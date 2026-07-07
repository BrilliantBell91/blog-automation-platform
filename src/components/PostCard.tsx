import Image from "next/image"
import Link from "next/link"
import { Post } from "@/types"
import { Badge } from "@/components/ui/badge"
import { formatDate, truncateExcerpt } from "@/lib/formatters"

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="group block overflow-hidden rounded-lg border transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {post.imageUrl && (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <Image
            src={post.imageUrl}
            alt={post.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
          <Badge className="absolute left-2 top-2">{post.category}</Badge>
        </div>
      )}
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 font-semibold">{post.title}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {truncateExcerpt(post.excerpt ?? post.content, 80)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
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
