import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateAiImage, verifyImageRelevance } from "./imageGen"

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

  describe("verifyImageRelevance", () => {
    function mockImageDownloadOk() {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => new ArrayBuffer(4),
      })
    }

    it("모델이 '예'라고 답하면 relevant를 반환한다", async () => {
      mockImageDownloadOk()
      generateContentMock.mockResolvedValueOnce({ text: "예" })

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("relevant")
    })

    it("모델이 '아니오'라고 답하면 irrelevant를 반환한다", async () => {
      mockImageDownloadOk()
      generateContentMock.mockResolvedValueOnce({ text: "아니오" })

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("irrelevant")
    })

    it("후보 이미지 다운로드 자체가 실패하면 irrelevant를 반환한다(모델 호출 안 함)", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false })

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("irrelevant")
      expect(generateContentMock).not.toHaveBeenCalled()
    })

    it("검증 모델 호출이 실패(할당량 소진 등)하면 unknown을 반환한다", async () => {
      mockImageDownloadOk()
      generateContentMock.mockRejectedValueOnce(new Error("quota exceeded"))

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("unknown")
    })
  })
})
