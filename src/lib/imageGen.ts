// 사용자가 사진을 제공하지 않았을 때, 본문 분위기에 맞는 삽화를 자동 생성한다.
// 실사 사진이 아니라 일러스트용 이미지이므로, 특정 사실(메뉴명/가격 등)을 암시하지 않도록
// 호출하는 쪽(llm.ts)에서 일반적인 분위기 설명만 전달해야 한다.

import { GoogleGenAI } from "@google/genai"
import { withRetry, shouldTryNextModel } from "./geminiRetry"

const IMAGE_MODEL = "gemini-2.5-flash-image"

export type IllustrativeImageStyle = "summary" | "photo"

function buildStyleInstruction(style: IllustrativeImageStyle): string {
  return style === "summary"
    ? "사진이 아니라, 핵심 정보를 한눈에 보기 좋게 정리한 카드뉴스/인포그래픽 스타일 이미지로 만들어주세요. 깔끔한 그래픽·아이콘·간단한 도식 위주로, 본문 텍스트를 그대로 옮기지 말고 최소한의 짧은 라벨만 사용하세요."
    : "실사 사진 느낌으로 만들어주세요."
}

// Gemini 이미지 생성 모델(gemini-2.5-flash-image)은 무료 티어에서 완전히 막혀있음이
// 실측으로 확인됐다(Google API 응답: "limit: 0, model: gemini-2.5-flash-preview-image" —
// 할당량 소진이 아니라 결제 미연동 시 애초에 호출 자체가 불가능). 결제 연동 전까지는
// 키가 필요 없는 무료 서비스인 Pollinations.ai(flux 모델)로 폴백해 최소한 이미지가
// 비는 것은 막는다. Gemini 결제가 연동되면 자동으로 다시 Gemini 결과를 우선 사용한다.
const POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt"
const POLLINATIONS_MODEL = "flux"
const POLLINATIONS_TIMEOUT_MS = 20_000

async function generateImageWithPollinations(
  description: string,
  style: IllustrativeImageStyle
): Promise<string | null> {
  try {
    // 설명이 짧거나 장면 정보가 부족하면 flux가 본문과 무관한 인물 클로즈업 사진으로
    // 대체하는 경향이 실측으로 확인되어(예: 놀이공원 후기 글에 뜬금없는 인물 초상 사진),
    // 인물 클로즈업/초상 사진은 만들지 말라고 명시적으로 지시한다. safe=true로 선정성
    // 있는 결과도 함께 걸러낸다. (이후 verifyImageRelevance()로 한 번 더 검증된다.)
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
 * 장면 설명을 받아 이미지를 생성하고 data URI로 반환한다. 429(할당량)/503(과부하)은
 * withRetry로 재시도해 일시적 실패를 흡수한다. 재시도 후에도 실패하면(할당량 완전
 * 소진, 결제 미연동으로 인한 접근 불가 등) null을 반환한다 — 호출부(generateAiImage)가
 * Pollinations로 폴백하거나, 그마저 실패하면 해당 자리를 조용히 제거한다.
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

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: prompt,
      })
    )

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

/**
 * 이미지 생성 진입점. Gemini를 우선 시도하고(결제 연동 시 더 좋은 품질), Gemini가
 * 실패하면(현재는 무료 티어 미지원으로 항상 실패) Pollinations로 폴백한다.
 */
export async function generateAiImage(
  apiKey: string,
  description: string,
  style: IllustrativeImageStyle = "photo"
): Promise<string | null> {
  const geminiImage = await generateIllustrativeImage(apiKey, description, style)
  if (geminiImage) return geminiImage
  return generateImageWithPollinations(description, style)
}

// 검색으로 찾은 이미지가 실제로 특정 가게/장소의 사진이라는 보장이 없어서(유명하지 않은
// 곳일수록 무관한 사진이 섞여 나옴), 비전 모델로 본문 설명과 실제로 관련 있는지 검증한다.
// 슬롯당 최대 6회까지 호출될 수 있어 텍스트 생성(llm.ts의 MODEL_FALLBACK_CHAIN, 1순위
// gemini-3-flash-preview)과 같은 모델을 쓰면 무료 티어 일일 한도(실측 확인: 20회/일,
// gemini-3-flash-preview와 gemini-3-flash가 같은 할당량 풀 공유)를 검증 호출만으로
// 순식간에 소진시켜 텍스트 생성까지 막히고, 결국 검증을 통과하는 후보가 하나도 없어
// 검색/AI 이미지가 전부 빠지는 사고가 실측으로 확인됐다. 텍스트 생성과 겹치지 않는
// 모델을 우선순위로 두고, 전부 실패하면 마지막으로 gemini-3-flash-preview도 시도한다.
const VERIFY_MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
] as const

// "irrelevant"는 모델이 실제로 "무관하다/부적절하다"고 답한 경우, "unknown"은 검증
// 자체(할당량 소진 등)가 실패해 답을 못 받은 경우다. 검증을 못 한 "unknown"도
// 호출부에서 "irrelevant"와 동일하게 건너뛴다. 로그에서만 원인을 구분한다.
export type ImageRelevanceResult = "relevant" | "irrelevant" | "unknown"

// 검증 기준을 이미지 출처별로 분리한다.
// - "downloaded"(검색/장소사진 등 외부에서 가져온 실사): 인물 주체·워터마크/광고문구·무관성을
//   모두 엄격히 검증한다. 타인의 저작물·개인 사진이 그대로 쓰이는 사고를 막기 위함.
// - "generated"(AI가 생성한 이미지, 특히 "summary" 스타일): 의도적으로 카드뉴스/인포그래픽
//   라벨 텍스트를 포함하도록 생성하므로, "글자가 있으면 무조건 거부"를 적용하면 정상적으로
//   생성된 이미지까지 항상 검증에 실패하는 자기모순이 생긴다(실측 확인됨 - 정보성 글에 AI
//   이미지가 전혀 안 만들어지던 회귀의 원인). 인물 주체·무관성만 검증하고 라벨 텍스트는 허용한다.
export type ImageSource = "downloaded" | "generated"

function buildVerifyPrompt(description: string, source: ImageSource): string {
  if (source === "generated") {
    return `이 AI 생성 이미지를 블로그 본문에 그대로 사용해도 되는지 판단해주세요.
설명: "${description}"
이 이미지는 카드뉴스/인포그래픽 스타일로 의도적으로 짧은 라벨 텍스트를 포함할 수 있습니다 — 텍스트나 그래픽 라벨이 있다는 이유만으로는 거부하지 마세요.
다음 중 하나라도 해당하면 반드시 "아니오"라고만 답하세요:
(1) 특정 인물(얼굴이나 전신)이 이미지의 주요 피사체로 나옴
(2) 설명과 실제로 무관함
위 두 가지에 모두 해당하지 않고 설명과 실제로 관련 있으면 정확히 "예"만 답하세요.`
  }
  return `이 사진을 블로그 본문에 그대로 사용해도 되는지 판단해주세요.
설명: "${description}"
다음 중 하나라도 해당하면 반드시 "아니오"라고만 답하세요:
(1) 특정 인물(얼굴이나 전신)이 사진의 주요 피사체로 나옴
(2) 사진 안에 상호명·광고 문구·워터마크 등 글자가 삽입되어 있음
(3) 설명과 실제로 무관함
위 세 가지에 모두 해당하지 않고 설명과 실제로 관련 있으면 정확히 "예"만 답하세요.`
}

export async function verifyImageRelevance(
  apiKey: string,
  imageUrl: string,
  description: string,
  source: ImageSource = "downloaded"
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

  const ai = new GoogleGenAI({ apiKey })
  let lastError: unknown
  for (const model of VERIFY_MODEL_FALLBACK_CHAIN) {
    try {
      // 폴백 체인 자체가 "이 모델이 안 되면 다음 모델"이라는 회복 수단이라 withRetry(지수
      // 백오프)로 감쌀 필요가 없다 — 오히려 모델당 최대 14초씩 대기가 쌓여 검증 1회가
      // 최악의 경우 4개 모델 × 14초 = 56초까지 걸리고, 슬롯당 최대 6회 검증이 겹치면
      // 함수 타임아웃(300초)을 넘기는 사고가 실측으로 확인됐다. 각 모델은 1회만 시도하고
      // 실패하면 대기 없이 바로 다음 모델로 넘어간다.
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: buildVerifyPrompt(description, source) },
            ],
          },
        ],
      })

      return (response.text ?? "").trim().startsWith("예") ? "relevant" : "irrelevant"
    } catch (error) {
      if (!shouldTryNextModel(error)) {
        console.warn("[imageGen] 이미지 관련성 검증(모델 호출) 실패 - 확인 불가로 처리", error)
        return "unknown"
      }
      console.warn(`[imageGen] ${model} 사용 불가(할당량 소진/미지원) — 다음 모델로 전환`, error)
      lastError = error
    }
  }

  console.warn("[imageGen] 이미지 관련성 검증 - 모든 모델 할당량 소진, 확인 불가로 처리", lastError)
  return "unknown"
}
