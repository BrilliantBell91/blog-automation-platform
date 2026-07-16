import { Inbox } from "lucide-react"
import { getCachedPostsByCategory, getCachedCategories } from "@/lib/postsCache"
import { applyDraftThumbnails } from "@/lib/drafts"
import { PostList } from "@/components/PostList"
import { CategoryFilter } from "@/components/CategoryFilter"
import { Pagination } from "@/components/Pagination"
import { POSTS_PER_PAGE } from "@/constants"
import { encodeUrl } from "@/lib/formatters"

interface CategoryPageProps {
  params: Promise<{ name: string }>
  searchParams: Promise<{ page?: string }>
}

export const revalidate = 3600 // 1시간

export async function generateStaticParams() {
  const categories = await getCachedCategories()
  return categories.map((categoryName) => ({ name: encodeUrl(categoryName) }))
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { name } = await params
  const { page } = await searchParams
  const decoded = decodeURIComponent(name)
  const currentPage = Math.max(1, Number(page) || 1)

  const filtered = await getCachedPostsByCategory(decoded)
  const categories = await getCachedCategories()

  const totalPages = Math.max(1, Math.ceil(filtered.length / POSTS_PER_PAGE))
  const pagedPosts = await applyDraftThumbnails(
    filtered.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE)
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{decoded}</h1>
        <p className="text-muted-foreground">{filtered.length}개의 글</p>
      </header>

      <CategoryFilter categories={categories} activeCategory={decoded} />

      {pagedPosts.length > 0 ? (
        <section aria-labelledby="category-posts-heading">
          <h2 id="category-posts-heading" className="sr-only">
            {decoded} 카테고리 포스트 목록
          </h2>
          <PostList posts={pagedPosts} />
        </section>
      ) : (
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
