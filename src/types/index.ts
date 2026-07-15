// 포스트 상태
export type PostStatus = '초안' | '발행됨' | '보관됨'

// 초안 상태
export type DraftStatus = '미생성' | '생성됨' | '게시완료'

// Notion 블록 타입
export type NotionBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'image'
  | 'quote'
  | 'code'
  | 'bookmark'
  | 'link_preview'
  | 'embed'

// Notion 블록 데이터
export interface NotionBlock {
  id: string
  type: NotionBlockType
  content: string
  imageUrl?: string
  linkUrl?: string
}

// 네이버 초안 생성(LLM)에만 쓰이는 첨부 정보.
// 사진/링크가 본문 블록이 아니라 "Image"(파일과 미디어 타입) 속성이나 "URL"(참고 링크)
// 속성에 올라오는 경우까지 포함해서 모은다. Post.content(공개 웹사이트/검색에 쓰임)와는
// 별개로 관리해 마커 텍스트가 사이트에 노출되지 않게 한다.
export interface LlmAttachment {
  kind: 'image' | 'link'
  url: string
  label?: string
}

// 포스트 인터페이스
export interface Post {
  id: string
  notionId: string
  title: string
  content: string
  excerpt?: string
  category: string
  tags: string[]
  imageUrl?: string
  status: PostStatus
  publishedAt?: Date
  naverDraftStatus: DraftStatus
  naverPostUrl?: string
  blocks?: NotionBlock[] // 본문 렌더링용 (상세 페이지에서 사용)
  thumbnailBlockId?: string // imageUrl이 본문 첫 이미지일 때 채워짐 (카드 썸네일 만료 시 재조회용)
  keywords?: string[] // Notion "Content" 속성(글의 핵심 내용) - 있으면 네이버 초안에 반드시 포함
  contentAttachments?: LlmAttachment[] // 네이버 초안 생성용 사진/링크 첨부 (공개 사이트에는 노출 안 함)
  createdAt: Date
  updatedAt: Date
  authorId?: string
}

// 초안 인터페이스
export interface Draft {
  id: string
  postId: string
  generatedContent: string
  status: DraftStatus
  reviewedById?: string | null
  createdAt: Date
  updatedAt: Date
}

// 사용자 인터페이스
export interface User {
  id: string
  email: string
  passwordHash?: string
  naverStyleGuide?: string
  createdAt: Date
  updatedAt: Date
}

// 검색 쿼리
export interface SearchQuery {
  query: string
  limit: number
  offset: number
}
