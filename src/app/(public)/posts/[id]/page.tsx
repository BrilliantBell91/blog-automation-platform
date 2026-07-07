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

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
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

      <div className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <time dateTime={new Date(post.publishedAt ?? post.createdAt).toISOString()}>
            {formatDate(post.publishedAt ?? post.createdAt)}
          </time>
          <Badge>{post.category}</Badge>
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      <div className="prose prose-sm max-w-none space-y-4 leading-relaxed sm:prose-base">
        {post.content.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <ShareButtons />
      </div>

      <Separator />

      <nav aria-label="이전/다음 글" className="grid grid-cols-2 gap-4">
        {previousPost ? (
          <Link
            href={`/posts/${previousPost.id}`}
            className="flex min-h-11 items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="line-clamp-2">{previousPost.title}</span>
          </Link>
        ) : (
          <span aria-hidden />
        )}
        {nextPost ? (
          <Link
            href={`/posts/${nextPost.id}`}
            className="flex min-h-11 items-center justify-end gap-2 rounded-md border p-3 text-right text-sm hover:bg-accent"
          >
            <span className="line-clamp-2">{nextPost.title}</span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </Link>
        ) : (
          <span aria-hidden />
        )}
      </nav>
    </article>
  )
}
