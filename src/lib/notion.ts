import {
  Client,
  isFullPage,
  isFullBlock,
  isFullDatabase,
  isNotionClientError,
  APIErrorCode,
  collectPaginatedAPI,
} from "@notionhq/client"
import type { PageObjectResponse, BlockObjectResponse } from "@notionhq/client"
import { Post, NotionBlock } from "@/types"
import { NOTION_RATE_LIMIT, NOTION_DATABASE_ID } from "@/constants"

const notion = new Client({ auth: process.env.NOTION_API_KEY })

let cachedDataSourceId: string | null = null

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (error) {
      const isRateLimited =
        isNotionClientError(error) && error.code === APIErrorCode.RateLimited
      if (!isRateLimited || attempt >= NOTION_RATE_LIMIT.MAX_RETRIES) throw error
      await sleep(NOTION_RATE_LIMIT.RETRY_BACKOFF_MS * 2 ** attempt)
      attempt++
    }
  }
}

// 데이터베이스는 여러 data source를 가질 수 있으므로(Notion API 2025-09-03+),
// 쿼리 전에 database_id로부터 data_source_id를 한 번 조회해 캐싱한다.
async function getDataSourceId(): Promise<string> {
  if (cachedDataSourceId) return cachedDataSourceId
  const database = await withRetry(() =>
    notion.databases.retrieve({ database_id: NOTION_DATABASE_ID })
  )
  if (!isFullDatabase(database)) {
    throw new Error("Notion 데이터베이스 정보를 가져올 수 없습니다")
  }
  const dataSourceId = database.data_sources[0]?.id
  if (!dataSourceId) {
    throw new Error("Notion 데이터베이스에서 data source를 찾을 수 없습니다")
  }
  cachedDataSourceId = dataSourceId
  return dataSourceId
}

function richTextToPlainText(richText: { plain_text: string }[]): string {
  return richText.map((t) => t.plain_text).join("")
}

function getTitle(page: PageObjectResponse): string {
  const prop = page.properties["Title"]
  return prop?.type === "title" ? richTextToPlainText(prop.title) : ""
}

function getSelect(page: PageObjectResponse, name: string): string {
  const prop = page.properties[name]
  return prop?.type === "select" ? (prop.select?.name ?? "") : ""
}

// Tags 속성은 multi_select 또는 콤마로 구분된 rich_text로 입력될 수 있다.
function getTags(page: PageObjectResponse, name: string): string[] {
  const prop = page.properties[name]
  if (prop?.type === "multi_select") return prop.multi_select.map((t) => t.name)
  if (prop?.type === "rich_text") {
    return richTextToPlainText(prop.rich_text)
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return []
}

function getDate(page: PageObjectResponse, name: string): Date | undefined {
  const prop = page.properties[name]
  return prop?.type === "date" && prop.date?.start ? new Date(prop.date.start) : undefined
}

function getUrl(page: PageObjectResponse, name: string): string | undefined {
  const prop = page.properties[name]
  return prop?.type === "url" ? (prop.url ?? undefined) : undefined
}

function getCoverImageUrl(page: PageObjectResponse): string | undefined {
  if (!page.cover) return undefined
  return page.cover.type === "external" ? page.cover.external.url : page.cover.file.url
}

function blockToNotionBlock(block: BlockObjectResponse): NotionBlock | null {
  switch (block.type) {
    case "paragraph":
      return { id: block.id, type: "paragraph", content: richTextToPlainText(block.paragraph.rich_text) }
    case "heading_1":
      return { id: block.id, type: "heading_1", content: richTextToPlainText(block.heading_1.rich_text) }
    case "heading_2":
      return { id: block.id, type: "heading_2", content: richTextToPlainText(block.heading_2.rich_text) }
    case "heading_3":
      return { id: block.id, type: "heading_3", content: richTextToPlainText(block.heading_3.rich_text) }
    case "bulleted_list_item":
      return {
        id: block.id,
        type: "bulleted_list_item",
        content: richTextToPlainText(block.bulleted_list_item.rich_text),
      }
    case "numbered_list_item":
      return {
        id: block.id,
        type: "numbered_list_item",
        content: richTextToPlainText(block.numbered_list_item.rich_text),
      }
    case "quote":
      return { id: block.id, type: "quote", content: richTextToPlainText(block.quote.rich_text) }
    case "code":
      return { id: block.id, type: "code", content: richTextToPlainText(block.code.rich_text) }
    case "image": {
      const imageUrl = block.image.type === "external" ? block.image.external.url : block.image.file.url
      return { id: block.id, type: "image", content: richTextToPlainText(block.image.caption), imageUrl }
    }
    default:
      return null
  }
}

async function getPageBlocks(pageId: string): Promise<NotionBlock[]> {
  const blocks = await withRetry(() =>
    collectPaginatedAPI(
      (args) => notion.blocks.children.list({ ...args, block_id: pageId }),
      {}
    )
  )
  return blocks
    .filter(isFullBlock)
    .map(blockToNotionBlock)
    .filter((block): block is NotionBlock => block !== null)
}

function blocksToContent(blocks: NotionBlock[]): string {
  return blocks
    .map((b) => b.content)
    .filter(Boolean)
    .join("\n\n")
}

function blocksToExcerpt(blocks: NotionBlock[], maxLength = 120): string {
  const text = blocks.find((b) => b.type === "paragraph" && b.content)?.content ?? ""
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function firstImageUrl(blocks: NotionBlock[]): string | undefined {
  return blocks.find((b) => b.type === "image")?.imageUrl
}

async function mapPageToPost(page: PageObjectResponse): Promise<Post> {
  const blocks = await getPageBlocks(page.id)

  return {
    id: page.id,
    notionId: page.id,
    title: getTitle(page),
    content: blocksToContent(blocks),
    excerpt: blocksToExcerpt(blocks),
    category: getSelect(page, "Category"),
    tags: getTags(page, "Tags"),
    imageUrl: getCoverImageUrl(page) ?? firstImageUrl(blocks),
    status: (getSelect(page, "Status") || "초안") as Post["status"],
    publishedAt: getDate(page, "Published"),
    naverDraftStatus: (getSelect(page, "NaverDraftStatus") || "미생성") as Post["naverDraftStatus"],
    naverPostUrl: getUrl(page, "NaverPostUrl"),
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time),
  }
}

/**
 * 발행된 포스트 전체 조회
 */
export async function getPublishedPosts(): Promise<Post[]> {
  const dataSourceId = await getDataSourceId()
  const response = await withRetry(() =>
    notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: { property: "Status", select: { equals: "발행됨" } },
      sorts: [{ property: "Published", direction: "descending" }],
    })
  )
  const pages = response.results.filter(isFullPage)
  return Promise.all(pages.map(mapPageToPost))
}

/**
 * 특정 ID의 포스트 조회
 */
export async function getPostById(id: string): Promise<Post | null> {
  try {
    const page = await withRetry(() => notion.pages.retrieve({ page_id: id }))
    if (!isFullPage(page)) return null
    return await mapPageToPost(page)
  } catch (error) {
    if (isNotionClientError(error) && error.code === APIErrorCode.ObjectNotFound) return null
    throw error
  }
}

/**
 * 카테고리별 포스트 조회
 */
export async function getPostsByCategory(category: string): Promise<Post[]> {
  const dataSourceId = await getDataSourceId()
  const response = await withRetry(() =>
    notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        and: [
          { property: "Status", select: { equals: "발행됨" } },
          { property: "Category", select: { equals: category } },
        ],
      },
      sorts: [{ property: "Published", direction: "descending" }],
    })
  )
  const pages = response.results.filter(isFullPage)
  return Promise.all(pages.map(mapPageToPost))
}

/**
 * 키워드로 포스트 검색 (제목, 태그, 본문)
 *
 * Notion 데이터베이스 쿼리는 페이지 속성만 필터링할 수 있고 본문 검색을 지원하지
 * 않으므로, 발행된 포스트를 조회한 뒤 애플리케이션 레벨에서 필터링한다.
 */
export async function searchPosts(
  query: string,
  searchType: "all" | "title" | "tag" | "content" = "all"
): Promise<Post[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const posts = await getPublishedPosts()

  return posts.filter((post) => {
    const matchesTitle = post.title.toLowerCase().includes(normalizedQuery)
    const matchesTag = post.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
    const matchesContent = post.content.toLowerCase().includes(normalizedQuery)

    if (searchType === "title") return matchesTitle
    if (searchType === "tag") return matchesTag
    if (searchType === "content") return matchesContent
    return matchesTitle || matchesTag || matchesContent
  })
}

/**
 * 모든 카테고리 목록 조회 (발행된 포스트 기준 집계)
 */
export async function getCategories(): Promise<string[]> {
  const posts = await getPublishedPosts()
  return Array.from(new Set(posts.map((post) => post.category).filter(Boolean)))
}

/**
 * 만료된 Notion 이미지 URL 재조회
 */
export async function refreshImageUrl(blockId: string): Promise<string> {
  const block = await withRetry(() => notion.blocks.retrieve({ block_id: blockId }))
  if (!isFullBlock(block) || block.type !== "image") {
    throw new Error("이미지 블록이 아닙니다")
  }
  return block.image.type === "external" ? block.image.external.url : block.image.file.url
}
