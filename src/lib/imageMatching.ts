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
  isInterior: boolean
  // 오마카세 등 코스 요리의 상대적 순서. 숫자가 클수록 나중에 나오는 코스다.
  // 0=음료/전채(기본찬), 1=회/사시미, 2=초밥/스시, 3=따뜻한 요리(구이·튀김·볶음·면·탕),
  // 4=디저트. 비전 모델이 답을 안 하거나 알 수 없는 경우 -1(순서 신호 없음).
  courseStage: number
}

// 아이스크림 등 디저트는 오마카세 코스 특성상 항상 마지막 순서에 나와야 자연스러운데,
// 노션에는 사진이 순서 없이 아무렇게나 첨부되고 캡션 키워드 매칭도 위치를 고려하지
// 않아 중간 문단에 뜬금없이 디저트 사진이 배치되는 사고가 실측 확인됐다. 비전 모델의
// courseStage 분류가 틀리더라도(예: "요리"로 오분류) 캡션 자체에 이 단어가 있으면
// 무조건 디저트(마지막 단계)로 강제 취급하는 안전망으로 쓴다.
export const DESSERT_CAPTION_PATTERN = /아이스크림|디저트|셔벗|빙수|파르페|마카롱|후식/

const COURSE_STAGE_APPETIZER = 0
const COURSE_STAGE_SASHIMI = 1
const COURSE_STAGE_SUSHI = 2
const COURSE_STAGE_HOT_DISH = 3
export const COURSE_STAGE_DESSERT = 4
const COURSE_STAGE_UNKNOWN = -1

// 비전 모델이 답한 단계명(한국어 단어)을 숫자 순서로 변환한다. 지시한 6개 단어 중
// 하나가 아니거나 필드 자체가 없으면(구버전 4필드 응답 등) UNKNOWN으로 안전 폴백해,
// 순서 정보가 없는 것으로 취급하고(호출부의 monotonic 배치가 그 사진을 상대 순서만
// 지켜 적당한 자리에 끼워넣는다) 잘못된 순서를 강제하지 않는다.
function mapCourseStageName(name: string | undefined): number {
  switch (name?.trim()) {
    case "전채":
      return COURSE_STAGE_APPETIZER
    case "회":
      return COURSE_STAGE_SASHIMI
    case "초밥":
      return COURSE_STAGE_SUSHI
    case "요리":
      return COURSE_STAGE_HOT_DISH
    case "디저트":
      return COURSE_STAGE_DESSERT
    default:
      return COURSE_STAGE_UNKNOWN
  }
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

// 라벨 텍스트만으로 외관/메뉴판/매장 내부 사진 여부를 저비용으로 추정한다(비전 호출 없음).
const EXTERIOR_LABEL_HINT = /외관|간판|입구|정면|건물/
const MENU_LABEL_HINT = /메뉴판|메뉴 사진|가격표|메뉴 리스트/
const INTERIOR_LABEL_HINT = /내부|인테리어|실내|홀/

const BATCH_SIZE = 5

const BATCH_ANALYSIS_PROMPT = `아래 사진들을 순서대로 분석해서, 각 사진마다 한 줄씩 다음 형식으로만 답하세요:
N) 키워드1, 키워드2 | 예 또는 아니오 | 예 또는 아니오 | 예 또는 아니오 | 코스단계

- 키워드: 그 사진의 핵심 피사체를 2~4개의 짧은 한국어 단어로 쉼표 구분해서 나열 (예: "우니, 초밥, 클로즈업"). 반드시 한국 블로거가 실제로 쓰는 일상적인 한국어 음식 이름을 쓰고, "자완무시"(→계란찜), "타다키"(→겉불에 살짝 구운 회), "오토로"(→참치 뱃살) 같은 격식체/일본어 원어 표기는 쓰지 마세요 — 본문 캡션 매칭이 문단 텍스트의 실제 단어와 겹치는지로 이뤄지는데, 블로그 본문은 항상 일상 한국어 명칭을 쓰기 때문에 격식체 키워드는 매칭에 실패해 사진이 엉뚱한 문단에 배치되는 원인이 됩니다. 또한 "새우", "회", "참치"처럼 조리법/부위 구분 없이 재료명만 단독으로 쓰지 마세요 — 같은 재료라도 조리법·부위가 다르면(예: 볶은 새우 요리 vs 회로 먹는 단새우, 참치 뱃살 vs 참치 살코기) 전혀 다른 사진인데, 재료명만 쓰면 그 재료가 언급된 다른 문단과 잘못 매칭됩니다. 조리법/형태/부위를 붙인 구체적인 이름을 쓰세요(예: 볶은 새우 요리라면 "새우볶음"처럼 붙여쓰기, 날것 그대로의 단새우라면 "단새우", 지방이 많은 붉은 참치 살이라면 "참치 뱃살", 담백한 참치 살코기라면 "참치 살코기"). 참치 회/초밥은 특히 부위 구분이 중요합니다 — 살 단면에 흰 지방 줄무늬(마블링)가 선명하게 보이면 뱃살(오토로/추토로) 부위이니 반드시 "참치 뱃살"이라고 쓰고, 지방 줄무늬 없이 균일한 붉은 살이면 "참치 살코기"라고 쓰세요. 마블링 여부가 애매해도 "참치"라고만 쓰지 말고 육안으로 더 가까운 쪽으로 판단해 "참치 뱃살" 또는 "참치 살코기" 중 하나로 명시하세요.
- 첫 번째 예/아니오: 그 사진이 가게/매장/장소의 외관(건물 정면, 간판이 보이는 입구, 외부 전경)이면 "예", 아니면 "아니오"
- 두 번째 예/아니오: 그 사진이 메뉴판(가격이 적힌 메뉴 목록/메뉴판 사진)이면 "예", 아니면 "아니오"
- 세 번째 예/아니오: 그 사진이 매장 내부(실내 인테리어, 좌석, 테이블, 홀 전경 등 음식이 클로즈업되지 않은 실내 전경)면 "예", 아니면 "아니오"
- 코스단계: 오마카세/코스 요리에서 그 음식이 나오는 상대적 순서를 아래 6개 단어 중 하나로만 답하세요(그 외 단어 금지):
  "전채"(음료·기본찬·샐러드·계란찜처럼 코스 맨 앞에 나오는 간단한 음식), "회"(사시미/생선회), "초밥"(스시/니기리), "요리"(구이·튀김·볶음·면류·탕처럼 조리된 따뜻한 요리), "디저트"(아이스크림·과일·후식), "기타"(외관/메뉴판/매장내부 사진이거나 코스 순서를 판단하기 어려운 경우)
  판단이 애매해도 반드시 이 중 하나를 고르세요 — 이 순서 정보로 사진이 본문에 코스 순서대로 배치되니, 실제 눈에 보이는 조리 상태(날것/구운것/튀긴것/디저트 모양)를 기준으로 판단하세요.
- 사진 번호(N)는 반드시 실제 순서와 일치시키고, 다른 설명 없이 위 형식의 줄만 그대로 출력하세요.`

// 네 번째 필드(매장 내부 여부)는 선택적으로 파싱한다 — 비전 모델이 프롬프트 지시를
// 어기고 예전 3필드 형식으로만 답하는 경우에도 캡션/외관/메뉴판 판정까지는 안전하게
// 건지기 위함이다(4번째 필드가 없으면 isInterior는 기본값 false로 남는다).
function parseBatchAnalysis(text: string, count: number): (ImageAnalysis | null)[] {
  const results: (ImageAnalysis | null)[] = Array.from({ length: count }, () => null)
  // 6번째 필드(코스단계)도 매장내부 필드와 마찬가지로 선택적으로 파싱한다 — 비전
  // 모델이 구버전 3~4필드 형식으로만 답해도 나머지 필드는 안전하게 건진다(없으면
  // courseStage는 UNKNOWN(-1)로 남아, 순서 강제 없이 기존 키워드 매칭에 맡겨진다).
  const lineRegex =
    /^(\d+)\)\s*(.+?)\s*\|\s*(예|아니오)\s*\|\s*(예|아니오)(?:\s*\|\s*(예|아니오))?(?:\s*\|\s*([^|\n]+))?\s*$/gm
  let match: RegExpExecArray | null
  while ((match = lineRegex.exec(text)) !== null) {
    const index = Number(match[1]) - 1
    if (index < 0 || index >= count) continue
    results[index] = {
      caption: match[2].trim().slice(0, 60),
      isExterior: match[3] === "예",
      isMenu: match[4] === "예",
      isInterior: match[5] === "예",
      courseStage: mapCourseStageName(match[6]),
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
  const results: ImageAnalysis[] = images.map(() => ({
    caption: "",
    isExterior: false,
    isMenu: false,
    isInterior: false,
    courseStage: COURSE_STAGE_UNKNOWN,
  }))
  const needsVision: { originalIndex: number; url: string }[] = []

  images.forEach((image, i) => {
    const label = image.existingLabel?.trim()
    if (label && !MEANINGLESS_LABEL_PATTERN.test(label)) {
      results[i] = {
        caption: label,
        isExterior: EXTERIOR_LABEL_HINT.test(label),
        isMenu: MENU_LABEL_HINT.test(label),
        isInterior: INTERIOR_LABEL_HINT.test(label),
        // 라벨만으로는 코스 순서를 알 수 없다(사람이 쓴 라벨은 보통 "메뉴판 사진" 같은
        // 분류용 텍스트라 조리 상태를 담고 있지 않음). 디저트 안전망은 아래에서
        // 캡션(=라벨) 텍스트 기준으로 일괄 적용된다.
        courseStage: COURSE_STAGE_UNKNOWN,
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

  // 디저트 안전망: 비전 모델의 courseStage 분류(또는 라벨 기반 UNKNOWN)와 무관하게,
  // 캡션 텍스트 자체가 디저트로 읽히면 무조건 마지막 단계로 강제한다(위
  // DESSERT_CAPTION_PATTERN 설명 참고).
  results.forEach((analysis) => {
    if (DESSERT_CAPTION_PATTERN.test(analysis.caption)) {
      analysis.courseStage = COURSE_STAGE_DESSERT
    }
  })

  return results
}

// 같은 음식을 부르는 서로 다른 한국어 표현이 텍스트 생성(LLM)과 사진 캡션(비전 모델)
// 양쪽에서 각각 독립적으로 선택되면, 둘 다 자연스러운 한국어인데도 순수 부분문자열
// 매칭으로는 절대 겹치지 않아 매칭이 실패한다. 실측 확인된 사고: 사시미 5점이 정확히
// 찍힌 사진이 있는데도(파일명 KakaoTalk_..._02.jpg), 본문은 "사시미"라고 쓰고 비전
// 캡션은 "회"(또는 "모둠회"처럼 "회"가 포함된 복합어)라고 써서 세 번의 재생성 모두
// 이 사진이 전혀 매칭되지 않고 엉뚱한 사진이 대신 붙었다. 두 표현 다 BATCH_ANALYSIS_
// PROMPT가 요구하는 "격식체 아닌 일상적인 한국어"에 해당해 어느 쪽이 나올지 예측할 수
// 없으므로, 매칭 직전에 흔히 혼용되는 동의어 쌍을 같은 것으로 취급한다.
const FOOD_SYNONYM_GROUPS: string[][] = [
  ["사시미", "회"],
  ["우니", "성게"],
  ["단새우", "아마에비"],
  ["참치", "마구로"],
  ["초밥", "스시"],
  // 프롬프트에서 "오토로" 대신 "참치 뱃살"을 쓰도록 지시했지만(BATCH_ANALYSIS_PROMPT
  // 참고), 모델이 지시를 어기고 예전처럼 격식체를 쓰는 경우에 대비한 안전망.
  ["뱃살", "오토로"],
]

// 캡션을 토큰(키워드) 배열로 쪼갠다. 쉼표/공백/구두점 기준으로 나누고, 조사 등 노이즈가
// 섞이기 쉬운 1글자 토큰은 제외한다 — 단, "회"처럼 1글자지만 동의어 그룹에 등록된
// 음식 키워드는 예외로 살려둔다(그대로 버려지면 애초에 매칭 대상에 오르지도 못한다).
const SHORT_SYNONYM_TERMS = new Set(FOOD_SYNONYM_GROUPS.flat().filter((t) => t.length < 2))
function tokenize(text: string): string[] {
  return text
    .split(/[,\s./\\!?~()[\]{}'"#>*\-–—:;·]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 || SHORT_SYNONYM_TERMS.has(t))
}

// 토큰(또는 문단 텍스트 조각) 안에 동의어 그룹의 어떤 표현이 부분 문자열로 들어있는지
// 찾는다("모둠회"에는 "회"가, "생선사시미"에는 "사시미"가 포함되는 식). 찾으면 그
// 그룹 전체를 반환한다.
function findSynonymGroup(text: string): string[] | undefined {
  return FOOD_SYNONYM_GROUPS.find((group) => group.some((term) => text.includes(term)))
}

// token이 paragraphText에 그대로 있는지뿐 아니라, token이나 paragraphText 어느 한쪽에
// 동의어 그룹의 표현이 포함되어 있으면 다른 쪽에 그 그룹의 다른 표현이 있는지도 확인한다.
function tokenMatchesText(token: string, text: string): boolean {
  if (text.includes(token)) return true
  const group = findSynonymGroup(token)
  return group?.some((synonym) => text.includes(synonym)) ?? false
}

// 캡션 키워드 중 문단 텍스트에 실제로 등장하는 비율로 유사도를 계산한다(부분 문자열
// 포함 여부 — 한국어는 조사가 바로 붙어 정확한 단어 경계 매칭이 어려우므로 포함 검사가
// 오히려 더 안정적으로 동작한다). 동의어 쌍(위 FOOD_SYNONYM_GROUPS)도 겹침으로 인정한다.
function keywordOverlapScore(captionTokens: string[], paragraphText: string): number {
  if (captionTokens.length === 0) return 0
  const hits = captionTokens.filter((token) => tokenMatchesText(token, paragraphText)).length
  return hits / captionTokens.length
}

// 토큰에 동의어 그룹의 표현이 포함되어 있으면 그 그룹의 대표 표현으로 정규화한다(없으면
// 그대로 반환). 두 토큰이 같은 그룹에 속하면 정규화 후 완전히 같은 문자열이 되어,
// Set 기반 정확 일치 비교에서도 동의어로 인식된다.
function canonicalizeToken(token: string): string {
  const group = findSynonymGroup(token)
  return group?.[0] ?? token
}

// 두 캡션이 키워드를 하나라도 공유하는지 확인한다(groupSimilarImages와 동일한 기준 —
// tokenize 결과의 정확 일치이며, 동의어 쌍은 정규화 후 비교해 같은 표현으로 인정한다).
// 그룹 상한(MAX_SIMILAR_GROUP_SIZE)에 걸려 같은 종류의 사진인데도 별도 그룹으로 남은
// 경우, 이미 배치된 "형제" 그룹을 찾아 합류시키는 용도로 쓴다 — 실측 확인된 사고:
// 초밥 사진이 4장인데 그룹 상한(3장) 때문에 하나가 남아 문단 매칭에도 실패하면,
// 위치 기반 폴백이 전혀 무관한 문단(예: "매장 내부" 소개 문단)에 떨어뜨렸다.
export function captionsShareKeyword(a: string, b: string): boolean {
  const tokensA = new Set(tokenize(a).map(canonicalizeToken))
  if (tokensA.size === 0) return false
  return tokenize(b).some((token) => tokensA.has(canonicalizeToken(token)))
}

// 이미지 각각을 캡션 키워드가 가장 많이 겹치는 문단에 배정한다. 겹치는 키워드가
// 하나도 없으면(score <= 0) 매칭 실패로 보고 null을 반환해, 호출부가 폴백 위치를
// 쓰도록 한다. 이미 배정된 문단은(다른 미배정 문단에 조금이라도 겹치는 키워드가 있는
// 한) 하드하게 재사용하지 않는다 — 예전에는 소프트 페널티(재사용 시 누적 감점)만
// 있어서, 여러 사진의 캡션이 서로 비슷하게 겹치면 결국 한 문단에 사진이 2~3장씩
// 몰리는 사고가 실측 확인됐다.
//
// 이미지를 입력 순서대로 그리디하게 하나씩 처리하면, 약하게라도(예: "샐러드" 한
// 단어만) 겹치는 사진이 먼저 처리돼 그 문단을 선점해버려서, 훨씬 더 구체적으로 딱
// 맞는 다른 사진(예: "계란찜"이 정확히 겹침)이 처리될 차례가 됐을 땐 이미 그 문단이
// 없어져 버리는 사고가 실측 확인됐다. 그래서 모든 (이미지, 문단) 조합의 점수를 먼저
// 계산해 점수가 높은 조합부터 확정한다 — 순서와 무관하게 가장 확실한 매칭이 항상
// 먼저 그 자리를 차지한다.
export function matchImagesToParagraphs(
  images: { caption: string }[],
  candidateParagraphs: { index: number; text: string }[]
): (number | null)[] {
  const results: (number | null)[] = images.map(() => null)
  if (candidateParagraphs.length === 0) return results

  const scoredPairs: { imageIndex: number; paragraphIndex: number; score: number }[] = []
  images.forEach((image, imageIndex) => {
    const tokens = tokenize(image.caption)
    if (tokens.length === 0) return
    candidateParagraphs.forEach(({ index, text }) => {
      const score = keywordOverlapScore(tokens, text)
      if (score > 0) scoredPairs.push({ imageIndex, paragraphIndex: index, score })
    })
  })
  // 점수 내림차순(동점이면 원래 순서 유지 — Array.sort는 안정 정렬).
  scoredPairs.sort((a, b) => b.score - a.score)

  const usedParagraphs = new Set<number>()
  const assignedImages = new Set<number>()
  for (const { imageIndex, paragraphIndex } of scoredPairs) {
    if (assignedImages.has(imageIndex) || usedParagraphs.has(paragraphIndex)) continue
    results[imageIndex] = paragraphIndex
    usedParagraphs.add(paragraphIndex)
    assignedImages.add(imageIndex)
  }

  return results
}

export interface CourseStageImage {
  caption: string
  courseStage: number
}

// matchImagesToParagraphs(전역 그리디 최고점 매칭)는 점수만 보고 문단을 배정해 코스
// 순서를 전혀 고려하지 않는다 — 그 결과 디저트 사진이 캡션 겹침 우연으로 중반 문단에,
// 초밥 사진이 사시미보다 앞선 문단에 배정되는 사고가 실측 확인됐다(사용자 신고: "아이스
// 크림 뒤에 새우볶음 사진이 옴"). 이 함수는 이미지를 courseStage 오름차순(모르면
// UNKNOWN을 맨 뒤로 취급)으로 먼저 정렬한 뒤, "포인터 이후 후보 중 최고점"만 고르고
// 고른 자리 뒤로 포인터를 전진시켜 문단 인덱스가 코스 순서와 함께 단조 증가하도록
// 강제한다 — 캡션이 문단과 전혀 안 겹쳐도(점수 0) 최소한 순서만은 항상 보장된다.
export function matchImagesMonotonicByStage(
  images: CourseStageImage[],
  candidateParagraphs: { index: number; text: string }[]
): (number | null)[] {
  const results: (number | null)[] = images.map(() => null)
  if (candidateParagraphs.length === 0) return results

  const order = images
    .map((image, imageIndex) => ({
      imageIndex,
      // 순서 정보가 없는 사진(-1)은 정렬 우선순위를 맨 뒤로 미뤄, 순서가 확실한 사진들이
      // 먼저 코스 순서대로 자리를 잡게 하고 남은 자리를 나중에 채우게 한다.
      sortKey: image.courseStage < 0 ? Number.MAX_SAFE_INTEGER : image.courseStage,
    }))
    .sort((a, b) => a.sortKey - b.sortKey) // Array.sort는 안정 정렬(동점이면 원래 순서 유지)

  let pointer = 0 // candidateParagraphs 배열 안에서의 위치(코스 순서 강제용 하한선)
  for (const { imageIndex } of order) {
    const remaining = candidateParagraphs.slice(pointer)
    if (remaining.length === 0) {
      // 남은 후보가 없으면(포인터가 끝까지 밀림) 마지막 후보를 그대로 재사용한다 —
      // 전부 포함 불변식을 지키기 위한 최후 수단(문단 하나에 여러 사진이 몰릴 수 있음).
      results[imageIndex] = candidateParagraphs[candidateParagraphs.length - 1].index
      continue
    }

    const tokens = tokenize(images[imageIndex].caption)
    let bestLocalIndex = 0
    let bestScore = 0
    if (tokens.length > 0) {
      remaining.forEach(({ text }, localIndex) => {
        const score = keywordOverlapScore(tokens, text)
        if (score > bestScore) {
          bestScore = score
          bestLocalIndex = localIndex
        }
      })
    }

    if (bestScore > 0) {
      results[imageIndex] = remaining[bestLocalIndex].index
      pointer += bestLocalIndex + 1
    } else if (images[imageIndex].courseStage >= 0) {
      // 키워드는 안 겹쳐도 코스 단계를 알고 있으면, 순서 보존을 위해 포인터 바로
      // 다음 후보에 강제 배치한다(뒤 단계 사진이 앞 단계보다 앞서지 않도록).
      results[imageIndex] = remaining[0].index
      pointer += 1
    }
    // 키워드도 안 겹치고 코스 단계도 모르면(UNKNOWN) 강제 배치하지 않는다 — results는
    // null로 남고 pointer도 전진시키지 않는다. 호출부(llm.ts)의 위치 기반 분산 폴백
    // (spaced-gap picker)이 이런 "순서 신호가 전혀 없는" 사진을 더 고르게 흩어 배치하게
    // 맡긴다 — 여기서 무조건 "다음 빈 후보"에 밀어넣으면 오히려 특정 구간(예: 이미
    // 다른 사진이 막 배치된 바로 다음 문단)에 몰리는 회귀가 실측 확인됐다.
  }

  return results
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
  const tokenSets = captions.map((caption) => new Set(tokenize(caption).map(canonicalizeToken)))
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
