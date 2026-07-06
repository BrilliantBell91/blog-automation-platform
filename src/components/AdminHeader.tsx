interface AdminHeaderProps {
  userName?: string
}

export function AdminHeader({ userName }: AdminHeaderProps) {
  return (
    <header className="border-b p-4">
      {/* TODO Task 005/008: 로고, 사용자명, 로그아웃 버튼, breadcrumb */}
      <p className="text-sm">관리자: {userName || "게스트"}</p>
    </header>
  )
}
