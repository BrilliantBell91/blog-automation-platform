// 네이버 초안 텍스트(순수 텍스트 + 마커)를 실제 블로그 화면처럼 렌더링하기 위한 블록으로 분류한다.
// src/lib/llm.ts의 프롬프트 규칙(사진 마커, 참고링크 마커, 해시태그 줄 형식)을 기준으로 파싱한다.

export type NaverDraftBlock =
  | { type: "image"; url: string; caption?: string }
  | { type: "link"; url: string }
  | { type: "hashtags"; tags: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "paragraph"; text: string }

const PHOTO_MARKER = /^\[사진 원본[^:]*:\s*([^\]\s]+)\]\s*(.*)$/
const LINK_MARKER = /^\[참고링크[^:]*:\s*([^\]\s]+)\]\s*(.*)$/

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

export function parseNaverDraft(content: string): NaverDraftBlock[] {
  const paragraphs = content.split("\n\n").map((p) => p.trim()).filter(Boolean)

  return paragraphs.map((paragraph): NaverDraftBlock => {
    const photoMatch = paragraph.match(PHOTO_MARKER)
    if (photoMatch) {
      const [, url, trailing] = photoMatch
      return { type: "image", url, caption: trailing.trim() || undefined }
    }

    const linkMatch = paragraph.match(LINK_MARKER)
    if (linkMatch) {
      return { type: "link", url: linkMatch[1] }
    }

    const tags = isHashtagLine(paragraph)
    if (tags) {
      return { type: "hashtags", tags }
    }

    const quoteLines = isQuoteBlock(paragraph)
    if (quoteLines) {
      return { type: "quote", lines: quoteLines }
    }

    return { type: "paragraph", text: paragraph }
  })
}
