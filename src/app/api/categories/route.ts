import { NextResponse } from "next/server"
import { getCachedCategories } from "@/lib/postsCache"
import type { GetCategoriesResponse } from "@/types/api"

export async function GET() {
  try {
    const categories = await getCachedCategories()
    const response: GetCategoriesResponse = { categories }
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    })
  } catch (error) {
    console.error("[GET /api/categories]", error)
    return NextResponse.json(
      { error: "카테고리를 불러오지 못했습니다." },
      { status: 500 }
    )
  }
}
