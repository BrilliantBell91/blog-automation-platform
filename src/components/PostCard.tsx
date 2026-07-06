import { Post } from "@/types"

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">{post.title}</h3>
      {/* TODO Task 004: 썸네일 이미지, 요약, 카테고리, 태그, 발행일, 호버 효과, 클릭 링크 */}
    </div>
  )
}
