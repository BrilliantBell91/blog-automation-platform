import { Post, Draft, SearchQuery } from './index'

// GET /api/posts 응답
export interface GetPostsResponse {
  posts: Post[]
  total: number
  hasMore: boolean
}

// GET /api/posts/[id] 응답
export interface GetPostResponse {
  post: Post
  previousPost?: Post
  nextPost?: Post
}

// GET /api/search 응답
export interface SearchResponse {
  results: Post[]
  total: number
  query: string
}

// POST /api/drafts/generate 응답
export interface GenerateDraftResponse {
  draft: Draft
}

// GET /api/admin/drafts 응답
export interface GetAdminDraftsResponse {
  drafts: Draft[]
  total: number
}

// GET /api/categories 응답
export interface GetCategoriesResponse {
  categories: string[]
}
