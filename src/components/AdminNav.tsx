'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// 데스크톱 사이드바와 모바일 Sheet가 동일한 메뉴 항목을 공유하기 위한 내부 컴포넌트
function AdminNavLinks() {
  const pathname = usePathname()

  return (
    <nav aria-label="관리자 메뉴" className="space-y-2">
      <Button
        variant="ghost"
        asChild
        className="h-11 w-full justify-start"
        aria-current={pathname === '/' ? 'page' : undefined}
      >
        <Link href="/">메인</Link>
      </Button>
      <Button
        variant="ghost"
        asChild
        className="h-11 w-full justify-start"
        aria-current={pathname.startsWith('/admin/drafts') ? 'page' : undefined}
      >
        <Link href="/admin/drafts">초안 대시보드</Link>
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
