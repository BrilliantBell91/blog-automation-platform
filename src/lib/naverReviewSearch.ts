// 네이버 지도 상세 페이지에 없는 편의시설 정보(예: 화장실 유무)를 블로그 리뷰 검색으로
// 보수적으로 보완한다. 공식 매장 정보가 아니라 방문자 후기 기반 추정이므로, 호출부는
// 반드시 "리뷰 기준" 같은 출처 표시를 붙여 프롬프트에 전달해야 한다(llm.ts 참고).

import { GoogleGenAI } from "@google/genai"
import { shouldTryNextModel } from "./geminiRetry"

const NAVER_BLOG_SEARCH_URL = "https://openapi.naver.com/v1/search/blog.json"

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, "")
}

async function searchBlogSnippets(query: string, count: number): Promise<string[]> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET
  if (!clientId || !clientSecret || !query.trim()) return []

  try {
    const url = `${NAVER_BLOG_SEARCH_URL}?query=${encodeURIComponent(query)}&display=${count}&sort=sim`
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    })
    if (!res.ok) {
      console.warn("[naverReviewSearch] 블로그 검색 응답 오류", res.status)
      return []
    }

    const data = (await res.json()) as { items?: { title?: string; description?: string }[] }
    return (data.items ?? [])
      .map((item) => stripHtmlTags(`${item.title ?? ""} ${item.description ?? ""}`).trim())
      .filter(Boolean)
  } catch (error) {
    console.warn("[naverReviewSearch] 블로그 검색 실패", error)
    return []
  }
}

// verifyImageRelevance/insertImages와 같은 이유로 텍스트 생성(gemini-3-flash-preview
// 우선순위) 모델과 겹치지 않는 모델을 먼저 시도해 무료 티어 할당량 경합을 피한다.
const INFER_MODEL_FALLBACK_CHAIN = [
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
] as const

/**
 * 블로그 리뷰 스니펫에서 특정 편의시설(예: "화장실")에 대한 실제 언급을 찾아 아주 짧게
 * 요약한다. 언급이 없거나 애매하면 반드시 null을 반환한다 — 지어내는 것보다 생략이 안전하다.
 */
export async function inferFacilityFromReviews(
  apiKey: string,
  placeName: string,
  facility: string
): Promise<string | null> {
  const snippets = await searchBlogSnippets(`${placeName} ${facility}`, 5)
  if (snippets.length === 0) return null

  const prompt = `다음은 "${placeName}"에 대한 블로그 리뷰 발췌 목록입니다. 이 중 "${facility}"에 관한 실제 언급이 있는지 확인해주세요.

${snippets.map((s, i) => `${i + 1}. ${s.slice(0, 200)}`).join("\n")}

규칙:
- 여러 발췌 중 "${facility}"에 대해 실제로 언급한 내용이 있으면, 그 내용을 사실 그대로 15자 내외로 아주 짧게 요약해서 답하세요(예: "있음, 내부 위치", "외부에 있음", "공용 화장실").
- 언급이 전혀 없거나 애매하면 정확히 "정보없음"이라고만 답하세요.
- 절대 추측하거나 지어내지 마세요.`

  const ai = new GoogleGenAI({ apiKey })
  for (const model of INFER_MODEL_FALLBACK_CHAIN) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt })
      const text = (response.text ?? "").trim()
      if (!text || text.includes("정보없음")) return null
      return text
    } catch (error) {
      if (!shouldTryNextModel(error)) {
        console.warn("[naverReviewSearch] 편의시설 추론 실패 - 확인 불가로 처리", error)
        return null
      }
      console.warn(`[naverReviewSearch] ${model} 사용 불가(할당량 소진/미지원) — 다음 모델로 전환`, error)
    }
  }
  return null
}
