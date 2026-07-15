// 사용자가 사진을 제공하지 않았을 때, 본문 분위기에 맞는 삽화를 자동 생성한다.
// 실사 사진이 아니라 일러스트용 이미지이므로, 특정 사실(메뉴명/가격 등)을 암시하지 않도록
// 호출하는 쪽(llm.ts)에서 일반적인 분위기 설명만 전달해야 한다.

import { GoogleGenAI } from "@google/genai"
import { withRetry } from "./geminiRetry"

const IMAGE_MODEL = "gemini-2.5-flash-image"

export type IllustrativeImageStyle = "summary" | "photo"

function buildStyleInstruction(style: IllustrativeImageStyle): string {
  return style === "summary"
    ? "사진이 아니라, 핵심 정보를 한눈에 보기 좋게 정리한 카드뉴스/인포그래픽 스타일 이미지로 만들어주세요. 깔끔한 그래픽·아이콘·간단한 도식 위주로, 본문 텍스트를 그대로 옮기지 말고 최소한의 짧은 라벨만 사용하세요."
    : "실사 사진 느낌으로 만들어주세요."
}

/**
 * 장면 설명을 받아 이미지를 생성하고 data URI로 반환한다. 품질 문제로 무료
 * 대체 서비스(Pollinations 등)는 쓰지 않고 전적으로 Gemini에만 맡긴다 —
 * 대신 429(할당량)/503(과부하)은 withRetry로 재시도해 일시적 실패를 흡수한다.
 * 재시도 후에도 실패하면(할당량 완전 소진 등) null을 반환한다 — 호출부에서 해당
 * 자리를 조용히 제거한다.
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

// resolveShortfallImages()의 실질적인 진입점. 과거에는 Gemini 실패 시 Pollinations로
// 폴백했으나 결과물 품질이 낮아 제거했다 — 전적으로 Gemini만 사용한다.
export async function generateAiImage(
  apiKey: string,
  description: string,
  style: IllustrativeImageStyle = "photo"
): Promise<string | null> {
  return generateIllustrativeImage(apiKey, description, style)
}

// 검색으로 찾은 이미지가 실제로 특정 가게/장소의 사진이라는 보장이 없어서(유명하지 않은
// 곳일수록 무관한 사진이 섞여 나옴), 비전 모델로 본문 설명과 실제로 관련 있는지 검증한다.
const VERIFY_MODEL = "gemini-3-flash-preview"

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

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: VERIFY_MODEL,
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
    )

    return (response.text ?? "").trim().startsWith("예") ? "relevant" : "irrelevant"
  } catch (error) {
    console.warn("[imageGen] 이미지 관련성 검증(모델 호출) 실패 - 확인 불가로 처리", error)
    return "unknown"
  }
}
