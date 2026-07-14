import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { getDraftItemByPostId } from "@/lib/drafts"
import { NaverDraftView } from "@/components/NaverDraftView"
import { CopyDraftButton } from "@/components/CopyDraftButton"

interface DraftPreviewPageProps {
  params: Promise<{ postId: string }>
}

export default async function DraftBlogPreviewPage({ params }: DraftPreviewPageProps) {
  const { postId } = await params
  const item = await getDraftItemByPostId(postId)

  if (!item) {
    notFound()
  }

  const { post, draft } = item

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/drafts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        초안 대시보드로
      </Link>

      <p className="text-sm text-muted-foreground">
        네이버 블로그 화면 미리보기 · {post.title}
      </p>

      {draft ? (
        <>
          {/* 실제 게시글처럼 보이도록 카드 형태로 감싼다 */}
          <article className="rounded-lg border bg-card p-6 sm:p-10">
            <NaverDraftView content={draft.generatedContent} />
          </article>
          <div className="flex justify-end">
            <CopyDraftButton content={draft.generatedContent} />
          </div>
        </>
      ) : (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          아직 생성된 초안이 없습니다. 대시보드에서 초안을 먼저 생성해주세요.
        </div>
      )}
    </div>
  )
}
