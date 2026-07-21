"use client"

import Link from "next/link"
import { Menu, RefreshCw, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SheetTrigger } from "@/components/ui/sheet"
import { toast } from "sonner"
import { useState } from "react"
import { signOut } from "next-auth/react"

export function AdminHeader() {
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
        {/* 375px 등 좁은 화면에서 우측 버튼(새로고침/로그아웃)이 줄어들지 않아(shrink-0)
            제목이 아이콘만 남을 정도로 짜부라지던 문제가 실측 확인됐다. 모바일에서는
            축약된 제목만 보여주고, sm 이상에서 전체 제목을 표시한다. */}
        <Link href="/" className="truncate text-lg font-bold">
          <span aria-hidden="true">📝</span>{" "}
          <span className="sm:hidden">아기부리새</span>
          <span className="hidden sm:inline">아기부리새의 블로그 자동화 플랫폼</span>
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Task 012: 홈페이지 캐시 재검증 버튼. 모바일에서는 아이콘만 표시해(위와 같은
            이유로) 제목이 밀려나지 않게 한다. */}
        <Button
          variant="outline"
          size="sm"
          className="h-11 px-2.5 sm:px-3"
          onClick={handleRevalidateHome}
          disabled={isRevalidating}
          title="홈페이지 캐시 재검증 (최근 Notion 변경 사항 즉시 반영)"
          aria-label={isRevalidating ? "재검증 중..." : "새로고침"}
        >
          <RefreshCw className="h-4 w-4 sm:mr-2" aria-hidden="true" />
          <span className="hidden sm:inline" aria-hidden="true">
            {isRevalidating ? "재검증 중..." : "새로고침"}
          </span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11 px-2.5 sm:px-3"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label={isLoggingOut ? "로그아웃 중..." : "로그아웃"}
        >
          <LogOut className="h-4 w-4 sm:mr-2" aria-hidden="true" />
          <span className="hidden sm:inline" aria-hidden="true">
            {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          </span>
        </Button>
      </div>
    </header>
  )
}
