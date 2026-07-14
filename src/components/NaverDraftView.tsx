import { Fragment } from "react"
import { MapPin, ExternalLink } from "lucide-react"
import { NaverDraftBlock, parseNaverDraft } from "@/lib/naverDraftParser"
import { Badge } from "@/components/ui/badge"

interface NaverDraftViewProps {
  content: string
}

// "**볼드**" 구간만 <strong>으로 치환하고 나머지 텍스트(줄바꿈 포함)는 그대로 둔다.
// 줄바꿈은 부모에 적용된 whitespace-pre-wrap이 그대로 렌더링해준다.
function renderInline(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g)
  return segments.map((segment, i) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return <strong key={i}>{segment.slice(2, -2)}</strong>
    }
    return <Fragment key={i}>{segment}</Fragment>
  })
}

function renderBlock(block: NaverDraftBlock, index: number) {
  switch (block.type) {
    case "image":
      return (
        <figure key={index} className="my-4">
          {/* 첨부 이미지 도메인이 다양한 S3 리전이라 next/image remotePatterns 관리 부담을 피하기 위해 일반 img 사용 */}
          <img
            src={block.url}
            alt={block.caption || "첨부 사진"}
            className="w-full rounded-lg object-cover"
          />
          {block.caption && (
            <figcaption className="mt-1 text-center text-sm text-muted-foreground">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    case "link":
      // 실제 게시글처럼 지도 URL을 그대로 노출하지 않고, "위치 안내" 배너 카드로 보여준다.
      // (실제 지도 이미지는 네이버 지도 og:image가 고정 로고만 반환해 재현 불가 — 카드 스타일로 대체)
      return (
        <a
          key={index}
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="not-prose my-4 flex items-center gap-3 rounded-xl border bg-gradient-to-br from-muted/60 to-muted/20 p-4 no-underline transition-colors hover:from-muted hover:to-muted/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block text-xs text-muted-foreground">위치는 요기 👇</span>
            <span className="block font-medium">{block.label}</span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
      )
    case "hashtags":
      return (
        <div key={index} className="flex flex-wrap gap-1.5 not-prose">
          {block.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
        </div>
      )
    case "quote":
      return (
        <blockquote
          key={index}
          className="border-l-4 pl-4 not-italic text-muted-foreground"
        >
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {line}
              {i < block.lines.length - 1 && <br />}
            </Fragment>
          ))}
        </blockquote>
      )
    case "paragraph":
      return (
        <p key={index} className="whitespace-pre-wrap">
          {renderInline(block.text)}
        </p>
      )
  }
}

export function NaverDraftView({ content }: NaverDraftViewProps) {
  const blocks = parseNaverDraft(content)

  return (
    <div className="prose prose-sm max-w-none space-y-4 dark:prose-invert sm:prose-base">
      {blocks.map(renderBlock)}
    </div>
  )
}
