import Link from "next/link"
import { Search } from "lucide-react"
import { generateMockPosts } from "@/lib/mockData"
import { PostList } from "@/components/PostList"
import { CategoryFilter } from "@/components/CategoryFilter"
import { Pagination } from "@/components/Pagination"
import { Card, CardContent } from "@/components/ui/card"
import { DEFAULT_CATEGORIES, POSTS_PER_PAGE } from "@/constants"

interface HomePageProps {
  searchParams: Promise<{ page?: string }>
}

// 더미 데이터 24개로 3페이지 분량의 페이지네이션 데모를 구성한다
const MOCK_POOL_SIZE = 24

export default async function HomePage({ searchParams }: HomePageProps) {
  const { page } = await searchParams
  const currentPage = Math.max(1, Number(page) || 1)

  const allPosts = generateMockPosts(MOCK_POOL_SIZE)
  const totalPages = Math.max(1, Math.ceil(allPosts.length / POSTS_PER_PAGE))
  const pagedPosts = allPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">최신 글</h1>
        <p className="text-muted-foreground">맛집, 육아, 결혼 이야기를 나눕니다.</p>
      </div>

      <CategoryFilter categories={[...DEFAULT_CATEGORIES]} />

      <Link href="/search">
        <Card className="transition-colors hover:bg-accent">
          <CardContent className="flex items-center gap-3 p-4">
            <Search className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">궁금한 키워드로 글을 검색해보세요</span>
          </CardContent>
        </Card>
      </Link>

      <PostList posts={pagedPosts} />

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/" />
    </div>
  )
}
