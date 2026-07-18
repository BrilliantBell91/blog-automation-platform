// 첨부 사진과 본문 문단을 의미적으로 매칭한다. llm.ts는 LLM에게 이미지 URL이나 마커
// 태그를 직접 쓰게 하지 않는데(과거 "LLM이 마커 형식을 임의로 변형해 이미지가 통째로
// 사라진" 실측 사고 때문), 각주형 태그("[[사진2]]" 등)도 결국 LLM이 텍스트에 직접 쓰는
// 마커라 같은 실패 모드에 노출된다. 그래서 이 모듈은 LLM에 어떤 추가 책임도 지우지 않고,
// 사진 캡션과 문단 텍스트를 임베딩해 코사인 유사도로 코드가 100% 결정론적으로 배치를
// 정한다.

import { GoogleGenAI } from "@google/genai"
import { runVisionPrompt } from "./imageGen"

const EMBEDDING_MODEL = "text-embedding-004"

const CAPTION_PROMPT = `이 사진의 핵심 피사체를 10~15자 내외의 짧은 한국어 명사구로 설명해주세요.
예: "우니초밥 클로즈업", "가게 외관", "라떼 한 잔". 문장이 아니라 명사구로, 다른 설명 없이 그 문구만 답하세요.`

// Notion 첨부 사진의 label은 대개 원본 파일명("20180206_195520.jpg" 등)이라 의미가
// 없다. 이런 경우만 비전 호출로 새로 캡션을 만들고, 사람이 실제로 입력한 캡션(파일명
// 패턴이 아닌 텍스트)이 있으면 비전 호출 없이 그대로 재사용해 시간/비용을 아낀다.
const MEANINGLESS_LABEL_PATTERN = /^[\d_\-.\s]+\.(jpe?g|png|heic|webp|gif)$/i

export async function describeImage(
  apiKey: string,
  imageUrl: string,
  existingLabel?: string
): Promise<string> {
  const trimmedLabel = existingLabel?.trim()
  if (trimmedLabel && !MEANINGLESS_LABEL_PATTERN.test(trimmedLabel)) {
    return trimmedLabel
  }
  const text = await runVisionPrompt(apiKey, imageUrl, CAPTION_PROMPT)
  return text && text.length > 0 ? text.slice(0, 30) : "사진"
}

// 여러 텍스트를 한 번의 배치 호출로 임베딩한다. 실패하면 각 항목에 빈 배열을 채워
// 반환해(호출부가 "매칭 불가"로 처리) 전체 초안 생성이 중단되지 않게 한다.
export async function embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts,
    })
    const embeddings = response.embeddings ?? []
    return texts.map((_, i) => embeddings[i]?.values ?? [])
  } catch (error) {
    console.warn("[imageMatching] 임베딩 생성 실패 - 매칭 없이 폴백", error)
    return texts.map(() => [])
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return -1
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return -1
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// 이미지 각각을 유사도가 가장 높은 문단에 독립적으로 배정한다. 같은 문단을 여러 이미지가
// 고르는 것을 막지 않는다 — 캡션이 비슷한 사진들(예: 초밥 사진 여러 장)은 유사도 1위
// 문단이 겹치기 마련이고, 그 결과 같은 문단 뒤에 나란히 삽입되어 "비슷한 사진끼리 인접
// 배치"되는 그룹핑 효과가 자연히 생긴다. 다만 crowdingPenalty로 이미 선택된 문단에는
// 누적 페널티를 줘서, 정말 무관한 사진들까지 전부 한 문단으로 쏠리는 것은 막는다.
export function matchImagesToParagraphs(
  images: { embedding: number[] }[],
  candidateParagraphs: { index: number; embedding: number[] }[],
  crowdingPenalty = 0.15
): (number | null)[] {
  if (candidateParagraphs.length === 0) return images.map(() => null)

  const usageCount = new Map<number, number>()

  return images.map((image) => {
    if (image.embedding.length === 0) return null

    let best = candidateParagraphs[0]
    let bestScore = -Infinity
    for (const paragraph of candidateParagraphs) {
      const penalty = (usageCount.get(paragraph.index) ?? 0) * crowdingPenalty
      const score = cosineSimilarity(image.embedding, paragraph.embedding) - penalty
      if (score > bestScore) {
        bestScore = score
        best = paragraph
      }
    }
    usageCount.set(best.index, (usageCount.get(best.index) ?? 0) + 1)
    return best.index
  })
}
