import { Draft } from "@/types"

interface DraftPreviewProps {
  draft: Draft | null
}

export function DraftPreview({ draft }: DraftPreviewProps) {
  if (!draft) {
    return <p className="text-muted-foreground">선택된 초안이 없습니다.</p>
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {/* TODO Task 005: 생성된 초안 텍스트, 생성 타임스탬프, 클립보드 복사 버튼(성공/실패 토스트), 전체/문단별 복사, 초안 편집 */}
      <div className="prose max-w-none text-sm">{draft.generatedContent}</div>
      <p className="text-xs text-muted-foreground">
        생성: {draft.createdAt.toLocaleString("ko-KR")}
      </p>
    </div>
  )
}
