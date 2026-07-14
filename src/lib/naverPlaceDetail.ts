// 네이버 지도 URL에 포함된 place ID로 실제 매장 상세 정보(주소/전화)를 조회한다.
// 네이버 오픈API의 지역 검색은 텍스트 검색만 지원해, 흔한 상호명(예: "잇키")으로 검색하면
// 완전히 다른 지점(부평 대신 송도)을 잘못 매칭하는 사고가 실측으로 확인됐다. 반면 지도
// URL의 place ID는 사용자가 실제로 확인한 정확한 그 장소를 가리키므로, 네이버 플레이스의
// 공개 모바일 페이지(m.place.naver.com, 로그인 불필요)에서 해당 ID의 실제 정보를 직접
// 추출하는 편이 훨씬 신뢰할 수 있다.

export interface NaverPlaceDetail {
  name?: string
  address?: string
  roadAddress?: string
  telephone?: string
  category?: string
  businessHours?: string
  parkingInfo?: string
  conveniences?: string[]
}

const PLACE_ID_PATTERN = /\/place\/(\d+)/

/**
 * 네이버 지도 URL(예: https://map.naver.com/p/search/잇키/place/1370160067?...)에서
 * place ID를 추출한다. 못 찾으면 null.
 */
export function extractNaverPlaceId(url: string): string | null {
  const match = url.match(PLACE_ID_PATTERN)
  return match ? match[1] : null
}

function extractField(html: string, key: string): string | undefined {
  const match = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
  return match?.[1] || undefined
}

// 영업시간은 "day"(예: "매일")와 시작/종료 시각, 라스트오더 시각이 별도 필드로 나뉘어
// 있어 하나의 읽기 쉬운 문구로 합친다. 필드가 없으면(비공개 등) undefined.
function extractBusinessHours(html: string): string | undefined {
  const dayMatch = html.match(/"WorkingHoursInfo","day":"([^"]*)"/)
  const timeMatch = html.match(/"StartEndTime","start":"([^"]*)","end":"([^"]*)"/)
  if (!dayMatch?.[1] || !timeMatch) return undefined

  const base = `${dayMatch[1]} ${timeMatch[1]} - ${timeMatch[2]}`
  const lastOrderMatch = html.match(/"LastOrderTimes"[^}]*"time":"([^"]*)"/)
  return lastOrderMatch?.[1] ? `${base} (라스트오더 ${lastOrderMatch[1]})` : base
}

function extractParkingInfo(html: string): string | undefined {
  const match = html.match(/"InformationParking","description":"([^"]*)"/)
  return match?.[1]?.trim() || undefined
}

// "예약", "배달", "포장", "무선 인터넷" 같은 편의 서비스 목록.
function extractConveniences(html: string): string[] {
  const match = html.match(/"conveniences":\[([^\]]*)\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(`[${match[1]}]`)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

/**
 * place ID로 네이버 플레이스 공개 페이지에서 실제 매장 정보를 조회한다.
 * `/place/{id}/home` 경로는 업종(restaurant/cafe 등)별 실제 경로로 자동 리다이렉트되므로
 * 업종을 미리 알 필요가 없다. 페이지 구조가 바뀌거나 요청이 실패하면 null을 반환해
 * 호출부가 안전하게 폴백하도록 한다.
 */
export async function fetchNaverPlaceDetail(placeId: string): Promise<NaverPlaceDetail | null> {
  try {
    const res = await fetch(`https://m.place.naver.com/place/${placeId}/home`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    })
    if (!res.ok) {
      console.warn("[naverPlaceDetail] 조회 응답 오류", res.status)
      return null
    }

    const html = await res.text()
    const roadAddress = extractField(html, "roadAddress")
    const address = extractField(html, "address")
    if (!roadAddress && !address) return null

    const conveniences = extractConveniences(html)

    return {
      name: extractField(html, "name"),
      address,
      roadAddress,
      telephone: extractField(html, "phone"),
      category: extractField(html, "category"),
      businessHours: extractBusinessHours(html),
      parkingInfo: extractParkingInfo(html),
      conveniences: conveniences.length > 0 ? conveniences : undefined,
    }
  } catch (error) {
    console.warn("[naverPlaceDetail] 조회 실패", error)
    return null
  }
}
