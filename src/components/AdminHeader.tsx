"use client"

import Link from "next/link"
import { Menu, RefreshCw, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SheetTrigger } from "@/components/ui/sheet"
import { toast } from "sonner"
import { useState } from "react"
import { signOut } from "next-auth/react"

interface AdminHeaderProps {
  userName?: string
}

export function AdminHeader({ userName }: AdminHeaderProps) {
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Task 012: 홈페이지 캐시 재검증 버튼
  const handleRevalidateHome = async () => {
    setIsRevalidating(true)
    try {
      const res = await fetch("/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/" }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || "재검증 실패")
        return
      }

      toast.success("홈페이지 캐시가 재검증되었습니다.")
    } catch (error) {
      console.error("재검증 요청 실패:", error)
      toast.error("요청 중 오류가 발생했습니다.")
    } finally {
      setIsRevalidating(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await signOut({ redirectTo: "/login" })
    } catch (error) {
      console.error("로그아웃 실패:", error)
      toast.error("로그아웃 중 오류가 발생했습니다.")
      setIsLoggingOut(false)
    }
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b p-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* 모바일 전용 메뉴 토글: Sheet 루트는 admin/layout.tsx가 제공하고,
            콘텐츠(사이드바 메뉴)는 AdminNav가 렌더링함 */}
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="메뉴 열기"
            className="h-11 w-11 shrink-0 md:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <Link href="/" className="truncate text-lg font-bold">
          {/* 이모지는 순수 장식 요소이므로 스크린리더가 "관리자 페이지" 텍스트만 읽도록 처리 */}
          <span aria-hidden="true">📝</span> 관리자 페이지
        </Link>
        <span className="hidden text-sm text-muted-foreground sm:inline" aria-hidden="true">
          &gt;
        </span>
        <span className="hidden text-sm text-muted-foreground sm:inline">초안 대시보드</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {/* Task 012: 홈페이지 캐시 재검증 버튼 */}
        <Button
          variant="outline"
          size="sm"
          className="h-11"
          onClick={handleRevalidateHome}
          disabled={isRevalidating}
          title="홈페이지 캐시 재검증 (최근 Notion 변경 사항 즉시 반영)"
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {isRevalidating ? "재검증 중..." : "캐시 새로고침"}
        </Button>
        <span className="hidden text-sm sm:inline">{userName || "게스트"}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-11"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
        </Button>
      </div>
    </header>
  )
}
