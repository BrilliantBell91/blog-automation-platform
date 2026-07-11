import { NextRequest, NextResponse } from "next/server"
import { getCachedPublishedPosts } from "@/lib/postsCache"
import { POSTS_PER_PAGE } from "@/constants"
import type { GetPostsResponse } from "@/types/api"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || POSTS_PER_PAGE))

  try {
    const allPosts = await getCachedPublishedPosts()
    const start = (page - 1) * limit
    const posts = allPosts.slice(start, start + limit)

    const response: GetPostsResponse = {
      posts,
      total: allPosts.length,
      hasMore: start + limit < allPosts.length,
    }

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    })
  } catch (error) {
    console.error("[GET /api/posts]", error)
    return NextResponse.json(
      { error: "포스트 목록을 불러오지 못했습니다." },
      { status: 500 }
    )
  }
}
