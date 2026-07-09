import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// 데스크톱 사이드바와 모바일 Sheet가 동일한 메뉴 항목을 공유하기 위한 내부 컴포넌트
function AdminNavLinks() {
  return (
    <nav aria-label="관리자 메뉴" className="space-y-2">
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
  )
}

export function AdminNav() {
  return (
    <>
      {/* 데스크톱(md 이상): 좌측 고정 사이드바로 항상 노출 */}
      <aside className="hidden w-48 shrink-0 border-r p-4 md:block">
        <AdminNavLinks />
      </aside>

      {/* 모바일(md 미만): 오프캔버스 Sheet 콘텐츠.
          Sheet 루트는 admin/layout.tsx가 감싸고, 트리거 버튼은 AdminHeader가 제공함 */}
      <SheetContent side="left" className="w-3/4 sm:max-w-xs">
        <SheetHeader>
          <SheetTitle>메뉴</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <AdminNavLinks />
        </div>
      </SheetContent>
    </>
  )
}
