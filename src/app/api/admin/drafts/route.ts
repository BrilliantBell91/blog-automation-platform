import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDraftListItems } from "@/lib/drafts"
import type { GetAdminDraftsResponse } from "@/types/api"
import type { DraftStatus } from "@/types"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // 인증 체크
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = (searchParams.get("status") || "all") as DraftStatus | "all"
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50))
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0)

  try {
    const { items, total } = await getDraftListItems(status, limit, offset)
    const response: GetAdminDraftsResponse = { items, total }
    return NextResponse.json(response)
  } catch (error) {
    console.error("[GET /api/admin/drafts]", error)
    return NextResponse.json(
      { error: "초안 목록을 불러오지 못했습니다." },
      { status: 500 }
    )
  }
}
