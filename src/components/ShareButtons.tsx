"use client"

import { useState } from "react"
import { Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ShareButtons() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="h-11 gap-2">
      <Link2 className="h-4 w-4" />
      {copied ? "링크가 복사되었습니다" : "링크 복사"}
    </Button>
  )
}
