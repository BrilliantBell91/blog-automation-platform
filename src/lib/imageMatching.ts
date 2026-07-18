// 첨부 사진과 본문 문단을 의미적으로 매칭한다. llm.ts는 LLM에게 이미지 URL이나 마커
// 태그를 직접 쓰게 하지 않는데(과거 "LLM이 마커 형식을 임의로 변형해 이미지가 통째로
// 사라진" 실측 사고 때문), 각주형 태그("[[사진2]]" 등)도 결국 LLM이 텍스트에 직접 쓰는
// 마커라 같은 실패 모드에 노출된다. 그래서 이 모듈은 LLM에 어떤 추가 책임도 지우지 않고,
// 사진 캡션 키워드가 문단 텍스트에 등장하는 정도로 코드가 100% 결정론적으로 배치를 정한다.
//
// 임베딩 API(embedContent) 대신 키워드 겹침 방식을 쓰는 이유: 이 프로젝트의 무료 티어
// API 키에서 일부 모델이 호출 자체가 막히는 사례(gemini-2.5-flash-image 등)가 이미
// 여러 번 확인됐다. 임베딩 호출이 조용히 실패하면 매칭이 통째로 위치 기반 폴백으로
// 전락해 "매칭이 전혀 안 된다"는 사고로 이어지므로, 추가 API 의존 없이 이미 확보한
// 캡션 텍스트만으로 항상 동작하는 방식을 택했다.

import { runVisionPromptBatch } from "./imageGen"

export interface ImageAnalysis {
  caption: string
  isExterior: boolean
}

// Notion 첨부 사진의 label은 대개 원본 파일명("20180206_195520.jpg" 등)이라 의미가
// 없다. 이런 경우만 비전 호출로 새로 캡션을 만들고, 사람이 실제로 입력한 캡션(파일명
// 패턴이 아닌 텍스트)이 있으면 비전 호출 없이 그대로 재사용해 시간/비용을 아낀다.
const MEANINGLESS_LABEL_PATTERN = /^[\d_\-.\s]+\.(jpe?g|png|heic|webp|gif)$/i

// 라벨 텍스트만으로 외관 사진 여부를 저비용으로 추정한다(비전 호출 없음).
const EXTERIOR_LABEL_HINT = /외관|간판|입구|정면|건물/

const BATCH_SIZE = 5

const BATCH_ANALYSIS_PROMPT = `아래 사진들을 순서대로 분석해서, 각 사진마다 한 줄씩 다음 형식으로만 답하세요:
N) 키워드1, 키워드2 | 예 또는 아니오

- 키워드: 그 사진의 핵심 피사체를 2~4개의 짧은 한국어 단어로 쉼표 구분해서 나열 (예: "우니, 초밥, 클로즈업")
- 마지막 예/아니오: 그 사진이 가게/매장/장소의 외관(건물 정면, 간판이 보이는 입구, 외부 전경)이면 "예", 아니면 "아니오"
- 사진 번호(N)는 반드시 실제 순서와 일치시키고, 다른 설명 없이 위 형식의 줄만 그대로 출력하세요.`

function parseBatchAnalysis(text: string, count: number): (ImageAnalysis | null)[] {
  const results: (ImageAnalysis | null)[] = Array.from({ length: count }, () => null)
  const lineRegex = /^(\d+)\)\s*(.+?)\s*\|\s*(예|아니오)\s*$/gm
  let match: RegExpExecArray | null
  while ((match = lineRegex.exec(text)) !== null) {
    const index = Number(match[1]) - 1
    if (index < 0 || index >= count) continue
    results[index] = {
      caption: match[2].trim().slice(0, 60),
      isExterior: match[3] === "예",
    }
  }
  return results
}

// 첨부 사진 전부를 분석해 {caption, isExterior}를 반환한다(입력과 같은 순서).
// 라벨이 의미 있으면(파일명 패턴 아님) 비전 호출 없이 그 라벨을 캡션으로 재사용하고,
// 라벨 텍스트에 외관 관련 단어가 있으면 그것만으로 외관 여부를 판정한다. 나머지(라벨
// 없음/의미 없음)만 여러 장씩 묶어 한 번의 비전 호출로 처리한다 — 캡션 생성과 외관 판별을
// 사진마다 각각 개별 호출하던 이전 구조는 사진 장수에 비례해 호출이 늘어나 무료 티어
// 일일 한도를 초안 하나로 소진시키는 사고가 실측으로 확인되어, 배치 호출로 재설계했다.
// 파싱에 실패하거나 일부만 파싱된 사진은 {caption: "", isExterior: false}로 안전 폴백
// 한다(배치 전체를 버리지 않음 — 호출부가 "매칭 불가"로 처리해 균등 배치 폴백을 쓴다).
export async function analyzeImagesBatch(
  apiKey: string,
  images: { url: string; existingLabel?: string }[]
): Promise<ImageAnalysis[]> {
  const results: ImageAnalysis[] = images.map(() => ({ caption: "", isExterior: false }))
  const needsVision: { originalIndex: number; url: string }[] = []

  images.forEach((image, i) => {
    const label = image.existingLabel?.trim()
    if (label && !MEANINGLESS_LABEL_PATTERN.test(label)) {
      results[i] = { caption: label, isExterior: EXTERIOR_LABEL_HINT.test(label) }
    } else {
      needsVision.push({ originalIndex: i, url: image.url })
    }
  })

  for (let start = 0; start < needsVision.length; start += BATCH_SIZE) {
    const batch = needsVision.slice(start, start + BATCH_SIZE)
    const { successIndexes, text } = await runVisionPromptBatch(
      apiKey,
      batch.map((b) => b.url),
      BATCH_ANALYSIS_PROMPT
    )
    if (!text) continue

    const parsed = parseBatchAnalysis(text, successIndexes.length)
    successIndexes.forEach((batchIndex, i) => {
      const analysis = parsed[i]
      if (analysis) results[batch[batchIndex].originalIndex] = analysis
    })
  }

  return results
}

// 캡션을 토큰(키워드) 배열로 쪼갠다. 쉼표/공백/구두점 기준으로 나누고, 조사 등 노이즈가
// 섞이기 쉬운 1글자 토큰은 제외한다.
function tokenize(text: string): string[] {
  return text
    .split(/[,\s./\\!?~()[\]{}'"#>*\-–—:;·]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

// 캡션 키워드 중 문단 텍스트에 실제로 등장하는 비율로 유사도를 계산한다(부분 문자열
// 포함 여부 — 한국어는 조사가 바로 붙어 정확한 단어 경계 매칭이 어려우므로 포함 검사가
// 오히려 더 안정적으로 동작한다).
function keywordOverlapScore(captionTokens: string[], paragraphText: string): number {
  if (captionTokens.length === 0) return 0
  const hits = captionTokens.filter((token) => paragraphText.includes(token)).length
  return hits / captionTokens.length
}

// 이미지 각각을 캡션 키워드가 가장 많이 겹치는 문단에 독립적으로 배정한다. 겹치는
// 키워드가 하나도 없으면(bestScore <= 0) 매칭 실패로 보고 null을 반환해, 호출부가
// 폴백 위치를 쓰도록 한다. crowdingPenalty로 이미 선택된 문단에 누적 페널티를 줘서
// 무관한 사진들까지 전부 한 문단으로 쏠리는 것은 막되, 캡션이 비슷한(=겹침이 큰)
// 사진들은 같은 문단으로 몰려 자연히 인접 배치(그룹핑)되는 효과가 남는다.
export function matchImagesToParagraphs(
  images: { caption: string }[],
  candidateParagraphs: { index: number; text: string }[],
  crowdingPenalty = 0.15
): (number | null)[] {
  if (candidateParagraphs.length === 0) return images.map(() => null)

  const usageCount = new Map<number, number>()

  return images.map((image) => {
    const tokens = tokenize(image.caption)
    if (tokens.length === 0) return null

    let best: { index: number; text: string } | null = null
    let bestScore = -Infinity
    for (const paragraph of candidateParagraphs) {
      const penalty = (usageCount.get(paragraph.index) ?? 0) * crowdingPenalty
      const score = keywordOverlapScore(tokens, paragraph.text) - penalty
      if (score > bestScore) {
        bestScore = score
        best = paragraph
      }
    }
    if (!best || bestScore <= 0) return null

    usageCount.set(best.index, (usageCount.get(best.index) ?? 0) + 1)
    return best.index
  })
}
