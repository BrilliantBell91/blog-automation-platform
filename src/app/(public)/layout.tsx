import { Navigation } from '@/components/Navigation'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1">{children}</main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {/* TODO Task 004: 실제 푸터 콘텐츠 */}
        <p>&copy; 2025 Notion CMS 블로그 자동화 플랫폼</p>
      </footer>
    </div>
  )
}
