// Notion 포스트 조회 + 메모리 캐싱 래퍼 (Task 007 + Task 012 확장)

import { getPublishedPosts, getPostById } from "./notion"
import { getCached, setCached, clearCache } from "./cache"
import type { Post } from "@/types"

const TTL_MS = 15 * 60 * 1000 // 15분 (Task 012: ROADMAP "TTL 10-30분" 요구 반영)
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
 * 특정 포스트 조회 (캐싱 적용) — Task 012 신규
 * 현재 상세 페이지(`posts/[id]/page.tsx`)가 캐시 없이 매번 Notion을 직접 호출하는 문제 해결
 */
export async function getCachedPostById(id: string): Promise<Post | null> {
  const key = `notion:post:${id}`
  const cached = getCached<Post>(key)
  if (cached) return cached

  const post = await getPostById(id)
  if (post) {
    setCached(key, post, TTL_MS)
  }
  return post
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

/**
 * 전체 포스트/카테고리 캐시 무효화 — Task 012 신규
 * `/api/revalidate`에서 홈페이지 재검증 시 호출
 */
export function invalidatePostsCache(): void {
  clearCache(POSTS_KEY)
  clearCache(CATEGORIES_KEY)
}

/**
 * 특정 포스트 캐시 무효화 — Task 012 신규
 * `/api/revalidate`와 `/api/drafts/generate`에서 해당 포스트 재검증 시 호출
 */
export function invalidatePostCache(id: string): void {
  clearCache(`notion:post:${id}`)
}
