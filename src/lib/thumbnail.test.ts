import { describe, it, expect, vi, beforeEach } from "vitest"
import { findExteriorImageViaSearch } from "./thumbnail"

const generateContentMock = vi.fn()
const { searchRealImagesMock, searchGoogleImagesMock, fetchMock } = vi.hoisted(() => ({
  searchRealImagesMock: vi.fn(),
  searchGoogleImagesMock: vi.fn(),
  fetchMock: vi.fn(),
}))

vi.stubGlobal("fetch", fetchMock)

vi.mock("./imageSearch", () => ({
  searchRealImages: searchRealImagesMock,
  searchGoogleImages: searchGoogleImagesMock,
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
})
