// 네이버 이미지 검색 API(https://developers.naver.com)를 통해 실제 존재하는 이미지를 찾는다.
// 방문 후기성 글(나들이/맛집)은 AI가 지어낸 그림보다 실제 장소 사진을 우선 쓰기 위함.
// 키가 설정되어 있지 않으면 빈 배열을 반환해 호출부가 자연스럽게 다음 단계(AI 생성)로 넘어가게 한다.

const NAVER_IMAGE_SEARCH_URL = "https://openapi.naver.com/v1/search/image"

// 언론사/통신사 이미지 CDN + 유료 스톡 이미지 사이트. 워터마크·저작권 표시가 찍혀있거나
// 타인의 저작물(뉴스 사진, 유료 스톡 사진)일 가능성이 높아 자동 첨부 대상에서 제외한다.
const BLOCKED_IMAGE_DOMAINS = [
  // 언론사/통신사
  "imgnews.naver.net",
  "imgnews.pstatic.net",
  "mimgnews.pstatic.net",
  "img.yna.co.kr",
  "image.chosun.com",
  "img.hankyung.com",
  "photo.jtbc.co.kr",
  "cdn.newsis.com",
  "image.fnnews.com",
  "img.sbs.co.kr",
  "image.ytn.co.kr",
  "img.donga.com",
  "img.hani.co.kr",
  "photo.mk.co.kr",
  // 유료 스톡 이미지(워터마크 포함)
  "gettyimages.com",
  "shutterstock.com",
  "istockphoto.com",
  "alamy.com",
  "123rf.com",
  "depositphotos.com",
]

// 개인 블로그/카페 게시판에서 캐싱된 이미지는 실측 결과 다른 사람의 워터마크가
// 찍혀있는 경우가 많아(예: "ezday.co.kr/cache/board/...") 호스트명·경로 패턴으로 걸러낸다.
// (완벽한 워터마크 탐지는 이미지 분석이 필요해 여기서는 휴리스틱으로만 걸러냄)
const BLOCKED_HOST_SUBSTRINGS = [
  "blog.",
  "cafe.",
  "tistory.com",
  "egloos.com",
  "blogspot.com",
  "wordpress.com",
  "blogfiles",
]
const BLOCKED_PATH_PATTERNS = [/\/board\//i, /\/blog\//i, /\/cafe\//i]

// GIF 등 움직이는 이미지나 확장자를 알 수 없는 링크는 블로그 사진으로 부적절하므로 제외하고,
// 정적 이미지 포맷만 허용한다.
const ALLOWED_EXTENSION_PATTERN = /\.(jpe?g|png|webp)(?:$)/i

function isUsableImageUrl(link: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(link)
  } catch {
    return false // URL 파싱 자체가 안 되면 안전하게 제외
  }

  const hostname = parsed.hostname
  const pathname = parsed.pathname

  if (
    BLOCKED_IMAGE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return false
  }
  if (BLOCKED_HOST_SUBSTRINGS.some((s) => hostname.includes(s))) return false
  if (BLOCKED_PATH_PATTERNS.some((p) => p.test(pathname))) return false
  if (!ALLOWED_EXTENSION_PATTERN.test(pathname)) return false

  return true
}

export async function searchRealImages(query: string, count: number): Promise<string[]> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET
  if (!clientId || !clientSecret || count <= 0) return []

  try {
    // 필터링 후에도 count개를 채울 수 있도록 여유 있게 더 많이 요청한다(최대 100).
    const display = Math.min(count * 5, 100)
    const url = `${NAVER_IMAGE_SEARCH_URL}?query=${encodeURIComponent(query)}&display=${display}&sort=sim`
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    })
    if (!res.ok) {
      console.warn("[imageSearch] 네이버 이미지 검색 응답 오류", res.status)
      return []
    }

    const data = (await res.json()) as { items?: { link?: string }[] }
    const links = (data.items ?? [])
      .map((item) => item.link)
      .filter((link): link is string => Boolean(link))

    return links.filter(isUsableImageUrl).slice(0, count)
  } catch (error) {
    console.warn("[imageSearch] 네이버 이미지 검색 실패", error)
    return []
  }
}
