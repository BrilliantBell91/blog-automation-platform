import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { generateMockPosts } from "@/lib/mockData"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ShareButtons } from "@/components/ShareButtons"
import { formatDate } from "@/lib/formatters"

interface PostPageProps {
  params: Promise<{ id: string }>
}

const MOCK_POOL_SIZE = 24

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params
  const posts = generateMockPosts(MOCK_POOL_SIZE)
  const index = posts.findIndex((p) => p.id === id)

  if (index === -1) {
    notFound()
  }

  const post = posts[index]
  const previousPost = index > 0 ? posts[index - 1] : undefined
  const nextPost = index < posts.length - 1 ? posts[index + 1] : undefined

  // 발행일과 실제로 다른 경우에만 "수정일"을 노출한다 (더미 데이터는 대부분 동일한 시각을 가짐)
  // 작성자 이름 필드는 Post 타입에 존재하지 않아(authorId만 있음) 표시하지 않음
  const publishedDate = post.publishedAt ?? post.createdAt
  const showUpdatedAt =
    post.updatedAt && new Date(post.updatedAt).getTime() !== new Date(publishedDate).getTime()

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      {post.imageUrl && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <Image
            src={post.imageUrl}
            alt={`${post.title} 대표 이미지`}
            fill
            priority
            sizes="(min-width: 768px) 768px, 100vw"
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
        <div className="prose prose-sm max-w-none dark:prose-invert sm:prose-base">
          {post.content.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
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
