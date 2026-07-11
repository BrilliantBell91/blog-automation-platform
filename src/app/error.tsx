"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[App Error]", error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-foreground">오류</h1>
          <p className="text-xl text-muted-foreground">문제가 발생했습니다</p>
        </div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          페이지를 불러오는 중에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>다시 시도</Button>
          <Link href="/">
            <Button variant="outline">홈으로</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
