import { generateMockDraftList } from "@/lib/mockData"
import { DraftDashboard } from "@/components/DraftDashboard"

export default function AdminDraftsPage() {
  const items = generateMockDraftList(12)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* 페이지 제목/설명 영역: 헤더로 시맨틱하게 구성 */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">초안 대시보드</h1>
        <p className="text-sm text-muted-foreground">
          네이버 블로그 초안 상태를 확인하고 생성/검토합니다.
        </p>
      </header>
      {/* DraftDashboard를 감싸는 주 영역: 초안 목록/필터/미리보기 기능 단위 */}
      <section aria-label="초안 목록 및 관리">
        <DraftDashboard initialItems={items} />
      </section>
    </div>
  )
}
