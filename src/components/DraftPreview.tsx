"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Copy, Pencil } from "lucide-react"
import { Draft } from "@/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface DraftPreviewProps {
  draft: Draft | null
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("복사되었습니다")
  } catch {
    toast.error("복사에 실패했습니다")
  }
}

export function DraftPreview({ draft }: DraftPreviewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(draft?.generatedContent ?? "")

  if (!draft) {
    return <p className="text-muted-foreground">선택된 초안이 없습니다.</p>
  }

  const content = isEditing ? editedContent : draft.generatedContent
  const paragraphs = content.split("\n\n")

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          생성: {draft.createdAt.toLocaleString("ko-KR")}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1"
          onClick={() => {
            setEditedContent(content)
            setIsEditing((prev) => !prev)
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
          {isEditing ? "편집 완료" : "편집"}
        </Button>
      </div>

      {isEditing ? (
        <Textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="min-h-[240px]"
        />
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
          {paragraphs.map((paragraph, i) => (
            <div key={i} className="flex items-start justify-between gap-2 rounded-md p-2 hover:bg-accent">
              <p className="whitespace-pre-wrap">{paragraph}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="문단 복사"
                onClick={() => copyText(paragraph)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button className="h-11 gap-2" onClick={() => copyText(content)}>
          <Copy className="h-4 w-4" />
          전체 복사
        </Button>
      </div>
    </div>
  )
}
