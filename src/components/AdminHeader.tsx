import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SheetTrigger } from "@/components/ui/sheet"

interface AdminHeaderProps {
  userName?: string
}

export function AdminHeader({ userName }: AdminHeaderProps) {
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
        <span className="hidden text-sm sm:inline">{userName || "게스트"}</span>
        {/* 로그아웃 실동작은 Task 008(NextAuth signOut 연동)에서 구현 예정 */}
        <Button variant="outline" size="sm" className="h-11" disabled title="Task 008에서 구현 예정">
          로그아웃
        </Button>
      </div>
    </header>
  )
}
