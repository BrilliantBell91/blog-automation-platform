import { GoogleGenAI, ApiError, UrlRetrievalStatus } from "@google/genai"
import { Post, LlmAttachment } from "@/types"
import { GEMINI_RATE_LIMIT } from "@/constants"

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

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (error) {
      const isRateLimited = error instanceof ApiError && error.status === 429
      if (!isRateLimited || attempt >= GEMINI_RATE_LIMIT.MAX_RETRIES) throw error
      await sleep(GEMINI_RATE_LIMIT.RETRY_BACKOFF_MS * 2 ** attempt)
      attempt++
    }
  }
}

// 재시도로도 해소되지 않는 429(할당량 소진)나 404(이 계정에서 모델 미지원)면
// 다음 모델로 넘어간다. 그 외 에러(응답에 text 없음, 504 등)는 즉시 전파한다.
function shouldTryNextModel(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 429 || error.status === 404)
}

// 카테고리별 실제 블로그(blog.naver.com/zmfflsp) 스타일 참고자료.
// 2026-07-14에 카테고리별 실제 게시글을 직접 확인하고 정리한 내용:
// - 결혼/육아: 혼인신고, 육아휴직 신청 등 절차·정보 안내형 글이 많음 (인용구 소제목 + 번호 목록 구조)
// - 나들이/맛집: 장소 방문 후기형 글 (상단 정보 인용구 + 사진별 코멘트 구조)
// - 기타: 일상 공유부터 이벤트/혜택 공유까지 다양하게 섞여 있음
const CATEGORY_STYLE_NOTES: Record<string, { naverCategoryLabel: string; notes: string }> = {
  결혼: {
    naverCategoryLabel: "결혼일지(۶•̀ᴗ•́)۶",
    notes: `- 혼인신고, 웨딩홀 비교 등 절차/정보 안내형 글이 많은 카테고리입니다.
- 소제목은 인용구(blockquote)로 구분하고, 단계는 번호 목록(1. 2. 3.)으로 정리하세요.
- 놓치면 안 되는 정보는 **볼드**로 강조하세요.
- 마무리에 개인적인 소감 1~2문장을 자연스럽게 덧붙이세요.`,
  },
  육아: {
    naverCategoryLabel: "아가야 안녕(•ө•)♡",
    notes: `- 육아휴직/출산휴가 신청 같은 절차·서류 안내형 글이 많은 카테고리입니다.
- 소제목은 인용구(blockquote)로 구분하고, 단계는 번호 목록으로 정리하세요.
- 중요한 서류/조건/기한은 **볼드**로 강조하세요.`,
  },
  나들이: {
    naverCategoryLabel: "나들이일지(˘▾˘)~",
    notes: `- 방문한 장소(숙소, 시설, 여행지 등) 후기 글입니다.
- 글 상단에 인용구(blockquote)로 주소/전화/영업시간/주차 등 기본 정보를 먼저 정리하세요.
- 이후 사진 위치마다 한두 문장씩 짧고 구어체로 코멘트하세요(예: "~있다", "~함", "~인 듯").
- 마무리에 총평과 위치 안내를 넣으세요.`,
  },
  맛집: {
    naverCategoryLabel: "욤뇸뇸일지(˘༥˘ )",
    notes: `- 방문한 맛집/카페 후기 글입니다.
- 글 상단에 인용구(blockquote)로 주소/전화/영업시간/주차 등 기본 정보를 먼저 정리하세요.
- 이후 사진 위치마다 한두 문장씩 짧고 구어체로 음식/분위기를 코멘트하세요.
- 마무리에 총평과 위치 안내를 넣으세요.`,
  },
  기타: {
    naverCategoryLabel: "일상/꿀팁일지(ᐢ ̫ᐢ)",
    notes: `- 일상 공유, 정보/꿀팁, 이벤트·혜택 공유 등 다양한 글이 섞여 있는 카테고리입니다.
- 이벤트/혜택 공유 글이면 "~공유드립니닷", "신청ㄱㄱ!" 같은 캐주얼한 독려 문구와 링크를 자연스럽게 넣어도 됩니다.
- 정보/팁 글이면 결혼·육아 카테고리처럼 소제목(인용구)과 번호 목록으로 정리하세요.`,
  },
}

function buildCategoryStyleNote(category: string): string {
  const entry = CATEGORY_STYLE_NOTES[category]
  if (!entry) return ""
  return `\n\n## 카테고리별 글 구성 참고 (실제 블로그 "${entry.naverCategoryLabel}" 카테고리 기준)\n${entry.notes}`
}

/**
 * 네이버 블로그 스타일 가이드 기본 시스템 프롬프트
 */
function buildSystemPrompt(styleGuide?: string, category?: string): string {
  const base = `당신은 네이버 블로그에서 활동하는 인기 있는 블로거입니다. 아래 스타일 가이드를 반드시 지켜 글을 재작성하세요.

## 어투
- 친근하고 실용적: "~예요", "~네요", "~더라고요", "~했어"
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
- **어느 경우든, 실제로 확인되지 않은 구체적 사실(메뉴명, 가격, 특정 리뷰 문구, 평점 등)은 절대 추측해서 지어내지 마세요.** 확인이 안 되거나 URL을 열람할 수 없으면 그 정보는 언급하지 말고 넘어가세요. 정확성이 자연스러움보다 우선입니다.${category ? buildCategoryStyleNote(category) : ""}`

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

/**
 * LLM(Gemini)을 이용한 네이버 블로그 스타일 초안 생성
 */
export async function generateNaverDraft(post: Post, styleGuide?: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    throw new Error("LLM_API_KEY가 설정되지 않았습니다.")
  }

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

      return response.text + warning
    } catch (error) {
      if (!shouldTryNextModel(error)) throw error
      console.warn(`[llm] ${model} 사용 불가(할당량 소진/미지원) — 다음 모델로 전환`, error)
      lastError = error
    }
  }

  throw lastError
}
