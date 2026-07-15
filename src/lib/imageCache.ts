// 이미지 URL 재조회 결과 캐싱 (동일 이미지 중복 Notion 호출 방지)

import { getCached, setCached } from "./cache"
import { refreshImageUrl, refreshCoverImageUrl, refreshImagePropertyUrl } from "./notion"

const TTL_MS = 55 * 60 * 1000 // Notion 서명 URL 수명(약 1시간)보다 살짝 짧게

/**
 * 만료된 이미지 URL을 재조회하고 캐싱 (블록/커버/속성 이미지 모두 지원)
 * @param kind "block"(본문 이미지 블록) / "cover"(페이지 커버) / "property"(Notion "Image" 속성 첨부 - 본문에 이미지가 없어 폴백된 썸네일)
 * @param id blockId 또는 pageId
 */
export async function getCachedRefreshedImageUrl(
  kind: "block" | "cover" | "property",
  id: string
): Promise<string | undefined> {
  const key = `image-refresh:${kind}:${id}`
  const cached = getCached<string>(key)
  if (cached) return cached

  const url =
    kind === "block"
      ? await refreshImageUrl(id)
      : kind === "cover"
        ? await refreshCoverImageUrl(id)
        : await refreshImagePropertyUrl(id)
  if (url) setCached(key, url, TTL_MS)
  return url
}
