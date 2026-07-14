// 사용자가 사진을 제공하지 않았을 때, 본문 분위기에 맞는 삽화를 자동 생성한다.
// 실사 사진이 아니라 일러스트용 이미지이므로, 특정 사실(메뉴명/가격 등)을 암시하지 않도록
// 호출하는 쪽(llm.ts)에서 일반적인 분위기 설명만 전달해야 한다.

import { GoogleGenAI } from "@google/genai"

const IMAGE_MODEL = "gemini-2.5-flash-image"

// Gemini 이미지 생성이 무료 티어 한도(quota)에 자주 걸려서, 키가 필요 없는 무료
// 서비스인 Pollinations.ai(flux 모델)를 1차로 시도하고, 실패할 때만 Gemini로 폴백한다.
const POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt"
const POLLINATIONS_MODEL = "flux"
const POLLINATIONS_TIMEOUT_MS = 20_000

export type IllustrativeImageStyle = "summary" | "photo"

function buildStyleInstruction(style: IllustrativeImageStyle): string {
  return style === "summary"
    ? "사진이 아니라, 핵심 정보를 한눈에 보기 좋게 정리한 카드뉴스/인포그래픽 스타일 이미지로 만들어주세요. 깔끔한 그래픽·아이콘·간단한 도식 위주로, 본문 텍스트를 그대로 옮기지 말고 최소한의 짧은 라벨만 사용하세요."
    : "실사 사진 느낌으로 만들어주세요."
}

// Pollinations는 요청 URL 자체가 곧 이미지 생성 명령이라, 같은 URL(같은 seed)을
// 다시 요청해도 같은 이미지가 나온다. 그래서 바이트를 내려받아 base64로 변환하지
// 않고 URL 문자열만 반환해 초안 텍스트 용량을 가볍게 유지한다.
async function generateImageWithPollinations(
  description: string,
  style: IllustrativeImageStyle
): Promise<string | null> {
  try {
    // 설명이 짧거나 장면 정보가 부족하면 flux가 본문과 무관한 인물 클로즈업 사진으로
    // 대체하는 경향이 실측으로 확인되어(예: 놀이공원 후기 글에 뜬금없는 인물 초상 사진),
    // 인물 클로즈업/초상 사진은 만들지 말라고 명시적으로 지시한다. safe=true로 선정성
    // 있는 결과도 함께 걸러낸다.
    const prompt = `${buildStyleInstruction(style)} ${description}. 인물 클로즈업이나 얼굴이 크게 나오는 초상 사진은 만들지 말고, 풍경·사물·분위기 위주로 표현해주세요. 텍스트나 워터마크, 로고 없이.`
    const seed = Math.floor(Math.random() * 1_000_000)
    const url = `${POLLINATIONS_BASE_URL}/${encodeURIComponent(prompt)}?model=${POLLINATIONS_MODEL}&width=1024&height=768&nologo=true&safe=true&seed=${seed}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), POLLINATIONS_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.startsWith("image/")) return null
      return url
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    console.warn("[imageGen] Pollinations 이미지 생성 실패", error)
    return null
  }
}

/**
 * 장면 설명을 받아 이미지를 생성한다. Pollinations(무료, 키 불필요)를 우선
 * 시도하고 실패하면 Gemini로 폴백한다. resolveShortfallImages()의 실질적인
 * 진입점.
 */
export async function generateAiImage(
  apiKey: string,
  description: string,
  style: IllustrativeImageStyle = "photo"
): Promise<string | null> {
  const pollinationsImage = await generateImageWithPollinations(description, style)
  if (pollinationsImage) return pollinationsImage
  return generateIllustrativeImage(apiKey, description, style)
}

/**
 * 장면 설명을 받아 이미지를 생성하고 data URI로 반환한다.
 * 생성 실패 시(할당량 소진 등) null을 반환한다 — 호출부에서 해당 자리를 조용히 제거한다.
 * style: "summary"는 정보/절차성 글(결혼·육아 등)용 인포그래픽 스타일, "photo"는 방문 후기성
 * 글(나들이·맛집 등)용 실사 사진 스타일.
 */
export async function generateIllustrativeImage(
  apiKey: string,
  description: string,
  style: IllustrativeImageStyle = "photo"
): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey })
    const prompt = `네이버 블로그 본문에 들어갈 삽화 이미지를 생성해주세요.
${buildStyleInstruction(style)}
텍스트·워터마크·로고는 최소화하고 절대 큰 글자로 넣지 마세요.
장면: ${description}
특정 실존 장소나 인물이 아니라, 글의 분위기를 보여주는 일반적인 이미지로 만들어주세요.
인물 클로즈업이나 얼굴이 크게 나오는 초상 사진은 만들지 말고, 풍경·사물·분위기 위주로 표현해주세요.`

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
    })

    const parts = response.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((part) => part.inlineData?.data)
    if (!imagePart?.inlineData?.data) return null

    const mimeType = imagePart.inlineData.mimeType || "image/png"
    return `data:${mimeType};base64,${imagePart.inlineData.data}`
  } catch (error) {
    console.warn("[imageGen] 이미지 생성 실패", error)
    return null
  }
}

// 검색으로 찾은 이미지가 실제로 특정 가게/장소의 사진이라는 보장이 없어서(유명하지 않은
// 곳일수록 무관한 사진이 섞여 나옴), 비전 모델로 본문 설명과 실제로 관련 있는지 검증한다.
const VERIFY_MODEL = "gemini-3-flash-preview"

// "irrelevant"는 모델이 실제로 "무관하다"고 답한 경우, "unknown"은 검증 자체(할당량
// 소진 등)가 실패해 답을 못 받은 경우다. 이 둘을 구분해야 Gemini 할당량이 소진됐다고
// 검색 후보를 전부 버리고 AI 생성으로만 몰리는 것을 막을 수 있다(실측 확인된 문제).
export type ImageRelevanceResult = "relevant" | "irrelevant" | "unknown"

export async function verifyImageRelevance(
  apiKey: string,
  imageUrl: string,
  description: string
): Promise<ImageRelevanceResult> {
  let mimeType: string
  let base64: string
  try {
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) return "irrelevant"
    mimeType = imageRes.headers.get("content-type") || "image/jpeg"
    base64 = Buffer.from(await imageRes.arrayBuffer()).toString("base64")
  } catch (error) {
    console.warn("[imageGen] 후보 이미지 다운로드 실패", error)
    return "irrelevant" // 후보 자체를 못 받았으니 안전하게 사용하지 않는다
  }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: VERIFY_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text: `이 사진이 아래 설명과 실제로 관련 있는 사진입니까?\n설명: "${description}"\n관련 있으면 정확히 "예"만, 관련 없으면 정확히 "아니오"만 답하세요.`,
            },
          ],
        },
      ],
    })

    return (response.text ?? "").trim().startsWith("예") ? "relevant" : "irrelevant"
  } catch (error) {
    console.warn("[imageGen] 이미지 관련성 검증(모델 호출) 실패 - 확인 불가로 처리", error)
    return "unknown"
  }
}
