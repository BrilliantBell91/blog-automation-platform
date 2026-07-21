import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { getDraftItemByPostId } from "@/lib/drafts"
import { getCachedPostById } from "@/lib/postsCache"
import { refreshDraftImageUrls } from "@/lib/naverDraftParser"
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

  // Draft.generatedContent에는 생성 시점의 Notion 이미지 URL(약 1시간 후 만료되는 S3
  // 서명 URL)이 그대로 박제돼 있어, 시간이 지나면 첨부 사진이 깨져 보이는 문제가 실측
  // 확인됐다. 로컬 Post(Prisma)는 contentAttachments를 저장하지 않으므로(Notion 전용
  // 런타임 필드), notionId로 최신 Notion 데이터를 한 번 더 조회해 렌더링 직전에만
  // URL을 최신 서명으로 치환한다(DB에 저장된 원본 텍스트 자체는 바꾸지 않음).
  const notionPost = draft ? await getCachedPostById(post.notionId).catch(() => null) : null
  const displayContent = draft
    ? refreshDraftImageUrls(draft.generatedContent, notionPost?.contentAttachments ?? [])
    : ""

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/drafts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        초안 대시보드로
      </Link>

      {/* 모바일(375px 등)에서 제목이 길면 "사진 업로드" 링크와 같은 줄에서 겹쳐 보이던
          문제가 실측 확인됐다 — 좁은 화면에서는 세로로 쌓고, sm 이상에서만 한 줄로 배치한다. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm text-muted-foreground">
          네이버 블로그 화면 미리보기 · {post.title}
        </p>
        <Link
          href={`/admin/uploads/${post.id}`}
          className="shrink-0 self-start text-sm text-muted-foreground hover:underline sm:self-auto"
        >
          사진 업로드
        </Link>
      </div>

      {draft ? (
        <>
          {/* 실제 게시글처럼 보이도록 카드 형태로 감싼다 */}
          <article className="rounded-lg border bg-card p-6 sm:p-10">
            <NaverDraftView content={displayContent} />
          </article>
          <div className="flex justify-end">
            <CopyDraftButton content={displayContent} />
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
