// 사용자가 사진을 제공하지 않았을 때, 본문 분위기에 맞는 삽화를 자동 생성한다.
// 실사 사진이 아니라 일러스트용 이미지이므로, 특정 사실(메뉴명/가격 등)을 암시하지 않도록
// 호출하는 쪽(llm.ts)에서 일반적인 분위기 설명만 전달해야 한다.

import { GoogleGenAI } from "@google/genai"

const IMAGE_MODEL = "gemini-2.5-flash-image"

export type IllustrativeImageStyle = "summary" | "photo"

function buildStyleInstruction(style: IllustrativeImageStyle): string {
  return style === "summary"
    ? "사진이 아니라, 핵심 정보를 한눈에 보기 좋게 정리한 카드뉴스/인포그래픽 스타일 이미지로 만들어주세요. 깔끔한 그래픽·아이콘·간단한 도식 위주로, 본문 텍스트를 그대로 옮기지 말고 최소한의 짧은 라벨만 사용하세요."
    : "실사 사진 느낌으로 만들어주세요."
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
특정 실존 장소나 인물이 아니라, 글의 분위기를 보여주는 일반적인 이미지로 만들어주세요.`

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

export async function verifyImageRelevance(
  apiKey: string,
  imageUrl: string,
  description: string
): Promise<boolean> {
  try {
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) return false
    const mimeType = imageRes.headers.get("content-type") || "image/jpeg"
    const buffer = await imageRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")

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

    return (response.text ?? "").trim().startsWith("예")
  } catch (error) {
    console.warn("[imageGen] 이미지 관련성 검증 실패", error)
    return false // 검증 자체가 실패하면 안전하게 사용하지 않는다
  }
}
