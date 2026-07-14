"use client"

import { Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { copyNaverDraftToClipboard } from "@/lib/clipboard"

interface CopyDraftButtonProps {
  content: string
}

export function CopyDraftButton({ content }: CopyDraftButtonProps) {
  async function handleCopy() {
    try {
      await copyNaverDraftToClipboard(content)
      toast.success("복사되었습니다 (이미지·링크 포함)")
    } catch {
      toast.error("복사에 실패했습니다")
    }
  }

  return (
    <Button className="h-11 gap-2" onClick={handleCopy}>
      <Copy className="h-4 w-4" aria-hidden="true" />
      전체 복사
    </Button>
  )
}
