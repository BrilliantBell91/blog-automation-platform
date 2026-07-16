// 관리자 대시보드용 초안 목록 조회 (Task 010)

import { db } from "./db"
import { syncPublishedPosts } from "./posts"
import { tagsToArray } from "./formatters"
import { parseNaverDraft } from "./naverDraftParser"
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

/**
 * Notion 페이지 ID 기준으로 생성된 초안을 조회한다 (공개 포스트 상세 페이지용).
 * 공개 사이트의 Post.id는 Notion 페이지 ID(notionId)를 쓰는 반면, 로컬 Post 테이블은
 * 별도의 DB id(cuid)를 쓰므로 getDraftItemByPostId(로컬 id 기준)와는 조회 기준이 다르다.
 * 초안이 아직 생성되지 않았거나(로컬 Post 행 자체가 없거나 Draft가 없음) 조회 실패 시 null.
 */
export async function getDraftByNotionId(notionId: string): Promise<Draft | null> {
  const row = await db.post.findUnique({
    where: { notionId },
    include: { draft: true },
  })
  if (!row?.draft) return null
  return {
    id: row.draft.id,
    postId: row.draft.postId,
    generatedContent: row.draft.generatedContent,
    status: row.draft.status as DraftStatus,
    reviewedById: row.draft.reviewedById,
    createdAt: row.draft.createdAt,
    updatedAt: row.draft.updatedAt,
  }
}

/**
 * 카드 목록(메인/카테고리/검색)의 썸네일 폴백 — Notion 본문/속성 어디에도 이미지가
 * 없는 글(post.imageUrl 없음)에 한해, 생성된 네이버 초안의 첫 번째 이미지를 썸네일로
 * 대신 쓴다. 초안 이미지는 검색/장소사진/AI 생성으로 채워지므로, Notion에는 사진이
 * 없어도 초안에는 있는 경우(예: 정보성 글에 AI 인포그래픽만 삽입된 경우) 카드가 계속
 * 회색 플레이스홀더로 남는 문제를 해결한다. 초안이 없거나 초안에도 이미지가 없으면
 * (예: 방문후기 글인데 검색으로도 못 찾은 경우) 그대로 플레이스홀더로 남는다 — 실제로
 * 보여줄 이미지가 없는 게 맞으므로 이건 버그가 아니다.
 * 초안 이미지는 검색 결과/Pollinations/Gemini data URI라 Notion 서명 URL과 달리
 * 만료되지 않으므로 별도 재조회(refreshKind) 처리는 필요 없다. 다만 출처 도메인이
 * 제각각이라(네이버/구글 검색 결과, Pollinations 등) next/image의 remotePatterns
 * 허용 목록으로 전부 관리할 수 없으므로, thumbnailSource="draft"로 표시해 카드가
 * next/image 대신 일반 <img> 태그로 렌더링하게 한다(NaverDraftView와 동일한 이유).
 */
export async function applyDraftThumbnails(posts: Post[]): Promise<Post[]> {
  const targetNotionIds = posts.filter((p) => !p.imageUrl).map((p) => p.notionId)
  if (targetNotionIds.length === 0) return posts

  const rows = await db.post.findMany({
    where: { notionId: { in: targetNotionIds }, draft: { isNot: null } },
    include: { draft: true },
  })

  const imageByNotionId = new Map<string, string>()
  for (const row of rows) {
    if (!row.draft) continue
    const firstImage = parseNaverDraft(row.draft.generatedContent).find(
      (block) => block.type === "image"
    )
    if (firstImage) imageByNotionId.set(row.notionId, firstImage.url)
  }
  if (imageByNotionId.size === 0) return posts

  return posts.map((post) => {
    const draftImage = imageByNotionId.get(post.notionId)
    return post.imageUrl || !draftImage
      ? post
      : { ...post, imageUrl: draftImage, thumbnailSource: "draft" as const }
  })
}
