// 네이버 지역 검색 API(https://developers.naver.com)로 실제 매장의 주소/전화번호를 조회한다.
// map.naver.com은 SPA라 url_context 툴이 페이지를 열어도 서버 렌더링된 실제 주소/전화
// 텍스트를 얻지 못하고(실측 확인: og:image조차 고정 로고만 반환), 그 결과 LLM이 그럴듯하지만
// 틀린 주소/전화번호를 지어내는 사고가 발생했다. 검증된 구조화 데이터를 직접 조회해
// 프롬프트에 "반드시 이 값만 사용"으로 주입하는 것이 유일하게 신뢰할 수 있는 방법이다.

import type { NaverPlaceDetail } from "./naverPlaceDetail"

const NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json"

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, "")
}

/**
 * 상호명(또는 검색어)으로 네이버 지역 검색을 해 실제 주소/전화번호를 조회한다.
 * API 키가 없거나 결과가 없으면 null을 반환한다 — 호출부에서 그 경우 url_context에만 의존한다.
 * 공식 오픈API 응답에는 영업시간/주차 정보가 없어 NaverPlaceDetail 타입의 해당 필드는 항상
 * undefined다(fetchNaverPlaceDetail과 반환 타입을 통일해 호출부에서 안전하게 다루기 위함).
 */
export async function searchNaverPlace(query: string): Promise<NaverPlaceDetail | null> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET
  if (!clientId || !clientSecret || !query.trim()) return null

  try {
    const url = `${NAVER_LOCAL_SEARCH_URL}?query=${encodeURIComponent(query)}&display=1`
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    })
    if (!res.ok) {
      console.warn("[naverLocalSearch] 지역 검색 응답 오류", res.status)
      return null
    }

    const data = (await res.json()) as {
      items?: { title?: string; address?: string; roadAddress?: string; telephone?: string }[]
    }
    const item = data.items?.[0]
    if (!item?.address) return null

    return {
      name: stripHtmlTags(item.title ?? ""),
      address: item.address,
      roadAddress: item.roadAddress || item.address,
      telephone: item.telephone || undefined,
    }
  } catch (error) {
    console.warn("[naverLocalSearch] 지역 검색 실패", error)
    return null
  }
}
