import { Post, Draft } from "@/types"

/**
 * 더미 포스트 데이터 생성
 */
export function generateMockPosts(count: number = 10): Post[] {
  const categories = ["맛집", "육아", "결혼"]
  const mockTitles = [
    "서울 강남 가성비 맛집 TOP 5",
    "신생아 황달 자연 치유 경험담",
    "결혼 준비물 체크리스트",
    "종로 한식당 웨이팅 팁",
    "아이 이유식 초기 시작하기",
    "웨딩홀 선택 기준",
    "강남역 카페 추천",
    "돌 잔치 준비하기",
    "신혼집 인테리어",
    "동대문 쇼핑 꿀팁",
  ]

  const posts: Post[] = []

  for (let i = 0; i < Math.min(count, mockTitles.length); i++) {
    const postId = `post-${i + 1}`
    posts.push({
      id: postId,
      notionId: `notion-${postId}`,
      title: mockTitles[i],
      content: `이것은 ${mockTitles[i]}에 대한 샘플 콘텐츠입니다.`,
      excerpt: `${mockTitles[i]}의 요약 텍스트입니다. 이 글에서는...`,
      category: categories[i % categories.length],
      tags: ["추천", "정보", "경험담"].slice(0, Math.floor(Math.random() * 3) + 1),
      imageUrl: `https://images.unsplash.com/photo-${1550000000000 + i * 1000000}?w=400&h=300&fit=crop`,
      status: "발행됨",
      publishedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
      naverDraftStatus: i % 2 === 0 ? "생성됨" : "미생성",
      naverPostUrl:
        i % 2 === 0
          ? `https://blog.naver.com/zmfflsp/${100 + i}`
          : undefined,
      createdAt: new Date(Date.now() - (i + 2) * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
    })
  }

  return posts
}

/**
 * 더미 초안 데이터 생성
 */
export function generateMockDraft(postId: string): Draft {
  return {
    id: `draft-${postId}`,
    postId,
    generatedContent: `이것은 ${postId}에 대한 네이버 블로그 스타일 자동 생성 초안입니다.

당신은 인기 있는 블로거답게 친근하고 실용적인 어투로 작성되었습니다.

- 가성비 좋은 가게 추천 ✨
- 분위기 최고 🌟
- 재방문 100% #가성비 #분위기 #서울 #맛집`,
    status: "생성됨",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
