import Link from "next/link"
import { cn } from "@/lib/utils"

interface PaginationProps {
  currentPage: number
  totalPages: number
  /** 페이지 링크의 기준 경로 (예: "/", "/category/맛집") — 항상 ?page=N 쿼리로 이동 */
  basePath: string
}

const MAX_VISIBLE_PAGES = 5

function buildHref(basePath: string, page: number): string {
  const [path, existingQuery] = basePath.split("?")
  const params = new URLSearchParams(existingQuery)
  params.set("page", String(page))
  return `${path}?${params.toString()}`
}

export function Pagination({ currentPage, totalPages, basePath }: PaginationProps) {
  if (totalPages <= 1) return null

  const half = Math.floor(MAX_VISIBLE_PAGES / 2)
  let start = Math.max(1, currentPage - half)
  const end = Math.min(totalPages, start + MAX_VISIBLE_PAGES - 1)
  start = Math.max(1, end - MAX_VISIBLE_PAGES + 1)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const buttonBase =
    "flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  // 생략(…) 표시용 셀 — 클릭 불가하므로 터치 타깃 규격 대상 아님
  const ellipsisClass = "flex h-11 items-center justify-center px-1 text-muted-foreground select-none"

  return (
    <nav aria-label="페이지네이션" className="mt-8 flex flex-wrap items-center justify-center gap-1">
      {currentPage > 1 ? (
        <Link
          href={buildHref(basePath, currentPage - 1)}
          aria-label="이전 페이지"
          className={cn(buttonBase, "border hover:bg-accent")}
        >
          이전
        </Link>
      ) : (
        // 비활성 상태이지만 스크린리더에는 "비활성화된 이전 페이지"로 인지되어야 하므로
        // aria-hidden 대신 aria-disabled 사용 (완전히 숨기지 않음)
        <span
          aria-disabled="true"
          className={cn(buttonBase, "border text-muted-foreground opacity-50")}
        >
          이전
        </span>
      )}

      {/* 페이지 수가 많을 때 첫 페이지 + 생략(…) 표시 */}
      {start > 1 && (
        <>
          <Link
            href={buildHref(basePath, 1)}
            aria-label="첫 페이지로 이동"
            className={cn(buttonBase, "border hover:bg-accent")}
          >
            1
          </Link>
          {start > 2 && (
            <span aria-hidden="true" className={ellipsisClass}>
              …
            </span>
          )}
        </>
      )}

      {pages.map((page) => (
        <Link
          key={page}
          href={buildHref(basePath, page)}
          aria-current={page === currentPage ? "page" : undefined}
          aria-label={page === currentPage ? `현재 페이지, ${page}페이지` : `${page}페이지로 이동`}
          className={cn(
            buttonBase,
            page === currentPage
              ? "bg-primary text-primary-foreground"
              : "border hover:bg-accent"
          )}
        >
          {page}
        </Link>
      ))}

      {/* 페이지 수가 많을 때 생략(…) 표시 + 마지막 페이지 */}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span aria-hidden="true" className={ellipsisClass}>
              …
            </span>
          )}
          <Link
            href={buildHref(basePath, totalPages)}
            aria-label={`마지막 페이지(${totalPages})로 이동`}
            className={cn(buttonBase, "border hover:bg-accent")}
          >
            {totalPages}
          </Link>
        </>
      )}

      {currentPage < totalPages ? (
        <Link
          href={buildHref(basePath, currentPage + 1)}
          aria-label="다음 페이지"
          className={cn(buttonBase, "border hover:bg-accent")}
        >
          다음
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={cn(buttonBase, "border text-muted-foreground opacity-50")}
        >
          다음
        </span>
      )}
    </nav>
  )
}
