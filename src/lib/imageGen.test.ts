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
    it("Gemini 응답이 성공하면 해당 data URI를 그대로 반환한다 (Pollinations 호출 안 함)", async () => {
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
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("Gemini 응답이 실패(예외)하면 Pollinations로 폴백한다", async () => {
      generateContentMock.mockRejectedValueOnce(new Error("quota exceeded"))
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
      })

      const result = await generateAiImage("test-key", "설명", "photo")

      expect(result).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("Gemini가 이미지 파트 없는 응답을 반환하면 Pollinations로 폴백한다", async () => {
      generateContentMock.mockResolvedValueOnce({
        candidates: [{ content: { parts: [] } }],
      })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
      })

      const result = await generateAiImage("test-key", "설명", "photo")

      expect(result).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//)
    })

    it("Gemini 호출 자체가 실패(네트워크 등)해도 Pollinations로 폴백한다", async () => {
      generateContentMock.mockRejectedValueOnce(new Error("network error"))
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
      })

      const result = await generateAiImage("test-key", "설명", "summary")

      expect(result).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//)
    })

    it("Gemini와 Pollinations 모두 실패하면 null을 반환한다", async () => {
      generateContentMock.mockRejectedValueOnce(new Error("quota exceeded"))
      fetchMock.mockResolvedValueOnce({ ok: false })

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
