// Notion 포스트를 로컬 Post 테이블에 동기화 (Task 009~010에서 사용)

import { db } from "./db"
import { getPublishedPosts } from "./notion"
import { arrayToTags } from "./formatters"
import type { Post as NotionPost } from "@/types"
import type { Post as DbPost } from "@/generated/prisma"

/**
 * Notion 포스트 1건을 로컬 Post 테이블에 notionId 기준으로 upsert
 * naverDraftStatus는 Notion 값으로 덮어쓰지 않음 (로컬 Draft.status가 진실의 원천)
 */
export async function upsertLocalPost(notionPost: NotionPost): Promise<DbPost> {
  return db.post.upsert({
    where: { notionId: notionPost.notionId },
    create: {
      notionId: notionPost.notionId,
      title: notionPost.title,
      content: notionPost.content,
      excerpt: notionPost.excerpt,
      category: notionPost.category,
      tags: arrayToTags(notionPost.tags),
      imageUrl: notionPost.imageUrl,
      status: notionPost.status,
      publishedAt: notionPost.publishedAt,
      naverDraftStatus: notionPost.naverDraftStatus,
      naverPostUrl: notionPost.naverPostUrl,
    },
    update: {
      title: notionPost.title,
      content: notionPost.content,
      excerpt: notionPost.excerpt,
      category: notionPost.category,
      tags: arrayToTags(notionPost.tags),
      imageUrl: notionPost.imageUrl,
      status: notionPost.status,
      publishedAt: notionPost.publishedAt,
      // naverDraftStatus는 로컬이 진실의 원천이므로 Notion 값으로 덮어쓰지 않음
      // naverPostUrl도 로컬 업데이트와 독립적으로 유지
    },
  })
}

/**
 * Notion에 발행된 포스트 전체를 로컬 Post 테이블과 동기화
 */
export async function syncPublishedPosts(): Promise<void> {
  const notionPosts = await getPublishedPosts()
  await Promise.all(notionPosts.map((p) => upsertLocalPost(p)))
}
