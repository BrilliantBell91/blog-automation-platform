import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Navigation() {
  return (
    <nav className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <Link href="/" className="text-lg font-bold">
          📝 블로그
        </Link>
        <div className="flex items-center gap-4">
          {/* TODO Task 004: 검색 바 */}
          <Button variant="ghost" asChild>
            <Link href="/login">로그인</Link>
          </Button>
        </div>
      </div>
    </nav>
  )
}
