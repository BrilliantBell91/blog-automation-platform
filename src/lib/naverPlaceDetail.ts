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

// 페이지 내 특정 위치(startBrace가 가리키는 "{")부터 중괄호 균형을 맞춰 JSON 객체 하나의
// 범위를 잘라낸다. 문자열 리터럴 안의 중괄호는 무시한다.
function extractBalancedJsonAt(html: string, startBrace: number): string | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startBrace; i < html.length; i++) {
    const ch = html[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return html.slice(startBrace, i + 1)
    }
  }
  return null
}

// 페이지에는 이 place와 무관한 다른 POI들의 캐시 객체(주변 시설, 추천 장소 등)도 함께
// 들어있어서, 필드명만 보고 페이지 전체에서 첫 매치를 가져오면 완전히 다른 업체의 값을
// 가져오는 사고가 실측으로 확인됐다(예: place ID가 "에버랜드"인데 페이지 앞쪽에 있던
// 무관한 "PoiInfoShapeKey" 객체의 name:"RELA"가 먼저 매치되어 상호명이 뒤바뀜).
// 반드시 이 place ID의 "PlaceDetailBase:{id}" 객체 범위 안에서만 값을 찾아야 한다.
function extractPlaceDetailBaseJson(html: string, placeId: string): string | null {
  const anchor = `"PlaceDetailBase:${placeId}":{`
  const start = html.indexOf(anchor)
  if (start === -1) return null
  return extractBalancedJsonAt(html, start + anchor.length - 1)
}

// "PlaceDetailTopPhotoItem:visitor_1":{...}, "PlaceDetailTopPhotoItem:business_1":{...} 같은
// 사진 캐시 객체를 전부 찾아 각각의 JSON 범위를 잘라낸다.
function extractAllObjectsByPrefix(html: string, keyPrefix: string): string[] {
  const results: string[] = []
  const anchorPattern = new RegExp(`"${keyPrefix}:[^"]+"\\s*:\\s*\\{`, "g")
  let anchorMatch: RegExpExecArray | null
  while ((anchorMatch = anchorPattern.exec(html)) !== null) {
    const start = anchorMatch.index + anchorMatch[0].length - 1
    const obj = extractBalancedJsonAt(html, start)
    if (obj) results.push(obj)
  }
  return results
}

function extractField(json: string, key: string): string | undefined {
  const match = json.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
  return match?.[1] || undefined
}

// 페이지 안 문자열은 JS 유니코드 이스케이프(슬래시가 6자리 코드로 인코딩됨)가 그대로
// 남아있는 채로 내려오므로, 실제 URL로 쓰기 전에 JSON 문자열 파싱으로 정식 디코딩한다.
function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return raw
  }
}

// 영업시간은 "day"(예: "매일")와 시작/종료 시각, 라스트오더 시각이 별도 필드로 나뉘어
// 있어 하나의 읽기 쉬운 문구로 합친다. WorkingHoursInfo는 PlaceDetailBase 객체 밖(요일별
// 배열)에 있어 이 place 소유인지 정확히 특정할 수 없으므로, PlaceDetailBase 자체가
// "영업시간 정보 없음"(isBizHourMissing)이라고 밝힌 경우엔 아예 추출을 시도하지 않는다
// (실측 확인: 에버랜드는 isBizHourMissing:true인데도 페이지 어딘가의 무관한 업체
// 영업시간이 "화 10:00-22:00"으로 잘못 붙는 사고가 있었음).
function extractBusinessHours(html: string, scopedJson: string): string | undefined {
  if (/"isBizHourMissing"\s*:\s*true/.test(scopedJson)) return undefined

  const dayMatch = html.match(/"WorkingHoursInfo","day":"([^"]*)"/)
  const timeMatch = html.match(/"StartEndTime","start":"([^"]*)","end":"([^"]*)"/)
  if (!dayMatch?.[1] || !timeMatch) return undefined

  const base = `${dayMatch[1]} ${timeMatch[1]} - ${timeMatch[2]}`
  const lastOrderMatch = html.match(/"LastOrderTimes"[^}]*"time":"([^"]*)"/)
  return lastOrderMatch?.[1] ? `${base} (라스트오더 ${lastOrderMatch[1]})` : base
}

// "예약", "배달", "포장", "무선 인터넷" 같은 편의 서비스 목록.
function extractConveniences(json: string): string[] {
  const match = json.match(/"conveniences":\[([^\]]*)\]/)
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
    const scoped = extractPlaceDetailBaseJson(html, placeId)
    if (!scoped) return null

    const roadAddress = extractField(scoped, "roadAddress")
    const address = extractField(scoped, "address")
    if (!roadAddress && !address) return null

    const conveniences = extractConveniences(scoped)

    return {
      name: extractField(scoped, "name"),
      address,
      roadAddress,
      // phone은 PlaceDetailBase 밖의 별도 참조 객체(PlacePhoneInfo)에 있어 이 객체 범위
      // 안에서는 못 찾지만, 페이지 전체에서도 유일하게 한 번만 나타나 이 place 소유임이
      // 실측으로 확인되어 전역 html에서 찾는다.
      telephone: extractField(html, "phone"),
      category: extractField(scoped, "category"),
      businessHours: extractBusinessHours(html, scoped),
      conveniences: conveniences.length > 0 ? conveniences : undefined,
    }
  } catch (error) {
    console.warn("[naverPlaceDetail] 조회 실패", error)
    return null
  }
}

/**
 * place ID의 실제 사진(업체 등록 사진 + 방문자 인증 사진)을 가져온다. 첨부된 지도 URL이
 * 가리키는 바로 그 장소의 사진이라, 제목/태그로 검색하는 방식과 달리 완전히 다른 장소의
 * 사진이 섞여 들어올 일이 없다(실측 확인된 문제 - 이자카야 글에 검색으로 찾은 무관한
 * 피자 사진이 쓰인 사고). 업체가 직접 올린 "business" 사진을 우선하고, 부족하면 방문자
 * 사진("visitor")으로 채운다. 사진이 하나도 없거나 요청이 실패하면 빈 배열을 반환해
 * 호출부가 기존 키워드 검색으로 폴백하도록 한다.
 */
export async function fetchNaverPlacePhotos(placeId: string, count: number): Promise<string[]> {
  if (count <= 0) return []
  try {
    const res = await fetch(`https://m.place.naver.com/place/${placeId}/home`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    })
    if (!res.ok) return []

    const html = await res.text()
    const photoObjects = extractAllObjectsByPrefix(html, "PlaceDetailTopPhotoItem")
    const photos = photoObjects
      .map((obj) => ({ origin: extractField(obj, "origin"), type: extractField(obj, "type") }))
      .filter((p): p is { origin: string; type: string } => Boolean(p.origin))

    const business = photos.filter((p) => p.type === "business").map((p) => decodeJsonString(p.origin))
    const visitor = photos.filter((p) => p.type === "visitor").map((p) => decodeJsonString(p.origin))

    return [...business, ...visitor].slice(0, count)
  } catch (error) {
    console.warn("[naverPlaceDetail] 플레이스 사진 조회 실패", error)
    return []
  }
}
