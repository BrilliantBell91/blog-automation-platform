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

// Notion 블록 데이터
export interface NotionBlock {
  id: string
  type: NotionBlockType
  content: string
  imageUrl?: string
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
  thumbnailBlockId?: string // imageUrl이 "본문 첫 이미지 폴백"일 때만 채워짐 (재조회용)
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
