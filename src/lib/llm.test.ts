import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateNaverDraft, MODEL_FALLBACK_CHAIN } from "./llm"
import type { Post } from "@/types"

const generateContentMock = vi.fn()
const {
  searchRealImagesMock,
  searchGoogleImagesMock,
  verifyImageRelevanceMock,
  searchNaverPlaceMock,
  fetchNaverPlaceDetailMock,
  fetchNaverPlacePhotosMock,
  inferFacilityFromReviewsMock,
  fetchMock,
  generateGroqTextMock,
  generateGroqVisionTextMock,
} = vi.hoisted(() => ({
  searchRealImagesMock: vi.fn().mockResolvedValue([]),
  searchGoogleImagesMock: vi.fn().mockResolvedValue([]),
  verifyImageRelevanceMock: vi.fn().mockResolvedValue("relevant"),
  searchNaverPlaceMock: vi.fn().mockResolvedValue(null),
  fetchNaverPlaceDetailMock: vi.fn().mockResolvedValue(null),
  fetchNaverPlacePhotosMock: vi.fn().mockResolvedValue([]),
  inferFacilityFromReviewsMock: vi.fn().mockResolvedValue(null),
  // verifyImageRelevanceMock이 실제 구현을 대체하므로 원래는 fetch가 호출될 일이 없지만,
  // 혹시 놓친 경로가 실제 네트워크를 타지 않도록 안전망으로 항상 실패시켜둔다.
  fetchMock: vi.fn().mockResolvedValue({ ok: false }),
  // 기본값 null: Gemini 체인이 전부 실패해도 Groq 키가 없으면(기본 상태) 기존과 동일하게
  // lastError를 던져야 하므로, 명시적으로 mockResolvedValueOnce하지 않는 한 항상 null.
  generateGroqTextMock: vi.fn().mockResolvedValue(null),
  // analyzeImagesBatch(imageMatching.ts)가 내부적으로 runVisionPromptBatch/callVisionModel
  // (imageGen.ts)을 실제 구현 그대로 거치므로, 그 경로가 Gemini 소진 후 시도하는
  // generateGroqVisionText도 이 파일에서 함께 목킹해야 한다 — 안 하면 imageGen.ts가 가져오는
  // 값이 undefined가 되어 "generateGroqVisionText is not a function"으로 터진다.
  generateGroqVisionTextMock: vi.fn().mockResolvedValue(null),
}))

vi.stubGlobal("fetch", fetchMock)

vi.mock("./imageSearch", () => ({
  searchRealImages: searchRealImagesMock,
  searchGoogleImages: searchGoogleImagesMock,
}))

vi.mock("./naverLocalSearch", () => ({
  searchNaverPlace: searchNaverPlaceMock,
}))

vi.mock("./naverReviewSearch", () => ({
  inferFacilityFromReviews: inferFacilityFromReviewsMock,
}))

vi.mock("./groqClient", () => ({
  generateGroqText: generateGroqTextMock,
  generateGroqVisionText: generateGroqVisionTextMock,
}))

// extractNaverPlaceId는 실제 구현(순수 정규식 파싱)을 그대로 쓰고, fetchNaverPlaceDetail/
// fetchNaverPlacePhotos(둘 다 실제 네트워크 호출)만 목으로 제어한다.
vi.mock("./naverPlaceDetail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./naverPlaceDetail")>()
  return {
    ...actual,
    fetchNaverPlaceDetail: fetchNaverPlaceDetailMock,
    fetchNaverPlacePhotos: fetchNaverPlacePhotosMock,
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
    verifyImageRelevanceMock.mockReset().mockResolvedValue("relevant")
    searchNaverPlaceMock.mockReset().mockResolvedValue(null)
    fetchNaverPlaceDetailMock.mockReset().mockResolvedValue(null)
    fetchNaverPlacePhotosMock.mockReset().mockResolvedValue([])
    inferFacilityFromReviewsMock.mockReset().mockResolvedValue(null)
    fetchMock.mockReset().mockResolvedValue({ ok: false })
    generateGroqTextMock.mockReset().mockResolvedValue(null)
    generateGroqVisionTextMock.mockReset().mockResolvedValue(null)
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

      const { content: result } = await generateNaverDraft(mockPost)

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

    it("사진 첨부가 여러 장이면 개수와 함께 사진 개수만큼 문단을 나눠 쓰라는 안내가 사용자 메시지에 들어간다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/a.jpg", label: "가게 전경" },
          { kind: "image", url: "https://s3.example.com/b.jpg", label: "우니초밥" },
        ],
      })

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain("첨부된 사진 설명 (총 2장")
      expect(callArgs.contents).toContain("사진 개수만큼 문단으로 나눠 쓰세요")
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

    it("네이버 플레이스에 영업시간 정보가 있으면 그대로 확인된 매장 정보에 반영한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      fetchNaverPlaceDetailMock.mockResolvedValueOnce({
        name: "잇키",
        roadAddress: "인천 부평구 마장로 397 1층",
        businessHours: "매일 11:00 - 22:00",
      })
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "link", url: "https://map.naver.com/p/search/잇키/place/1370160067" },
        ],
      })

      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain("영업시간: 매일 11:00 - 22:00")
      expect(inferFacilityFromReviewsMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "영업시간"
      )
    })

    it("영업시간은 매장 주요 정보에 반드시 포함돼야 하므로, 공식 데이터에 없으면 블로그 리뷰로 보완한다 (회귀 테스트)", async () => {
      // 실측 확인된 사고: 네이버 플레이스 페이지 구조상 isBizHourMissing이 true로
      // 표시되는 매장이 적지 않은데(실제로는 요일별 영업시간 데이터가 존재해도), 기존
      // 코드는 이 경우 영업시간을 아예 생략했다. 화장실 정보와 동일한 방식(리뷰 검색
      // 보완)으로 영업시간도 반드시 채워야 한다는 요청.
      process.env.LLM_API_KEY = "test-key"
      fetchNaverPlaceDetailMock.mockResolvedValueOnce({
        name: "잇키",
        roadAddress: "인천 부평구 마장로 397 1층",
        // businessHours 없음(공식 데이터 누락 상황 재현)
      })
      inferFacilityFromReviewsMock.mockImplementation(async (_apiKey, _placeName, facility) =>
        facility === "영업시간" ? "매일 11:00-21:00" : null
      )
      generateContentMock.mockResolvedValueOnce({ text: "생성된 초안 내용" })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "link", url: "https://map.naver.com/p/search/잇키/place/1370160067" },
        ],
      })

      expect(inferFacilityFromReviewsMock).toHaveBeenCalledWith(
        expect.anything(),
        "잇키",
        "영업시간"
      )
      const callArgs = generateContentMock.mock.calls[0][0]
      expect(callArgs.contents).toContain("영업시간(리뷰 기준, 참고용): 매일 11:00-21:00")
    })

    it("지도 링크가 있으면(place ID 확인됨) 대표 사진은 상호명 텍스트 웹 검색이 아니라 place ID로 등록된 실제 매장 사진만 시도한다 (회귀 테스트)", async () => {
      // 과거에는 이 시나리오에서 상호명 텍스트("미우치 외관")로 웹 전체를 검색했는데,
      // 동명의 다른 가게나 무관한 사진이 섞이는 사고가 실측 확인됐다. 지도 링크로 place
      // ID가 확인되면(실제 등록 사진 유무와 무관하게) 텍스트 웹 검색으로 새지 않는다 —
      // place ID 기준 검증은 src/lib/thumbnail.test.ts에서 별도로 검증한다.
      process.env.LLM_API_KEY = "test-key"
      fetchNaverPlaceDetailMock.mockResolvedValueOnce({
        name: "미우치",
        address: "경기 부천시 원미구 중동로248번길 52",
        roadAddress: "경기 부천시 원미구 중동로248번길 52 1층",
      })
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      await generateNaverDraft({
        ...mockPost,
        title: "[부천/신중동] 편안하게 먹을 수 있는 오마카세, 미우치",
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/food.jpg", label: "음식 사진" },
          { kind: "link", url: "https://map.naver.com/p/entry/place/1377140070" },
        ],
      })

      expect(fetchNaverPlacePhotosMock).toHaveBeenCalledWith("1377140070", 4)
      expect(searchRealImagesMock).not.toHaveBeenCalledWith("미우치 외관", 5)
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

      const { content: result } = await generateNaverDraft(mockPost)

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
      // Groq 키가 없는(기본) 상태이므로 Groq 시도도 null로 끝나고 그대로 에러를 던진다.
      expect(generateGroqTextMock).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it("Gemini 모델이 전부 소진되어도 Groq가 텍스트를 반환하면 그 결과로 초안을 생성한다", async () => {
      vi.useFakeTimers()
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(new ApiError({ message: "Too Many Requests", status: 429 }))
      generateGroqTextMock.mockResolvedValueOnce("Groq가 생성한 초안 내용")

      const promise = generateNaverDraft(mockPost)
      await vi.runAllTimersAsync()
      const { content: result } = await promise

      expect(result).toBe("Groq가 생성한 초안 내용")
      expect(generateContentMock).toHaveBeenCalledTimes(4 * MODEL_FALLBACK_CHAIN.length)
      expect(generateGroqTextMock).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it("Gemini 모델과 Groq 모두 실패하면(Groq도 null) 기존과 동일하게 마지막 에러를 던진다", async () => {
      vi.useFakeTimers()
      process.env.LLM_API_KEY = "test-key"
      const { ApiError } = await import("@google/genai")
      generateContentMock.mockRejectedValue(new ApiError({ message: "Too Many Requests", status: 429 }))
      generateGroqTextMock.mockResolvedValueOnce(null)

      const promise = generateNaverDraft(mockPost)
      const assertion = expect(promise).rejects.toMatchObject({ status: 429 })
      await vi.runAllTimersAsync()
      await assertion

      expect(generateGroqTextMock).toHaveBeenCalledTimes(1)
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
      const { content: result } = await promise

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
      const { content: result } = await promise

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

      const { content: result } = await generateNaverDraft(mockPost)

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
      const { content: result } = await promise

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
      const { content: result } = await promise

      expect(result).toBe("두 번째 모델이 생성한 초안")
      expect(generateContentMock).toHaveBeenCalledTimes(5)
      expect(generateContentMock.mock.calls[4][0].model).toBe(MODEL_FALLBACK_CHAIN[1])
    })

    it("사진이 부족하면 서술형 문단 뒤에 AI 생성 이미지가 삽입된다 (allowAiFallback=true인 카테고리만)", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
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

      // category="기타" (allowAiFallback=true, aiImageCount=2) — 후보 문단이 2개뿐이라 둘 다 삽입 대상이 됨
      const { content: result } = await generateNaverDraft({ ...mockPost, category: "기타" })

      expect(result).toBe(
        "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG1]\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG2]\n\n마무리 인사."
      )
      expect(generateContentMock).toHaveBeenCalledTimes(3)
    })

    it("첨부 사진이 카테고리 기준 개수만큼 있으면 부족분 검색/생성 없이 첨부 사진만 프로그래밍적으로 삽입한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 문단 내용입니다 여기에는 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n두 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n세 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n네 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft({
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
      // 텍스트 생성 1회만 — 캡션 배치 분석은 이미지 다운로드(fetch)가 테스트 환경에서
      // 항상 실패하도록 mock되어 있어(fetchMock 기본값) 비전 모델 호출까지 가지 않고
      // 조용히 빈 캡션으로 폴백한다(생성 자체가 실패한 게 아니라 안전하게 건너뛴 것).
      expect(generateContentMock).toHaveBeenCalledTimes(1)
      // 부족분 채우기 검색은 없지만, 외관 사진이 없어 대표 사진 검색은 한 번 시도한다
      expect(searchRealImagesMock).toHaveBeenCalledWith("테스트 포스트 외관", 5)
    })

    it("첨부 사진에 label(Notion 파일명 등)이 있어도 마커에는 캡션을 붙이지 않는다(파일명 노출 방지)", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft({
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
        text: "안녕하세요.\n\n첫 번째 문단 내용입니다 여기에는 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n두 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft({
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
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
        })
        .mockRejectedValueOnce(new Error("이미지 생성 실패"))

      const { content: result } = await generateNaverDraft(mockPost)

      expect(result).toBe("안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.")
    })

    it("allowAiFallback=false 카테고리(나들이/맛집)는 슬롯마다 다른 검색어로 네이버 이미지 검색을 하되 AI 폴백을 하지 않는다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock
        .mockResolvedValueOnce(["https://search.example.com/real1.jpg"])
        .mockResolvedValueOnce(["https://search.example.com/real2.jpg"])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      // mockPost.category === "맛집" (allowAiFallback=false), tags === ["서울", "카페"]
      const { content: result } = await generateNaverDraft(mockPost)

      expect(result).toBe(
        "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real1.jpg]\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real2.jpg]\n\n마무리 인사."
      )
      // 텍스트 생성 1회만 호출되고, 이미지 생성(AI)은 호출되지 않는다
      expect(generateContentMock).toHaveBeenCalledTimes(1)
      // 슬롯마다 제목 + 서로 다른 태그를 조합한 검색어를 사용한다(본문과 무관한 이미지 재사용 방지)
      expect(searchRealImagesMock).toHaveBeenNthCalledWith(1, "테스트 포스트 서울", 8)
      expect(searchRealImagesMock).toHaveBeenNthCalledWith(2, "테스트 포스트 카페", 8)
    })

    it("첨부 지도 URL에 place ID가 있으면 키워드 검색보다 그 장소의 실제 사진을 먼저 쓴다", async () => {
      process.env.LLM_API_KEY = "test-key"
      fetchNaverPlacePhotosMock.mockResolvedValueOnce([
        "https://ldb-phinf.pstatic.net/place-photo-1.jpg",
      ])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "link", url: "https://map.naver.com/p/search/잇키/place/1370160067" },
        ],
      })

      expect(fetchNaverPlacePhotosMock).toHaveBeenCalledWith("1370160067", expect.any(Number))
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://ldb-phinf.pstatic.net/place-photo-1.jpg]"
      )
      expect(searchRealImagesMock).not.toHaveBeenCalled() // place 사진으로 채워졌으니 키워드 검색은 하지 않음
    })

    it("서로 다른 슬롯이 같은 이미지를 고르면 뒤 슬롯은 비워 중복 삽입을 막는다 (슬롯은 병렬 처리되어 실시간 조율은 하지 않음)", async () => {
      process.env.LLM_API_KEY = "test-key"
      // 두 슬롯 모두 검색 결과의 첫 번째 후보(shared.jpg)를 고르므로 겹친다.
      // 슬롯은 서로 독립적으로 병렬 실행되어(성능/타임아웃 개선 목적) 다른 슬롯이
      // 무엇을 골랐는지 실시간으로 알 수 없으므로, 대체 후보를 찾는 대신 뒤 슬롯을 비운다.
      searchRealImagesMock.mockResolvedValue([
        "https://search.example.com/shared.jpg",
        "https://search.example.com/onlyB.jpg",
      ])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft(mockPost)

      // shared.jpg는 한 번만 삽입되고, 중복된 두 번째 선택은 비워진다.
      const occurrences = result.split("shared.jpg").length - 1
      expect(occurrences).toBe(1)
      expect(result).not.toContain("onlyB.jpg")
    })

    it("본문과 무관하다고 검증된 후보는 건너뛰고 관련 있는 다음 후보를 사용한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([
        "https://search.example.com/unrelated.jpg",
        "https://search.example.com/related.jpg",
      ])
      verifyImageRelevanceMock
        .mockResolvedValueOnce("irrelevant") // 첫 후보는 본문과 무관
        .mockResolvedValueOnce("relevant") // 두 번째 후보는 관련 있음
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft(mockPost)

      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/related.jpg]"
      )
      expect(result).not.toContain("unrelated.jpg")
      expect(generateContentMock).toHaveBeenCalledTimes(1) // AI 생성으로 폴백하지 않음
    })

    it("검증 모델 호출 자체가 실패(unknown)하면 무관 판정과 동일하게 후보를 건너뛰고 AI 생성으로 폴백한다 (allowAiFallback=true인 경우만)", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce(["https://search.example.com/unverified.jpg"])
      verifyImageRelevanceMock.mockResolvedValueOnce("unknown") // 검증 모델 할당량 소진 등
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG1", mimeType: "image/png" } }] } },
          ],
        })
        // 후보 문단이 1개뿐이라도 목표 이미지 개수(기타=2)만큼 부족분 슬롯이 전부 시도되므로
        // (셀렉트 포인트 순환 수정 이후의 정상 동작 — 과거엔 두 번째 슬롯이 조용히 누락됐음)
        // 두 번째 슬롯용 AI 생성 응답도 큐에 넣어준다.
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG2", mimeType: "image/png" } }] } },
          ],
        })

      const { content: result } = await generateNaverDraft({ ...mockPost, category: "기타" })

      expect(result).not.toContain("unverified.jpg")
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG1]"
      )
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG2]"
      )
      expect(generateContentMock).toHaveBeenCalledTimes(3) // 텍스트 생성 + AI 이미지 생성 2회(부족분 슬롯 2개 전부 시도)
    })

    it("슬롯당 검증 시도가 최대값(6회)를 넘으면 AI 생성으로 폴백한다 (allowAiFallback=true인 경우만)", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([
        "https://search.example.com/a.jpg",
        "https://search.example.com/b.jpg",
        "https://search.example.com/c.jpg",
        "https://search.example.com/d.jpg",
      ])
      verifyImageRelevanceMock
        .mockResolvedValueOnce("irrelevant") // 첫 4회 모두 무관 판정
        .mockResolvedValueOnce("irrelevant")
        .mockResolvedValueOnce("irrelevant")
        .mockResolvedValueOnce("irrelevant")
        .mockResolvedValueOnce("relevant") // AI 생성 이미지는 통과
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG1", mimeType: "image/png" } }] } },
          ],
        })

      const { content: result } = await generateNaverDraft({ ...mockPost, category: "기타" })

      // 검증은 총 5회: search 결과 4개 + AI 생성 이미지 1회
      expect(verifyImageRelevanceMock).toHaveBeenCalledTimes(5)
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG1]"
      )
    })

    it("AI 생성 이미지는 검증이 unknown이어도 그대로 채택한다 (검증 모델 전체 할당량 소진 상황 대비)", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([]) // 검색 결과 없음 → AI 생성으로 폴백
      verifyImageRelevanceMock.mockResolvedValueOnce("unknown") // AI 생성 이미지 검증도 확인 불가
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG1", mimeType: "image/png" } }] } },
          ],
        })
        // 목표 이미지 개수(기타=2)만큼 부족분 슬롯 2개가 전부 시도되므로 두 번째 슬롯용
        // AI 생성 응답도 큐에 넣어준다.
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG2", mimeType: "image/png" } }] } },
          ],
        })

      const { content: result } = await generateNaverDraft({ ...mockPost, category: "기타" })

      // irrelevant가 아니라 unknown이므로 재생성하지 않고 첫 시도 결과를 그대로 채택
      expect(generateContentMock).toHaveBeenCalledTimes(3)
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG1]"
      )
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG2]"
      )
    })

    it("제목에 [테스트] 같은 대괄호 접두사가 있으면 검색어에서 제거한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValue(["https://search.example.com/real.jpg"])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      await generateNaverDraft({ ...mockPost, title: "[테스트] 부평 이자카야 잇키" })

      expect(searchRealImagesMock).toHaveBeenCalledWith("부평 이자카야 잇키 서울", 8)
    })

    it("검색 결과가 부족하면 나머지만 AI 생성으로 채운다 (allowAiFallback=true인 경우만)", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock
        .mockResolvedValueOnce(["https://search.example.com/real1.jpg"])
        .mockResolvedValueOnce([])
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG2", mimeType: "image/png" } }] } },
          ],
        })

      const { content: result } = await generateNaverDraft({ ...mockPost, category: "기타" })

      expect(result).toBe(
        "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real1.jpg]\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: data:image/png;base64,IMG2]\n\n마무리 인사."
      )
      expect(generateContentMock).toHaveBeenCalledTimes(2)
    })

    it("정보 카테고리(육아 등)도 검색을 먼저 시도하고, 실패하면 AI로 보완한다 (allowAiFallback=true)", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([]) // 검색 결과 없음
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG1", mimeType: "image/png" } }] } },
          ],
        })
        // 목표 이미지 개수(육아=2)만큼 부족분 슬롯 2개가 전부 시도되므로 두 번째 슬롯용
        // AI 생성 응답도 큐에 넣어준다.
        .mockResolvedValueOnce({
          candidates: [
            { content: { parts: [{ inlineData: { data: "IMG2", mimeType: "image/png" } }] } },
          ],
        })

      await generateNaverDraft({ ...mockPost, category: "육아" })

      expect(searchRealImagesMock).toHaveBeenCalled() // 이제 검색을 시도함
      expect(generateContentMock).toHaveBeenCalledTimes(3) // 텍스트 생성 + AI 이미지 생성 2회(부족분 슬롯 2개 전부 시도)
    })

    it("실사 스타일 카테고리(나들이/맛집)는 검색으로 다 못 채워도 AI로 대체하지 않고 그 자리를 비워둔다 (회귀 테스트)", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([]) // 첫 슬롯 검색 실패
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft(mockPost) // category="맛집" (allowAiFallback=false)

      // 첫 슬롯은 검색 실패로 비워짐, 두 번째 슬롯만 삽입 시도 (generateContentMock은 텍스트 생성 1회만)
      expect(generateContentMock).toHaveBeenCalledTimes(1) // AI 이미지 생성 없음
      expect(searchRealImagesMock).toHaveBeenCalled() // 검색은 시도했음
      expect(result).toContain("첫 번째 이야기입니다")
      expect(result).not.toContain("[사진 원본") // 검색 실패한 이미지는 삽입되지 않음
    })

    it("라벨에 외관이 명시된 첨부 사진은 첫 번째 후보 문단에 강제 배치되고 leadImageUrl로 반환된다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      // 라벨이 의미 있는 텍스트("가게 외관")면 비전 호출 없이 라벨 자체로 외관 여부를
      // 판정하므로(EXTERIOR_LABEL_HINT), 이 테스트는 추가 vision mock 없이 결정론적으로 통과한다.
      const { content: result, leadImageUrl } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/exterior.jpg", label: "가게 외관" },
        ],
      })

      const markerIndex = result.indexOf(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://s3.example.com/exterior.jpg]"
      )
      const secondParagraphIndex = result.indexOf("두 번째 이야기입니다")

      expect(leadImageUrl).toBe("https://s3.example.com/exterior.jpg")
      expect(markerIndex).toBeGreaterThan(-1)
      expect(markerIndex).toBeLessThan(secondParagraphIndex) // 첫 번째 후보 문단(=두 번째 문단) 뒤에 붙음
    })

    it("첨부 사진 중 메뉴판으로 판별된 사진은 '메뉴 ▼' 소제목 바로 다음 문단에 강제 배치된다 (회귀 테스트)", async () => {
      // 사용자 요청: 외관 사진뿐 아니라 메뉴판 사진도 반드시 포함시켜야 한다. 첨부에
      // 메뉴판 사진이 있으면 그걸 쓰고, 소제목("메뉴 ▼") 바로 다음 문단에 배치해야
      // 소제목과 사진이 자연스럽게 이어진다.
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n메뉴 ▼\n\n오늘의 메뉴를 소개합니다 다양한 요리가 준비되어 있어요.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/menu.jpg", label: "메뉴판 사진" },
        ],
      })

      const menuHeadingIndex = result.indexOf("메뉴 ▼")
      const menuBodyIndex = result.indexOf("오늘의 메뉴를 소개합니다")
      const menuMarkerIndex = result.indexOf("https://s3.example.com/menu.jpg")

      expect(menuMarkerIndex).toBeGreaterThan(menuHeadingIndex)
      expect(menuMarkerIndex).toBeGreaterThan(menuBodyIndex) // 소제목 다음 첫 후보 문단(본문) 뒤에 위치
    })

    it("첨부 사진 중 메뉴판이 없으면 findMenuImageViaSearch로 찾아 삽입한다 (회귀 테스트)", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockImplementation(async (query: string) =>
        query.includes("메뉴판") ? ["https://search.example.com/menu.jpg"] : []
      )
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => new ArrayBuffer(4),
      })
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })
      // 메뉴판 검색 후보 검증 비전 호출: "예"
      generateContentMock.mockResolvedValue({ text: "예" })

      const { content: result } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/food.jpg", label: "음식 사진" },
        ],
      })

      expect(searchRealImagesMock).toHaveBeenCalledWith("테스트 포스트 메뉴판", 5)
      expect(result).toContain(
        "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/menu.jpg]"
      )
    })

    it("대표 사진 검색 시 지도 링크의 place ID로 확인된 실제 매장 사진을 상호명 텍스트 웹 검색보다 우선한다 (회귀 테스트)", async () => {
      // 실측 확인된 사고: 상호명/제목 텍스트로 웹 전체를 검색하면 동명의 다른 가게나
      // 전혀 무관한 사진(예: foodnjob.com의 낯선 사진)을 대표 사진으로 잘못 채택하는
      // 사고가 있었다. 사용자가 Notion 속성(지도 URL)으로 등록한 place ID가 있으면,
      // 그 ID로 실제 등록된 매장 사진만 후보로 검증해야 한다.
      process.env.LLM_API_KEY = "test-key"
      generateContentMock
        .mockResolvedValueOnce({
          text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
        })
        .mockResolvedValueOnce({ text: "예" }) // place ID로 찾은 사진의 외관 판별
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => new ArrayBuffer(4),
      })
      fetchNaverPlacePhotosMock.mockResolvedValueOnce(["https://place.naver.com/verified-exterior.jpg"])

      const { leadImageUrl } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/food.jpg", label: "음식 사진" },
          { kind: "link", url: "https://map.naver.com/p/entry/place/999999" },
        ],
      })

      expect(leadImageUrl).toBe("https://place.naver.com/verified-exterior.jpg")
      expect(fetchNaverPlacePhotosMock).toHaveBeenCalledWith("999999", 4)
      // STEP 3 부족분 채우기 검색(태그 기반 쿼리)은 별개로 시도될 수 있지만, 대표 사진
      // 전용 텍스트 검색("... 외관" 쿼리)만큼은 place ID 사진으로 대체돼 시도되지 않는다.
      expect(searchRealImagesMock).not.toHaveBeenCalledWith("테스트 포스트 외관", 5)
    })

    it("지도 링크가 없으면(place ID 없음) 대표 사진 검색은 기존처럼 상호명/제목 텍스트 웹 검색으로 폴백한다", async () => {
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([])
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/food.jpg", label: "음식 사진" },
        ],
      })

      expect(fetchNaverPlacePhotosMock).not.toHaveBeenCalled()
      expect(searchRealImagesMock).toHaveBeenCalledWith("테스트 포스트 외관", 5)
    })

    it("리드로 뽑힌 첨부 사진이 있을 때, 캡션 매칭에 실패한 다른 첨부 사진은 리드 사진과 같은 문단에 겹치지 않는다 (회귀 테스트)", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 이야기입니다 여기에는 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n두 번째 이야기입니다 여기에도 사진이 들어갈 만큼 충분히 긴 본문 내용이 있습니다.\n\n마무리 인사.",
      })

      // exterior.jpg는 라벨에 "외관"이 있어 결정론적으로 leadImageUrl이 된다(candidates[0]=
      // 첫 번째 후보 문단에 배치). random.jpg는 캡션이 어느 문단과도 겹치지 않아 매칭에
      // 실패하고 폴백 위치로 떨어지는데, points[0](=리드 사진 자리)로 되돌아가 리드 사진과
      // 같은 문단에 겹쳐 삽입되던 버그가 있었다 — "대표 사진 옆에 엉뚱한 사진이 같이
      // 붙는다"는 재발 신고의 원인이었다. 수정 후에는 리드 사진이 이미 쓴 자리를 건너뛰고
      // 다음 후보 문단(=두 번째 후보 문단)에 배치돼야 한다.
      const { content: result, leadImageUrl } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/exterior.jpg", label: "가게 외관" },
          { kind: "image", url: "https://s3.example.com/random.jpg", label: "전혀 상관없는 잡담" },
        ],
      })

      const firstParagraphIndex = result.indexOf("첫 번째 이야기입니다")
      const secondParagraphIndex = result.indexOf("두 번째 이야기입니다")
      const exteriorMarkerIndex = result.indexOf("https://s3.example.com/exterior.jpg")
      const randomMarkerIndex = result.indexOf("https://s3.example.com/random.jpg")

      expect(leadImageUrl).toBe("https://s3.example.com/exterior.jpg")
      // 리드 사진은 첫 번째 후보 문단(첫 번째 이야기와 두 번째 이야기 문단 사이)에 위치
      expect(exteriorMarkerIndex).toBeGreaterThan(firstParagraphIndex)
      expect(exteriorMarkerIndex).toBeLessThan(secondParagraphIndex)
      // 매칭 실패한 사진은 리드 사진과 같은 문단(첫 번째 후보)이 아니라 두 번째 후보 문단
      // 뒤에 위치해야 한다 — 즉 "두 번째 이야기입니다" 문단 텍스트보다 뒤에 나와야 한다.
      expect(randomMarkerIndex).toBeGreaterThan(secondParagraphIndex)
    })

    it("다른 첨부 사진의 캡션이 리드 사진 문단과 진짜로 겹쳐도, 매칭 후보에서 리드 문단이 미리 제외돼 다른 문단으로 배치된다 (회귀 테스트)", async () => {
      // 리드 사진이 이미 candidates[0]을 차지했는데, 다른 첨부 사진의 캡션이 우연히
      // candidates[0] 문단 텍스트와 키워드가 겹치면(매칭 실패가 아니라 진짜 매칭 성공),
      // 소프트 페널티만으로는 여전히 리드 문단이 선택될 수 있었다. 매칭 후보 목록
      // 자체에서 리드가 쓴 문단을 미리 빼야, 진짜 매칭이 성공하는 경우에도 리드 자리와
      // 겹치지 않는다.
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n오늘은 우니초밥 먹으러 왔어요 정말 맛있었고 아주 신선하고 좋았습니다.\n\n디저트로 아이스크림도 나왔는데 부드럽고 좋았습니다.\n\n마무리 인사.",
      })

      const { content: result, leadImageUrl } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/exterior.jpg", label: "가게 외관" },
          // 캡션이 "우니초밥"을 포함해 리드 사진이 이미 차지한 candidates[0](우니초밥
          // 문단)과 진짜로 키워드가 겹친다.
          { kind: "image", url: "https://s3.example.com/uni.jpg", label: "우니초밥 클로즈업" },
        ],
      })

      const uniParagraphIndex = result.indexOf("오늘은 우니초밥")
      const dessertParagraphIndex = result.indexOf("디저트로 아이스크림")
      const exteriorMarkerIndex = result.indexOf("https://s3.example.com/exterior.jpg")
      const uniMarkerIndex = result.indexOf("https://s3.example.com/uni.jpg")

      expect(leadImageUrl).toBe("https://s3.example.com/exterior.jpg")
      expect(exteriorMarkerIndex).toBeGreaterThan(uniParagraphIndex)
      expect(exteriorMarkerIndex).toBeLessThan(dessertParagraphIndex)
      // 우니초밥 사진은 캡션이 진짜로 겹쳐도 리드 문단이 아니라 다음 문단(디저트) 뒤로 밀린다
      expect(uniMarkerIndex).toBeGreaterThan(dessertParagraphIndex)
    })

    it("첨부 사진은 위치 순서가 아니라 캡션 키워드가 겹치는 문단에 매칭된다", async () => {
      process.env.LLM_API_KEY = "test-key"
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n우니초밥을 먼저 맛봤는데 신선하고 고소했다.\n\n디저트로 나온 티라미수도 인상 깊었다.\n\n마무리 인사.",
      })

      // 첨부 순서는 티라미수 → 우니초밥 이지만(=위치 기반이면 첫 자리는 우니초밥 문단을
      // 차지해야 함), 실제로는 캡션 키워드가 겹치는 문단으로 각각 배치되어야 한다.
      const { content: result } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [
          { kind: "image", url: "https://s3.example.com/tiramisu.jpg", label: "티라미수 디저트" },
          { kind: "image", url: "https://s3.example.com/uni.jpg", label: "우니초밥 클로즈업" },
        ],
      })

      const uniParagraphIndex = result.indexOf("우니초밥을 먼저")
      const dessertParagraphIndex = result.indexOf("디저트로 나온")
      const uniMarkerIndex = result.indexOf("https://s3.example.com/uni.jpg")
      const tiramisuMarkerIndex = result.indexOf("https://s3.example.com/tiramisu.jpg")

      // 우니초밥 사진 마커는 우니초밥 문단과 디저트 문단 사이에 위치해야 한다
      expect(uniMarkerIndex).toBeGreaterThan(uniParagraphIndex)
      expect(uniMarkerIndex).toBeLessThan(dessertParagraphIndex)
      // 티라미수 사진 마커는 디저트 문단 뒤에 위치해야 한다
      expect(tiramisuMarkerIndex).toBeGreaterThan(dessertParagraphIndex)
    })

    it("캡션 매칭이 전부 실패해도 사진들이 서로 다른 후보 문단에 고르게 분산되고 특정 문단에 몰리지 않는다 (회귀 테스트)", async () => {
      // 실측 확인된 사고: "사진 개수만큼 문단을 나눠 쓰라"는 프롬프트 지시로 후보 문단이
      // 늘어난 상황에서, 매칭에 실패한 사진들의 폴백 위치가 고정된 균등 샘플링 배열을
      // 써서 일부 후보 문단은 사진을 아예 못 받고(여러 문단이 연달아 사진 없이 이어짐),
      // 다른 문단엔 여러 장이 몰리는 문제가 있었다. 후보 문단 수(5)와 첨부 사진 수(5)가
      // 정확히 같을 때, 매칭이 전부 실패해도(캡션이 문단과 무관) 다섯 사진이 다섯 후보
      // 문단에 1:1로 정확히 퍼져야 한다.
      process.env.LLM_API_KEY = "test-key"
      searchRealImagesMock.mockResolvedValueOnce([]) // 리드 사진 검색도 실패시켜 순수 분산 로직만 검증
      generateContentMock.mockResolvedValueOnce({
        text: "안녕하세요.\n\n첫 번째 문단 내용입니다 여기에는 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n두 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n세 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n네 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n다섯 번째 문단 내용입니다 여기에도 사진이 들어갈 만큼 충분히 긴 내용이 있습니다.\n\n마무리 인사.",
      })

      const { content: result } = await generateNaverDraft({
        ...mockPost,
        contentAttachments: [1, 2, 3, 4, 5].map((n) => ({
          kind: "image" as const,
          url: `https://s3.example.com/${n}.jpg`,
          label: `전혀 상관없는 잡담 ${n}`,
        })),
      })

      const paragraphLabels = ["첫 번째 문단", "두 번째 문단", "세 번째 문단", "네 번째 문단", "다섯 번째 문단"]
      const paragraphPositions = paragraphLabels.map((label) => result.indexOf(label))
      const markerPositions = [1, 2, 3, 4, 5].map((n) =>
        result.indexOf(`https://s3.example.com/${n}.jpg`)
      )

      // 각 마커가 어느 후보 문단 구간(paragraphPositions[i] ~ paragraphPositions[i+1])에
      // 속하는지 계산해, 다섯 마커가 각기 다른 구간(0~4)에 하나씩 배정됐는지 확인한다.
      const sectionOf = (pos: number) => {
        let section = -1
        paragraphPositions.forEach((start, i) => {
          if (pos > start) section = i
        })
        return section
      }
      const sections = markerPositions.map(sectionOf)

      expect(sections.every((s) => s >= 0)).toBe(true)
      expect(new Set(sections).size).toBe(5) // 다섯 마커가 다섯 개의 서로 다른 구간에 위치
    })
  })
})
