import { NextRequest, NextResponse } from "next/server"
import { searchPosts } from "@/lib/notion"
import { validateSearchQuery } from "@/lib/validators"
import type { SearchResponse } from "@/types/api"
import type { SearchType } from "@/constants"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q") || ""
  const type = (searchParams.get("type") || "all") as SearchType
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10))
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0)

  // 검색 쿼리 검증
  const validation = validateSearchQuery({ query: q, limit, offset })
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.errors.join(", ") },
      { status: 400 }
    )
  }

  try {
    const allResults = await searchPosts(q, type)
    const results = allResults.slice(offset, offset + limit)

    const response: SearchResponse = {
      results,
      total: allResults.length,
      query: q,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[GET /api/search]", error)
    return NextResponse.json(
      { error: "검색을 수행하지 못했습니다." },
      { status: 500 }
    )
  }
}
