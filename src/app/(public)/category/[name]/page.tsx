interface CategoryPageProps {
  params: Promise<{ name: string }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { name } = await params
  const decoded = decodeURIComponent(name)

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold">카테고리: {decoded} (스켈레톤)</h1>
      {/* TODO Task 004: CategoryFilter(다른 카테고리 선택) + PostList(해당 카테고리 글) + 포스트 수 표시 + Pagination */}
    </div>
  )
}
