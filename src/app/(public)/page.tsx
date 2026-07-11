import Link from "next/link"
import { Search } from "lucide-react"
import { getCachedPublishedPosts, getCachedCategories } from "@/lib/postsCache"
import { PostList } from "@/components/PostList"
import { CategoryFilter } from "@/components/CategoryFilter"
import { Pagination } from "@/components/Pagination"
import { Card, CardContent } from "@/components/ui/card"
import { POSTS_PER_PAGE } from "@/constants"

interface HomePageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { page } = await searchParams
  const currentPage = Math.max(1, Number(page) || 1)

  const allPosts = await getCachedPublishedPosts()
  const categories = await getCachedCategories()

  const totalPages = Math.max(1, Math.ceil(allPosts.length / POSTS_PER_PAGE))
  const pagedPosts = allPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      {/* 페이지 소개 영역을 header로 묶어 시맨틱을 명확히 함 */}
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">최신 글</h1>
        <p className="text-muted-foreground">맛집, 육아, 결혼 이야기를 나눕니다.</p>
      </header>

      <CategoryFilter categories={categories} />

      {/* 검색 페이지로 이동하는 배너 링크 — 포커스 링을 명시해 키보드 접근성 확보 */}
      <Link
        href="/search"
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="transition-colors hover:bg-accent">
          <CardContent className="flex items-center gap-3 p-4">
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm">궁금한 키워드로 글을 검색해보세요</span>
          </CardContent>
        </Card>
      </Link>

      {/* 포스트 목록 영역 — 스크린리더 사용자를 위한 숨김 제목으로 랜드마크 이름 부여 */}
      <section aria-labelledby="latest-posts-heading">
        <h2 id="latest-posts-heading" className="sr-only">
          포스트 목록
        </h2>
        <PostList posts={pagedPosts} />
      </section>

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/" />
    </div>
  )
}
