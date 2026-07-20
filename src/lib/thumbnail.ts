// 첨부 사진 중 외관/메뉴판 사진이 없을 때, place ID로 검증된 실제 매장 사진이나
// 웹 검색으로 대신 찾는다. 첨부 사진 자체의 외관/메뉴판 여부 판별은
// imageMatching.ts의 analyzeImagesBatch가 캡션 생성과 함께 한 번의 배치 비전
// 호출로 처리하므로(사진 장수만큼 개별 호출하던 이전 구조는 무료 티어 일일
// 한도를 초안 하나로 소진시키는 사고가 실측으로 확인되어 폐기했다), 이 파일은
// 검색 폴백 전용으로 축소한다.

import { runVisionPrompt } from "./imageGen"
import { searchRealImages, searchGoogleImages } from "./imageSearch"
import { fetchNaverPlacePhotos } from "./naverPlaceDetail"

const EXTERIOR_CLASSIFY_PROMPT = `이 사진이 가게/매장/장소의 외관(건물 정면, 간판이 보이는 입구, 외부 전경) 사진인지 판단해주세요.
음식, 실내 인테리어, 메뉴판, 사람 얼굴 클로즈업 등은 외관 사진이 아닙니다.
외관 사진이면 정확히 "예"만, 아니면 정확히 "아니오"만 답하세요.`

const MENU_CLASSIFY_PROMPT = `이 사진이 가게/매장의 메뉴판(가격이 적힌 메뉴 목록판) 사진인지 판단해주세요.
음식 자체 클로즈업, 실내 인테리어, 건물 외관, 사람 얼굴 클로즈업 등은 메뉴판 사진이 아닙니다.
메뉴판 사진이면 정확히 "예"만, 아니면 정확히 "아니오"만 답하세요.`

// 검색 후보 검증은 슬롯 하나를 채우는 것과 같은 비중이므로, 다른 슬롯 채우기(최대 6회)와
// 비슷한 예산으로 제한한다 — 첨부 사진에 외관/메뉴판 사진이 없을 때만 도는 폴백 경로라
// 자주 호출되지는 않지만, 후보를 무제한 검증하면 비전 호출이 불필요하게 쌓일 수 있다.
const MAX_CANDIDATES_TO_VERIFY = 4

async function classifyPhoto(apiKey: string, imageUrl: string, prompt: string): Promise<boolean> {
  const text = await runVisionPrompt(apiKey, imageUrl, prompt)
  return (text ?? "").startsWith("예")
}

// Notion 제목에 흔히 붙는 "[테스트]", "[협찬]" 같은 대괄호 접두사는 검색 관련성을 떨어뜨린다.
function cleanTitleForSearch(title: string): string {
  return title.replace(/^\[[^\]]*\]\s*/, "").trim()
}

// 외관/메뉴판 검색 공통 로직: placeId(사용자가 Notion 속성에 등록한 지도 URL에서 뽑은
// 네이버 플레이스 ID)가 있으면 그 place ID로 실제 등록된 사진(업체가 직접 올린 사진
// 우선, 그다음 방문자 사진)만 후보로 검증한다 — 지도 URL로 "이 가게가 맞다"는 게 이미
// 검증돼 있으므로, 이름이 같은 다른 가게나 전혀 무관한 사진이 섞이지 않는다. placeId가
// 없을 때만(지도 링크를 첨부하지 않은 글) 검색어 텍스트로 웹 전체를 검색하는 것으로
// 폴백한다 — 이 경로는 동명의 다른 가게 사진이 섞일 위험이 있어 place ID 기준보다
// 신뢰도가 낮다.
async function findCategoryImage(
  apiKey: string,
  searchQuery: string,
  placeId: string | null | undefined,
  classifyPrompt: string
): Promise<string | null> {
  if (!apiKey) return null

  if (placeId) {
    const verifiedPhotos = await fetchNaverPlacePhotos(placeId, MAX_CANDIDATES_TO_VERIFY)
    for (const candidate of verifiedPhotos) {
      if (await classifyPhoto(apiKey, candidate, classifyPrompt)) return candidate
    }
    return null
  }

  const candidates = [
    ...(await searchRealImages(searchQuery, 5)),
    ...(await searchGoogleImages(searchQuery, 5)),
  ].slice(0, MAX_CANDIDATES_TO_VERIFY)

  for (const candidate of candidates) {
    if (await classifyPhoto(apiKey, candidate, classifyPrompt)) return candidate
  }

  return null
}

/**
 * 가게 외관 사진을 찾아 검증까지 통과한 URL을 반환한다. 찾지 못하면 null.
 */
export async function findExteriorImageViaSearch(
  apiKey: string,
  postTitle: string,
  placeId?: string | null
): Promise<string | null> {
  const query = `${cleanTitleForSearch(postTitle)} 외관`
  return findCategoryImage(apiKey, query, placeId, EXTERIOR_CLASSIFY_PROMPT)
}

/**
 * 가게 메뉴판 사진을 찾아 검증까지 통과한 URL을 반환한다. 찾지 못하면 null.
 */
export async function findMenuImageViaSearch(
  apiKey: string,
  postTitle: string,
  placeId?: string | null
): Promise<string | null> {
  const query = `${cleanTitleForSearch(postTitle)} 메뉴판`
  return findCategoryImage(apiKey, query, placeId, MENU_CLASSIFY_PROMPT)
}
