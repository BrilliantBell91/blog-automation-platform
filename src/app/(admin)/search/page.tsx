import Link from "next/link"
import { SearchX } from "lucide-react"
import { searchPosts } from "@/lib/notion"
import { applyDraftThumbnails } from "@/lib/drafts"
import { SearchBar } from "@/components/SearchBar"
import { PostList } from "@/components/PostList"
import { Pagination } from "@/components/Pagination"
import { cn } from "@/lib/utils"
import { SEARCH_TYPES, POSTS_PER_PAGE, type SearchType } from "@/constants"

interface SearchPageProps {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>
}

export const dynamic = "force-dynamic"

const TYPE_LABELS: Record<SearchType, string> = {
  [SEARCH_TYPES.ALL]: "전체",
  [SEARCH_TYPES.TITLE]: "제목",
  [SEARCH_TYPES.TAG]: "태그",
  [SEARCH_TYPES.CONTENT]: "본문",
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "", type = SEARCH_TYPES.ALL, page } = await searchParams
  const searchType = (Object.values(SEARCH_TYPES).includes(type as SearchType)
    ? type
    : SEARCH_TYPES.ALL) as SearchType
  const currentPage = Math.max(1, Number(page) || 1)
  const query = q.trim()

  const allMatches = query ? await searchPosts(query, searchType) : []

  const totalPages = Math.max(1, Math.ceil(allMatches.length / POSTS_PER_PAGE))
  const pagedPosts = await applyDraftThumbnails(
    allMatches.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE)
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold">검색</h1>
      </header>

      <SearchBar defaultValue={query} />

      <nav aria-label="검색 결과 타입 필터" className="flex flex-wrap gap-2">
        {Object.values(SEARCH_TYPES).map((t) => (
          <Link
            key={t}
            href={`/search?q=${encodeURIComponent(query)}&type=${t}`}
            aria-current={searchType === t ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              searchType === t ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent"
            )}
          >
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </nav>

      {query ? (
        <section aria-labelledby="search-results-heading">
          <h2 id="search-results-heading" className="sr-only">
            검색 결과
          </h2>
          <p className="text-sm text-muted-foreground">
            &quot;{query}&quot; 검색 결과 {allMatches.length}건
          </p>
          {pagedPosts.length > 0 ? (
            <div className="mt-4 space-y-6">
              <PostList posts={pagedPosts} />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                basePath={`/search?q=${encodeURIComponent(query)}&type=${searchType}`}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <SearchX className="h-10 w-10" aria-hidden="true" />
              <p>검색 결과가 없습니다.</p>
              <p className="text-sm">다른 키워드로 다시 시도해보세요.</p>
            </div>
          )}
        </section>
      ) : (
        <p className="py-12 text-center text-muted-foreground">검색어를 입력해주세요.</p>
      )}
    </div>
  )
}
