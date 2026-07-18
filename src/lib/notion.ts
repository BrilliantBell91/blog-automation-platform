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
import { Post, NotionBlock, LlmAttachment } from "@/types"
import { NOTION_RATE_LIMIT, NOTION_DATABASE_ID } from "@/constants"

// 대량 이미지 업로드(api/admin/notion/uploads)에서도 같은 클라이언트를 재사용하기 위해 export한다.
export const notion = new Client({ auth: process.env.NOTION_API_KEY })

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

// "Content" 속성 - 해당 글에 핵심적으로 들어가야 하는 내용(네이버 초안에 반드시 포함되어야
// 하는 확인된 사실). 원래 이름은 "Keyword"였으나 "단어" 나열이 아니라 "글의 핵심 내용"을
// 반영하는 용도라 속성명이 "Content"로 변경됨. Tags와 동일하게 multi_select 또는 콤마 구분
// rich_text를 모두 지원한다.
function getKeywords(page: PageObjectResponse, name: string): string[] {
  return getTags(page, name)
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
    case "bookmark":
      return {
        id: block.id,
        type: "bookmark",
        content: richTextToPlainText(block.bookmark.caption),
        linkUrl: block.bookmark.url,
      }
    case "link_preview":
      return { id: block.id, type: "link_preview", content: "", linkUrl: block.link_preview.url }
    case "embed":
      return {
        id: block.id,
        type: "embed",
        content: richTextToPlainText(block.embed.caption),
        linkUrl: block.embed.url,
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

// 공개 웹사이트/검색/로컬 DB에 쓰이는 순수 본문 텍스트.
// 사진·링크류 블록은 여기서 제외한다 — 마커 텍스트가 사이트에 그대로 노출되면 안 되기 때문.
// (이미지 자체는 blocks 배열을 통해 PostBody가 별도로 렌더링한다.)
const NARRATIVE_BLOCK_TYPES = new Set<NotionBlock["type"]>([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "quote",
  "code",
])

function blocksToContent(blocks: NotionBlock[]): string {
  return blocks
    .filter((b) => NARRATIVE_BLOCK_TYPES.has(b.type))
    .map((b) => b.content)
    .filter(Boolean)
    .join("\n\n")
}

// 본문 블록 중 사진/링크류를 네이버 초안 생성(LLM)용 첨부 목록으로 뽑아낸다.
function blocksToAttachments(blocks: NotionBlock[]): LlmAttachment[] {
  const attachments: LlmAttachment[] = []
  for (const block of blocks) {
    if (block.type === "image" && block.imageUrl) {
      attachments.push({ kind: "image", url: block.imageUrl, label: block.content || undefined })
    } else if (
      (block.type === "bookmark" || block.type === "link_preview" || block.type === "embed") &&
      block.linkUrl
    ) {
      attachments.push({ kind: "link", url: block.linkUrl, label: block.content || undefined })
    }
  }
  return attachments
}

// "Image" 속성("파일과 미디어" 타입)에 첨부한 사진/영상을 사진 첨부로 변환한다.
// 기존에는 "Content" 속성 하나가 사진과 참고 URL을 겸했으나, 이제 "Image"는 사진/영상
// 전용이고 참고 URL은 별도 "URL" 속성(getUrlPropertyAttachments)으로 분리되었다.
function getImagePropertyAttachments(page: PageObjectResponse, name: string): LlmAttachment[] {
  const prop = page.properties[name]
  if (prop?.type !== "files") return []

  return prop.files.map((file): LlmAttachment => {
    const url = file.type === "file" ? file.file.url : file.external.url
    return { kind: "image", url, label: file.name || undefined }
  })
}

// "URL" 속성(장소/메뉴/리뷰 등 참고용 링크)을 참고링크 첨부로 변환한다.
// Notion에서 url 타입(단일 값) 또는 rich_text(여러 URL을 줄바꿈/쉼표로 나열)로 입력할 수
// 있어 둘 다 지원한다.
function getUrlPropertyAttachments(page: PageObjectResponse, name: string): LlmAttachment[] {
  const prop = page.properties[name]
  if (prop?.type === "url") {
    return prop.url ? [{ kind: "link", url: prop.url }] : []
  }
  if (prop?.type === "rich_text") {
    const urls = richTextToPlainText(prop.rich_text).match(/https?:\/\/\S+/g) ?? []
    return urls.map((url): LlmAttachment => ({ kind: "link", url }))
  }
  return []
}

function blocksToExcerpt(blocks: NotionBlock[], maxLength = 120): string {
  const text = blocks.find((b) => b.type === "paragraph" && b.content)?.content ?? ""
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function firstImageBlock(blocks: NotionBlock[]): NotionBlock | undefined {
  return blocks.find((b) => b.type === "image")
}

async function mapPageToPost(page: PageObjectResponse): Promise<Post> {
  const blocks = await getPageBlocks(page.id)
  const thumbnailBlock = firstImageBlock(blocks)
  const contentAttachments = [
    ...blocksToAttachments(blocks),
    ...getImagePropertyAttachments(page, "Image"),
    ...getUrlPropertyAttachments(page, "URL"),
  ]

  // 본문에 이미지 블록이 없는 글(사진을 Notion "Image" 속성에만 첨부하고 본문은 안 쓰는
  // 경우가 실측으로 확인됨 - 예: 본문 블록 0개에 Image 속성 사진 2장인 글)은 카드 썸네일이
  // 아예 안 뜨는 문제가 있어, 첨부 이미지로 폴백한다.
  const propertyImageFallback = thumbnailBlock
    ? undefined
    : contentAttachments.find((a) => a.kind === "image")

  return {
    id: page.id,
    notionId: page.id,
    title: getTitle(page),
    content: blocksToContent(blocks),
    excerpt: blocksToExcerpt(blocks),
    category: getSelect(page, "Category"),
    tags: getTags(page, "Tags"),
    imageUrl: thumbnailBlock?.imageUrl ?? propertyImageFallback?.url,
    status: (getSelect(page, "Status") || "초안") as Post["status"],
    publishedAt: getDate(page, "Published"),
    naverDraftStatus: (getSelect(page, "NaverDraftStatus") || "미생성") as Post["naverDraftStatus"],
    naverPostUrl: getUrl(page, "NaverPostUrl"),
    blocks,
    thumbnailBlockId: thumbnailBlock?.id,
    thumbnailSource: thumbnailBlock ? "block" : propertyImageFallback ? "property" : undefined,
    keywords: getKeywords(page, "Content"),
    contentAttachments,
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
 * 만료된 Notion 이미지 URL 재조회 (블록 기반)
 */
export async function refreshImageUrl(blockId: string): Promise<string> {
  const block = await withRetry(() => notion.blocks.retrieve({ block_id: blockId }))
  if (!isFullBlock(block) || block.type !== "image") {
    throw new Error("이미지 블록이 아닙니다")
  }
  return block.image.type === "external" ? block.image.external.url : block.image.file.url
}

/**
 * 만료된 커버 이미지 URL 재조회 (페이지 기반)
 */
export async function refreshCoverImageUrl(pageId: string): Promise<string | undefined> {
  const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }))
  if (!isFullPage(page)) {
    throw new Error("페이지 정보를 가져올 수 없습니다")
  }
  return getCoverImageUrl(page)
}

/**
 * 만료된 썸네일 이미지 URL 재조회 (Notion "Image" 속성 기반)
 * 본문에 이미지 블록이 없어 "Image" 속성 사진으로 폴백한 썸네일(Post.thumbnailSource
 * === "property")은 블록 ID가 없어 refreshImageUrl()로 재조회할 수 없으므로 별도 경로가 필요하다.
 */
export async function refreshImagePropertyUrl(pageId: string): Promise<string | undefined> {
  const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }))
  if (!isFullPage(page)) {
    throw new Error("페이지 정보를 가져올 수 없습니다")
  }
  return getImagePropertyAttachments(page, "Image")[0]?.url
}
