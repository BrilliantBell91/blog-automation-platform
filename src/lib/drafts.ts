// 관리자 대시보드용 초안 목록 조회 (Task 010)

import { db } from "./db"
import { syncPublishedPosts } from "./posts"
import { tagsToArray } from "./formatters"
import type { Draft, DraftStatus, Post } from "@/types"

export interface DraftListItem {
  post: Post
  draft: Draft | null
}

/**
 * 관리자 대시보드용 포스트+초안 목록 조회
 * 조회 전 Notion↔로컬 동기화 수행
 */
export async function getDraftListItems(
  status?: DraftStatus | "all",
  limit = 50,
  offset = 0
): Promise<{ items: DraftListItem[]; total: number }> {
  // 먼저 Notion의 발행된 포스트를 로컬과 동기화
  await syncPublishedPosts()

  // 상태 필터링 조건
  const where =
    status && status !== "all"
      ? status === "미생성"
        ? { draft: null }
        : { draft: { status } }
      : undefined

  // 조인 쿼리 실행
  const [rows, total] = await Promise.all([
    db.post.findMany({
      where,
      include: { draft: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.post.count({ where }),
  ])

  // Prisma 타입을 앱 타입으로 변환
  const items = rows.map(
    (row: typeof rows[0]) => ({
      post: {
        ...row,
        tags: tagsToArray(row.tags),
      },
      draft: row.draft
        ? {
            id: row.draft.id,
            postId: row.draft.postId,
            generatedContent: row.draft.generatedContent,
            status: (row.draft.status as DraftStatus),
            reviewedById: row.draft.reviewedById,
            createdAt: row.draft.createdAt,
            updatedAt: row.draft.updatedAt,
          }
        : null,
    }) as DraftListItem
  )

  return { items, total }
}
