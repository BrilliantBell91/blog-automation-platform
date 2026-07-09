import { Navigation } from '@/components/Navigation'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* 키보드 사용자를 위한 본문 바로가기 링크 (평소엔 시각적으로 숨김, 포커스 시에만 노출) */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        본문으로 건너뛰기
      </a>
      <Navigation />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        {/* 데스크톱에서 텍스트가 화면 끝까지 늘어지지 않도록 nav와 동일한 컨테이너 폭 적용 */}
        <div className="mx-auto max-w-5xl px-4">
          <p>맛집 · 육아 · 결혼 이야기를 기록하는 블로그</p>
          <p className="mt-1">&copy; {new Date().getFullYear()} Notion CMS 블로그 자동화 플랫폼</p>
        </div>
      </footer>
    </div>
  )
}
