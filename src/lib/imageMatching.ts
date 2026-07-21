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
  isMenu: boolean
}

// Notion 첨부 사진의 label은 대개 원본 파일명("20180206_195520.jpg", "KakaoTalk_
// 20260717_161714013_11.jpg" 등)이라 의미가 없다. 이런 경우만 비전 호출로 새로 캡션을
// 만들고, 사람이 실제로 입력한 캡션(파일명 패턴이 아닌 텍스트)이 있으면 비전 호출 없이
// 그대로 재사용해 시간/비용을 아낀다. 원래 숫자만 허용했으나(구형 카메라 파일명 기준),
// "KakaoTalk_..." 처럼 영문자가 섞인 메신저/카메라 앱 자동 파일명을 못 잡아 그 라벨이
// 그대로 "의미 있는 캡션"으로 오인되고 비전 분석 자체가 스킵되는 사고가 실측 확인됐다
// (캡션이 파일명이면 문단 키워드 매칭이 항상 실패하고, isExterior도 항상 false가 되어
// 대표 사진 판별도 함께 무너진다). 영문자를 허용해 흔한 자동 파일명 패턴을 폭넓게 잡되,
// 한글 캡션(예: "가게 외관")은 이 문자 클래스에 없는 한글이 섞여 있어 여전히 매치되지
// 않으므로 기존 동작(사람이 입력한 캡션은 그대로 재사용)은 그대로 유지된다.
const MEANINGLESS_LABEL_PATTERN = /^[a-z0-9_\-\s.]+\.(jpe?g|png|heic|webp|gif)$/i

// 라벨 텍스트만으로 외관/메뉴판 사진 여부를 저비용으로 추정한다(비전 호출 없음).
const EXTERIOR_LABEL_HINT = /외관|간판|입구|정면|건물/
const MENU_LABEL_HINT = /메뉴판|메뉴 사진|가격표|메뉴 리스트/

const BATCH_SIZE = 5

const BATCH_ANALYSIS_PROMPT = `아래 사진들을 순서대로 분석해서, 각 사진마다 한 줄씩 다음 형식으로만 답하세요:
N) 키워드1, 키워드2 | 예 또는 아니오 | 예 또는 아니오

- 키워드: 그 사진의 핵심 피사체를 2~4개의 짧은 한국어 단어로 쉼표 구분해서 나열 (예: "우니, 초밥, 클로즈업"). 반드시 한국 블로거가 실제로 쓰는 일상적인 한국어 음식 이름을 쓰고, "자완무시"(→계란찜), "타다키"(→겉불에 살짝 구운 회) 같은 격식체/일본어 원어 표기는 쓰지 마세요 — 본문 캡션 매칭이 문단 텍스트의 실제 단어와 겹치는지로 이뤄지는데, 블로그 본문은 항상 일상 한국어 명칭을 쓰기 때문에 격식체 키워드는 매칭에 실패해 사진이 엉뚱한 문단에 배치되는 원인이 됩니다.
- 첫 번째 예/아니오: 그 사진이 가게/매장/장소의 외관(건물 정면, 간판이 보이는 입구, 외부 전경)이면 "예", 아니면 "아니오"
- 두 번째 예/아니오: 그 사진이 메뉴판(가격이 적힌 메뉴 목록/메뉴판 사진)이면 "예", 아니면 "아니오"
- 사진 번호(N)는 반드시 실제 순서와 일치시키고, 다른 설명 없이 위 형식의 줄만 그대로 출력하세요.`

function parseBatchAnalysis(text: string, count: number): (ImageAnalysis | null)[] {
  const results: (ImageAnalysis | null)[] = Array.from({ length: count }, () => null)
  const lineRegex = /^(\d+)\)\s*(.+?)\s*\|\s*(예|아니오)\s*\|\s*(예|아니오)\s*$/gm
  let match: RegExpExecArray | null
  while ((match = lineRegex.exec(text)) !== null) {
    const index = Number(match[1]) - 1
    if (index < 0 || index >= count) continue
    results[index] = {
      caption: match[2].trim().slice(0, 60),
      isExterior: match[3] === "예",
      isMenu: match[4] === "예",
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
  const results: ImageAnalysis[] = images.map(() => ({ caption: "", isExterior: false, isMenu: false }))
  const needsVision: { originalIndex: number; url: string }[] = []

  images.forEach((image, i) => {
    const label = image.existingLabel?.trim()
    if (label && !MEANINGLESS_LABEL_PATTERN.test(label)) {
      results[i] = {
        caption: label,
        isExterior: EXTERIOR_LABEL_HINT.test(label),
        isMenu: MENU_LABEL_HINT.test(label),
      }
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

// 두 캡션이 키워드를 하나라도 공유하는지 확인한다(groupSimilarImages와 동일한 기준).
// 그룹 상한(MAX_SIMILAR_GROUP_SIZE)에 걸려 같은 종류의 사진인데도 별도 그룹으로 남은
// 경우, 이미 배치된 "형제" 그룹을 찾아 합류시키는 용도로 쓴다 — 실측 확인된 사고:
// 초밥 사진이 4장인데 그룹 상한(3장) 때문에 하나가 남아 문단 매칭에도 실패하면,
// 위치 기반 폴백이 전혀 무관한 문단(예: "매장 내부" 소개 문단)에 떨어뜨렸다.
export function captionsShareKeyword(a: string, b: string): boolean {
  const tokensA = new Set(tokenize(a))
  if (tokensA.size === 0) return false
  return tokenize(b).some((token) => tokensA.has(token))
}

// 이미지 각각을 캡션 키워드가 가장 많이 겹치는 문단에 독립적으로 배정한다. 겹치는
// 키워드가 하나도 없으면(bestScore <= 0) 매칭 실패로 보고 null을 반환해, 호출부가
// 폴백 위치를 쓰도록 한다. 이미 배정된 문단은(다른 미배정 문단에 조금이라도 겹치는
// 키워드가 있는 한) 하드하게 재사용하지 않는다 — 예전에는 소프트 페널티(재사용 시
// 누적 감점)만 있어서, 여러 사진의 캡션이 서로 비슷하게 겹치면 결국 한 문단에 사진이
// 2~3장씩 몰리는 사고가 실측 확인됐다(원래는 "비슷한 사진끼리 자연히 그룹핑"을
// 의도한 설계였지만, "짧은 문단 하나에 사진 하나"라는 요구와 상충했다). 후보 문단
// 수가 사진 수만큼 충분하면(이 프로젝트 실측 케이스: 후보 18개/사진 15장) 하드 제외로
// 거의 항상 1:1로 퍼진다. 후보가 사진보다 적어 다 채우고 나면 그 이후 이미지는
// 매칭 실패(null) 처리되어 호출부의 최소사용 폴백으로 넘어간다.
export function matchImagesToParagraphs(
  images: { caption: string }[],
  candidateParagraphs: { index: number; text: string }[]
): (number | null)[] {
  if (candidateParagraphs.length === 0) return images.map(() => null)

  const used = new Set<number>()

  return images.map((image) => {
    const tokens = tokenize(image.caption)
    if (tokens.length === 0) return null

    let best: { index: number; text: string } | null = null
    let bestScore = -Infinity
    for (const paragraph of candidateParagraphs) {
      if (used.has(paragraph.index)) continue
      const score = keywordOverlapScore(tokens, paragraph.text)
      if (score > bestScore) {
        bestScore = score
        best = paragraph
      }
    }
    if (!best || bestScore <= 0) return null

    used.add(best.index)
    return best.index
  })
}

// 한 그룹에 사진이 무한정 쌓이는 것을 막는 상한. 사용자가 예시로 든 "전체요리/메인요리
// (초밥)/디저트" 그룹 규모를 참고해, 자연스럽게 묶이되 한 문단이 사진으로 도배되지
// 않는 선(최대 3장)으로 잡았다.
const MAX_SIMILAR_GROUP_SIZE = 3

// 캡션 키워드가 겹치는 사진끼리(예: "초밥"이 포함된 여러 장) 묶어서, 같은 문단에 함께
// 배치할 수 있게 사진 인덱스 그룹 목록을 반환한다(입력 순서 기준, 각 사진은 정확히
// 한 그룹에만 속함 — 매칭 안 되는 사진은 원소 1개짜리 그룹이 된다). "짧은 문단 하나에
// 사진 하나씩 억지로 끼워넣지 말고, 전체요리/메인요리/디저트처럼 유사한 사진은 묶어
// 달라"는 요청에 따라 도입했다. 예전에 "소프트 페널티로 인한 무한정 크라우딩" 사고가
// 있었으므로(그래서 한때 완전히 1문단=1사진으로 하드 제한했었다), 이번엔 명시적으로
// 캡션이 실제로 겹치는 경우로만 그룹을 만들고 크기도 상한을 둬 재발을 막는다.
export function groupSimilarImages(captions: string[]): number[][] {
  const tokenSets = captions.map((caption) => new Set(tokenize(caption)))
  const assigned = new Array(captions.length).fill(false)
  const groups: number[][] = []

  for (let i = 0; i < captions.length; i++) {
    if (assigned[i]) continue
    assigned[i] = true
    const group = [i]

    if (tokenSets[i].size > 0) {
      for (let j = i + 1; j < captions.length && group.length < MAX_SIMILAR_GROUP_SIZE; j++) {
        if (assigned[j]) continue
        const overlaps = [...tokenSets[j]].some((token) => tokenSets[i].has(token))
        if (overlaps) {
          assigned[j] = true
          group.push(j)
        }
      }
    }

    groups.push(group)
  }

  return groups
}
