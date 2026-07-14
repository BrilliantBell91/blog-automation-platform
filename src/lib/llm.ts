import { GoogleGenAI, ApiError, UrlRetrievalStatus } from "@google/genai"
import { Post, LlmAttachment } from "@/types"
import { GEMINI_RATE_LIMIT } from "@/constants"

const MODEL = "gemini-3-flash-preview"
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

/**
 * 네이버 블로그 스타일 가이드 기본 시스템 프롬프트
 */
function buildSystemPrompt(styleGuide?: string): string {
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
- 나머지 해시태그는 이 블로그의 실제 스타일(상호명·지역명·카테고리 조합 등)에 맞게 자연스럽게 추가로 만들어서, 전체 해시태그 개수가 8~10개 정도가 되도록 채우세요.
- "필수 포함 해시태그"가 없으면, 위 스타일에 맞춰 전체 해시태그를 알아서 구성하세요.

## 사진 마커 처리 규칙 (중요)
- 본문에 \`[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: URL]\` 형태의 마커가 있으면, 이 마커는 절대 고치거나 지우지 말고 정확히 그 형태 그대로 유지하세요.
- 마커에 캡션이 함께 있으면 그 캡션만 참고해서 짧게 언급해도 되지만, 사진 내용을 마음대로 상상해서 묘사하거나 없는 디테일을 지어내지 마세요.

## 키워드 및 링크 반영 규칙 (매우 중요, 사실 왜곡 금지)
- "필수 포함 키워드"가 주어지면: 사용자가 직접 확인한 사실이므로, 각 키워드를 본문에 자연스럽게 반드시 포함하세요.
- "필수 포함 키워드"가 없으면: 아래 \`[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: URL]\` 마커를 제공된 URL 컨텍스트 도구로 실제로 열어 확인한 내용(지도 위치, 메뉴, 리뷰/후기 등)만으로 글을 구성하세요.
- **어느 경우든, 실제로 확인되지 않은 구체적 사실(메뉴명, 가격, 특정 리뷰 문구, 평점 등)은 절대 추측해서 지어내지 마세요.** 확인이 안 되거나 URL을 열람할 수 없으면 그 정보는 언급하지 말고 넘어가세요. 정확성이 자연스러움보다 우선입니다.`

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

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: buildUserMessage(post),
      config: {
        systemInstruction: buildSystemPrompt(styleGuide),
        httpOptions: { timeout: TIMEOUT_MS },
        tools: [{ urlContext: {} }],
      },
    })
  )

  if (!response.text) {
    throw new Error("LLM 응답에서 텍스트를 추출할 수 없습니다.")
  }

  const warning = buildUnverifiedLinksWarning(
    response.candidates?.[0]?.urlContextMetadata?.urlMetadata
  )

  return response.text + warning
}
