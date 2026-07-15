import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateAiImage, verifyImageRelevance } from "./imageGen"

const generateContentMock = vi.fn()
const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}))

vi.stubGlobal("fetch", fetchMock)

vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number
    constructor(options: { message: string; status: number }) {
      super(options.message)
      this.name = "ApiError"
      this.status = options.status
    }
  }
  return {
    GoogleGenAI: vi.fn(() => ({
      models: { generateContent: generateContentMock },
    })),
    ApiError,
  }
})

describe("imageGen", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    generateContentMock.mockReset()
  })

  // 이미지 생성은 품질 문제로 무료 대체 서비스(Pollinations 등)를 쓰지 않고 전적으로
  // Gemini에만 맡긴다. 429/503(일시적 오류)은 withRetry로 재시도하고, 그래도 실패하면
  // 조용히 null을 반환한다(호출부가 해당 자리를 비운다).
  describe("generateAiImage", () => {
    it("Gemini 응답이 성공하면 해당 data URI를 그대로 반환한다", async () => {
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

    it("429(할당량) 에러가 재시도 중 정상 응답으로 회복되면 결과를 반환한다", async () => {
      vi.useFakeTimers()
      const { ApiError } = await import("@google/genai")
      generateContentMock
        .mockRejectedValueOnce(new ApiError({ message: "Too Many Requests", status: 429 }))
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "retried", mimeType: "image/png" } }] } },
          ],
        })

      const promise = generateAiImage("test-key", "설명", "photo")
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe("data:image/png;base64,retried")
      expect(generateContentMock).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
    })

    it("429 에러가 재시도 후에도 계속되면 null을 반환한다", async () => {
      vi.useFakeTimers()
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(new ApiError({ message: "Too Many Requests", status: 429 }))

      const promise = generateAiImage("test-key", "설명", "photo")
      await vi.runAllTimersAsync()
      const result = await promise

      // 최초 시도 + GEMINI_RATE_LIMIT.MAX_RETRIES(3) 재시도 = 4회
      expect(generateContentMock).toHaveBeenCalledTimes(4)
      expect(result).toBeNull()
      vi.useRealTimers()
    })

    it("재시도 대상이 아닌 예외(일반 네트워크 에러 등)는 즉시 null을 반환한다(재시도 없음)", async () => {
      generateContentMock.mockRejectedValueOnce(new Error("network error"))

      const result = await generateAiImage("test-key", "설명", "summary")

      expect(result).toBeNull()
      expect(generateContentMock).toHaveBeenCalledTimes(1)
    })

    it("Gemini가 이미지 파트 없는 응답을 반환하면 null을 반환한다", async () => {
      generateContentMock.mockResolvedValueOnce({
        candidates: [{ content: { parts: [] } }],
      })

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
