"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, ExternalLink, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Post, Draft, DraftStatus } from "@/types"
import { formatDate } from "@/lib/formatters"
import { DRAFT_STATUS } from "@/constants"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DraftPreview } from "@/components/DraftPreview"

interface DraftDashboardProps {
  initialItems: Array<{ post: Post; draft: Draft | null }>
}

type FilterType = "all" | DraftStatus

function getDraftStatusBadgeVariant(
  status: DraftStatus | null
): "default" | "secondary" | "outline" {
  if (status === "생성됨") return "default"
  if (status === "게시완료") return "secondary"
  return "outline"
}

export function DraftDashboard({ initialItems }: DraftDashboardProps) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [activeFilter, setActiveFilter] = useState<FilterType>("all")
  const [previewItem, setPreviewItem] = useState<{
    post: Post
    draft: Draft | null
  } | null>(null)
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())

  // 상태별 필터링
  const filteredItems =
    activeFilter === "all"
      ? items
      : items.filter((item) => {
          if (activeFilter === "미생성") return item.draft === null
          return item.draft?.status === activeFilter
        })

  // 각 상태별 개수 계산
  const statusCounts = {
    all: items.length,
    미생성: items.filter((i) => i.draft === null).length,
    생성됨: items.filter((i) => i.draft?.status === "생성됨").length,
    게시완료: items.filter((i) => i.draft?.status === "게시완료").length,
  }

  // 초안 생성/재생성 (API가 upsert 방식이라 기존 초안이 있어도 그대로 재사용 가능)
  async function handleGenerateDraft(post: Post, isRegenerate: boolean) {
    setGeneratingIds((prev) => new Set(prev).add(post.id))

    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.notionId }), // Notion 페이지 ID 전달
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "초안 생성 실패")
      }

      toast.success(`"${post.title}" 초안이 ${isRegenerate ? "재생성" : "생성"}되었습니다`)
      router.refresh() // Next.js가 서버 컴포넌트 재실행해 새 initialItems 전달
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "초안 생성에 실패했습니다")
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev)
        next.delete(post.id)
        return next
      })
    }
  }

  // 상태 변경
  async function handleStatusChange(draftId: string, status: DraftStatus) {
    try {
      const res = await fetch(`/api/admin/drafts/${draftId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "상태 변경 실패")
      }

      toast.success("상태가 변경되었습니다")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상태 변경에 실패했습니다")
    }
  }

  return (
    <div className="space-y-6">
      {/* 필터 탭 */}
      <Tabs
        value={activeFilter}
        onValueChange={(val) => setActiveFilter(val as FilterType)}
      >
        {/* 375px 등 좁은 화면에서는 탭이 줄바꿈되도록 flex-wrap 적용, 각 탭은 44px 높이로 터치 타깃 확보 */}
        <TabsList
          aria-label="초안 상태 필터"
          className="h-auto flex-wrap justify-start gap-1"
        >
          <TabsTrigger value="all" className="h-11">
            전체 ({statusCounts.all})
          </TabsTrigger>
          <TabsTrigger value="미생성" className="h-11">
            미생성 ({statusCounts.미생성})
          </TabsTrigger>
          <TabsTrigger value="생성됨" className="h-11">
            생성됨 ({statusCounts.생성됨})
          </TabsTrigger>
          <TabsTrigger value="게시완료" className="h-11">
            게시완료 ({statusCounts.게시완료})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 목록 테이블: 좁은 화면에서 가로 스크롤 가능하도록 overflow-x-auto 적용 */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">포스트명</TableHead>
              <TableHead scope="col" className="hidden sm:table-cell">
                작성일
              </TableHead>
              <TableHead scope="col">상태</TableHead>
              <TableHead scope="col" className="hidden md:table-cell">
                수정일
              </TableHead>
              <TableHead scope="col" className="text-right">
                작업
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <span className="text-sm text-muted-foreground">
                    {activeFilter === "all"
                      ? "항목이 없습니다."
                      : `${activeFilter} 상태의 항목이 없습니다.`}
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map(({ post, draft }) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium">
                    {post.title}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {formatDate(post.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getDraftStatusBadgeVariant(draft?.status ?? null)}
                    >
                      {draft?.status ?? "미생성"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(draft?.updatedAt ?? post.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {draft === null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11"
                        onClick={() => handleGenerateDraft(post, false)}
                        disabled={generatingIds.has(post.id)}
                        aria-busy={generatingIds.has(post.id)}
                      >
                        {generatingIds.has(post.id) ? (
                          <>
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin"
                              aria-hidden="true"
                            />
                            생성 중
                          </>
                        ) : (
                          "초안 생성"
                        )}
                      </Button>
    ) : (
                      <TooltipProvider delayDuration={200}>
                        <div className="flex items-center justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                aria-label="수정하기"
                                onClick={() => setPreviewItem({ post, draft })}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>수정하기</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                aria-label="초안 미리보기"
                                asChild
                              >
                                <Link
                                  href={`/admin/drafts/${post.id}/preview`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>초안 미리보기</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                aria-label="초안 재생성"
                                onClick={() => handleGenerateDraft(post, true)}
                                disabled={generatingIds.has(post.id)}
                                aria-busy={generatingIds.has(post.id)}
                              >
                                <RefreshCw
                                  className={`h-4 w-4 ${generatingIds.has(post.id) ? "animate-spin" : ""}`}
                                  aria-hidden="true"
                                />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>초안 재생성</TooltipContent>
                          </Tooltip>
                          <Select
                            value={draft.status}
                            onValueChange={(status) =>
                              handleStatusChange(draft.id, status as DraftStatus)
                            }
                          >
                            <SelectTrigger
                              className="h-11 w-[110px]"
                              aria-label="초안 상태 변경"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(DRAFT_STATUS).map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TooltipProvider>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 미리보기 Sheet */}
      <Sheet
        open={previewItem !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null)
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>수정하기</SheetTitle>
          </SheetHeader>
          {/* Sheet 자체를 세로 스크롤 가능하게 하여 모바일 뷰포트에서 콘텐츠가 잘리지 않도록 함 */}
          <div className="mt-6">
            <DraftPreview draft={previewItem?.draft ?? null} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
