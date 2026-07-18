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

import { runVisionPrompt } from "./imageGen"

const CAPTION_PROMPT = `이 사진의 핵심 피사체를 2~4개의 짧은 한국어 키워드로 나열해주세요(쉼표로 구분).
예: "우니, 초밥, 클로즈업" 또는 "가게, 외관, 간판" 또는 "라떼, 커피잔".
문장이 아니라 키워드만 쉼표로 구분해서, 다른 설명 없이 답하세요.`

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
  return text && text.length > 0 ? text.slice(0, 60) : ""
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
