import { Fragment } from "react"
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
      return (
        <p key={index}>
          <a href={block.url} target="_blank" rel="noopener noreferrer">
            {block.url}
          </a>
        </p>
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
