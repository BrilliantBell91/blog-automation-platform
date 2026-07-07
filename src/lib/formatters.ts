/**
 * 날짜를 한국 형식 문자열로 포맷
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d)
}

/**
 * 태그 배열을 문자열로 변환 (DB 저장용)
 */
export function arrayToTags(tags: string[]): string {
  return tags.join(",")
}

/**
 * 태그 문자열을 배열로 변환 (DB 조회용)
 */
export function tagsToArray(tags: string): string[] {
  return tags ? tags.split(",").filter(Boolean) : []
}

/**
 * 긴 텍스트를 지정된 길이로 자르고 ...추가
 */
export function truncateExcerpt(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}...`
}

/**
 * URL 인코딩 (한글 카테고리명 등 경로 세그먼트용)
 */
export function encodeUrl(value: string): string {
  return encodeURIComponent(value)
}
