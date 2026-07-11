import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getCachedPostById } from "@/lib/postsCache"
import { invalidatePostCache } from "@/lib/postsCache"
import { upsertLocalPost } from "@/lib/posts"
import { generateNaverDraft } from "@/lib/llm"
import { db } from "@/lib/db"
import type { GenerateDraftResponse } from "@/types/api"
import type { DraftStatus } from "@/types"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  // 인증 체크
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "유효한 JSON이 필요합니다." }, { status: 400 })
  }

  const { postId } = body // Notion 페이지 ID
  if (!postId) {
    return NextResponse.json({ error: "postId가 필요합니다." }, { status: 400 })
  }

  try {
    // Task 012: getPostById → getCachedPostById로 교체 (중복 Notion 호출 절감)
    const notionPost = await getCachedPostById(postId)
    if (!notionPost) {
      return NextResponse.json(
        { error: "Notion에서 포스트를 찾을 수 없습니다." },
        { status: 404 }
      )
    }

    // 로컬 Post 테이블에 upsert
    const localPost = await upsertLocalPost(notionPost)

    // 로그인 사용자의 스타일 가이드 조회
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    })

    // LLM으로 초안 생성
    const generatedContent = await generateNaverDraft(
      notionPost,
      user?.naverStyleGuide ?? undefined
    )

    // Draft upsert (기존 초안이 있으면 재생성)
    const draftRecord = await db.draft.upsert({
      where: { postId: localPost.id },
      create: {
        postId: localPost.id,
        generatedContent,
        status: "생성됨",
      },
      update: {
        generatedContent,
        status: "생성됨",
      },
    })

    // Post의 naverDraftStatus도 동기화
    await db.post.update({
      where: { id: localPost.id },
      data: { naverDraftStatus: "생성됨" },
    })

    // Task 012: 초안 생성 성공 후 해당 포스트 상세 페이지 재검증
    // ROADMAP "초안 생성 후 해당 포스트 상세 페이지 재검증" 요구 충족
    revalidatePath(`/posts/${postId}`)
    invalidatePostCache(postId)

    // Prisma 타입을 앱 타입으로 변환
    const draft = {
      ...draftRecord,
      status: draftRecord.status as DraftStatus,
    }

    const response: GenerateDraftResponse = { draft }
    return NextResponse.json(response)
  } catch (error) {
    console.error("[POST /api/drafts/generate]", error)
    const message = error instanceof Error ? error.message : "초안 생성 중 오류가 발생했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
