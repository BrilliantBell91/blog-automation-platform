import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { AdminNav } from '@/components/AdminNav'
import { AdminHeader } from '@/components/AdminHeader'
import { Toaster } from '@/components/ui/sonner'
import { Sheet } from '@/components/ui/sheet'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  // Sheet(Radix Dialog)는 비제어(uncontrolled) 상태로 동작하므로 별도 useState 없이
  // 트리거(AdminHeader)와 콘텐츠(AdminNav)를 같은 <Sheet> 하위 트리에 두기만 하면 연결됨
  return (
    <Sheet>
      <div className="flex min-h-screen flex-col">
        <AdminHeader />
        {/* 데스크톱(md 이상): 사이드바 폭(aside의 w-48)만큼 첫 컬럼을 차지하는 2컬럼 그리드
            모바일(md 미만): aside가 hidden 처리되어 main만 전체 폭으로 표시 */}
        <div className="flex-1 md:grid md:grid-cols-[auto_1fr]">
          <AdminNav />
          <main className="p-4 sm:p-8">{children}</main>
        </div>
        <Toaster />
      </div>
    </Sheet>
  )
}
