// 순수 키워드 겹침(imageMatching.ts의 matchImagesMonotonicByStage)은 비전 캡션과 본문
// 단어가 그대로 겹칠 때만 맞는다. 캡션과 본문이 같은 대상을 다르게 표현하면(동의어
// 사전에 없는 표현 차이 등) 겹침이 0이 되어 위치 기반 폴백으로 넘어가버리는 사고가
// 실측 확인됐다(샐러드/계란찜/사시미/참치뱃살 위치 오류). 본문을 생성한 것과 같은
// 텍스트 LLM에게 문단 목록과 사진 캡션을 함께 보여주고 의미 기반 매핑을 요청하면
// 부분 문자열 일치보다 훨씬 정확하게 맞출 수 있다. 이 호출은 초안 생성당 1회만
// 발생하며(사진 장수와 무관), 실패하거나 응답이 코스 순서를 어기면 호출부가 전부
// 버리고 결정론적 폴백(matchImagesMonotonicByStage)을 쓰도록 null을 반환한다.

import { GoogleGenAI } from "@google/genai"
import { withRetry, shouldTryNextModel } from "./geminiRetry"
import { generateGroqText } from "./groqClient"

const TIMEOUT_MS = 30_000

// llm.ts의 MODEL_FALLBACK_CHAIN과 값은 같지만, llm.ts가 이 파일을 import하므로
// 순환 import를 피하기 위해 이 파일 전용으로 별도 정의한다.
const MATCH_MODEL_FALLBACK_CHAIN = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-latest",
] as const

export interface MatchableImage {
  caption: string
  courseStage: number
}

export interface MatchableParagraph {
  index: number
  text: string
}

const STAGE_LABELS: Record<number, string> = {
  0: "전채",
  1: "회",
  2: "초밥",
  3: "요리",
  4: "디저트",
}

function buildPrompt(images: MatchableImage[], paragraphs: MatchableParagraph[]): string {
  const imageLines = images
    .map((img, i) => {
      const stageLabel = img.courseStage in STAGE_LABELS ? STAGE_LABELS[img.courseStage] : "알수없음"
      return `I${i + 1}) ${img.caption || "(설명 없음)"} [코스단계: ${stageLabel}]`
    })
    .join("\n")
  const paragraphLines = paragraphs.map((p, i) => `P${i + 1}) ${p.text.slice(0, 80)}`).join("\n")

  return `아래는 블로그 글의 문단 목록과, 그 글에 첨부할 사진들의 설명(캡션)입니다.

문단 목록:
${paragraphLines}

사진 목록:
${imageLines}

각 사진(I1~I${images.length})을 내용상 가장 어울리는 문단 번호(P1~P${paragraphs.length})에 배정하세요.
규칙:
1. 사진 설명과 문단 내용이 실제로 일치해야 합니다(예: "샐러드" 사진은 샐러드를 언급하는 문단에 배정).
2. 사진에 [코스단계]가 있으면 그 순서(전채→회→초밥→요리→디저트)를 반드시 지키세요 — 뒤 단계 사진이 앞 단계 사진보다 앞선 문단 번호에 배정되면 안 됩니다. 디저트는 반드시 다른 모든 사진보다 뒤(더 큰 문단 번호)여야 합니다.
3. 서로 비슷한 사진 여러 장을 같은 문단에 배정해도 됩니다.
4. 다른 설명 없이 아래 형식의 JSON 배열만 출력하세요: [{"image":1,"paragraph":3},{"image":2,"paragraph":3}]`
}

interface MatchResponseEntry {
  image: number
  paragraph: number
}

function isMatchResponseEntry(value: unknown): value is MatchResponseEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).image === "number" &&
    typeof (value as Record<string, unknown>).paragraph === "number"
  )
}

// 응답에 코드펜스나 설명 텍스트가 섞여도 첫 JSON 배열만 추출해 파싱한다. 파싱에
// 실패하거나 형식이 어긋난 항목은 조용히 건너뛴다(전체 응답을 버리지 않음 — 일부라도
// 건질 수 있으면 건진다. 나머지는 호출부가 폴백으로 채운다).
function parseMatchResponse(
  text: string,
  imageCount: number,
  paragraphCount: number
): (number | null)[] {
  const results: (number | null)[] = Array.from({ length: imageCount }, () => null)
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return results

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return results
  }
  if (!Array.isArray(parsed)) return results

  for (const entry of parsed) {
    if (!isMatchResponseEntry(entry)) continue
    const imageIndex = entry.image - 1
    const paragraphIndex = entry.paragraph - 1
    if (imageIndex < 0 || imageIndex >= imageCount) continue
    if (paragraphIndex < 0 || paragraphIndex >= paragraphCount) continue
    results[imageIndex] = paragraphIndex
  }
  return results
}

async function callMatchModel(apiKey: string, prompt: string): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey })
  for (const model of MATCH_MODEL_FALLBACK_CHAIN) {
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: { httpOptions: { timeout: TIMEOUT_MS } },
        })
      )
      return response.text ?? null
    } catch (error) {
      if (!shouldTryNextModel(error)) return null
      console.warn(`[imageMatchLlm] ${model} 사용 불가(할당량 소진/미지원) — 다음 모델로 전환`, error)
    }
  }
  return null
}

/**
 * 문단 목록과 사진 캡션을 LLM에게 함께 보여주고 의미 기반 매핑을 요청한다. 이미지
 * 인덱스 기준(images와 같은 순서)으로 candidateParagraphs 안의 "실제 문단 인덱스"를
 * 반환한다. 호출/파싱이 전부 실패하면(응답 없음) null을 반환해 호출부가 결정론적
 * 폴백을 쓰도록 한다.
 */
export async function matchImagesToParagraphsViaLlm(
  apiKey: string,
  images: MatchableImage[],
  candidateParagraphs: MatchableParagraph[]
): Promise<(number | null)[] | null> {
  if (images.length === 0 || candidateParagraphs.length === 0) return null

  const prompt = buildPrompt(images, candidateParagraphs)

  let responseText: string | null = null
  try {
    responseText = await callMatchModel(apiKey, prompt)
  } catch (error) {
    console.warn("[imageMatchLlm] 매칭 호출 실패", error)
  }
  if (!responseText) {
    responseText = await generateGroqText("", prompt)
  }
  if (!responseText) return null

  const localIndexes = parseMatchResponse(responseText, images.length, candidateParagraphs.length)
  if (localIndexes.every((v) => v === null)) return null

  return localIndexes.map((localIndex) =>
    localIndex === null ? null : candidateParagraphs[localIndex].index
  )
}

// LLM 응답이 실제로 코스 순서를 지켰는지 검증한다. courseStage가 있는(UNKNOWN이 아닌)
// 사진만 대상으로, 단계별로 배정된 문단 인덱스 구간이 코스 순서와 함께 겹치지 않고
// 증가하는지 확인한다 — 어기면(예: 초밥이 사시미보다 앞에 배정) 호출부가 이 응답
// 전체를 버리고 결정론적 폴백(matchImagesMonotonicByStage)을 쓸 수 있도록 false를 반환한다.
export function respectsCourseOrder(
  images: MatchableImage[],
  assignedParagraphIndexes: (number | null)[]
): boolean {
  const byStage = new Map<number, number[]>()
  images.forEach((image, i) => {
    const paragraphIndex = assignedParagraphIndexes[i]
    if (paragraphIndex === null || image.courseStage < 0) return
    const list = byStage.get(image.courseStage) ?? []
    list.push(paragraphIndex)
    byStage.set(image.courseStage, list)
  })

  const stages = [...byStage.keys()].sort((a, b) => a - b)
  for (let i = 1; i < stages.length; i++) {
    const prevMax = Math.max(...byStage.get(stages[i - 1])!)
    const currMin = Math.min(...byStage.get(stages[i])!)
    if (currMin < prevMax) return false
  }
  return true
}
