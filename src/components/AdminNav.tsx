import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function AdminNav() {
  return (
    <aside className="border-r p-4">
      <div className="w-48 space-y-4">
        <Link href="/" className="block text-lg font-bold">
          📝 블로그
        </Link>
        <nav className="space-y-2">
          <Button variant="ghost" asChild className="w-full justify-start">
            <Link href="/admin/drafts">초안 대시보드</Link>
          </Button>
          {/* TODO Task 008: 관리자 설정, 로그아웃 버튼 */}
        </nav>
      </div>
    </aside>
  )
}
