import { NotionBlock, LlmAttachment } from "@/types"
import { OptimizedImage } from "@/components/OptimizedImage"

interface PostBodyProps {
  blocks?: NotionBlock[]
  fallbackContent: string
  pageId: string
  // 본문 블록도 텍스트도 전혀 없는 글(사진/링크를 Notion "Image"/"URL" 속성에만 첨부하고
  // 본문은 안 쓰는 경우가 실측으로 확인됨)을 위한 최후 폴백. LLM 마커 텍스트는 절대
  // 포함하지 않고 순수 이미지/링크만 렌더링하므로 기존 "공개 사이트에 노출 안 함" 설계
  // 의도(마커 텍스트 노출 금지)를 위반하지 않는다.
  attachments?: LlmAttachment[]
}

interface ListRun {
  type: "bulleted_list_item" | "numbered_list_item"
  items: NotionBlock[]
}

function groupListItems(blocks: NotionBlock[]): (NotionBlock | ListRun)[] {
  const result: (NotionBlock | ListRun)[] = []
  let currentRun: ListRun | null = null

  for (const block of blocks) {
    if (block.type === "bulleted_list_item") {
      if (!currentRun || currentRun.type !== "bulleted_list_item") {
        if (currentRun) result.push(currentRun)
        currentRun = { type: "bulleted_list_item", items: [block] }
      } else {
        currentRun.items.push(block)
      }
    } else if (block.type === "numbered_list_item") {
      if (!currentRun || currentRun.type !== "numbered_list_item") {
        if (currentRun) result.push(currentRun)
        currentRun = { type: "numbered_list_item", items: [block] }
      } else {
        currentRun.items.push(block)
      }
    } else {
      if (currentRun) {
        result.push(currentRun)
        currentRun = null
      }
      result.push(block)
    }
  }

  if (currentRun) result.push(currentRun)
  return result
}

function AttachmentGallery({ attachments, pageId }: { attachments: LlmAttachment[]; pageId: string }) {
  const images = attachments.filter((a) => a.kind === "image")
  const links = attachments.filter((a) => a.kind === "link")

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert sm:prose-base">
      {images.map((image, i) => (
        <div
          key={image.url}
          className="relative my-4 aspect-[4/3] overflow-hidden rounded-lg bg-muted"
        >
          <OptimizedImage
            src={image.url}
            alt={image.label || "첨부 이미지"}
            variant="body"
            pageId={pageId}
            // Notion "Image" 속성 첨부 재조회는 현재 첫 번째 파일 URL만 돌려주므로,
            // 두 번째 이미지부터는(i > 0) 만료 후 재조회가 정확하지 않을 수 있다(알려진 한계).
            refreshKind={i === 0 ? "property" : undefined}
            className="object-contain"
          />
        </div>
      ))}
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block my-4 p-4 border rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="text-sm font-medium text-muted-foreground mb-1">참고 링크</div>
          <div className="text-base font-semibold text-foreground break-words">
            {link.label || link.url}
          </div>
        </a>
      ))}
    </div>
  )
}

export function PostBody({ blocks, fallbackContent, pageId, attachments }: PostBodyProps) {
  // blocks도 fallbackContent(본문 텍스트)도 전혀 없으면, 사진/링크를 Notion 속성에만
  // 첨부한 글이라는 뜻이니 첨부 갤러리로 대체한다.
  if ((!blocks || blocks.length === 0) && !fallbackContent && attachments?.length) {
    return <AttachmentGallery attachments={attachments} pageId={pageId} />
  }

  // blocks가 없으면 텍스트 폴백 (구버전 캐시, mock 데이터 미정의 등)
  if (!blocks || blocks.length === 0) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert sm:prose-base">
        {fallbackContent.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    )
  }

  const groupedBlocks = groupListItems(blocks)

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert sm:prose-base">
      {groupedBlocks.map((item, index) => {
        // 리스트 그룹
        if ("items" in item) {
          const Tag = item.type === "bulleted_list_item" ? "ul" : "ol"
          return (
            <Tag key={index}>
              {item.items.map((block) => (
                <li key={block.id}>{block.content}</li>
              ))}
            </Tag>
          )
        }

        // 개별 블록
        const block = item as NotionBlock
        switch (block.type) {
          case "paragraph":
            return <p key={block.id}>{block.content}</p>
          case "heading_1":
            return <h1 key={block.id}>{block.content}</h1>
          case "heading_2":
            return <h2 key={block.id}>{block.content}</h2>
          case "heading_3":
            return <h3 key={block.id}>{block.content}</h3>
          case "quote":
            return <blockquote key={block.id}>{block.content}</blockquote>
          case "code":
            return (
              <pre key={block.id}>
                <code>{block.content}</code>
              </pre>
            )
          case "image":
            return (
              <div
                key={block.id}
                className="relative my-4 aspect-[4/3] overflow-hidden rounded-lg bg-muted"
              >
                <OptimizedImage
                  src={block.imageUrl || ""}
                  alt={block.content || "본문 이미지"}
                  variant="body"
                  blockId={block.id}
                  pageId={pageId}
                  className="object-contain"
                />
              </div>
            )
          case "bookmark":
          case "link_preview":
          case "embed":
            if (!block.linkUrl) return null
            return (
              <a
                key={block.id}
                href={block.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block my-4 p-4 border rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              >
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  {block.type === "embed" ? "임베드 콘텐츠" : "참고 링크"}
                </div>
                <div className="text-base font-semibold text-foreground break-words">
                  {block.content || block.linkUrl}
                </div>
              </a>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
