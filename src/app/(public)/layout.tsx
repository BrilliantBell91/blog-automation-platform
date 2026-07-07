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
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>맛집 · 육아 · 결혼 이야기를 기록하는 블로그</p>
        <p className="mt-1">&copy; {new Date().getFullYear()} Notion CMS 블로그 자동화 플랫폼</p>
      </footer>
    </div>
  )
}
