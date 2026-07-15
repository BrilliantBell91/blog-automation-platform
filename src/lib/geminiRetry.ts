// Gemini API 호출 공통 재시도 유틸. llm.ts(텍스트 생성)와 imageGen.ts(이미지 생성/검증)
// 양쪽에서 동일한 429/503 재시도 정책을 쓰기 위해 분리했다.

import { ApiError } from "@google/genai"
import { GEMINI_RATE_LIMIT } from "@/constants"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 429(rate limit)와 503(일시 과부하 - 실측 확인됨)은 같은 모델로 잠시 후
// 재시도하면 회복될 수 있어 지수 백오프로 재시도한다.
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (error) {
      const isTransient = error instanceof ApiError && (error.status === 429 || error.status === 503)
      if (!isTransient || attempt >= GEMINI_RATE_LIMIT.MAX_RETRIES) throw error
      await sleep(GEMINI_RATE_LIMIT.RETRY_BACKOFF_MS * 2 ** attempt)
      attempt++
    }
  }
}

// 재시도로도 해소되지 않는 429(할당량 소진), 404(이 계정에서 모델 미지원),
// 503(모델 일시 과부하 - 실측 확인됨)이면 다음 모델로 넘어간다(모델 폴백 체인이 있는 경우).
// 그 외 에러(응답에 text 없음, 504 등)는 즉시 전파한다.
export function shouldTryNextModel(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 429 || error.status === 404 || error.status === 503)
  )
}
