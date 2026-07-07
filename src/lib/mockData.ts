import { Post, Draft, DraftStatus } from "@/types"

const MOCK_TITLES = [
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
  "홍대 브런치 맛집 정리",
  "아이 밤중 수유 노하우",
  "청첩장 제작 후기",
  "제주도 가족 여행 맛집",
  "신혼여행지 추천 BEST 3",
]

const MOCK_CATEGORIES = ["맛집", "육아", "결혼"]
const MOCK_TAG_POOL = ["추천", "정보", "경험담"]

/**
 * 더미 포스트 데이터 생성
 * count가 제목 목록 길이보다 크면 제목에 회차 접미사를 붙여 순환 생성한다 (페이지네이션 데모용)
 */
export function generateMockPosts(count: number = 10): Post[] {
  const posts: Post[] = []

  for (let i = 0; i < count; i++) {
    const cycle = Math.floor(i / MOCK_TITLES.length) + 1
    const baseTitle = MOCK_TITLES[i % MOCK_TITLES.length]
    const title = cycle > 1 ? `${baseTitle} ${cycle}` : baseTitle
    const postId = `post-${i + 1}`

    posts.push({
      id: postId,
      notionId: `notion-${postId}`,
      title,
      content: `이것은 ${title}에 대한 샘플 콘텐츠입니다.`,
      excerpt: `${title}의 요약 텍스트입니다. 이 글에서는...`,
      category: MOCK_CATEGORIES[i % MOCK_CATEGORIES.length],
      tags: MOCK_TAG_POOL.slice(0, (i % MOCK_TAG_POOL.length) + 1),
      imageUrl: `https://picsum.photos/seed/post-${i + 1}/400/300`,
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

const SHORT_DRAFT_CONTENT = (title: string) => `${title} 다녀왔어요! 완전 만족 ✨ #추천`

const LONG_DRAFT_CONTENT = (title: string) => `안녕하세요! 오늘은 ${title} 이야기를 들고 왔어요.

사실 별 기대 없이 갔는데, 생각보다 훨씬 만족스러웠어요. 분위기도 좋고 사람들도 친절해서 시간 가는 줄 몰랐네요.

특히 기억에 남는 부분은 디테일이 살아있다는 점이었어요. 처음 방문하시는 분들도 부담 없이 즐기실 수 있을 것 같아요.

다음에 또 기회가 되면 꼭 다시 와보고 싶어요. 여러분도 한 번쯤 경험해보시길 추천드려요!

#추천 #정보 #경험담 #또가고싶다`

/**
 * 관리자 대시보드용 포스트+초안 목록 생성
 * Draft.status를 상태의 기준으로 삼는다 (Post.naverDraftStatus는 읽지 않음 — shrimp-rules.md 참고)
 * 상태 3종(미생성/생성됨/게시완료)을 고르게 분포시키고, 긴/짧은 본문 샘플을 함께 포함한다
 */
export function generateMockDraftList(count: number = 12): Array<{ post: Post; draft: Draft | null }> {
  const posts = generateMockPosts(count)
  const statuses: DraftStatus[] = ["미생성", "생성됨", "게시완료"]

  return posts.map((post, i) => {
    const status = statuses[i % statuses.length]

    if (status === "미생성") {
      return { post, draft: null }
    }

    const content = i % 4 === 0 ? LONG_DRAFT_CONTENT(post.title) : SHORT_DRAFT_CONTENT(post.title)

    const draft: Draft = {
      id: `draft-${post.id}`,
      postId: post.id,
      generatedContent: content,
      status,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }

    return { post, draft }
  })
}
