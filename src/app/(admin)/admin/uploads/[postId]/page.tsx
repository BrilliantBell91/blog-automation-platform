import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { db } from "@/lib/db"
import { NotionImageUploader } from "@/components/NotionImageUploader"

interface UploadPageProps {
  params: Promise<{ postId: string }>
}

export default async function NotionUploadPage({ params }: UploadPageProps) {
  const { postId } = await params
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { notionId: true, title: true },
  })

  if (!post) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/drafts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        초안 대시보드로
      </Link>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Notion 사진 일괄 업로드</h1>
        <p className="text-sm text-muted-foreground">{post.title}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        여러 장을 한 번에 선택해서 올리면 Notion 페이지 본문 끝에 순서대로 이미지 블록이
        추가됩니다. 업로드 후 초안을 다시 생성하면 새 사진이 반영됩니다.
      </p>

      <NotionImageUploader notionPageId={post.notionId} />
    </div>
  )
}
