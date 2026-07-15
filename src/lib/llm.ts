import { GoogleGenAI, ApiError } from "@google/genai"
import { Post, LlmAttachment } from "@/types"
import { GEMINI_RATE_LIMIT } from "@/constants"
import {
  generateAiImage,
  verifyImageRelevance,
  type IllustrativeImageStyle,
} from "./imageGen"
import { searchRealImages } from "./imageSearch"
import { searchNaverPlace } from "./naverLocalSearch"
import { extractNaverPlaceId, fetchNaverPlaceDetail, fetchNaverPlacePhotos } from "./naverPlaceDetail"
import { extractLinkLabel } from "./naverDraftParser"

// 무료 티어 할당량은 모델별로 독립적으로 차감된다(실측 확인됨: gemini-3.5-flash가
// 하루 한도로 막혀도 다른 모델은 정상 동작). 앞쪽부터 시도하고 할당량 소진(429)이나
// 계정에서 미지원(404)이면 다음 모델로 자동 전환한다.
export const MODEL_FALLBACK_CHAIN = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-latest",
] as const
// 링크가 여러 개면 url_context 툴이 추가로 페이지를 fetch하느라 시간이 더 걸릴 수 있어 여유를 둔다.
const TIMEOUT_MS = 45_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 429(rate limit)와 503(일시 과부하 - 실측 확인됨)은 같은 모델로 잠시 후
// 재시도하면 회복될 수 있어 지수 백오프로 재시도한다.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (error) {
      const isTransient = error instanceof ApiError && (error.status === 429 || error.status === 503)
      if (!isTransient || attempt >= GEMINI_RATE_LIMIT.MAX_RETRIES) throw error
      await sleep(GEMINI_RATE_LIMIT.RETRY_BACKOFF_MS * 2 ** attempt)
      attempt++
    }
  }
}

// 재시도로도 해소되지 않는 429(할당량 소진), 404(이 계정에서 모델 미지원),
// 503(모델 일시 과부하 - 실측 확인됨)이면 다음 모델로 넘어간다.
// 그 외 에러(응답에 text 없음, 504 등)는 즉시 전파한다.
function shouldTryNextModel(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 429 || error.status === 404 || error.status === 503)
  )
}

// 카테고리별 실제 블로그(blog.naver.com/zmfflsp) 스타일 참고자료.
// 2026-07-14에 카테고리별 실제 게시글을 직접 확인하고 정리한 내용:
// - 결혼/육아: 혼인신고, 육아휴직 신청 등 절차·정보 안내형 글이 많음 (인용구 소제목 + 번호 목록 구조)
// - 나들이/맛집: 장소 방문 후기형 글 (상단 정보 인용구 + 사진별 코멘트 구조)
// - 기타: 일상 공유부터 이벤트/혜택 공유까지 다양하게 섞여 있음
//
// 이미지 소싱 우선순위 변경(2026-07-15):
// - allowAiFallback=false (나들이/맛집): 첨부 → 웹 검색만 (AI 생성 제외)
// - allowAiFallback=true (결혼/육아/기타): 첨부 → 웹 검색 → AI 생성 보완
const CATEGORY_STYLE_NOTES: Record<
  string,
  {
    naverCategoryLabel: string
    notes: string
    aiImageCount: number
    imagesPerParagraphs: number
    allowAiFallback: boolean
  }
> = {
  결혼: {
    naverCategoryLabel: "결혼일지(۶•̀ᴗ•́)۶",
    aiImageCount: 1,
    imagesPerParagraphs: 5,
    allowAiFallback: true,
    notes: `- 혼인신고, 웨딩홀 비교 등 절차/정보 안내형 글이 많은 카테고리입니다.
- 소제목은 반드시 그 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙여서 표시하세요. \`<blockquote>\`, \`</blockquote>\` 같은 HTML 태그는 절대 쓰지 마세요.
- 소제목 줄 바로 다음에는 반드시 빈 줄을 넣어서 소제목과 본문 내용이 서로 다른 문단이 되게 하세요(같은 문단에 이어 쓰지 마세요).
- 단계는 번호 목록(1. 2. 3.)으로 정리하세요.
- 놓치면 안 되는 정보는 **볼드**로 강조하세요.
- 마무리에 개인적인 소감 1~2문장을 자연스럽게 덧붙이세요.`,
  },
  육아: {
    naverCategoryLabel: "아가야 안녕(•ө•)♡",
    aiImageCount: 1,
    imagesPerParagraphs: 5,
    allowAiFallback: true,
    notes: `- 육아휴직/출산휴가 신청 같은 절차·서류 안내형 글이 많은 카테고리입니다.
- 소제목은 반드시 그 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙여서 표시하세요. \`<blockquote>\`, \`</blockquote>\` 같은 HTML 태그는 절대 쓰지 마세요.
- 소제목 줄 바로 다음에는 반드시 빈 줄을 넣어서 소제목과 본문 내용이 서로 다른 문단이 되게 하세요(같은 문단에 이어 쓰지 마세요).
- 단계는 번호 목록으로 정리하세요.
- 중요한 서류/조건/기한은 **볼드**로 강조하세요.`,
  },
  나들이: {
    naverCategoryLabel: "나들이일지(˘▾˘)~",
    aiImageCount: 4,
    imagesPerParagraphs: 3,
    allowAiFallback: false,
    notes: `- 방문한 장소(숙소, 시설, 여행지 등) 후기 글입니다.
- 글 상단에 주소/전화/영업시간/주차 등 기본 정보를 정리하세요. 각 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙이면 되고, \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요.
- 이후 사진 위치마다 한두 문장씩 짧고 구어체로 코멘트하세요(예: "~있다", "~함", "~인 듯").
- 마무리에 총평을 쓰고, 참고링크(지도 등) 마커가 있다면 위 "위치 링크 유지 규칙"에 따라 위치 안내로 그대로 남기세요.`,
  },
  맛집: {
    naverCategoryLabel: "욤뇸뇸일지(˘༥˘ )",
    aiImageCount: 4,
    imagesPerParagraphs: 3,
    allowAiFallback: false,
    notes: `- 방문한 맛집/카페 후기 글입니다.
- 글 상단에 주소/전화/영업시간/주차 등 기본 정보를 정리하세요. 각 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙이면 되고, \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요.
- 이후 사진 위치마다 한두 문장씩 짧고 구어체로 음식/분위기를 코멘트하세요.
- 마무리에 총평을 쓰고, 참고링크(지도 등) 마커가 있다면 위 "위치 링크 유지 규칙"에 따라 위치 안내로 그대로 남기세요.`,
  },
  기타: {
    naverCategoryLabel: "일상/꿀팁일지(ᐢ ̫ᐢ)",
    aiImageCount: 2,
    imagesPerParagraphs: 5,
    allowAiFallback: true,
    notes: `- 일상 공유, 정보/꿀팁, 이벤트·혜택 공유 등 다양한 글이 섞여 있는 카테고리입니다.
- 이벤트/혜택 공유 글이면 "~공유드립니닷", "신청ㄱㄱ!" 같은 캐주얼한 독려 문구와 링크를 자연스럽게 넣어도 됩니다.
- 정보/팁 글이면 결혼·육아 카테고리처럼 소제목과 번호 목록으로 정리하세요. 소제목은 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙이고, \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요. 소제목 줄 다음에는 반드시 빈 줄을 넣어 본문과 다른 문단으로 분리하세요.`,
  },
}

const DEFAULT_AI_IMAGE_COUNT = 1
const DEFAULT_ALLOW_AI_FALLBACK = false

function buildCategoryStyleNote(category: string): string {
  const entry = CATEGORY_STYLE_NOTES[category]
  if (!entry) return ""
  return `\n\n## 카테고리별 글 구성 참고 (실제 블로그 "${entry.naverCategoryLabel}" 카테고리 기준)\n${entry.notes}`
}

/**
 * 네이버 블로그 스타일 가이드 기본 시스템 프롬프트
 */
function buildSystemPrompt(styleGuide?: string, category?: string): string {
  const base = `당신은 네이버 블로그 "아기부리새"를 운영하는 실제 블로거 본인입니다. 독자는 이 글이 AI가 아니라 블로거 본인이 직접 쓴 글이라고 자연스럽게 믿어야 합니다. 아래 스타일 가이드를 반드시 지켜 글을 재작성하세요.

## 어투 (매우 중요 - 아래 실제 예시의 말투를 최대한 그대로 재현하세요)
아래는 이 블로거가 실제로 쓴 글의 발췌입니다(내용/주제는 무시하고 말투·리듬만 참고):

> 일단 넓다.
> 신기하게 심리 상담방도 있다. 조금 궁금쓰.
> 훈제란이 좀 아쉽다. 다음엔 맥반석을 먹어야 겠다.
> 그렇지만 찜질방에서 계란+식혜 조합은 뭐다? 사랑이다.ෆ˙ᵕ˙ෆ
> 사우나 찜질방 요금 ▼
> 저도 곧 혼인신고 하러 갑니다! 결혼하고 같이 산지 2년이 넘었는데 막상 혼인신고를 하려니까 또 설레네요🥰

이 예시에서 드러나는 특징을 그대로 살리세요:
- "~다.", "~음.", "~함.", "~인 듯." 같은 짧고 단정적인 반말체 문장을 서술문 사이에 자연스럽게 섞으세요(전부 "~예요/~네요"로만 끝내지 마세요).
- 가끔 스스로 묻고 스스로 답하는 식의 가벼운 문장("~뭐다? ~이다.")이나 감탄사, 혼잣말 같은 문장을 넣으세요.
- "일단", "그냥", "당연히", "진짜", "완전", "역시", "넘", "왕" 같은 구어체 강조 부사를 자연스럽게 씁니다.
- "쓰", "~인 듯", "ㅎㅎㅎ", "ㅋㅋㅋ" 같은 어미/추임새와 "( ˘﹃˘ )", "ෆ˙ᵕ˙ෆ", "✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧" 같은 특수 이모티콘을 문장 사이사이 자연스럽게 섞으세요.
- 문장은 짧게 끊어 쓰고, 지나치게 매끄럽거나 설명적인 "AI스러운" 문장(예: 완벽한 접속사로 이어지는 긴 문장, 과도하게 친절한 부연설명)은 피하세요.
- "~예요", "~네요", "~더라고요" 같은 정중한 반말도 섞이지만, 위 예시처럼 딱딱 끊는 반말체 비중을 더 높게 유지하세요.
- 과도한 존댓말은 피하고, 개인적 경험/감정을 자연스럽게 표현

## 구성
1. 서두: 1~2문장으로 글의 핵심 인상
2. 본문: 짧은 문단 위주로 구성 (사진별 설명이 있다면 장소→분위기→내용 순)
3. 마무리: 추천 또는 아쉬운 점, 배운 점

## 해시태그 (중요)
- "필수 포함 해시태그"가 주어지면, 그 태그들은 반드시 전부 해시태그 목록에 포함하세요(형식만 #태그명으로 맞추면 됨, 내용 변경 금지).
- 나머지 해시태그는 이 블로그의 실제 스타일에 맞게 자연스럽게 추가로 만들어서, 전체 해시태그 개수가 7~9개 정도가 되도록 채우세요.
- 실제 블로그는 "#분위기", "#데이트" 같은 지나치게 일반적인 단독 태그보다 상호명·지역명·속성을 조합한 좁은 태그(예: #부평맥주집, #부평하이볼)를 주로 씁니다. 이 방식을 따르세요.
- "필수 포함 해시태그"가 없으면, 위 스타일에 맞춰 전체 해시태그를 알아서 구성하세요.

## 첨부 사진 처리 규칙 (중요)
- 첨부된 사진의 실제 위치 배치는 시스템이 생성된 글을 후처리해서 자동으로 넣습니다. 당신은 사진 마커, "[사진]", "사진 첨부", 카메라 이모지 같은 어떤 형태의 placeholder도 절대 직접 만들어 쓰지 마세요.
- "첨부된 사진 설명"이 주어지면 그 캡션 내용만 참고해서 본문 흐름 속에서 자연스럽게 한두 문장 언급해도 되지만, 사진 내용을 마음대로 상상해서 묘사하거나 없는 디테일을 지어내지 마세요.

## 키워드 및 링크 반영 규칙 (매우 중요, 사실 왜곡 금지)
- "확인된 매장 정보"가 주어지면: 사용자가 첨부한 지도 URL 기준으로 실제 확인한 사실이므로 최우선입니다. 주소/전화/영업시간/주차/편의시설 등 주어진 항목은 본문 상단 요약에 반드시 이 값과 정확히 일치하게 포함하세요. url_context로 열어본 내용이나 스스로 알고 있는 정보가 이와 다르더라도 이 값을 따르고, 여기 없는 항목(화장실 유무 등)은 다른 출처로 확인되지 않는 한 언급하지 마세요.
- "필수 포함 키워드"가 주어지면: 사용자가 직접 확인한 사실이므로, 각 키워드를 본문에 자연스럽게 반드시 포함하세요.
- "필수 포함 키워드"가 없으면: 아래 \`[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: URL]\` 마커를 제공된 URL 컨텍스트 도구로 실제로 열어 확인한 내용(지도 위치, 메뉴, 리뷰/후기 등)만으로 글을 구성하세요.
- **어느 경우든, 실제로 확인되지 않은 구체적 사실(메뉴명, 가격, 특정 리뷰 문구, 평점 등)은 절대 추측해서 지어내지 마세요.** 확인이 안 되거나 URL을 열람할 수 없으면 그 정보는 언급하지 말고 넘어가세요. 정확성이 자연스러움보다 우선입니다.

## 위치 링크 유지 규칙 (중요)
- 실제 블로그 글은 마무리 부분에 위치를 확인할 수 있는 지도 링크를 남겨둡니다. \`[참고링크 - ...: URL]\` 마커가 지도/장소 링크라면, 내용 확인에 활용한 뒤에도 그 마커 자체를 지우지 말고 글 마무리(마지막 인사 앞이나 뒤) 근처에 위치 안내용으로 그대로 한 번 남겨두세요. 마커 형식을 바꾸거나 요약해서 다시 쓰지 말고 정확히 그 형태 그대로 유지하세요.${category ? buildCategoryStyleNote(category) : ""}`

  return styleGuide
    ? `${base}\n\n## 사용자 지정 스타일 가이드 (우선 적용)\n${styleGuide}`
    : base
}

// 링크 첨부만 LLM이 인식할 수 있는 마커 텍스트로 변환한다(url_context 툴로 실제 열어봐야
// 하므로 URL 자체가 필요함). Post.content(공개 사이트/DB용)와는 별개로 여기서만 조립한다.
// 사진 첨부는 LLM에게 URL 마커를 주지 않는다 — 모델이 마커 형식을 그대로 보존하지 않고
// 임의로 바꿔써서(예: "[사진 원본...]" → "📷첨부 사진") 실제 이미지가 통째로 사라지는
// 사고가 실측으로 확인되어, 사진은 텍스트 생성 후 insertImages()가 프로그래밍적으로 삽입한다.
function formatLinkMarkers(attachments: LlmAttachment[]): string {
  return attachments
    .filter((a) => a.kind === "link")
    .map((a) => {
      const label = a.label ? ` (${a.label})` : ""
      return `[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: ${a.url}]${label}`
    })
    .join("\n\n")
}

// 첨부된 사진의 캡션만 참고 정보로 전달한다(URL은 주지 않음 - 자연스러운 언급용).
function formatImageAttachmentHints(attachments: LlmAttachment[]): string {
  const captions = attachments
    .filter((a): a is LlmAttachment & { label: string } => a.kind === "image" && Boolean(a.label))
    .map((a, i) => `${i + 1}. ${a.label}`)

  if (captions.length === 0) return ""
  return `\n\n첨부된 사진 설명 (참고용 - 사진 위치는 시스템이 자동 배치하니 마커는 쓰지 말고, 자연스러운 언급에만 활용):\n${captions.join("\n")}`
}

function isNaverMapUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("map.naver.com")
  } catch {
    return false
  }
}

// 지도 링크가 있으면 실제 매장 주소/전화를 조회해 "확인된 사실"로 프롬프트에 주입한다.
// map.naver.com은 SPA라 url_context 툴이 페이지를 열어도 실제 주소/전화 텍스트를 못 얻고,
// 그 결과 모델이 그럴듯하지만 틀린 정보를 지어내는 사고가 실측으로 확인되어 도입한
// 안전장치다. 사용자가 직접 확인하고 첨부한 그 URL을 기준으로 삼아야 하므로:
// 1순위) URL에 담긴 place ID로 네이버 플레이스 상세 페이지에서 그 정확한 장소의 정보를
//        직접 조회한다(가장 신뢰할 수 있음 - 상호명이 흔해도 사용자가 고른 그 지점 그대로).
// 2순위) place ID가 없으면 URL의 검색어(searchText 등)로 지역 검색을 시도한다.
// 제목으로는 검색하지 않는다 — 흔한 상호명(예: "잇키")을 제목만으로 검색하면 완전히 다른
// 지점(부평→송도)을 잘못 매칭하는 사고가 실측으로 확인됐고, 사용자도 "정확한 URL을
// 첨부할 것이니 그 URL 기준으로 반영해달라"고 명시적으로 요청했다.
async function buildVerifiedPlaceInfoText(attachments: LlmAttachment[]): Promise<string> {
  const mapLink = attachments.find((a) => a.kind === "link" && isNaverMapUrl(a.url))
  if (!mapLink) return ""

  const placeId = extractNaverPlaceId(mapLink.url)
  let place = placeId ? await fetchNaverPlaceDetail(placeId) : null

  if (!place) {
    const label = extractLinkLabel(mapLink.url)
    if (label !== "지도에서 위치 보기") {
      place = await searchNaverPlace(label)
    }
  }

  if (!place) return ""

  const address = place.roadAddress ?? place.address
  if (!address) return ""

  const lines = [`- 상호명: ${place.name ?? "(확인 안 됨)"}`, `- 주소: ${address}`]
  if (place.telephone) lines.push(`- 전화: ${place.telephone}`)
  if (place.businessHours) lines.push(`- 영업시간: ${place.businessHours}`)
  if (place.conveniences?.length) lines.push(`- 편의시설: ${place.conveniences.join(", ")}`)

  return `\n\n확인된 매장 정보 (사용자가 첨부한 지도 URL 기준 실제 확인된 사실 - 반드시 이 값과 정확히 일치하게 쓰고, 다른 곳에서 본 정보와 달라도 이 값을 따르세요. 여기 없는 항목(화장실 유무 등)은 확인되지 않은 것이니 언급하지 마세요):\n${lines.join("\n")}`
}

/**
 * 사용자 메시지 구성
 */
function buildUserMessage(post: Post, verifiedPlaceInfoText: string): string {
  const attachments = post.contentAttachments ?? []
  const linkMarkersText = formatLinkMarkers(attachments)
  const imageHintsText = formatImageAttachmentHints(attachments)
  const keywords = post.keywords ?? []
  const keywordsText = keywords.length
    ? `\n\n필수 포함 키워드 (사용자가 직접 확인한 사실 - 반드시 자연스럽게 포함): ${keywords.join(", ")}`
    : ""
  const tagsText = post.tags.length
    ? post.tags.join(", ")
    : "(입력 없음 - 아래 스타일에 맞는 해시태그를 직접 구성)"

  return `다음 Notion 글을 위 스타일 가이드에 맞춰 네이버 블로그 포스팅용으로 재작성해주세요.

제목: ${post.title}
카테고리: ${post.category}
필수 포함 해시태그: ${tagsText}

본문:
${post.content || "(본문 텍스트 없음 - 아래 첨부 정보를 참고해 작성)"}${linkMarkersText ? `\n\n${linkMarkersText}` : ""}${imageHintsText}${verifiedPlaceInfoText}${keywordsText}`
}

const MARKER_PARAGRAPH = /^\[(사진 원본|참고링크)/

// 이미지 슬롯의 "장면 설명"으로 쓰기엔 너무 짧은 문단(예: "그럼 다들 기분 좋은 하루
// 보내세요.🙌" 같은 마무리 인사)은 실질적인 장면 정보가 없어, AI 생성 이미지가 본문과
// 전혀 무관한 결과(인물 클로즈업 등)로 나오는 사고가 실측으로 확인됐다.
const MIN_VISUAL_PARAGRAPH_LENGTH = 40

// 이미지 슬롯으로 쓸 수 있는 문단을 필터링한다. 인사말(첫 문단)/마무리·해시태그(마지막 문단),
// 인용구·해시태그 줄, 이미 사진/링크 마커인 문단, 장면 설명으로 쓰기엔 너무 짧은 문단은 제외한다.
function getVisualParagraphCandidates(paragraphs: string[]): number[] {
  const candidates: number[] = []
  paragraphs.forEach((raw, i) => {
    const p = raw.trim()
    if (i === 0 || i === paragraphs.length - 1) return
    if (!p || p.startsWith(">") || p.startsWith("#") || MARKER_PARAGRAPH.test(p)) return
    if (p.length < MIN_VISUAL_PARAGRAPH_LENGTH) return
    candidates.push(i)
  })
  return candidates
}

// 이미지 슬롯을 삽입할 문단 위치를 고른다. 후보 문단 중 균등한 간격으로 count개를 고른다.
function selectImageInsertionPoints(candidates: number[], count: number): number[] {
  if (candidates.length === 0 || count <= 0) return []
  if (candidates.length <= count) return candidates

  const step = candidates.length / count
  return Array.from({ length: count }, (_, k) => candidates[Math.floor(k * step)])
}

// Notion 제목에 흔히 붙는 "[테스트]", "[협찬]" 같은 대괄호 접두사는 이미지 검색 관련성을
// 떨어뜨리므로 제거한다.
function cleanTitleForSearch(title: string): string {
  return title.replace(/^\[[^\]]*\]\s*/, "").trim()
}

// 이미지 슬롯마다 검색어를 다르게 구성해, 실제 본문(장소/메뉴)과 무관한 사진이 반복
// 재사용되지 않고 각 자리에 맞는 사진을 찾도록 한다. 사용자가 입력한 실제 태그를
// 조합에 사용하고(허구 키워드 조합 방지), 태그가 없으면 제목만으로 검색한다.
function buildImageSearchQuery(cleanTitle: string, tags: string[], slotIndex: number): string {
  if (tags.length === 0) return cleanTitle
  return `${cleanTitle} ${tags[slotIndex % tags.length]}`
}

// 후보 목록에서 (아직 안 쓰인 것 중) 관련성 검증을 통과한 첫 후보를 찾는다. 슬롯당 검증
// 시도 예산(remainingAttempts)을 다 쓰면 통과 못 해도 중단한다.
async function pickVerifiedCandidate(
  candidates: string[],
  usedUrls: Set<string>,
  description: string,
  apiKey: string,
  remainingAttempts: number
): Promise<{ pick: string | null; attemptsUsed: number }> {
  let attemptsUsed = 0
  for (const candidate of candidates) {
    if (usedUrls.has(candidate)) continue
    if (attemptsUsed >= remainingAttempts) break
    attemptsUsed++
    const relevance = await verifyImageRelevance(apiKey, candidate, description)
    if (relevance === "unknown") {
      console.warn(`[llm] 이미지 관련성 확인 불가(검증 모델 호출 실패) - 안전하게 건너뜀: ${candidate}`)
    }
    if (relevance === "relevant") return { pick: candidate, attemptsUsed }
  }
  return { pick: null, attemptsUsed }
}

// AI 이미지를 생성하고 관련성을 검증해 통과한 이미지를 반환한다. 1회 생성 후
// 검증 실패 시 1회 재생성해 다시 검증하고, 그래도 실패하면 null을 반환한다.
async function generateVerifiedAiImage(
  apiKey: string,
  description: string,
  style: IllustrativeImageStyle
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const imageUrl = await generateAiImage(apiKey, description, style)
    if (!imageUrl) continue
    const relevance = await verifyImageRelevance(apiKey, imageUrl, description)
    if (relevance === "relevant") return imageUrl
    if (relevance === "unknown") {
      console.warn("[llm] AI 생성 이미지 검증 불가(모델 호출 실패) - 안전하게 건너뜀")
    }
  }
  return null
}

// 부족한 이미지 개수를 채운다. 모든 카테고리가 동일한 파이프라인을 따른다:
// (1) 첨부된 지도 URL의 place ID로 그 장소의 실제 사진(업체 등록/방문자 인증 사진) 시도
// (2) 그걸로 못 채우면 슬롯마다 다른 검색어로 네이버 이미지 검색 시도
// (3) allowAiFallback=true인 카테고리만, 그래도 못 채운 나머지를 검증 후 AI로 생성
// allowAiFallback=false인 카테고리(나들이/맛집)는 (1)+(2)로 채우지 못한 슬롯을 비워둔다.
// place ID 기반 사진은 첨부 링크가 가리키는 바로 그 장소의 사진이라 검색과 달리
// 다른 장소 사진이 섞일 일이 없다(실측 확인된 문제 - 이자카야 글에 검색으로 찾은
// 무관한 피자 사진이 쓰인 사고).
async function resolveShortfallImages(
  points: number[],
  paragraphs: string[],
  postTitle: string,
  tags: string[],
  apiKey: string,
  allowAiFallback: boolean,
  placeId: string | null
): Promise<(string | null)[]> {
  const cleanTitle = cleanTitleForSearch(postTitle)
  const placePhotos = placeId ? await fetchNaverPlacePhotos(placeId, points.length * 5) : []

  // 검증 시도를 두 단계로 나눠 place/search 각각에 최소 예산을 보장하고,
  // 전체 예산을 늘린다 (3 → 6).
  const MAX_VERIFY_ATTEMPTS_PER_SLOT = 6
  const MIN_ATTEMPTS_PER_SOURCE = 2
  const usedUrls = new Set<string>()
  const results: (string | null)[] = []

  for (let i = 0; i < points.length; i++) {
    const description = paragraphs[points[i]].slice(0, 60)

    // (1) place 사진 시도 (최소 MIN_ATTEMPTS_PER_SOURCE회)
    const fromPlace = await pickVerifiedCandidate(
      placePhotos,
      usedUrls,
      description,
      apiKey,
      MIN_ATTEMPTS_PER_SOURCE
    )
    let pick = fromPlace.pick
    let remaining = MAX_VERIFY_ATTEMPTS_PER_SLOT - fromPlace.attemptsUsed

    // (2) 검색 시도 (나머지 예산, 최소 MIN_ATTEMPTS_PER_SOURCE회)
    if (!pick && remaining >= MIN_ATTEMPTS_PER_SOURCE) {
      const searchCandidates = await searchRealImages(
        buildImageSearchQuery(cleanTitle, tags, i),
        8
      )
      const fromSearch = await pickVerifiedCandidate(
        searchCandidates,
        usedUrls,
        description,
        apiKey,
        remaining
      )
      pick = fromSearch.pick
    }

    if (pick) usedUrls.add(pick)
    results.push(pick)
  }

  // allowAiFallback=false인 경우(나들이/맛집)는 여기서 반환. AI 생성은 하지 않음.
  if (!allowAiFallback) return results

  // (3) AI 생성 (allowAiFallback=true인 경우만)
  const missingIndexes = results
    .map((v, i) => (v === null ? i : -1))
    .filter((i) => i >= 0)

  if (missingIndexes.length > 0) {
    const generated = await Promise.all(
      missingIndexes.map((i) =>
        generateVerifiedAiImage(apiKey, paragraphs[points[i]].slice(0, 60), "summary")
      )
    )
    missingIndexes.forEach((i, k) => {
      results[i] = generated[k]
    })
  }

  return results
}

// 사용자 첨부 사진과 부족분(실사 검색/AI 생성)을 모두 서술형 문단 사이사이에 프로그래밍적으로
// 끼워넣는다. 첨부 사진의 URL은 LLM에게 애초에 주지 않으므로(위 formatImageAttachmentHints
// 참고) 여기서 코드가 직접 삽입해야 실제로 첨부한 사진이 결과에 반드시 포함된다.
// 모든 카테고리가 동일하게 (첨부 → 웹 검색) 파이프라인을 따르고,
// allowAiFallback=true인 카테고리(결혼·육아·기타)만 AI 이미지로 보완한다.
// allowAiFallback=false인 카테고리(나들이·맛집)는 부족한 슬롯을 비워둔다.
async function insertImages(text: string, apiKey: string, post: Post): Promise<string> {
  const attachments = (post.contentAttachments ?? []).filter((a) => a.kind === "image")
  const entry = post.category ? CATEGORY_STYLE_NOTES[post.category] : undefined
  const allowAiFallback = entry?.allowAiFallback ?? DEFAULT_ALLOW_AI_FALLBACK

  const paragraphs = text.split("\n\n")
  const candidates = getVisualParagraphCandidates(paragraphs)

  // 이미지 목표 개수를 "카테고리 최소값" 또는 "글 길이 기반값" 중 더 큰 값으로 결정
  const minImageCount = entry?.aiImageCount ?? DEFAULT_AI_IMAGE_COUNT
  const imagesPerParagraphs = entry?.imagesPerParagraphs ?? 5
  const lengthBasedCount = Math.ceil(candidates.length / imagesPerParagraphs)
  const targetCount = Math.max(minImageCount, lengthBasedCount)

  const shortfall = Math.max(targetCount - attachments.length, 0)
  const totalSlots = attachments.length + shortfall
  if (totalSlots === 0) return text

  const points = selectImageInsertionPoints(candidates, totalSlots)
  if (points.length === 0) return text

  const mapLink = (post.contentAttachments ?? []).find(
    (a) => a.kind === "link" && isNaverMapUrl(a.url)
  )
  const placeId = mapLink ? extractNaverPlaceId(mapLink.url) : null

  // 앞쪽 자리는 사용자 첨부 사진, 나머지 자리만 검색/생성으로 채운다.
  const shortfallPoints = points.slice(attachments.length)
  const shortfallImages =
    shortfallPoints.length > 0
      ? await resolveShortfallImages(
          shortfallPoints,
          paragraphs,
          post.title,
          post.tags,
          apiKey,
          allowAiFallback,
          placeId
        )
      : []

  // 첨부 사진의 캡션으로 Notion 파일명(예: "20180206_195520.jpg")이 그대로 화면에 노출되던
  // 문제가 있어, 마커에는 캡션을 붙이지 않는다(파일명은 의미 있는 설명이 아니므로).
  const images: (string | null)[] = [
    ...attachments.map((a) => a.url),
    ...shortfallImages,
  ]

  const result = [...paragraphs]
  // 배열에 새 원소를 끼워넣는 대신 대상 문단 뒤에 마커를 이어붙이므로 인덱스가 밀리지 않는다.
  points.forEach((pointIndex, k) => {
    const imageUrl = images[k]
    if (!imageUrl) return
    result[pointIndex] =
      result[pointIndex] +
      `\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: ${imageUrl}]`
  })

  return result.join("\n\n")
}

/**
 * LLM(Gemini)을 이용한 네이버 블로그 스타일 초안 생성
 */
export async function generateNaverDraft(post: Post, styleGuide?: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    throw new Error("LLM_API_KEY가 설정되지 않았습니다.")
  }

  const verifiedPlaceInfoText = await buildVerifiedPlaceInfoText(post.contentAttachments ?? [])

  const ai = new GoogleGenAI({ apiKey })
  const contents = buildUserMessage(post, verifiedPlaceInfoText)
  const config = {
    systemInstruction: buildSystemPrompt(styleGuide, post.category),
    httpOptions: { timeout: TIMEOUT_MS },
    tools: [{ urlContext: {} }],
  }

  let lastError: unknown
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({ model, contents, config })
      )

      if (!response.text) {
        throw new Error("LLM 응답에서 텍스트를 추출할 수 없습니다.")
      }

      return await insertImages(response.text, apiKey, post)
    } catch (error) {
      if (!shouldTryNextModel(error)) throw error
      console.warn(`[llm] ${model} 사용 불가(할당량 소진/미지원) — 다음 모델로 전환`, error)
      lastError = error
    }
  }

  throw lastError
}
