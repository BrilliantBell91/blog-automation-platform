// 첨부 사진 중 외관 사진이 없을 때, 웹 검색으로 가게 외관 사진을 찾는다.
// 첨부 사진 자체의 외관 여부 판별은 imageMatching.ts의 analyzeImagesBatch가 캡션
// 생성과 함께 한 번의 배치 비전 호출로 처리하므로(사진 장수만큼 개별 호출하던 이전
// 구조는 무료 티어 일일 한도를 초안 하나로 소진시키는 사고가 실측으로 확인되어
// 폐기했다), 이 파일은 검색 폴백 전용으로 축소한다.

import { runVisionPrompt } from "./imageGen"
import { searchRealImages, searchGoogleImages } from "./imageSearch"

const EXTERIOR_CLASSIFY_PROMPT = `이 사진이 가게/매장/장소의 외관(건물 정면, 간판이 보이는 입구, 외부 전경) 사진인지 판단해주세요.
음식, 실내 인테리어, 메뉴판, 사람 얼굴 클로즈업 등은 외관 사진이 아닙니다.
외관 사진이면 정확히 "예"만, 아니면 정확히 "아니오"만 답하세요.`

// 검색 후보 검증은 슬롯 하나를 채우는 것과 같은 비중이므로, 다른 슬롯 채우기(최대 6회)와
// 비슷한 예산으로 제한한다 — 첨부 사진에 외관 사진이 없을 때만 도는 폴백 경로라 자주
// 호출되지는 않지만, 후보를 무제한 검증하면 비전 호출이 불필요하게 쌓일 수 있다.
const MAX_CANDIDATES_TO_VERIFY = 4

async function classifyExteriorPhoto(apiKey: string, imageUrl: string): Promise<boolean> {
  const text = await runVisionPrompt(apiKey, imageUrl, EXTERIOR_CLASSIFY_PROMPT)
  return (text ?? "").startsWith("예")
}

// Notion 제목에 흔히 붙는 "[테스트]", "[협찬]" 같은 대괄호 접두사는 검색 관련성을 떨어뜨린다.
function cleanTitleForSearch(title: string): string {
  return title.replace(/^\[[^\]]*\]\s*/, "").trim()
}

/**
 * 웹 검색으로 가게 외관 사진을 찾아 검증까지 통과한 URL을 반환한다. 찾지 못하면 null.
 */
export async function findExteriorImageViaSearch(
  apiKey: string,
  postTitle: string
): Promise<string | null> {
  if (!apiKey) return null

  const query = `${cleanTitleForSearch(postTitle)} 외관`
  const candidates = [
    ...(await searchRealImages(query, 5)),
    ...(await searchGoogleImages(query, 5)),
  ].slice(0, MAX_CANDIDATES_TO_VERIFY)

  for (const candidate of candidates) {
    if (await classifyExteriorPhoto(apiKey, candidate)) return candidate
  }

  return null
}
