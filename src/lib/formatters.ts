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
 * API 에러 응답 본문에서 메시지를 안전하게 추출한다. 서버 라우트는 보통
 * `{ error: string }` JSON을 반환하지만, Vercel 플랫폼 레벨 타임아웃/장애 시에는
 * "An error occurred..." 같은 순수 텍스트(비 JSON) 응답이 내려와 res.json()이
 * SyntaxError로 죽는 사고가 실측으로 확인됐다(사용자에게 "Unexpected token..."
 * 같은 알아볼 수 없는 오류가 그대로 노출됨). res.json() 실패 시 res.text()로
 * 폴백해 최소한 사람이 읽을 수 있는 메시지를 보여준다.
 */
export async function extractApiErrorMessage(res: Response, fallback: string): Promise<string> {
  // res.json()이 파싱 실패로 던지면 body 스트림이 이미 소비되어 그 다음 res.text()를
  // 호출할 수 없으므로(body stream already read), 항상 text로 먼저 읽고 직접 파싱한다.
  let text: string
  try {
    text = await res.text()
  } catch {
    return fallback
  }

  try {
    const data = JSON.parse(text)
    return data?.error || fallback
  } catch {
    if (res.status === 504) return "요청 처리 시간이 너무 오래 걸려 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
    return text.trim() || fallback
  }
}

/**
 * URL 인코딩 (한글 카테고리명 등 경로 세그먼트용)
 */
export function encodeUrl(value: string): string {
  return encodeURIComponent(value)
}
