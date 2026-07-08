import { AdminNav } from '@/components/AdminNav'
import { AdminHeader } from '@/components/AdminHeader'
import { Toaster } from '@/components/ui/sonner'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO Task 008: auth() 세션 체크 → 미인증 사용자 redirect("/login")
  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader />
      <div className="flex flex-1">
        <AdminNav />
        <main className="flex-1 p-4 sm:p-8">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
