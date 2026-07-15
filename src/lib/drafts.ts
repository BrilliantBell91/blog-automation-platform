// 관리자 대시보드용 초안 목록 조회 (Task 010)

import { db } from "./db"
import { syncPublishedPosts } from "./posts"
import { tagsToArray } from "./formatters"
import type { Prisma } from "@/generated/prisma/client"
import type { Draft, DraftStatus, Post } from "@/types"

export interface DraftListItem {
  post: Post
  draft: Draft | null
}

type PostWithDraft = Prisma.PostGetPayload<{ include: { draft: true } }>

// Prisma 타입을 앱 타입으로 변환 (목록/단건 조회에서 공통 사용)
function mapRowToDraftListItem(row: PostWithDraft): DraftListItem {
  return {
    post: {
      ...row,
      tags: tagsToArray(row.tags),
    },
    draft: row.draft
      ? {
          id: row.draft.id,
          postId: row.draft.postId,
          generatedContent: row.draft.generatedContent,
          status: row.draft.status as DraftStatus,
          reviewedById: row.draft.reviewedById,
          createdAt: row.draft.createdAt,
          updatedAt: row.draft.updatedAt,
        }
      : null,
  } as DraftListItem
}

/**
 * 관리자 대시보드용 포스트+초안 목록 조회
 * 조회 전 Notion↔로컬 동기화 수행. 대시보드는 Notion Status="발행됨"인 글만 노출.
 */
export async function getDraftListItems(
  status?: DraftStatus | "all",
  limit = 50,
  offset = 0
): Promise<{ items: DraftListItem[]; total: number }> {
  // 먼저 Notion의 발행된 포스트를 로컬과 동기화
  await syncPublishedPosts()

  // 초안 상태 필터링 조건
  const draftFilter: Prisma.PostWhereInput =
    status && status !== "all"
      ? status === "미생성"
        ? { draft: null }
        : { draft: { status } }
      : {}

  // 대시보드는 Notion Status="발행됨"인 글만 노출 (보관됨/초안으로 바뀌면 즉시 제외)
  const where: Prisma.PostWhereInput = { status: "발행됨", ...draftFilter }

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

  const items = rows.map((row: typeof rows[0]) => mapRowToDraftListItem(row))

  return { items, total }
}

/**
 * 단일 포스트(로컬 Post.id 기준)의 포스트+초안 조회 ("블로그 화면" 미리보기 페이지용)
 */
export async function getDraftItemByPostId(postId: string): Promise<DraftListItem | null> {
  const row = await db.post.findUnique({
    where: { id: postId },
    include: { draft: true },
  })
  if (!row) return null
  return mapRowToDraftListItem(row)
}
