// Notion 포스트 조회 + 메모리 캐싱 래퍼 (Task 007)

import { getPublishedPosts, getCategories } from "./notion"
import { getCached, setCached } from "./cache"
import type { Post } from "@/types"

const TTL_MS = 5 * 60 * 1000 // 5분
const POSTS_KEY = "notion:published-posts"
const CATEGORIES_KEY = "notion:categories"

/**
 * 발행된 포스트 전체 조회 (캐싱 적용)
 */
export async function getCachedPublishedPosts(): Promise<Post[]> {
  const cached = getCached<Post[]>(POSTS_KEY)
  if (cached) return cached

  const posts = await getPublishedPosts()
  setCached(POSTS_KEY, posts, TTL_MS)
  return posts
}

/**
 * 카테고리별 포스트 조회 (캐시된 전체 목록에서 필터링)
 */
export async function getCachedPostsByCategory(category: string): Promise<Post[]> {
  const posts = await getCachedPublishedPosts()
  return posts.filter((p) => p.category === category)
}

/**
 * 모든 카테고리 목록 조회 (캐싱 적용)
 */
export async function getCachedCategories(): Promise<string[]> {
  const cached = getCached<string[]>(CATEGORIES_KEY)
  if (cached) return cached

  const posts = await getCachedPublishedPosts()
  const categories = Array.from(new Set(posts.map((p) => p.category).filter(Boolean)))
  setCached(CATEGORIES_KEY, categories, TTL_MS)
  return categories
}
