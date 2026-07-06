import { Post } from "@/types"

/**
 * 발행된 포스트 전체 조회
 */
export async function getPublishedPosts(): Promise<Post[]> {
  throw new Error("Not implemented — Task 006")
}

/**
 * 특정 ID의 포스트 조회
 */
export async function getPostById(id: string): Promise<Post | null> {
  throw new Error("Not implemented — Task 006")
}

/**
 * 카테고리별 포스트 조회
 */
export async function getPostsByCategory(category: string): Promise<Post[]> {
  throw new Error("Not implemented — Task 006")
}

/**
 * 키워드로 포스트 검색 (제목, 태그, 본문)
 */
export async function searchPosts(
  query: string,
  searchType: "all" | "title" | "tag" | "content" = "all"
): Promise<Post[]> {
  throw new Error("Not implemented — Task 006")
}

/**
 * 모든 카테고리 목록 조회
 */
export async function getCategories(): Promise<string[]> {
  throw new Error("Not implemented — Task 006")
}

/**
 * 만료된 Notion 이미지 URL 재조회
 */
export async function refreshImageUrl(blockId: string): Promise<string> {
  throw new Error("Not implemented — Task 006")
}
