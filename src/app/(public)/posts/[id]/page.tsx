import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { getCachedPostById, getCachedPublishedPosts } from "@/lib/postsCache"
import { generateMockPosts } from "@/lib/mockData"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { OptimizedImage } from "@/components/OptimizedImage"
import { PostBody } from "@/components/PostBody"
import { ShareButtons } from "@/components/ShareButtons"
import { formatDate } from "@/lib/formatters"
import { STATIC_PARAMS_POST_LIMIT } from "@/constants"

interface PostPageProps {
  params: Promise<{ id: string }>
}

const MOCK_POOL_SIZE = 24

// Task 012: ISR 설정 (포스트 상세 페이지는 searchParams를 쓰지 않아 Full Route Cache가 정상 적용됨)
export const revalidate = 600 // 10분

// Task 012: on-demand ISR 대상 외 경로는 동적 렌더링 (기본값이지만 의도를 명시)
export const dynamicParams = true

// Task 012: 최신 발행 N개 포스트는 빌드 시 정적 생성
export async function generateStaticParams() {
  const posts = await getCachedPublishedPosts()
  return posts.slice(0, STATIC_PARAMS_POST_LIMIT).map((post) => ({ id: post.notionId }))
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params

  // Task 012: getPostById → getCachedPostById로 교체 (캐시 계층 추가)
  let post = await getCachedPostById(id).catch(() => null)
  let allPosts

  if (!post) {
    // Notion 포스트가 없으면 mock으로 폴백 (로컬 테스트용)
    const mockPosts = generateMockPosts(MOCK_POOL_SIZE)
    post = mockPosts.find((p) => p.id === id)
    allPosts = mockPosts
  } else {
    // Notion 포스트 찾음
    allPosts = await getCachedPublishedPosts()
  }

  if (!post || post.status !== "발행됨") {
    notFound()
  }

  // 이전/다음 포스트 계산 (발행된 모든 포스트 기준)
  const currentIndex = allPosts.findIndex((p) => p.notionId === id || p.id === id)

  let previousPost
  let nextPost

  if (currentIndex > 0) {
    nextPost = allPosts[currentIndex - 1] // 최신이 먼저이므로 index - 1이 다음
  }
  if (currentIndex < allPosts.length - 1) {
    previousPost = allPosts[currentIndex + 1] // 이전
  }

  // 발행일과 실제로 다른 경우에만 "수정일"을 노출한다 (더미 데이터는 대부분 동일한 시각을 가짐)
  // 작성자 이름 필드는 Post 타입에 존재하지 않아(authorId만 있음) 표시하지 않음
  const publishedDate = post.publishedAt ?? post.createdAt
  const showUpdatedAt =
    post.updatedAt && new Date(post.updatedAt).getTime() !== new Date(publishedDate).getTime()

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      {post.imageUrl && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <OptimizedImage
            src={post.imageUrl}
            alt={`${post.title} 대표 이미지`}
            variant="detail"
            preload
            blockId={post.thumbnailBlockId}
            pageId={post.notionId}
            className="object-cover"
          />
        </div>
      )}

      {/* 포스트 본문을 article로 감싸 시맨틱을 명확히 함(제목/메타/본문만 포함, 공유·이전다음 글은 본문 외부) */}
      <article className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <time dateTime={new Date(publishedDate).toISOString()}>{formatDate(publishedDate)}</time>
            {showUpdatedAt && (
              <span>· 수정일 {formatDate(post.updatedAt)}</span>
            )}
            <Badge>{post.category}</Badge>
            {post.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                #{tag}
              </Badge>
            ))}
          </div>
        </header>

        <Separator />

        {/* @tailwindcss/typography 플러그인(postcss.config.mjs 등록됨)을 활용한 본문 스타일링, 다크 모드 대비 포함 */}
        <PostBody blocks={post.blocks} fallbackContent={post.content} pageId={post.notionId} />
      </article>

      <div className="flex items-center justify-between">
        <ShareButtons />
      </div>

      <Separator />

      <nav aria-label="이전/다음 글" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {previousPost ? (
          <Link
            href={`/posts/${previousPost.id}`}
            className="flex min-h-11 items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2">{previousPost.title}</span>
          </Link>
        ) : (
          // 모바일 1열에서는 빈 자리가 불필요한 여백을 만들므로 sm 이상에서만 자리 차지
          <span aria-hidden="true" className="hidden sm:block" />
        )}
        {nextPost ? (
          <Link
            href={`/posts/${nextPost.id}`}
            className="flex min-h-11 items-center justify-end gap-2 rounded-md border p-3 text-right text-sm hover:bg-accent"
          >
            <span className="line-clamp-2">{nextPost.title}</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        ) : (
          <span aria-hidden="true" className="hidden sm:block" />
        )}
      </nav>
    </div>
  )
}
