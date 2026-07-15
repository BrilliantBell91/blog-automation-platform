import { Post } from "@/types"
import { PostCard } from "./PostCard"

interface PostListProps {
  posts: Post[]
}

export function PostList({ posts }: PostListProps) {
  return (
    // 포스트 목록은 의미상 목록이므로 ul/li로 마크업 (div 남용 방지)
    <ul className="grid list-none gap-4 md:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <li key={post.id} className="h-full">
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  )
}
