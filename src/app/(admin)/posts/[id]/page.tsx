import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { getCachedPostById, getCachedPublishedPosts } from "@/lib/postsCache"
import { getDraftByNotionId } from "@/lib/drafts"
import { refreshDraftImageUrls } from "@/lib/naverDraftParser"
import { generateMockPosts } from "@/lib/mockData"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { OptimizedImage } from "@/components/OptimizedImage"
import { PostBody } from "@/components/PostBody"
import { NaverDraftView } from "@/components/NaverDraftView"
import { ShareButtons } from "@/components/ShareButtons"
import { formatDate } from "@/lib/formatters"
import { STATIC_PARAMS_POST_LIMIT } from "@/constants"

interface PostPageProps {
  params: Promise<{ id: string }>
}

const MOCK_POOL_SIZE = 24

export const revalidate = 600 // 10분
export const dynamicParams = true

export async function generateStaticParams() {
  const posts = await getCachedPublishedPosts()
  return posts.slice(0, STATIC_PARAMS_POST_LIMIT).map((post) => ({ id: post.notionId }))
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params

  let post = await getCachedPostById(id).catch(() => null)
  let allPosts
  let draft = null

  if (!post) {
    const mockPosts = generateMockPosts(MOCK_POOL_SIZE)
    post = mockPosts.find((p) => p.id === id) || null
    allPosts = mockPosts
  } else {
    allPosts = await getCachedPublishedPosts()
    // 관리자 대시보드에서 생성한 네이버 스타일 초안이 있으면 그걸 "완성된 글"로 우선
    // 보여준다. Notion 원본은 정리 전 메모에 가까운 경우가 많아(예: "지원 대상: ...
    // 소득 무관 전 국민" 같은 팩트 나열), 초안이 있는데도 원본을 보여주면 사용자가
    // "요약본만 보인다"고 느끼는 문제가 실측으로 확인됐다. 초안이 없으면(아직 생성
    // 전) 기존처럼 Notion 원본을 보여준다.
    draft = await getDraftByNotionId(id).catch(() => null)
  }

  if (!post || post.status !== "발행됨") {
    notFound()
  }

  const currentIndex = allPosts.findIndex((p) => p.notionId === id || p.id === id)

  let previousPost
  let nextPost

  if (currentIndex > 0) {
    nextPost = allPosts[currentIndex - 1]
  }
  if (currentIndex < allPosts.length - 1) {
    previousPost = allPosts[currentIndex + 1]
  }

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
            refreshKind={post.thumbnailSource}
            className="object-cover"
          />
        </div>
      )}

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

        {draft ? (
          <NaverDraftView
            content={refreshDraftImageUrls(draft.generatedContent, post.contentAttachments ?? [])}
          />
        ) : (
          <PostBody
            blocks={post.blocks}
            fallbackContent={post.content}
            pageId={post.notionId}
            attachments={post.contentAttachments}
          />
        )}
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
