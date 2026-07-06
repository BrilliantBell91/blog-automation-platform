import { PostStatus, DraftStatus } from '@/types'

// Notion 데이터베이스 ID
export const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || ''

// 페이지네이션
export const POSTS_PER_PAGE = 10

// Notion API Rate Limit 설정
export const NOTION_RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 30,
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: 1000,
} as const

// 검색 타입
export const SEARCH_TYPES = {
  ALL: 'all',
  TITLE: 'title',
  TAG: 'tag',
  CONTENT: 'content',
} as const

export type SearchType = (typeof SEARCH_TYPES)[keyof typeof SEARCH_TYPES]

// 포스트 상태 값
export const POST_STATUS: Record<PostStatus, PostStatus> = {
  '초안': '초안',
  '발행됨': '발행됨',
  '보관됨': '보관됨',
} as const

// 초안 상태 값
export const DRAFT_STATUS: Record<DraftStatus, DraftStatus> = {
  '미생성': '미생성',
  '생성됨': '생성됨',
  '게시완료': '게시완료',
} as const

// 카테고리 기본값 (PRD 예시: 맛집, 육아, 결혼)
export const DEFAULT_CATEGORIES = ['맛집', '육아', '결혼'] as const
