import { NotionBlock } from "@/types"
import { OptimizedImage } from "@/components/OptimizedImage"

interface PostBodyProps {
  blocks?: NotionBlock[]
  fallbackContent: string
  pageId: string
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

export function PostBody({ blocks, fallbackContent, pageId }: PostBodyProps) {
  // blocks가 없으면 폴백 (구버전 캐시, mock 데이터 미정의 등)
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
          default:
            return null
        }
      })}
    </div>
  )
}
