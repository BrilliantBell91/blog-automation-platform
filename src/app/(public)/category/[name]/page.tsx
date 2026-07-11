import { Inbox } from "lucide-react"
import { getCachedPostsByCategory, getCachedCategories } from "@/lib/postsCache"
import { PostList } from "@/components/PostList"
import { CategoryFilter } from "@/components/CategoryFilter"
import { Pagination } from "@/components/Pagination"
import { POSTS_PER_PAGE } from "@/constants"
import { encodeUrl } from "@/lib/formatters"

interface CategoryPageProps {
  params: Promise<{ name: string }>
  searchParams: Promise<{ page?: string }>
}

// Task 012: ISR 설정 (searchParams 사용으로 인해 Full Route Cache는 적용되지 않으며,
// 실질적 캐싱은 postsCache.ts의 TTL 캐싱이 담당함 — Next.js 공식 문서 참고)
export const revalidate = 3600 // 1시간

// Task 012: 카테고리 페이지의 정적 생성 파라미터 — 모든 카테고리를 미리 생성
export async function generateStaticParams() {
  const categories = await getCachedCategories()
  return categories.map((categoryName) => ({ name: encodeUrl(categoryName) }))
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { name } = await params
  const { page } = await searchParams
  const decoded = decodeURIComponent(name)
  const currentPage = Math.max(1, Number(page) || 1)

  // Task 012: mock 데이터 제거, 실데이터 연동
  const filtered = await getCachedPostsByCategory(decoded)
  const categories = await getCachedCategories()

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

      {/* Task 012: DEFAULT_CATEGORIES 하드코딩 대신 실카테고리 목록으로 교체 */}
      <CategoryFilter categories={categories} activeCategory={decoded} />

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
