import { GoogleGenAI, ApiError, UrlRetrievalStatus } from "@google/genai"
import { Post, LlmAttachment } from "@/types"
import { GEMINI_RATE_LIMIT } from "@/constants"
import {
  generateIllustrativeImage,
  verifyImageRelevance,
  type IllustrativeImageStyle,
} from "./imageGen"
import { searchRealImages } from "./imageSearch"

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
const CATEGORY_STYLE_NOTES: Record<
  string,
  {
    naverCategoryLabel: string
    notes: string
    aiImageCount: number
    imageStyle: "summary" | "photo"
  }
> = {
  결혼: {
    naverCategoryLabel: "결혼일지(۶•̀ᴗ•́)۶",
    aiImageCount: 1,
    imageStyle: "summary",
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
    imageStyle: "summary",
    notes: `- 육아휴직/출산휴가 신청 같은 절차·서류 안내형 글이 많은 카테고리입니다.
- 소제목은 반드시 그 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙여서 표시하세요. \`<blockquote>\`, \`</blockquote>\` 같은 HTML 태그는 절대 쓰지 마세요.
- 소제목 줄 바로 다음에는 반드시 빈 줄을 넣어서 소제목과 본문 내용이 서로 다른 문단이 되게 하세요(같은 문단에 이어 쓰지 마세요).
- 단계는 번호 목록으로 정리하세요.
- 중요한 서류/조건/기한은 **볼드**로 강조하세요.`,
  },
  나들이: {
    naverCategoryLabel: "나들이일지(˘▾˘)~",
    aiImageCount: 4,
    imageStyle: "photo",
    notes: `- 방문한 장소(숙소, 시설, 여행지 등) 후기 글입니다.
- 글 상단에 주소/전화/영업시간/주차 등 기본 정보를 정리하세요. 각 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙이면 되고, \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요.
- 이후 사진 위치마다 한두 문장씩 짧고 구어체로 코멘트하세요(예: "~있다", "~함", "~인 듯").
- 마무리에 총평을 쓰고, 참고링크(지도 등) 마커가 있다면 위 "위치 링크 유지 규칙"에 따라 위치 안내로 그대로 남기세요.`,
  },
  맛집: {
    naverCategoryLabel: "욤뇸뇸일지(˘༥˘ )",
    aiImageCount: 4,
    imageStyle: "photo",
    notes: `- 방문한 맛집/카페 후기 글입니다.
- 글 상단에 주소/전화/영업시간/주차 등 기본 정보를 정리하세요. 각 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙이면 되고, \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요.
- 이후 사진 위치마다 한두 문장씩 짧고 구어체로 음식/분위기를 코멘트하세요.
- 마무리에 총평을 쓰고, 참고링크(지도 등) 마커가 있다면 위 "위치 링크 유지 규칙"에 따라 위치 안내로 그대로 남기세요.`,
  },
  기타: {
    naverCategoryLabel: "일상/꿀팁일지(ᐢ ̫ᐢ)",
    aiImageCount: 2,
    imageStyle: "summary",
    notes: `- 일상 공유, 정보/꿀팁, 이벤트·혜택 공유 등 다양한 글이 섞여 있는 카테고리입니다.
- 이벤트/혜택 공유 글이면 "~공유드립니닷", "신청ㄱㄱ!" 같은 캐주얼한 독려 문구와 링크를 자연스럽게 넣어도 됩니다.
- 정보/팁 글이면 결혼·육아 카테고리처럼 소제목과 번호 목록으로 정리하세요. 소제목은 줄 맨 앞에 "> " (꺾쇠 기호 + 공백)만 붙이고, \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요. 소제목 줄 다음에는 반드시 빈 줄을 넣어 본문과 다른 문단으로 분리하세요.`,
  },
}

const DEFAULT_AI_IMAGE_COUNT = 1
const DEFAULT_IMAGE_STYLE = "photo" as const

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

## 사진 마커 처리 규칙 (중요)
- 본문에 \`[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: URL]\` 형태의 마커가 있으면, 이 마커는 절대 고치거나 지우지 말고 정확히 그 형태 그대로 유지하세요.
- 마커에 캡션이 함께 있으면 그 캡션만 참고해서 짧게 언급해도 되지만, 사진 내용을 마음대로 상상해서 묘사하거나 없는 디테일을 지어내지 마세요.

## 키워드 및 링크 반영 규칙 (매우 중요, 사실 왜곡 금지)
- "필수 포함 키워드"가 주어지면: 사용자가 직접 확인한 사실이므로, 각 키워드를 본문에 자연스럽게 반드시 포함하세요.
- "필수 포함 키워드"가 없으면: 아래 \`[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: URL]\` 마커를 제공된 URL 컨텍스트 도구로 실제로 열어 확인한 내용(지도 위치, 메뉴, 리뷰/후기 등)만으로 글을 구성하세요.
- **어느 경우든, 실제로 확인되지 않은 구체적 사실(메뉴명, 가격, 특정 리뷰 문구, 평점 등)은 절대 추측해서 지어내지 마세요.** 확인이 안 되거나 URL을 열람할 수 없으면 그 정보는 언급하지 말고 넘어가세요. 정확성이 자연스러움보다 우선입니다.

## 위치 링크 유지 규칙 (중요)
- 실제 블로그 글은 마무리 부분에 위치를 확인할 수 있는 지도 링크를 남겨둡니다. \`[참고링크 - ...: URL]\` 마커가 지도/장소 링크라면, 내용 확인에 활용한 뒤에도 그 마커 자체를 지우지 말고 글 마무리(마지막 인사 앞이나 뒤) 근처에 위치 안내용으로 그대로 한 번 남겨두세요. 마커 형식을 바꾸거나 요약해서 다시 쓰지 말고 정확히 그 형태 그대로 유지하세요.${category ? buildCategoryStyleNote(category) : ""}`

  return styleGuide
    ? `${base}\n\n## 사용자 지정 스타일 가이드 (우선 적용)\n${styleGuide}`
    : base
}

// 사진/링크 첨부(본문 블록 + "Content" 속성 유래 모두 포함)를 LLM이 인식할 수 있는
// 마커 텍스트로 변환한다. Post.content(공개 사이트/DB용)와는 별개로 여기서만 조립한다.
function formatAttachmentMarkers(attachments: LlmAttachment[]): string {
  return attachments
    .map((a) => {
      const label = a.label ? ` (${a.label})` : ""
      return a.kind === "image"
        ? `[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: ${a.url}]${label}`
        : `[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: ${a.url}]${label}`
    })
    .join("\n\n")
}

/**
 * 사용자 메시지 구성
 */
function buildUserMessage(post: Post): string {
  const attachmentsText = formatAttachmentMarkers(post.contentAttachments ?? [])
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
${post.content || "(본문 텍스트 없음 - 아래 첨부 정보를 참고해 작성)"}${attachmentsText ? `\n\n${attachmentsText}` : ""}${keywordsText}`
}

// url_context 툴이 실제로 조회하지 못한 링크를 모아 경고 문구를 만든다.
// 프롬프트 지시만으로는 모델이 사실을 지어낼 위험을 막을 수 없으므로,
// "정말로 그 URL을 읽었는지"를 API 응답 메타데이터로 검증하는 코드 레벨 안전장치다.
function buildUnverifiedLinksWarning(
  urlMetadata: { retrievedUrl?: string; urlRetrievalStatus?: string }[] | undefined
): string {
  if (!urlMetadata?.length) return ""

  const failedUrls = urlMetadata
    .filter((m) => m.urlRetrievalStatus !== UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS)
    .map((m) => m.retrievedUrl)
    .filter((url): url is string => Boolean(url))

  if (!failedUrls.length) return ""

  const list = failedUrls.map((url) => `- ${url}`).join("\n")
  return `\n\n---\n⚠️ 아래 링크는 자동으로 내용을 확인하지 못했습니다. 게시 전 직접 확인 후 반영해주세요:\n${list}`
}

const MARKER_PARAGRAPH = /^\[(사진 원본|참고링크)/

// AI 생성 이미지를 끼워넣을 문단 위치를 고른다. 인사말(첫 문단)/마무리·해시태그(마지막 문단),
// 인용구·해시태그 줄, 이미 사진/링크 마커인 문단은 후보에서 제외하고, 남은 "서술형" 문단 중
// 균등한 간격으로 count개를 고른다. (지시문만으로 LLM에게 위치 표시를 맡겼을 때 실제로는
// 자주 무시되는 것을 확인해서, 생성된 텍스트를 후처리하는 결정론적 방식으로 전환함)
function selectImageInsertionPoints(paragraphs: string[], count: number): number[] {
  const candidates: number[] = []
  paragraphs.forEach((raw, i) => {
    const p = raw.trim()
    if (i === 0 || i === paragraphs.length - 1) return
    if (!p || p.startsWith(">") || p.startsWith("#") || MARKER_PARAGRAPH.test(p)) return
    candidates.push(i)
  })

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

// 부족한 이미지 개수를 채운다. 우선순위: (1) 실사 스타일 카테고리(나들이·맛집)는 슬롯마다
// 다른 검색어로 네이버 이미지 검색을 해 실제 사진을 먼저 찾고, (2) 검색으로 못 채운
// 나머지(또는 요약 스타일 카테고리 전체)는 AI로 생성한다.
async function resolveShortfallImages(
  points: number[],
  paragraphs: string[],
  postTitle: string,
  tags: string[],
  apiKey: string,
  style: IllustrativeImageStyle
): Promise<(string | null)[]> {
  if (style !== "photo") {
    return Promise.all(
      points.map((i) => generateIllustrativeImage(apiKey, paragraphs[i].slice(0, 60), style))
    )
  }

  const cleanTitle = cleanTitleForSearch(postTitle)
  // 슬롯마다 후보를 여러 장 받아온 뒤, (1) 앞 슬롯에서 이미 고른 이미지는 건너뛰고
  // (2) 비전 모델로 그 문단 내용과 실제로 관련 있는지 검증해 통과한 첫 후보만 쓴다.
  // 유명하지 않은 가게일수록 검색 결과에 전혀 무관한 사진이 섞여 나오는 걸 실측으로
  // 확인해서, 관련성 검증 없이는 신뢰할 수 없다고 판단함. 비용을 고려해 슬롯당 검증
  // 시도는 최대 3장으로 제한하고, 통과하는 후보가 없으면 AI 생성으로 폴백한다.
  const MAX_VERIFY_ATTEMPTS_PER_SLOT = 3
  const usedUrls = new Set<string>()
  const results: (string | null)[] = []
  for (let i = 0; i < points.length; i++) {
    const description = paragraphs[points[i]].slice(0, 60)
    const candidates = await searchRealImages(buildImageSearchQuery(cleanTitle, tags, i), 5)

    let pick: string | null = null
    let attempts = 0
    for (const candidate of candidates) {
      if (usedUrls.has(candidate)) continue
      if (attempts >= MAX_VERIFY_ATTEMPTS_PER_SLOT) break
      attempts++
      if (await verifyImageRelevance(apiKey, candidate, description)) {
        pick = candidate
        break
      }
    }

    if (pick) usedUrls.add(pick)
    results.push(pick)
  }

  const missingIndexes = results
    .map((v, i) => (v === null ? i : -1))
    .filter((i) => i >= 0)

  if (missingIndexes.length > 0) {
    const generated = await Promise.all(
      missingIndexes.map((i) =>
        generateIllustrativeImage(apiKey, paragraphs[points[i]].slice(0, 60), style)
      )
    )
    missingIndexes.forEach((i, k) => {
      results[i] = generated[k]
    })
  }

  return results
}

// 사용자가 제공한 사진이 카테고리 기준 개수보다 부족하면, 부족한 개수만큼 채워서
// 서술형 문단 사이사이에 끼워넣는다. 정보/절차성 카테고리(결혼·육아·기타)는 AI 요약형
// 이미지, 방문 후기성 카테고리(나들이·맛집)는 실사 검색 우선 + AI 생성 보완(CATEGORY_STYLE_NOTES 기준).
async function insertGeneratedImages(
  text: string,
  apiKey: string,
  post: Post,
  existingImageCount: number
): Promise<string> {
  const entry = post.category ? CATEGORY_STYLE_NOTES[post.category] : undefined
  const targetCount = entry?.aiImageCount ?? DEFAULT_AI_IMAGE_COUNT
  const style = entry?.imageStyle ?? DEFAULT_IMAGE_STYLE
  const shortfall = targetCount - existingImageCount
  if (shortfall <= 0) return text

  const paragraphs = text.split("\n\n")
  const points = selectImageInsertionPoints(paragraphs, shortfall)
  if (points.length === 0) return text

  const images = await resolveShortfallImages(
    points,
    paragraphs,
    post.title,
    post.tags,
    apiKey,
    style
  )

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

  const existingImageCount = (post.contentAttachments ?? []).filter(
    (a) => a.kind === "image"
  ).length

  const ai = new GoogleGenAI({ apiKey })
  const contents = buildUserMessage(post)
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

      const warning = buildUnverifiedLinksWarning(
        response.candidates?.[0]?.urlContextMetadata?.urlMetadata
      )

      const finalText = await insertGeneratedImages(
        response.text,
        apiKey,
        post,
        existingImageCount
      )

      return finalText + warning
    } catch (error) {
      if (!shouldTryNextModel(error)) throw error
      console.warn(`[llm] ${model} 사용 불가(할당량 소진/미지원) — 다음 모델로 전환`, error)
      lastError = error
    }
  }

  throw lastError
}
