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
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{decoded}</h1>
        <p className="text-muted-foreground">{filtered.length}개의 글</p>
      </div>

      <CategoryFilter categories={[...DEFAULT_CATEGORIES]} activeCategory={decoded} />

      {pagedPosts.length > 0 ? (
        <PostList posts={pagedPosts} />
      ) : (
        <p className="py-12 text-center text-muted-foreground">
          &quot;{decoded}&quot; 카테고리에 글이 없습니다.
        </p>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath={`/category/${encodeUrl(decoded)}`}
      />
    </div>
  )
}
