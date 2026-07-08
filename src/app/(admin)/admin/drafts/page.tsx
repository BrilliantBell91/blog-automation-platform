import { generateMockDraftList } from "@/lib/mockData"
import { DraftDashboard } from "@/components/DraftDashboard"

export default function AdminDraftsPage() {
  const items = generateMockDraftList(12)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">초안 대시보드</h1>
        <p className="text-sm text-muted-foreground">
          네이버 블로그 초안 상태를 확인하고 생성/검토합니다.
        </p>
      </div>
      <DraftDashboard initialItems={items} />
    </div>
  )
}
