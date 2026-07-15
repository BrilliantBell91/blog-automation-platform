import Link from "next/link"
import { Post } from "@/types"
import { Badge } from "@/components/ui/badge"
import { OptimizedImage } from "@/components/OptimizedImage"
import { formatDate, truncateExcerpt } from "@/lib/formatters"
import { MAX_VISIBLE_POST_TAGS } from "@/constants"

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  const visibleTags = post.tags.slice(0, MAX_VISIBLE_POST_TAGS)
  const hiddenTagCount = post.tags.length - visibleTags.length

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* 이미지 유무와 관계없이 항상 표시되는 썸네일 영역 (카테고리 배지 포함) */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {post.imageUrl ? (
          <OptimizedImage
            src={post.imageUrl}
            alt={post.title}
            variant="thumbnail"
            blockId={post.thumbnailBlockId}
            pageId={post.notionId}
            refreshKind={post.thumbnailSource}
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          // 이미지가 없는 포스트를 위한 플레이스홀더 (카드 높이 일관성 유지)
          <div
            className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
            aria-hidden="true"
          >
            {post.category}
          </div>
        )}
        <Badge className="absolute left-2 top-2">{post.category}</Badge>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 font-semibold">{post.title}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {truncateExcerpt(
            post.excerpt || post.content || post.keywords?.join(" ") || "",
            80
          )}
        </p>
        <div className="flex h-6 items-center gap-1.5 overflow-hidden pt-1">
          {visibleTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="shrink-0">
              #{tag}
            </Badge>
          ))}
          {hiddenTagCount > 0 && (
            <Badge variant="outline" className="shrink-0">
              +{hiddenTagCount}개
            </Badge>
          )}
        </div>
        <time
          dateTime={new Date(post.publishedAt ?? post.createdAt).toISOString()}
          className="block text-xs text-muted-foreground"
        >
          {formatDate(post.publishedAt ?? post.createdAt)}
        </time>
      </div>
    </Link>
  )
}
