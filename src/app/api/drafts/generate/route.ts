import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { ApiError } from "@google/genai"
import { auth } from "@/auth"
import { getCachedPostById } from "@/lib/postsCache"
import { invalidatePostCache } from "@/lib/postsCache"
import { upsertLocalPost } from "@/lib/posts"
import { generateNaverDraft } from "@/lib/llm"
import { db } from "@/lib/db"
import type { GenerateDraftResponse } from "@/types/api"
import type { DraftStatus } from "@/types"

export const dynamic = "force-dynamic"
// Vercel 공식 문서(2026-07-01 기준) 확인 결과, fluid compute가 기본 활성화된 Hobby
// 플랜은 함수 실행시간 기본값이자 최대값이 이미 300초(5분)다. 예전에 "Hobby는 60초가
// 상한일 것"이라 잘못 추정해 여기 60을 명시했다가, 오히려 기본값(300초)보다 짧게
// 강제로 깎아버려서 실제로 504(Vercel Runtime Timeout)를 유발한 사고가 확인되어
// 되돌린다. 이미지 소싱(장소사진/네이버·구글 검색/관련성 검증/AI 생성)까지 포함하면
// 처리 시간이 꽤 걸릴 수 있으므로, Hobby 최대값인 300에 맞춰 명시적으로 설정해둔다.
export const maxDuration = 300

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
    // 초안 생성 버튼을 누른 시점 = 최신 Notion 내용을 반영해야 하는 시점이므로,
    // 조회 직전에 캐시를 비워 15분짜리 캐시된 옛 데이터(예: 수정 전 이미지)를 쓰지 않도록 한다.
    invalidatePostCache(postId)
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

    // LLM으로 초안 생성 (외관 사진 판별·본문 최상단 배치까지 내부에서 자체 처리)
    const { content: generatedContent, leadImageUrl } = await generateNaverDraft(
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

    // Post의 naverDraftStatus 동기화 + 초안 본문에 실제로 쓰인 대표 사진으로 카드 썸네일도 동기화
    await db.post.update({
      where: { id: localPost.id },
      data: {
        naverDraftStatus: "생성됨",
        ...(leadImageUrl ? { imageUrl: leadImageUrl } : {}),
      },
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

    if (error instanceof ApiError && error.status === 429) {
      return NextResponse.json(
        { error: "요청이 많아 잠시 후 다시 시도해주세요." },
        { status: 429 }
      )
    }

    if (error instanceof ApiError && error.status === 504) {
      return NextResponse.json(
        { error: "응답 생성이 지연되어 시간이 초과되었습니다. 잠시 후 다시 시도해주세요." },
        { status: 504 }
      )
    }

    if (error instanceof ApiError && error.status === 503) {
      return NextResponse.json(
        { error: "모델 사용량이 많아 일시적으로 응답이 어렵습니다. 잠시 후 다시 시도해주세요." },
        { status: 503 }
      )
    }

    const message = error instanceof Error ? error.message : "초안 생성 중 오류가 발생했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
