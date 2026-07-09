"use client"

import { useState } from "react"
import { Check, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ShareButtons() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    // size="sm"(32px)의 기본 높이를 h-11(44px)로 덮어써 터치 타깃 확보
    // 복사 완료 시 아이콘/테두리 색상을 함께 바꿔 텍스트만으로는 부족한 시각적 피드백을 보강
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={
        copied
          ? "h-11 gap-2 border-green-600 text-green-600 hover:text-green-600"
          : "h-11 gap-2"
      }
      aria-live="polite"
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Link2 className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "링크가 복사되었습니다" : "링크 복사"}
    </Button>
  )
}
