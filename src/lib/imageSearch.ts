// 네이버 이미지 검색 API(https://developers.naver.com)를 통해 실제 존재하는 이미지를 찾는다.
// 방문 후기성 글(나들이/맛집)은 AI가 지어낸 그림보다 실제 장소 사진을 우선 쓰기 위함.
// 키가 설정되어 있지 않으면 빈 배열을 반환해 호출부가 자연스럽게 다음 단계(AI 생성)로 넘어가게 한다.

const NAVER_IMAGE_SEARCH_URL = "https://openapi.naver.com/v1/search/image"

// 언론사/통신사 이미지 CDN + 유료 스톡 이미지 사이트. 워터마크·저작권 표시가 찍혀있거나
// 타인의 저작물(뉴스 사진, 유료 스톡 사진)일 가능성이 높아 자동 첨부 대상에서 제외한다.
const BLOCKED_IMAGE_DOMAINS = [
  // 언론사/통신사 - 워터마크·저작권 표시가 찍혀있는 경우가 많아(실측 확인: 이데일리
  // 워터마크가 찍힌 사진이 그대로 쓰인 사고) 도메인 단위로 원천 차단한다.
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
  "img.edaily.co.kr",
  "thumb.edaily.co.kr",
  "image.news1.kr",
  "image.nocutnews.co.kr",
  "img.segye.com",
  "image.kmib.co.kr",
  "img.joongang.co.kr",
  "image.heraldcorp.com",
  "cdn.asiae.co.kr",
  "img.etnews.com",
  "image.newsis.com",
  "photo.newsis.com",
  // 유료 스톡 이미지(워터마크 포함)
  "gettyimages.com",
  "shutterstock.com",
  "istockphoto.com",
  "alamy.com",
  "123rf.com",
  "depositphotos.com",
]

// 개인 블로그/카페 게시판에서 캐싱된 이미지는 실측 결과 다른 사람의 워터마크가
// 찍혀있는 경우가 많아(예: "ezday.co.kr/cache/board/...") 경로 패턴으로 걸러낸다.
// 예전에는 호스트명에 "blog."/"cafe."가 들어가면 통째로 차단했으나, 네이버 이미지 검색
// 결과의 상당수가 네이버 자체 CDN(blogfiles.naver.net, cafefiles.naver.net 등)이라
// 이 필터가 정상 이미지까지 광범위하게 걸러내는 문제가 실측으로 확인되어 제거했다.
// 워터마크/광고 이미지 여부는 이제 verifyImageRelevance()의 비전 모델 검증이 최종
// 방어선 역할을 한다. 네이버가 아닌 타 블로그 플랫폼(워터마크가 흔함)은 도메인으로 계속 차단한다.
// (완벽한 워터마크 탐지는 이미지 분석이 필요해 여기서는 휴리스틱으로만 걸러냄)
const BLOCKED_HOST_SUBSTRINGS = ["tistory.com", "egloos.com", "blogspot.com", "wordpress.com"]
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

const GOOGLE_CUSTOM_SEARCH_URL = "https://www.googleapis.com/customsearch/v1"

// 네이버 검색으로 부족한 이미지를 보완하는 2차 소스. 2026-01-20부터 신규 Programmable
// Search Engine은 "전체 웹 검색"이 막히고 콘솔에서 등록한 최대 50개 도메인 내에서만
// 검색되므로(구글 공식 정책 변경), 특정 장소 실사 사진보다는 스톡/백과/정보성 이미지
// 보완에 더 적합하다. 키가 없으면 조용히 건너뛴다(searchRealImages와 동일한 패턴).
export async function searchGoogleImages(query: string, count: number): Promise<string[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID
  if (!apiKey || !engineId || count <= 0) return []

  try {
    // Custom Search API는 1회 요청당 최대 10개(num)만 반환하므로 그 안에서 여유 있게 요청한다.
    const num = Math.min(count * 3, 10)
    const url = `${GOOGLE_CUSTOM_SEARCH_URL}?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(
      query
    )}&searchType=image&num=${num}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn("[imageSearch] 구글 이미지 검색 응답 오류", res.status)
      return []
    }

    const data = (await res.json()) as { items?: { link?: string }[] }
    const links = (data.items ?? [])
      .map((item) => item.link)
      .filter((link): link is string => Boolean(link))

    return links.filter(isUsableImageUrl).slice(0, count)
  } catch (error) {
    console.warn("[imageSearch] 구글 이미지 검색 실패", error)
    return []
  }
}
