import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateAiImage, verifyImageRelevance, runVisionPromptBatch } from "./imageGen"

const generateContentMock = vi.fn()
const { fetchMock, generateGroqVisionTextMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  // 기본값 null: Groq 키가 없는(기본) 상태를 흉내내, 명시적으로 mockResolvedValueOnce하지
  // 않는 한 항상 기존 Gemini 전용 동작(unknown/null)을 그대로 유지해야 한다.
  generateGroqVisionTextMock: vi.fn().mockResolvedValue(null),
}))

vi.stubGlobal("fetch", fetchMock)

vi.mock("./groqClient", () => ({
  generateGroqVisionText: generateGroqVisionTextMock,
}))

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
    generateGroqVisionTextMock.mockReset().mockResolvedValue(null)
  })

  // 이미지 생성은 Gemini를 우선 시도한다(429/503은 withRetry로 재시도). Gemini가
  // 결제 미연동 등으로 계속 실패하면(무료 티어에서 gemini-2.5-flash-image의 실제 한도가
  // 0임이 실측 확인됨) 키가 필요 없는 무료 서비스인 Pollinations로 폴백해 이미지가
  // 완전히 비는 것은 막는다. 둘 다 실패하면 null(호출부가 해당 자리를 비운다).
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
      expect(generateContentMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalled()
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

    it("Gemini가 재시도 후에도 계속 실패하면 Pollinations로 폴백한다", async () => {
      vi.useFakeTimers()
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(
        new ApiError({ message: "quota exceeded (limit: 0)", status: 429 })
      )
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
      })

      const promise = generateAiImage("test-key", "설명", "photo")
      await vi.runAllTimersAsync()
      const result = await promise

      // 최초 시도 + GEMINI_RATE_LIMIT.MAX_RETRIES(3) 재시도 = 4회, 그 다음 Pollinations
      expect(generateContentMock).toHaveBeenCalledTimes(4)
      expect(result).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//)
      vi.useRealTimers()
    })

    it("재시도 대상이 아닌 예외(일반 네트워크 에러 등)는 Gemini를 즉시 포기하고(재시도 없음) Pollinations로 폴백한다", async () => {
      generateContentMock.mockRejectedValueOnce(new Error("network error"))
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
      })

      const result = await generateAiImage("test-key", "설명", "summary")

      expect(generateContentMock).toHaveBeenCalledTimes(1)
      expect(result).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//)
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

    it("Gemini와 Pollinations 모두 실패하면 null을 반환한다", async () => {
      generateContentMock.mockRejectedValueOnce(new Error("network error"))
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

    it("검증 모델 호출이 재시도 대상이 아닌 예외로 실패하면 unknown을 반환한다(다른 모델로 넘어가지 않음)", async () => {
      mockImageDownloadOk()
      generateContentMock.mockRejectedValueOnce(new Error("quota exceeded"))

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("unknown")
      expect(generateContentMock).toHaveBeenCalledTimes(1)
    })

    it("첫 번째 검증 모델이 실패하면 대기 없이 즉시 다음 모델로 전환한다", async () => {
      mockImageDownloadOk()
      const { ApiError } = await import("@google/genai")
      // 폴백 체인 자체가 회복 수단이라 모델당 재시도는 하지 않는다(withRetry 미사용) —
      // 1회 실패하면 바로 다음 모델로 넘어가 검증 지연이 쌓이지 않는다.
      generateContentMock
        .mockRejectedValueOnce(new ApiError({ message: "Too Many Requests", status: 429 }))
        .mockResolvedValueOnce({ text: "예" })

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("relevant")
      expect(generateContentMock).toHaveBeenCalledTimes(2)
    })

    it("모든 검증 모델이 할당량 소진이고 Groq도 null이면 unknown을 반환한다", async () => {
      mockImageDownloadOk()
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(
        new ApiError({ message: "Too Many Requests", status: 429 })
      )

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("unknown")
      // VERIFY_MODEL_FALLBACK_CHAIN 3개 모델(gemini-2.0-flash는 limit:0 확인되어 제외됨),
      // 모델당 1회씩만 시도(재시도 없음) = 3회
      expect(generateContentMock).toHaveBeenCalledTimes(3)
      expect(generateGroqVisionTextMock).toHaveBeenCalledTimes(1)
    })

    it("모든 검증 모델이 할당량 소진이어도 Groq가 '예'를 반환하면 relevant로 매핑한다", async () => {
      mockImageDownloadOk()
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(
        new ApiError({ message: "Too Many Requests", status: 429 })
      )
      generateGroqVisionTextMock.mockResolvedValueOnce("예")

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("relevant")
      expect(generateGroqVisionTextMock).toHaveBeenCalledTimes(1)
    })

    it("모든 검증 모델이 할당량 소진이어도 Groq가 '아니오'를 반환하면 irrelevant로 매핑한다", async () => {
      mockImageDownloadOk()
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(
        new ApiError({ message: "Too Many Requests", status: 429 })
      )
      generateGroqVisionTextMock.mockResolvedValueOnce("아니오")

      const result = await verifyImageRelevance("test-key", "https://example.com/a.jpg", "설명")

      expect(result).toBe("irrelevant")
    })
  })

  describe("runVisionPromptBatch", () => {
    function mockImageDownloadOk() {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => new ArrayBuffer(4),
      })
    }

    it("여러 이미지를 한 번의 모델 호출로 묶어 보낸다", async () => {
      mockImageDownloadOk()
      mockImageDownloadOk()
      generateContentMock.mockResolvedValueOnce({ text: "1) a | 예\n2) b | 아니오" })

      const { successIndexes, text } = await runVisionPromptBatch(
        "test-key",
        ["https://example.com/1.jpg", "https://example.com/2.jpg"],
        "분석해줘"
      )

      expect(successIndexes).toEqual([0, 1])
      expect(text).toBe("1) a | 예\n2) b | 아니오")
      expect(generateContentMock).toHaveBeenCalledTimes(1) // 이미지 2장이어도 호출은 1회
      const parts = generateContentMock.mock.calls[0][0].contents[0].parts
      expect(parts).toHaveLength(3) // 이미지 2장 + 안내 텍스트 1개
    })

    it("일부 이미지 다운로드가 실패하면 성공한 이미지만 순서를 유지해 보낸다", async () => {
      mockImageDownloadOk() // 1번째 성공
      fetchMock.mockResolvedValueOnce({ ok: false }) // 2번째 실패
      mockImageDownloadOk() // 3번째 성공
      generateContentMock.mockResolvedValueOnce({ text: "1) a | 아니오\n2) c | 아니오" })

      const { successIndexes } = await runVisionPromptBatch(
        "test-key",
        ["https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg"],
        "분석해줘"
      )

      expect(successIndexes).toEqual([0, 2]) // 원래 인덱스 기준(1번째, 3번째만 성공)
    })

    it("모든 이미지 다운로드가 실패하면 모델을 호출하지 않고 null을 반환한다", async () => {
      fetchMock.mockResolvedValue({ ok: false })

      const { successIndexes, text } = await runVisionPromptBatch(
        "test-key",
        ["https://example.com/1.jpg"],
        "분석해줘"
      )

      expect(text).toBeNull()
      expect(successIndexes).toEqual([])
      expect(generateContentMock).not.toHaveBeenCalled()
    })

    it("Gemini 비전 모델이 전부 할당량 소진이면 Groq 비전 응답으로 대체한다", async () => {
      mockImageDownloadOk()
      mockImageDownloadOk()
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(
        new ApiError({ message: "Too Many Requests", status: 429 })
      )
      generateGroqVisionTextMock.mockResolvedValueOnce("1) a | 예\n2) b | 아니오")

      const { successIndexes, text } = await runVisionPromptBatch(
        "test-key",
        ["https://example.com/1.jpg", "https://example.com/2.jpg"],
        "분석해줘"
      )

      expect(text).toBe("1) a | 예\n2) b | 아니오")
      expect(successIndexes).toEqual([0, 1])
      // VERIFY_MODEL_FALLBACK_CHAIN 3개 모델 전부 시도 후 Groq로 폴백
      expect(generateContentMock).toHaveBeenCalledTimes(3)
      expect(generateGroqVisionTextMock).toHaveBeenCalledTimes(1)
      const [images, promptText] = generateGroqVisionTextMock.mock.calls[0]
      expect(images).toHaveLength(2)
      expect(promptText).toBe("분석해줘")
    })

    it("Gemini와 Groq 비전 모두 실패하면 null을 반환한다", async () => {
      mockImageDownloadOk()
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(
        new ApiError({ message: "Too Many Requests", status: 429 })
      )

      const { text } = await runVisionPromptBatch(
        "test-key",
        ["https://example.com/1.jpg"],
        "분석해줘"
      )

      expect(text).toBeNull()
      expect(generateGroqVisionTextMock).toHaveBeenCalledTimes(1)
    })
  })
})
