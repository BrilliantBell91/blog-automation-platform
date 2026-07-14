import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateAiImage } from "./imageGen"

const generateContentMock = vi.fn()
const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}))

vi.stubGlobal("fetch", fetchMock)

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent: generateContentMock },
  })),
}))

describe("imageGen", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    generateContentMock.mockReset()
  })

  describe("generateAiImage", () => {
    it("Pollinations 응답이 성공(이미지 content-type)하면 해당 URL을 그대로 반환한다", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
      })

      const result = await generateAiImage("test-key", "설명", "photo")

      expect(result).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//)
      expect(generateContentMock).not.toHaveBeenCalled()
    })

    it("Pollinations 응답이 실패(ok: false)하면 Gemini로 폴백한다", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false })
      generateContentMock.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: "base64data", mimeType: "image/png" } }],
            },
          },
        ],
      })

      const result = await generateAiImage("test-key", "설명", "photo")

      expect(result).toBe("data:image/png;base64,base64data")
      expect(generateContentMock).toHaveBeenCalledTimes(1)
    })

    it("Pollinations가 이미지가 아닌 content-type을 반환하면 Gemini로 폴백한다", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "text/html" },
      })
      generateContentMock.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: "base64data", mimeType: "image/png" } }],
            },
          },
        ],
      })

      const result = await generateAiImage("test-key", "설명", "photo")

      expect(result).toBe("data:image/png;base64,base64data")
    })

    it("Pollinations가 네트워크 오류를 던져도 Gemini로 폴백한다", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network error"))
      generateContentMock.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: "base64data", mimeType: "image/png" } }],
            },
          },
        ],
      })

      const result = await generateAiImage("test-key", "설명", "summary")

      expect(result).toBe("data:image/png;base64,base64data")
    })

    it("Pollinations와 Gemini 모두 실패하면 null을 반환한다", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false })
      generateContentMock.mockRejectedValueOnce(new Error("quota exceeded"))

      const result = await generateAiImage("test-key", "설명", "photo")

      expect(result).toBeNull()
    })
  })
})
