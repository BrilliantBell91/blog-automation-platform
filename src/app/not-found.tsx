import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-foreground">404</h1>
          <p className="text-xl text-muted-foreground">찾을 수 없는 페이지</p>
        </div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          요청하신 페이지가 존재하지 않습니다. 다른 콘텐츠를 찾아보세요.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/">
            <Button>홈으로 돌아가기</Button>
          </Link>
          <Link href="/search">
            <Button variant="outline">검색하기</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
