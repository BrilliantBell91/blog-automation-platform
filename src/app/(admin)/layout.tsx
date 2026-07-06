import { AdminNav } from '@/components/AdminNav'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO Task 008: auth() 세션 체크 → 미인증 사용자 redirect("/login")
  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
