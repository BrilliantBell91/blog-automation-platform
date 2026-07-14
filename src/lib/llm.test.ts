import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateNaverDraft, MODEL_FALLBACK_CHAIN } from "./llm"
import type { Post } from "@/types"

const generateContentMock = vi.fn()
const {
  searchRealImagesMock,
  verifyImageRelevanceMock,
  searchNaverPlaceMock,
  fetchNaverPlaceDetailMock,
  fetchMock,
} = vi.hoisted(() => ({
  searchRealImagesMock: vi.fn().mockResolvedValue([]),
  verifyImageRelevanceMock: vi.fn().mockResolvedValue(true),
  searchNaverPlaceMock: vi.fn().mockResolvedValue(null),
  fetchNaverPlaceDetailMock: vi.fn().mockResolvedValue(null),
  // Pollinations 이미지 생성(imageGen.ts)이 전역 fetch를 직접 호출한다. 실제 네트워크를
  // 타지 않도록 항상 실패시켜 기존 테스트가 기대하는 Gemini 폴백 경로로 넘어가게 한다.
  fetchMock: vi.fn().mockResolvedValue({ ok: false }),
}))

vi.stubGlobal("fetch", fetchMock)

vi.mock("./imageSearch", () => ({
  searchRealImages: searchRealImagesMock,
}))

vi.mock("./naverLocalSearch", () => ({
  searchNaverPlace: searchNaverPlaceMock,
}))

// extractNaverPlaceId는 실제 구현(순수 정규식 파싱)을 그대로 쓰고, fetchNaverPlaceDetail만 목으로 제어한다.
vi.mock("./naverPlaceDetail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./naverPlaceDetail")>()
  return {
    ...actual,
    fetchNaverPlaceDetail: fetchNaverPlaceDetailMock,
  }
})

// generateIllustrativeImage는 실제 구현(아래 "@google/genai" 목 기반)을 그대로 쓰고,
// verifyImageRelevance만 별도로 제어한다(비전 검증 호출까지 실제로 흉내내면 테스트가
// 지나치게 복잡해지므로).
vi.mock("./imageGen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./imageGen")>()
  return {
    ...actual,
    verifyImageRelevance: verifyImageRelevanceMock,
  }
})

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
    // clearAllMocks는 호출 기록만 정리하고 구현(mockResolvedValue 등)은 남겨서, 어떤
    // 테스트가 persistent(non-once)로 설정한 동작이 다음 테스트로 새는 문제가 있었다.
    // (예: GoogleGenAI 생성자 목처럼 계속 살아있어야 하는 것도 있어 vi.resetAllMocks()는
    // 쓸 수 없으므로, 문제가 됐던 3개 목만 개별적으로 mockReset한다)
    vi.clearAllMocks()
    delete process.env.LLM_API_KEY
    generateContentMock.mockReset()
    searchRealImagesMock.mockReset().mockResolvedValue([])
    verifyImageRelevanceMock.mockReset().mockResolvedValue(true)
    searchNaverPlaceMock.mockReset().mockResolvedValue(null)
    fetchNaverPlaceDetailMock.mockReset().mockResolvedValue(null)
    fetchMock.mockReset().mockResolvedValue({ ok: false })
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

    it("링크 첨부는 마커로 사용자 메시지에 들어가지만, 사진 첨부는 URL 마커 없이 캡션 힌트만 들어간다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/photo.jpg", label: "가게 전경" },
          { kind: "link", url: "https://map.naver.com/p/place/123" },
        ],
      })

      const callArgs = generateContentMock.mock.calls[0][0]
      // 사진 URL은 LLM이 보지 못하게 해서 마커 훼손(예: "📷첨부 사진"으로 임의 변경) 위험을 차단한다
      expect(callArgs.contents).not.toContain("https://s3.example.com/photo.jpg")
      expect(callArgs.contents).toContain("첨부된 사진 설명")
      expect(callArgs.contents).toContain("가게 전경")
      expect(callArgs.contents).toContain(
        "[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/place/123]"
      )
    })

    it("지도 URL에 place ID가 있으면 그 ID로 상세 정보를 조회해 확인된 매장 정보에 반영한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      fetchNaverPlaceDetailMock.mockResolvedValueOnce({
        name: "잇키",
        address: "인천 부평구 청천동 366-37",
        roadAddress: "인천 부평구 마장로 397 1층",
        telephone: "0507-1490-0634",
      })
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        // 상호명("잇키")만으로 텍스트 검색하면 실측에서 완전히 다른 지점(부평→송도)을
        // 잘못 매칭하는 사고가 확인되어, 사용자가 첨부한 URL의 place ID를 최우선으로 쓴다.
        contentAttachments: [
          { kind: "link", url: "https://map.naver.com/p/search/잇키/place/1370160067" },
        ],
      })

      expect(fetchNaverPlaceDetailMock).toHaveBeenCalledWith("1370160067")
      expect(searchNaverPlaceMock).not.toHaveBeenCalled()
      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain("확인된 매장 정보")
      expect(callArgs.contents).toContain("인천 부평구 마장로 397 1층")
      expect(callArgs.contents).toContain("0507-1490-0634")
    })

    it("place ID 조회가 실패하면 URL의 검색어로 지역 검색을 시도한다(제목은 쓰지 않음)", async () => {
      process.env.LLM_API_KEY = "test-key"
      fetchNaverPlaceDetailMock.mockResolvedValueOnce(null)
      searchNaverPlaceMock.mockResolvedValueOnce({
        name: "잇키",
        address: "인천 부평구 청천동 366-37",
        roadAddress: "인천 부평구 마장로 397 1층",
      })
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        title: "이 제목은 검색에 쓰이면 안 됨",
        contentAttachments: [
          {
            kind: "link",
            url: "https://map.naver.com/p/search/place/1370160067?searchText=%EC%9E%87%ED%82%A4",
          },
        ],
      })

      expect(fetchNaverPlaceDetailMock).toHaveBeenCalledWith("1370160067")
      expect(searchNaverPlaceMock).toHaveBeenCalledWith("잇키")
    })

    it("URL에 place ID도 없고 검색어 추출도 안 되면 확인된 매장 정보 없이 url_context에만 의존한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [{ kind: "link", url: "https://map.naver.com/p/abc" }],
      })

      expect(fetchNaverPlaceDetailMock).not.toHaveBeenCalled()
      expect(searchNaverPlaceMock).not.toHaveBeenCalled()
      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).not.toContain("확인된 매장 정보")
    })

    it("지도 링크가 없으면 place 조회를 시도하지 않는다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [{ kind: "link", url: "https://example.com/review/123" }],
      })

      expect(fetchNaverPlaceDetailMock).not.toHaveBeenCalled()
      expect(searchNaverPlaceMock).not.toHaveBeenCalled()
    })

    it("url_context 툴이 항상 활성화된 상태로 호출된다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft(mockPost)

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.config.tools).toEqual([{ urlContext: {} }])
    })

    it("url_context 메타데이터가 있어도 경고 문구를 붙이지 않는다(경고 기능 제거됨)", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "생성된 초안 내용",
        candidates: [
          {
            urlContextMetadata: {
              urlMetadata: [
                { retrievedUrl: "https://place.map.naver.com/12345", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_ERROR" },
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

    it("503(일시 과부하) 에러가 재시도 중 정상 응답으로 회복되면 결과를 반환한다", async () => {
      vi.useFakeTimers()
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock
        .mockRejectedValueOnce(new ApiError({ message: "UNAVAILABLE", status: 503 }))
        .mockResolvedValueOnce({ text: "재시도 후 생성된 초안" })

      const promise = generateNaverDraft(mockPost)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe("재시도 후 생성된 초안")
      expect(generateContentMock).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
    })

    it("첫 모델이 재시도 끝에 계속 503이면 다음 모델로 자동 전환해 초안을 생성한다", async () => {
      vi.useFakeTimers()
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock
        .mockRejectedValueOnce(new ApiError({ message: "UNAVAILABLE", status: 503 }))
        .mockRejectedValueOnce(new ApiError({ message: "UNAVAILABLE", status: 503 }))
        .mockRejectedValueOnce(new ApiError({ message: "UNAVAILABLE", status: 503 }))
        .mockRejectedValueOnce(new ApiError({ message: "UNAVAILABLE", status: 503 }))
        .mockResolvedValueOnce({ text: "두 번째 모델이 생성한 초안" })

      const promise = generateNaverDraft(mockPost)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe("두 번째 모델이 생성한 초안")
      expect(generateContentMock).toHaveBeenCalledTimes(5)
      expect(generateContentMock.mock.calls[4][0].model).toBe(MODEL_FALLBACK_CHAIN[1])
    })

    it("사진이 부족하면 서술형 문단 뒤에 AI 생성 이미지가 삽입된다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기.\n\n두 번째 이야기.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG1", mimeType: "image/png" } }] } },
          ],
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG2", mimeType: "image/png" } }] } },
          ],
        })

      // mockPost.category === "맛집" (aiImageCount 4) — 후보 문단이 2개뿐이라 둘 다 삽입 대상이 됨
      const result = await generateNaverDraft(mockPost)

      expect(result).toBe(
        "안녕하세요.\n\n첫 번째 이야기.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG1]\n\n두 번째 이야기.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG2]\n\n마무리 인사."
      )
      expect(generateContentMock).toHaveBeenCalledTimes(3)
    })

    it("첨부 사진이 카테고리 기준 개수만큼 있으면 부족분 검색/생성 없이 첨부 사진만 프로그래밍적으로 삽입한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n하나.\n\n둘.\n\n셋.\n\n넷.\n\n마무리 인사.",
      })

      const result = await generateNaverDraft({
        ...mockPost, // 맛집, aiImageCount 4
        contentAttachments: [
          { kind: "image", url: "https://example.com/1.jpg" },
          { kind: "image", url: "https://example.com/2.jpg" },
          { kind: "image", url: "https://example.com/3.jpg" },
          { kind: "image", url: "https://example.com/4.jpg" },
        ],
      })

      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/1.jpg]"
      )
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/2.jpg]"
      )
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/3.jpg]"
      )
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/4.jpg]"
      )
      expect(generateContentMock).toHaveBeenCalledTimes(1) // 텍스트 생성만, AI 이미지 생성 호출 없음
      expect(searchRealImagesMock).not.toHaveBeenCalled() // 부족분이 없으니 검색도 하지 않음
    })

    it("첨부 사진에 label(Notion 파일명 등)이 있어도 마커에는 캡션을 붙이지 않는다(파일명 노출 방지)", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기.\n\n마무리 인사.",
      })

      const result = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://example.com/1.jpg", label: "20180206_195520.jpg" },
        ],
      })

      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/1.jpg]"
      )
      expect(result).not.toContain("20180206_195520.jpg")
    })

    it("첨부 사진이 카테고리 기준 개수보다 부족하면 첨부 사진을 먼저 배치하고 나머지만 검색/생성으로 채운다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValue(["https://search.example.com/real.jpg"])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n하나.\n\n둘.\n\n마무리 인사.",
      })

      const result = await generateNaverDraft({
        ...mockPost, // 맛집, aiImageCount 4 → 첨부 1장 + 부족분 3장 시도(문단 후보는 2개뿐)
        contentAttachments: [{ kind: "image", url: "https://example.com/attached.jpg" }],
      })

      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/attached.jpg]"
      )
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real.jpg]"
      )
    })

    it("이미지 생성에 실패한 자리는 조용히 건너뛰고 나머지 텍스트는 그대로 유지한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기.\n\n마무리 인사.",
        })
        .mockRejectedValueOnce(new Error("이미지 생성 실패"))

      const result = await generateNaverDraft(mockPost)

      expect(result).toBe("안녕하세요.\n\n첫 번째 이야기.\n\n마무리 인사.")
    })

    it("실사 스타일 카테고리는 슬롯마다 다른 검색어로 네이버 이미지 검색을 하고 AI를 호출하지 않는다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock
        .mockResolvedValueOnce(["https://search.example.com/real1.jpg"])
        .mockResolvedValueOnce(["https://search.example.com/real2.jpg"])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기.\n\n두 번째 이야기.\n\n마무리 인사.",
      })

      // mockPost.category === "맛집" (photo 스타일), tags === ["서울", "카페"]
      const result = await generateNaverDraft(mockPost)

      expect(result).toBe(
        "안녕하세요.\n\n첫 번째 이야기.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real1.jpg]\n\n두 번째 이야기.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real2.jpg]\n\n마무리 인사."
      )
      // 텍스트 생성 1회만 호출되고, 이미지 생성(AI)은 호출되지 않는다
      expect(generateContentMock).toHaveBeenCalledTimes(1)
      // 슬롯마다 제목 + 서로 다른 태그를 조합한 검색어를 사용한다(본문과 무관한 이미지 재사용 방지)
      expect(searchRealImagesMock).toHaveBeenNthCalledWith(1, "테스트 포스트 서울", 5)
      expect(searchRealImagesMock).toHaveBeenNthCalledWith(2, "테스트 포스트 카페", 5)
    })

    it("앞 슬롯에서 이미 고른 이미지는 다음 슬롯에서 재사용하지 않는다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock
        .mockResolvedValueOnce([
          "https://search.example.com/shared.jpg",
          "https://search.example.com/onlyA.jpg",
        ])
        .mockResolvedValueOnce([
          "https://search.example.com/shared.jpg",
          "https://search.example.com/onlyB.jpg",
        ])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기.\n\n두 번째 이야기.\n\n마무리 인사.",
      })

      const result = await generateNaverDraft(mockPost)

      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/shared.jpg]"
      )
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/onlyB.jpg]"
      )
      expect(result).not.toContain("onlyA.jpg")
    })

    it("본문과 무관하다고 검증된 후보는 건너뛰고 관련 있는 다음 후보를 사용한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([
        "https://search.example.com/unrelated.jpg",
        "https://search.example.com/related.jpg",
      ])
      verifyImageRelevanceMock
        .mockResolvedValueOnce(false) // 첫 후보는 본문과 무관
        .mockResolvedValueOnce(true) // 두 번째 후보는 관련 있음
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기.\n\n마무리 인사.",
      })

      const result = await generateNaverDraft(mockPost)

      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/related.jpg]"
      )
      expect(result).not.toContain("unrelated.jpg")
      expect(generateContentMock).toHaveBeenCalledTimes(1) // AI 생성으로 폴백하지 않음
    })

    it("슬롯당 검증 시도가 3회를 넘으면 AI 생성으로 폴백한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([
        "https://search.example.com/a.jpg",
        "https://search.example.com/b.jpg",
        "https://search.example.com/c.jpg",
        "https://search.example.com/d.jpg",
      ])
      verifyImageRelevanceMock.mockResolvedValue(false) // 전부 무관 판정
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG1", mimeType: "image/png" } }] } },
          ],
        })

      const result = await generateNaverDraft(mockPost)

      // 검증은 최대 3장까지만 시도(a, b, c) — 4번째(d)까지 확인하지 않고 AI 생성으로 폴백
      expect(verifyImageRelevanceMock).toHaveBeenCalledTimes(3)
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG1]"
      )
    })

    it("제목에 [테스트] 같은 대괄호 접두사가 있으면 검색어에서 제거한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValue(["https://search.example.com/real.jpg"])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기.\n\n마무리 인사.",
      })

      await generateNaverDraft({ ...mockPost, title: "[테스트] 부평 이자카야 잇키" })

      expect(searchRealImagesMock).toHaveBeenCalledWith("부평 이자카야 잇키 서울", 5)
    })

    it("검색 결과가 부족하면 나머지만 AI 생성으로 채운다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock
        .mockResolvedValueOnce(["https://search.example.com/real1.jpg"])
        .mockResolvedValueOnce([])
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기.\n\n두 번째 이야기.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG2", mimeType: "image/png" } }] } },
          ],
        })

      const result = await generateNaverDraft(mockPost)

      expect(result).toBe(
        "안녕하세요.\n\n첫 번째 이야기.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real1.jpg]\n\n두 번째 이야기.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG2]\n\n마무리 인사."
      )
      expect(generateContentMock).toHaveBeenCalledTimes(2)
    })

    it("요약 스타일 카테고리(육아 등)는 이미지 검색을 시도하지 않고 바로 AI로 생성한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG1", mimeType: "image/png" } }] } },
          ],
        })

      await generateNaverDraft({ ...mockPost, category: "육아" })

      expect(searchRealImagesMock).not.toHaveBeenCalled()
      expect(generateContentMock).toHaveBeenCalledTimes(2)
    })
  })
})
