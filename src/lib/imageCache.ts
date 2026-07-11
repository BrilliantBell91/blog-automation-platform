// 이미지 URL 재조회 결과 캐싱 (동일 이미지 중복 Notion 호출 방지)

import { getCached, setCached } from "./cache"
import { refreshImageUrl, refreshCoverImageUrl } from "./notion"

const TTL_MS = 55 * 60 * 1000 // Notion 서명 URL 수명(약 1시간)보다 살짝 짧게

/**
 * 만료된 이미지 URL을 재조회하고 캐싱 (블록/커버 이미지 둘 다 지원)
 * @param kind "block" (본문 이미지 블록) 또는 "cover" (페이지 커버)
 * @param id blockId 또는 pageId
 */
export async function getCachedRefreshedImageUrl(
  kind: "block" | "cover",
  id: string
): Promise<string | undefined> {
  const key = `image-refresh:${kind}:${id}`
  const cached = getCached<string>(key)
  if (cached) return cached

  const url = kind === "block" ? await refreshImageUrl(id) : await refreshCoverImageUrl(id)
  if (url) setCached(key, url, TTL_MS)
  return url
}
