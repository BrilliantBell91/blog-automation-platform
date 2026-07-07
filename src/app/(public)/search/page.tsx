import Link from "next/link"
import { SearchX } from "lucide-react"
import { generateMockPosts } from "@/lib/mockData"
import { SearchBar } from "@/components/SearchBar"
import { PostList } from "@/components/PostList"
import { Pagination } from "@/components/Pagination"
import { cn } from "@/lib/utils"
import { SEARCH_TYPES, POSTS_PER_PAGE, type SearchType } from "@/constants"

interface SearchPageProps {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>
}

const MOCK_POOL_SIZE = 24

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

  const matches = query
    ? generateMockPosts(MOCK_POOL_SIZE).filter((post) => {
        const keyword = query.toLowerCase()
        const matchesTitle = post.title.toLowerCase().includes(keyword)
        const matchesTag = post.tags.some((tag) => tag.toLowerCase().includes(keyword))
        const matchesContent = post.content.toLowerCase().includes(keyword)
        if (searchType === SEARCH_TYPES.TITLE) return matchesTitle
        if (searchType === SEARCH_TYPES.TAG) return matchesTag
        if (searchType === SEARCH_TYPES.CONTENT) return matchesContent
        return matchesTitle || matchesTag || matchesContent
      })
    : []

  const totalPages = Math.max(1, Math.ceil(matches.length / POSTS_PER_PAGE))
  const pagedPosts = matches.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">검색</h1>
      <SearchBar defaultValue={query} />

      <div className="flex flex-wrap gap-2">
        {Object.values(SEARCH_TYPES).map((t) => (
          <Link
            key={t}
            href={`/search?q=${encodeURIComponent(query)}&type=${t}`}
            aria-current={searchType === t ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-sm",
              searchType === t ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent"
            )}
          >
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </div>

      {query ? (
        <>
          <p className="text-sm text-muted-foreground">
            &quot;{query}&quot; 검색 결과 {matches.length}건
          </p>
          {pagedPosts.length > 0 ? (
            <>
              <PostList posts={pagedPosts} />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                basePath={`/search?q=${encodeURIComponent(query)}&type=${searchType}`}
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <SearchX className="h-10 w-10" />
              <p>검색 결과가 없습니다.</p>
              <p className="text-sm">다른 키워드로 다시 시도해보세요.</p>
            </div>
          )}
        </>
      ) : (
        <p className="py-12 text-center text-muted-foreground">검색어를 입력해주세요.</p>
      )}
    </div>
  )
}
