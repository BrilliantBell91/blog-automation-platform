import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateNaverDraft, MODEL_FALLBACK_CHAIN } from "./llm"
import type { Post } from "@/types"

const generateContentMock = vi.fn()

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
    UrlRetrievalStatus: {
      URL_RETRIEVAL_STATUS_UNSPECIFIED: "URL_RETRIEVAL_STATUS_UNSPECIFIED",
      URL_RETRIEVAL_STATUS_SUCCESS: "URL_RETRIEVAL_STATUS_SUCCESS",
      URL_RETRIEVAL_STATUS_ERROR: "URL_RETRIEVAL_STATUS_ERROR",
      URL_RETRIEVAL_STATUS_PAYWALL: "URL_RETRIEVAL_STATUS_PAYWALL",
      URL_RETRIEVAL_STATUS_UNSAFE: "URL_RETRIEVAL_STATUS_UNSAFE",
    },
  }
})

describe("llm", () => {
  const mockPost: Post = {
    id: "test-id",
    notionId: "notion-id",
    title: "테스트 포스트",
    content: "테스트 본문",
    excerpt: "테스트 요약",
    category: "맛집",
    tags: ["서울", "카페"],
    imageUrl: "https://example.com/image.jpg",
    status: "발행됨",
    publishedAt: new Date("2026-07-11"),
    naverDraftStatus: "미생성",
    naverPostUrl: undefined,
    blocks: [],
    thumbnailBlockId: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.LLM_API_KEY
  })

  describe("generateNaverDraft", () => {
    it("LLM_API_KEY가 없으면 에러를 던진다", async () => {
      await expect(generateNaverDraft(mockPost)).rejects.toThrow(
        "LLM_API_KEY가 설정되지 않았습니다."
      )
      expect(generateContentMock).not.toHaveBeenCalled()
    })

    it("정상 응답 시 생성된 텍스트를 반환한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      const result = await generateNaverDraft(mockPost)

      expect(result).toBe("생성된 초안 내용")
      expect(generateContentMock).toHaveBeenCalledTimes(1)
    })

    it("tags가 있으면 필수 포함 해시태그로 사용자 메시지에 들어간다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft(mockPost)

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain("필수 포함 해시태그: 서울, 카페")
    })

    it("tags가 없으면 스타일에 맞게 직접 구성하라는 안내가 들어간다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({ ...mockPost, tags: [] })

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain("필수 포함 해시태그: (입력 없음")
    })

    it("keywords가 있으면 필수 포함 문구가 사용자 메시지에 들어간다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({ ...mockPost, keywords: ["숙성회", "오션뷰"] })

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain("필수 포함 키워드")
      expect(callArgs.contents).toContain("숙성회, 오션뷰")
    })

    it("contentAttachments가 있으면 사진/링크 마커가 사용자 메시지에 들어간다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/photo.jpg" },
          { kind: "link", url: "https://map.naver.com/p/place/123" },
        ],
      })

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://s3.example.com/photo.jpg]"
      )
      expect(callArgs.contents).toContain(
        "[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/place/123]"
      )
    })

    it("url_context 툴이 항상 활성화된 상태로 호출된다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft(mockPost)

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.config.tools).toEqual([{ urlContext: {} }])
    })

    it("링크 조회 실패가 있으면 결과 끝에 경고 문구를 덧붙인다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "생성된 초안 내용",
        candidates: [
          {
            urlContextMetadata: {
              urlMetadata: [
                { retrievedUrl: "https://place.map.naver.com/12345", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_ERROR" },
                { retrievedUrl: "https://example.com/ok", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" },
              ],
            },
          },
        ],
      })

      const result = await generateNaverDraft(mockPost)

      expect(result).toContain("생성된 초안 내용")
      expect(result).toContain("자동으로 내용을 확인하지 못했습니다")
      expect(result).toContain("https://place.map.naver.com/12345")
      expect(result).not.toContain("https://example.com/ok")
    })

    it("urlContextMetadata가 없거나 전부 성공이면 경고 문구를 붙이지 않는다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "생성된 초안 내용",
        candidates: [
          {
            urlContextMetadata: {
              urlMetadata: [
                { retrievedUrl: "https://example.com/ok", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" },
              ],
            },
          },
        ],
      })

      const result = await generateNaverDraft(mockPost)

      expect(result).toBe("생성된 초안 내용")
    })

    it("스타일 가이드가 있으면 systemInstruction에 포함된다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft(mockPost, "커스텀 스타일 가이드입니다")

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.config.systemInstruction).toContain("커스텀 스타일 가이드입니다")
    })

    it("카테고리에 맞는 실제 블로그 스타일 참고가 systemInstruction에 포함된다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({ ...mockPost, category: "맛집" })

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.config.systemInstruction).toContain("욤뇸뇸일지")
    })

    it("카테고리별로 서로 다른 스타일 참고가 들어간다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValue({ text: "생성된 초안 내용" })

      await generateNaverDraft({ ...mockPost, category: "결혼" })
      expect(generateContentMock.mock.calls[0][0].config.systemInstruction).toContain(
        "결혼일지"
      )

      await generateNaverDraft({ ...mockPost, category: "알수없는카테고리" })
      expect(generateContentMock.mock.calls[1][0].config.systemInstruction).not.toContain(
        "카테고리별 글 구성 참고"
      )
    })

    it("응답에 텍스트가 없으면 에러를 던진다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: undefined })

      await expect(generateNaverDraft(mockPost)).rejects.toThrow(
        "LLM 응답에서 텍스트를 추출할 수 없습니다."
      )
    })

    it("429 에러 발생 시 재시도 후 최종 실패하면 에러를 전파한다", async () => {
      vi.useFakeTimers()
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(new ApiError({ message: "Too Many Requests", status: 429 }))

      const promise = generateNaverDraft(mockPost)
      const assertion = expect(promise).rejects.toMatchObject({ status: 429 })
      await vi.runAllTimersAsync()
      await assertion

      // 모델마다 최초 시도 + GEMINI_RATE_LIMIT.MAX_RETRIES(3) 재시도 = 4회,
      // 모든 모델이 계속 429면 체인 전체를 소진하고 마지막 에러를 전파한다.
      expect(generateContentMock).toHaveBeenCalledTimes(4 * MODEL_FALLBACK_CHAIN.length)
      vi.useRealTimers()
    })

    it("429 에러가 재시도 중 정상 응답으로 회복되면 결과를 반환한다", async () => {
      vi.useFakeTimers()
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock
        .mockRejectedValueOnce(new ApiError({ message: "Too Many Requests", status: 429 }))
        .mockResolvedValueOnce({ text: "재시도 후 생성된 초안" })

      const promise = generateNaverDraft(mockPost)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe("재시도 후 생성된 초안")
      expect(generateContentMock).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
    })

    it("첫 모델이 재시도 끝에 계속 429면 다음 모델로 자동 전환해 초안을 생성한다", async () => {
      vi.useFakeTimers()
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock
        .mockRejectedValueOnce(new ApiError({ message: "Too Many Requests", status: 429 }))
        .mockRejectedValueOnce(new ApiError({ message: "Too Many Requests", status: 429 }))
        .mockRejectedValueOnce(new ApiError({ message: "Too Many Requests", status: 429 }))
        .mockRejectedValueOnce(new ApiError({ message: "Too Many Requests", status: 429 }))
        .mockResolvedValueOnce({ text: "두 번째 모델이 생성한 초안" })

      const promise = generateNaverDraft(mockPost)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe("두 번째 모델이 생성한 초안")
      // 첫 모델: 최초 시도 + 재시도 3회 = 4회, 두 번째 모델: 1회 = 총 5회
      expect(generateContentMock).toHaveBeenCalledTimes(5)
      expect(generateContentMock.mock.calls[4][0].model).toBe(MODEL_FALLBACK_CHAIN[1])
    })

    it("첫 모델이 404(미지원)면 재시도 없이 즉시 다음 모델로 전환한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock
        .mockRejectedValueOnce(new ApiError({ message: "Not Found", status: 404 }))
        .mockResolvedValueOnce({ text: "두 번째 모델이 생성한 초안" })

      const result = await generateNaverDraft(mockPost)

      expect(result).toBe("두 번째 모델이 생성한 초안")
      // 404는 재시도하지 않으므로 첫 모델 1회 + 두 번째 모델 1회 = 총 2회
      expect(generateContentMock).toHaveBeenCalledTimes(2)
    })
  })
})
