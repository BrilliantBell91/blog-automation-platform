import Groq from "groq-sdk"
import type { ChatCompletionContentPart } from "groq-sdk/resources/chat/completions"

export async function generateGroqText(
  systemInstruction: string,
  userContent: string
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  try {
    const client = new Groq({ apiKey })
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
    })

    return response.choices[0]?.message?.content ?? null
  } catch (error) {
    console.warn("[groqClient] generateGroqText 실패:", error)
    return null
  }
}

export async function generateGroqVisionText(
  images: { mimeType: string; data: string }[],
  promptText: string
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  try {
    const client = new Groq({ apiKey })

    const content: ChatCompletionContentPart[] = [
      ...images.map(
        (img): ChatCompletionContentPart => ({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })
      ),
      { type: "text", text: promptText },
    ]

    const response = await client.chat.completions.create({
      model: "llama-4-scout",
      messages: [{ role: "user", content }],
      temperature: 0.7,
    })

    return response.choices[0]?.message?.content ?? null
  } catch (error) {
    console.warn("[groqClient] generateGroqVisionText 실패:", error)
    return null
  }
}
