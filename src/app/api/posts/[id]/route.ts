import { NextRequest, NextResponse } from "next/server"
import { getPostById } from "@/lib/notion"
import { getCachedPublishedPosts } from "@/lib/postsCache"
import type { GetPostResponse } from "@/types/api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // 포스트 조회
    const post = await getPostById(id)
    if (!post || post.status !== "발행됨") {
      return NextResponse.json({ error: "포스트를 찾을 수 없습니다." }, { status: 404 })
    }

    // 이전/다음 포스트 계산
    const allPosts = await getCachedPublishedPosts()
    const currentIndex = allPosts.findIndex((p) => p.notionId === id)

    let previousPost: typeof post | undefined
    let nextPost: typeof post | undefined

    if (currentIndex > 0) {
      nextPost = allPosts[currentIndex - 1] // 최신이 먼저이므로 index - 1이 다음
    }
    if (currentIndex < allPosts.length - 1) {
      previousPost = allPosts[currentIndex + 1] // 이전
    }

    const response: GetPostResponse = {
      post,
      previousPost,
      nextPost,
    }

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    })
  } catch (error) {
    console.error("[GET /api/posts/[id]]", error)
    return NextResponse.json(
      { error: "포스트를 불러오지 못했습니다." },
      { status: 500 }
    )
  }
}
