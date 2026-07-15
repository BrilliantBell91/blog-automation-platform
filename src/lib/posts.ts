// Notion 포스트를 로컬 Post 테이블에 동기화 (Task 009~010에서 사용)

import { db } from "./db"
import { getPublishedPosts } from "./notion"
import { arrayToTags } from "./formatters"
import type { Post as NotionPost } from "@/types"
import type { Post as DbPost } from "@/generated/prisma/client"

// Notion에서 더 이상 "발행됨"이 아니게 된 글들을 대시보드에서 제외하는 기준
const ARCHIVED_STATUS = "보관됨" as const

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
 * Notion에서 더 이상 "발행됨"이 아니게 된 로컬 글은 status를 갱신해 대시보드에서 제외
 * (Draft는 유지 — 나중에 다시 "발행됨"으로 바뀌면 기존 초안 재사용 가능)
 */
export async function syncPublishedPosts(): Promise<void> {
  const notionPosts = await getPublishedPosts()
  await Promise.all(notionPosts.map((p) => upsertLocalPost(p)))

  const liveNotionIds = notionPosts.map((p) => p.notionId)
  await db.post.updateMany({
    where: {
      status: "발행됨",
      ...(liveNotionIds.length > 0 ? { notionId: { notIn: liveNotionIds } } : {}),
    },
    data: { status: ARCHIVED_STATUS },
  })
}
