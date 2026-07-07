import Link from "next/link"
import { Button } from "@/components/ui/button"

interface AdminHeaderProps {
  userName?: string
}

export function AdminHeader({ userName }: AdminHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b p-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-lg font-bold">
          📝 관리자 페이지
        </Link>
        <span className="text-sm text-muted-foreground" aria-hidden>
          &gt;
        </span>
        <span className="text-sm text-muted-foreground">초안 대시보드</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm">{userName || "게스트"}</span>
        {/* 로그아웃 실동작은 Task 008(NextAuth signOut 연동)에서 구현 예정 */}
        <Button variant="outline" size="sm" className="h-9" disabled title="Task 008에서 구현 예정">
          로그아웃
        </Button>
      </div>
    </header>
  )
}
