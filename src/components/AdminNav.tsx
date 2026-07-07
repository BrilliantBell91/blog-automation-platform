import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function AdminNav() {
  return (
    <aside className="border-r p-4">
      <div className="w-48 space-y-4">
        <nav className="space-y-2">
          <Button variant="ghost" asChild className="h-11 w-full justify-start">
            <Link href="/admin/drafts">초안 대시보드</Link>
          </Button>
          {/* 설정 페이지는 ROADMAP.md에 아직 없는 범위 밖 항목 — 죽은 링크 대신 비활성 표시로 PRD 요구사항만 시각적으로 반영 */}
          <Button variant="ghost" disabled className="h-11 w-full justify-start gap-2">
            설정
            <Badge variant="secondary">준비 중</Badge>
          </Button>
          {/* 로그아웃 실동작은 Task 008에서 구현 예정 */}
          <Button variant="ghost" disabled className="h-11 w-full justify-start" title="Task 008에서 구현 예정">
            로그아웃
          </Button>
        </nav>
      </div>
    </aside>
  )
}
