interface PaginationProps {
  currentPage: number
  totalPages: number
}

export function Pagination({ currentPage, totalPages }: PaginationProps) {
  return (
    <div className="mt-8 text-center text-sm text-muted-foreground">
      {/* TODO Task 004: 이전/다음 버튼, 페이지 번호 표시 */}
      <p>
        페이지 {currentPage} / {totalPages}
      </p>
    </div>
  )
}
