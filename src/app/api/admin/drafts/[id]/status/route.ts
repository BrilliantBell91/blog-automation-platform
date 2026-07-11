import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import type { DraftStatus } from "@/types"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 인증 체크
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 })
  }

  const { id } = await params
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "유효한 JSON이 필요합니다." }, { status: 400 })
  }

  const { status } = body as { status?: DraftStatus }

  if (!status || !["미생성", "생성됨", "게시완료"].includes(status)) {
    return NextResponse.json({ error: "유효하지 않은 상태입니다." }, { status: 400 })
  }

  try {
    if (status === "미생성") {
      // 미생성: Draft row 삭제 (기존 mockData 관례 유지)
      const draft = await db.draft.delete({ where: { id } })
      await db.post.update({
        where: { id: draft.postId },
        data: { naverDraftStatus: "미생성" },
      })
      return NextResponse.json({
        draftId: draft.id,
        status: "미생성",
        updatedAt: new Date(),
      })
    } else {
      // 생성됨, 게시완료: Draft 상태 업데이트
      const draft = await db.draft.update({
        where: { id },
        data: {
          status,
          reviewedById: session.user.id,
        },
      })
      await db.post.update({
        where: { id: draft.postId },
        data: { naverDraftStatus: status },
      })
      return NextResponse.json({
        draftId: draft.id,
        status: draft.status,
        updatedAt: draft.updatedAt,
      })
    }
  } catch (error) {
    console.error("[PATCH /api/admin/drafts/[id]/status]", error)
    const message = error instanceof Error ? error.message : "상태 변경에 실패했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
