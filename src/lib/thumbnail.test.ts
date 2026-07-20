import { describe, it, expect, vi, beforeEach } from "vitest"
import { findExteriorImageViaSearch, findMenuImageViaSearch } from "./thumbnail"

const generateContentMock = vi.fn()
const { searchRealImagesMock, searchGoogleImagesMock, fetchMock, fetchNaverPlacePhotosMock } =
  vi.hoisted(() => ({
    searchRealImagesMock: vi.fn(),
    searchGoogleImagesMock: vi.fn(),
    fetchMock: vi.fn(),
    fetchNaverPlacePhotosMock: vi.fn(),
  }))

vi.stubGlobal("fetch", fetchMock)

vi.mock("./imageSearch", () => ({
  searchRealImages: searchRealImagesMock,
  searchGoogleImages: searchGoogleImagesMock,
}))

vi.mock("./naverPlaceDetail", () => ({
  fetchNaverPlacePhotos: fetchNaverPlacePhotosMock,
}))

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent: generateContentMock },
  })),
}))

describe("thumbnail", () => {
  beforeEach(() => {
    generateContentMock.mockReset()
    searchRealImagesMock.mockReset().mockResolvedValue([])
    searchGoogleImagesMock.mockReset().mockResolvedValue([])
    fetchMock.mockReset()
    fetchNaverPlacePhotosMock.mockReset().mockResolvedValue([])
  })

  function mockImageDownloadOk() {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new ArrayBuffer(4),
    })
  }

  it("API 키가 없으면 검색 자체를 시도하지 않는다", async () => {
    const result = await findExteriorImageViaSearch("", "부평 이자카야 잇키")
    expect(result).toBeNull()
    expect(searchRealImagesMock).not.toHaveBeenCalled()
  })

  it("검색 결과 중 외관으로 판별된 첫 후보를 반환한다", async () => {
    searchRealImagesMock.mockResolvedValueOnce([
      "https://search.example.com/a.jpg",
      "https://search.example.com/b.jpg",
    ])
    mockImageDownloadOk()
    generateContentMock.mockResolvedValueOnce({ text: "예" })

    const result = await findExteriorImageViaSearch("test-key", "부평 이자카야 잇키")

    expect(result).toBe("https://search.example.com/a.jpg")
    expect(searchRealImagesMock).toHaveBeenCalledWith("부평 이자카야 잇키 외관", 5)
  })

  it("첫 후보가 외관이 아니면 다음 후보를 검증한다", async () => {
    searchRealImagesMock.mockResolvedValueOnce([
      "https://search.example.com/a.jpg",
      "https://search.example.com/b.jpg",
    ])
    mockImageDownloadOk()
    generateContentMock.mockResolvedValueOnce({ text: "아니오" })
    mockImageDownloadOk()
    generateContentMock.mockResolvedValueOnce({ text: "예" })

    const result = await findExteriorImageViaSearch("test-key", "부평 이자카야 잇키")

    expect(result).toBe("https://search.example.com/b.jpg")
  })

  it("제목의 대괄호 접두사는 검색어에서 제거한다", async () => {
    await findExteriorImageViaSearch("test-key", "[테스트] 부평 이자카야 잇키")
    expect(searchRealImagesMock).toHaveBeenCalledWith("부평 이자카야 잇키 외관", 5)
  })

  it("모든 후보가 외관이 아니면 null을 반환한다", async () => {
    searchRealImagesMock.mockResolvedValueOnce(["https://search.example.com/a.jpg"])
    mockImageDownloadOk()
    generateContentMock.mockResolvedValueOnce({ text: "아니오" })

    const result = await findExteriorImageViaSearch("test-key", "부평 이자카야 잇키")

    expect(result).toBeNull()
  })

  it("placeId가 있으면 상호명 텍스트 웹 검색 대신 그 place ID의 실제 등록 사진만 검증한다", async () => {
    fetchNaverPlacePhotosMock.mockResolvedValueOnce(["https://place.naver.com/real.jpg"])
    mockImageDownloadOk()
    generateContentMock.mockResolvedValueOnce({ text: "예" })

    const result = await findExteriorImageViaSearch("test-key", "부평 이자카야 잇키", "12345")

    expect(result).toBe("https://place.naver.com/real.jpg")
    expect(fetchNaverPlacePhotosMock).toHaveBeenCalledWith("12345", 4)
    expect(searchRealImagesMock).not.toHaveBeenCalled()
    expect(searchGoogleImagesMock).not.toHaveBeenCalled()
  })

  it("placeId로 찾은 사진 중 외관이 없으면(텍스트 검색으로 폴백하지 않고) null을 반환한다", async () => {
    // place ID 기준 사진은 "이 가게가 맞다"는 게 검증돼 있으므로, 여기서 못 찾으면
    // 동명의 다른 가게가 섞일 위험이 있는 텍스트 검색으로 굳이 넘어가지 않는다.
    fetchNaverPlacePhotosMock.mockResolvedValueOnce(["https://place.naver.com/food.jpg"])
    mockImageDownloadOk()
    generateContentMock.mockResolvedValueOnce({ text: "아니오" })

    const result = await findExteriorImageViaSearch("test-key", "부평 이자카야 잇키", "12345")

    expect(result).toBeNull()
    expect(searchRealImagesMock).not.toHaveBeenCalled()
  })

  describe("findMenuImageViaSearch", () => {
    it("placeId가 있으면 그 place ID의 실제 등록 사진 중 메뉴판을 검증해 반환한다", async () => {
      fetchNaverPlacePhotosMock.mockResolvedValueOnce(["https://place.naver.com/menu.jpg"])
      mockImageDownloadOk()
      generateContentMock.mockResolvedValueOnce({ text: "예" })

      const result = await findMenuImageViaSearch("test-key", "부평 이자카야 잇키", "12345")

      expect(result).toBe("https://place.naver.com/menu.jpg")
      expect(fetchNaverPlacePhotosMock).toHaveBeenCalledWith("12345", 4)
      expect(searchRealImagesMock).not.toHaveBeenCalled()
    })

    it("placeId가 없으면 '메뉴판' 검색어로 웹 검색을 시도한다", async () => {
      searchRealImagesMock.mockResolvedValueOnce(["https://search.example.com/menu.jpg"])
      mockImageDownloadOk()
      generateContentMock.mockResolvedValueOnce({ text: "예" })

      const result = await findMenuImageViaSearch("test-key", "부평 이자카야 잇키")

      expect(result).toBe("https://search.example.com/menu.jpg")
      expect(searchRealImagesMock).toHaveBeenCalledWith("부평 이자카야 잇키 메뉴판", 5)
    })

    it("등록 사진 중에 메뉴판이 없으면(외관과 달리) 상호명 텍스트 웹 검색도 추가로 시도한다 (회귀 테스트)", async () => {
      // 실측 확인된 사고: 매장이 등록한 사진에 메뉴판 자체가 없는 경우가 흔한데, 외관과
      // 동일하게 place ID 등록 사진에서만 찾고 끝내버리면 메뉴판이 계속 누락됐다.
      // 메뉴판은 반드시 포함돼야 한다는 요청에 따라, 등록 사진에서 못 찾으면 웹 검색도
      // 추가로 시도해야 한다.
      fetchNaverPlacePhotosMock.mockResolvedValueOnce(["https://place.naver.com/exterior.jpg"])
      mockImageDownloadOk() // place 사진 검증용
      generateContentMock.mockResolvedValueOnce({ text: "아니오" }) // place 사진은 메뉴판이 아님
      searchRealImagesMock.mockResolvedValueOnce(["https://search.example.com/menu.jpg"])
      mockImageDownloadOk() // 웹 검색 후보 검증용
      generateContentMock.mockResolvedValueOnce({ text: "예" }) // 웹 검색 후보는 메뉴판임

      const result = await findMenuImageViaSearch("test-key", "부평 이자카야 잇키", "12345")

      expect(result).toBe("https://search.example.com/menu.jpg")
      expect(searchRealImagesMock).toHaveBeenCalledWith("부평 이자카야 잇키 메뉴판", 5)
    })

    it("등록 사진과 웹 검색 모두에서 메뉴판으로 판별된 후보가 없으면 null을 반환한다", async () => {
      fetchNaverPlacePhotosMock.mockResolvedValueOnce(["https://place.naver.com/exterior.jpg"])
      mockImageDownloadOk()
      generateContentMock.mockResolvedValueOnce({ text: "아니오" })
      searchRealImagesMock.mockResolvedValueOnce([])

      const result = await findMenuImageViaSearch("test-key", "부평 이자카야 잇키", "12345")

      expect(result).toBeNull()
    })
  })
})
