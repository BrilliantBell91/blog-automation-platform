import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { invalidatePostsCache, invalidatePostCache } from "@/lib/postsCache"

export const dynamic = "force-dynamic"

/**
 * On-Demand Revalidation 엔드포인트 — Task 012 신규
 * POST /api/revalidate
 *
 * 인증: NextAuth 세션 또는 x-revalidate-secret 헤더(REVALIDATE_SECRET 환경변수)
 * 요청: { "path": "/" | "/posts/{notionId}" | "/category/{name}" }
 * 응답: { revalidated: true, path, timestamp } / 400/401/500
 *
 * Next.js의 revalidatePath()와 postsCache.ts의 invalidate*() 함수를 함께 호출하여
 * Full Route Cache(Next 내장 캐시)와 인메모리 캐시(postsCache)를 동시 무효화함.
 * 이를 통해 재검증의 즉시성(즉시 갱신)을 보장함.
 */
export async function POST(request: NextRequest) {
  // 인증 체크 — NextAuth 세션 또는 secret 헤더
  const session = await auth()
  const secretHeader = request.headers.get("x-revalidate-secret")
  const revalidateSecret = process.env.REVALIDATE_SECRET

  const isAuthorized = session?.user || (secretHeader && revalidateSecret && secretHeader === revalidateSecret)

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "인증이 필요합니다." },
      { status: 401 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "유효한 JSON이 필요합니다." },
      { status: 400 }
    )
  }

  const { path } = body
  if (!path || typeof path !== "string" || !path.startsWith("/")) {
    return NextResponse.json(
      { error: "path는 필수이며 /로 시작해야 합니다." },
      { status: 400 }
    )
  }

  try {
    // Next.js Full Route Cache 무효화
    revalidatePath(path)

    // 인메모리 캐시(postsCache.ts) 무효화
    if (path === "/" || path === "/?page=1") {
      // 홈페이지: 전체 포스트/카테고리 캐시 무효화
      invalidatePostsCache()
    } else if (path.startsWith("/posts/")) {
      // 포스트 상세 페이지: 해당 포스트 캐시만 무효화
      const postId = path.split("/posts/")[1]?.split("?")[0]
      if (postId) {
        invalidatePostCache(postId)
      }
    } else if (path.startsWith("/category/")) {
      // 카테고리 페이지: 전체 포스트/카테고리 캐시 무효화 (카테고리별 필터링이므로)
      invalidatePostsCache()
    }

    const response = {
      revalidated: true,
      path,
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[POST /api/revalidate]", error)
    const message = error instanceof Error ? error.message : "재검증 중 오류가 발생했습니다."
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
