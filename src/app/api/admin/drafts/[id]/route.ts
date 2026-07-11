import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 인증 체크
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 })
  }

  const { id } = await params

  try {
    const draft = await db.draft.findUnique({
      where: { id },
      include: { post: true },
    })

    if (!draft) {
      return NextResponse.json({ error: "초안을 찾을 수 없습니다." }, { status: 404 })
    }

    return NextResponse.json({ draft })
  } catch (error) {
    console.error("[GET /api/admin/drafts/[id]]", error)
    return NextResponse.json(
      { error: "초안을 불러오지 못했습니다." },
      { status: 500 }
    )
  }
}
