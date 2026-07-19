// 네이버 초안 텍스트(순수 텍스트 + 마커)를 실제 블로그 화면처럼 렌더링하기 위한 블록으로 분류한다.
// src/lib/llm.ts의 프롬프트 규칙(사진 마커, 참고링크 마커, 해시태그 줄 형식)을 기준으로 파싱한다.

import type { LlmAttachment } from "@/types"

export type NaverDraftBlock =
  | { type: "image"; url: string; caption?: string }
  | { type: "link"; url: string; label: string }
  | { type: "hashtags"; tags: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "paragraph"; text: string }

const PHOTO_MARKER = /^\[사진 원본[^:]*:\s*([^\]\s]+)\]\s*(.*)$/
const LINK_MARKER = /^\[참고링크[^:]*:\s*([^\]\s]+)\]\s*(.*)$/
// LLM이 "마커 형식을 그대로 유지하라"는 지시를 어기고 [참고링크 ...] 대괄호 래퍼를
// 빼먹은 채 URL만 남기는 경우가 실측으로 확인됐다(예: "위치는 요기 ▼" 다음 문단이
// 순수 지도 URL 한 줄뿐). 문단 전체가 URL 하나뿐이면 마커가 없어도 링크 카드로
// 렌더링해, 프롬프트 재지시에 의존하지 않고 파싱 단계에서 안전하게 흡수한다.
const BARE_URL_LINE = /^(https?:\/\/\S+)$/

// 지도 URL을 그대로 노출하면 실제 게시글처럼 안 보이므로, 검색어/장소명 쿼리 파라미터나
// 경로에서 사람이 읽을 수 있는 라벨을 뽑아내 링크 카드에 쓴다. 못 찾으면 기본 문구로 대체.
export function extractLinkLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const queryLabel =
      parsed.searchParams.get("searchText") ?? parsed.searchParams.get("query") ?? undefined
    if (queryLabel) return decodeURIComponent(queryLabel)

    const pathMatch = parsed.pathname.match(/\/search\/([^/]+)/)
    if (pathMatch) return decodeURIComponent(pathMatch[1])
  } catch {
    // URL 파싱 실패 시 기본 문구로 대체
  }
  return "지도에서 위치 보기"
}

function isHashtagLine(paragraph: string): string[] | null {
  const tokens = paragraph.trim().split(/\s+/)
  if (tokens.length === 0 || !tokens.every((t) => /^#[^\s#]+$/.test(t))) return null
  return tokens.map((t) => t.slice(1))
}

function isQuoteBlock(paragraph: string): string[] | null {
  const lines = paragraph.split("\n").filter((line) => line.trim().length > 0)
  if (lines.length === 0 || !lines.every((line) => line.trim().startsWith(">"))) return null
  return lines.map((line) => line.trim().replace(/^>\s*/, ""))
}

// 소제목(">" 줄)과 본문이 프롬프트 지시와 달리 같은 문단에 붙어버린 경우를 방어적으로 분리한다.
// 첫 줄만 ">"로 시작하고 나머지 줄은 그렇지 않으면, 첫 줄을 별도 인용구로 떼어내고
// 나머지는 일반 문단으로 반환한다.
function splitLeadingQuoteLine(
  paragraph: string
): { heading: string; rest: string } | null {
  const lines = paragraph.split("\n")
  if (lines.length < 2) return null

  const [first, ...others] = lines
  if (!first.trim().startsWith(">")) return null
  if (others.some((line) => line.trim().startsWith(">"))) return null // 여러 줄짜리 진짜 인용구 블록은 건드리지 않음

  const rest = others.join("\n").trim()
  if (!rest) return null

  return { heading: first.trim().replace(/^>\s*/, ""), rest }
}

// URL의 쿼리스트링(서명 등)을 제거한 "경로" 부분만 뽑아낸다. Notion 첨부 사진의 S3 서명
// URL은 버킷/키(경로)는 고정이고 서명(X-Amz-* 쿼리스트링)만 재조회 때마다 바뀌므로,
// 경로가 같으면 "같은 사진의 최신 서명"이라고 판단할 수 있다.
function urlPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.origin + parsed.pathname
  } catch {
    return null
  }
}

// Draft.generatedContent에는 초안 생성 시점의 Notion 이미지 URL(S3 서명 URL, 약 1시간 후
// 만료)이 [사진 원본 ...: <url>] 마커에 문자열로 그대로 박제된다. 생성 후 시간이 지나면
// 그 URL이 만료돼 NaverDraftView가 깨진 이미지를 보여주는 사고가 실측으로 확인됐다.
// 렌더링 시점에 그 포스트의 최신 Notion 첨부 목록(attachments)을 받아, 경로가 일치하는
// 사진 마커의 URL만 최신 서명 URL로 치환한다. 검색 결과/생성 이미지 등 Notion이 아닌
// 이미지는 애초에 attachments에 없거나 경로가 안 맞으므로 그대로 둔다. DB에 저장된
// generatedContent 자체는 바꾸지 않고 렌더링 직전에만 적용하는 표시 계층 처리다.
export function refreshDraftImageUrls(content: string, attachments: LlmAttachment[]): string {
  const freshByPath = new Map<string, string>()
  for (const attachment of attachments) {
    if (attachment.kind !== "image") continue
    const path = urlPath(attachment.url)
    if (path) freshByPath.set(path, attachment.url)
  }
  if (freshByPath.size === 0) return content

  const paragraphs = content.split("\n\n")
  const updated = paragraphs.map((paragraph) => {
    const match = paragraph.match(PHOTO_MARKER)
    if (!match) return paragraph

    const staleUrl = match[1]
    const path = urlPath(staleUrl)
    const freshUrl = path ? freshByPath.get(path) : undefined
    if (!freshUrl || freshUrl === staleUrl) return paragraph

    return paragraph.replace(staleUrl, freshUrl)
  })

  return updated.join("\n\n")
}

export function parseNaverDraft(content: string): NaverDraftBlock[] {
  const paragraphs = content.split("\n\n").map((p) => p.trim()).filter(Boolean)

  return paragraphs.flatMap((paragraph): NaverDraftBlock[] => {
    const photoMatch = paragraph.match(PHOTO_MARKER)
    if (photoMatch) {
      const [, url, trailing] = photoMatch
      return [{ type: "image", url, caption: trailing.trim() || undefined }]
    }

    const linkMatch = paragraph.match(LINK_MARKER)
    if (linkMatch) {
      return [{ type: "link", url: linkMatch[1], label: extractLinkLabel(linkMatch[1]) }]
    }

    const bareUrlMatch = paragraph.match(BARE_URL_LINE)
    if (bareUrlMatch) {
      return [{ type: "link", url: bareUrlMatch[1], label: extractLinkLabel(bareUrlMatch[1]) }]
    }

    const tags = isHashtagLine(paragraph)
    if (tags) {
      return [{ type: "hashtags", tags }]
    }

    const quoteLines = isQuoteBlock(paragraph)
    if (quoteLines) {
      return [{ type: "quote", lines: quoteLines }]
    }

    const split = splitLeadingQuoteLine(paragraph)
    if (split) {
      return [
        { type: "quote", lines: [split.heading] },
        { type: "paragraph", text: split.rest },
      ]
    }

    return [{ type: "paragraph", text: paragraph }]
  })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function inlineMarkdownToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")
}

// 초안을 리치 텍스트(HTML)로 직렬화한다. 네이버 블로그 에디터에 붙여넣었을 때
// 이미지·링크·인용구가 텍스트가 아니라 실제 요소로 붙도록 클립보드에 함께 실어 보내는 용도.
export function naverDraftToHtml(content: string): string {
  const blocks = parseNaverDraft(content)

  return blocks
    .map((block) => {
      switch (block.type) {
        case "image":
          return `<p><img src="${block.url}" alt="${escapeHtml(block.caption ?? "")}" style="max-width:100%;"></p>`
        case "link":
          // 네이버 블로그 에디터는 링크가 걸리지 않은 순수 URL 한 줄을 그대로 붙여넣으면
          // 자동으로 인식해 지도 위젯(카드)으로 변환해준다. <a> 태그로 감싸면 이미 "링크"로
          // 처리되어 이 자동 변환이 걸리지 않는 것으로 확인되어, 앵커 없이 URL 텍스트만 둔다.
          return `<p>${escapeHtml(block.url)}</p>`
        case "hashtags":
          return `<p>${block.tags.map((t) => "#" + escapeHtml(t)).join(" ")}</p>`
        case "quote":
          return `<blockquote>${block.lines.map(escapeHtml).join("<br>")}</blockquote>`
        case "paragraph":
          return `<p>${inlineMarkdownToHtml(block.text)}</p>`
      }
    })
    .join("\n")
}
