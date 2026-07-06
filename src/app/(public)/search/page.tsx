interface SearchPageProps {
  searchParams: Promise<{ q?: string; type?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = '', type = 'all' } = await searchParams

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold">검색 (스켈레톤)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        쿼리: {q || '(없음)'}, 타입: {type}
      </p>
      {/* TODO Task 004: SearchBar + 검색 결과 목록 + 검색 결과 개수 표시 + "검색 결과 없음" UI + 타입별 필터 버튼 */}
    </div>
  )
}
