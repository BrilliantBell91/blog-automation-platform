import { Inbox } from "lucide-react"
import { generateMockPosts } from "@/lib/mockData"
import { PostList } from "@/components/PostList"
import { CategoryFilter } from "@/components/CategoryFilter"
import { Pagination } from "@/components/Pagination"
import { DEFAULT_CATEGORIES, POSTS_PER_PAGE } from "@/constants"
import { encodeUrl } from "@/lib/formatters"

interface CategoryPageProps {
  params: Promise<{ name: string }>
  searchParams: Promise<{ page?: string }>
}

const MOCK_POOL_SIZE = 24

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { name } = await params
  const { page } = await searchParams
  const decoded = decodeURIComponent(name)
  const currentPage = Math.max(1, Number(page) || 1)

  const filtered = generateMockPosts(MOCK_POOL_SIZE).filter((post) => post.category === decoded)
  const totalPages = Math.max(1, Math.ceil(filtered.length / POSTS_PER_PAGE))
  const pagedPosts = filtered.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      {/* 페이지 소개 영역을 header로 묶어 시맨틱을 명확히 함 */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{decoded}</h1>
        <p className="text-muted-foreground">{filtered.length}개의 글</p>
      </header>

      {/* activeCategory가 decoded와 일치해야 현재 카테고리 칩에 aria-current="page"가 붙는다 */}
      <CategoryFilter categories={[...DEFAULT_CATEGORIES]} activeCategory={decoded} />

      {pagedPosts.length > 0 ? (
        <section aria-labelledby="category-posts-heading">
          <h2 id="category-posts-heading" className="sr-only">
            {decoded} 카테고리 포스트 목록
          </h2>
          <PostList posts={pagedPosts} />
        </section>
      ) : (
        // 빈 카테고리 상태 — 검색 결과 없음 화면과 동일한 톤으로 안내 + 다음 행동 제안
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <Inbox className="h-10 w-10" aria-hidden="true" />
          <p>&quot;{decoded}&quot; 카테고리에 아직 글이 없습니다.</p>
          <p className="text-sm">다른 카테고리를 둘러보세요.</p>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath={`/category/${encodeUrl(decoded)}`}
      />
    </div>
  )
}
