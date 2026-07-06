import { Post } from "@/types"
import { PostCard } from "./PostCard"

interface PostListProps {
  posts: Post[]
}

export function PostList({ posts }: PostListProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
