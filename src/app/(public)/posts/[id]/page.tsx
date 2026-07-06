interface PostPageProps {
  params: Promise<{ id: string }>
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params

  return (
    <article className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">포스트 상세 (스켈레톤): {id}</h1>
      {/* TODO Task 004: 메타데이터(작성자, 발행일, 수정일), 본문 콘텐츠, 이전/다음 포스트 네비게이션, 공유 버튼, 반응형 레이아웃 */}
    </article>
  )
}
