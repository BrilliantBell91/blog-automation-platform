import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { searchRealImages, searchGoogleImages } from "./imageSearch"

function mockFetchResponse(items: { link?: string }[]) {
  return {
    ok: true,
    json: async () => ({ items }),
  }
}

describe("searchRealImages", () => {
  beforeEach(() => {
    process.env.NAVER_SEARCH_CLIENT_ID = "test-id"
    process.env.NAVER_SEARCH_CLIENT_SECRET = "test-secret"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NAVER_SEARCH_CLIENT_ID
    delete process.env.NAVER_SEARCH_CLIENT_SECRET
  })

  it("API 키가 없으면 빈 배열을 반환한다", async () => {
    delete process.env.NAVER_SEARCH_CLIENT_ID
    const result = await searchRealImages("부평 이자카야", 3)
    expect(result).toEqual([])
  })

  it("언론사/스톡 이미지 도메인은 걸러내고 나머지만 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse([
        { link: "http://imgnews.naver.net/image/1.jpg" },
        { link: "https://example.com/real1.jpg" },
        { link: "https://www.gettyimages.com/photo/2.jpg" },
        { link: "https://cdn.example.com/real2.jpg" },
      ])
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await searchRealImages("부평 이자카야", 3)

    expect(result).toEqual(["https://example.com/real1.jpg", "https://cdn.example.com/real2.jpg"])
  })

  it("blog./cafe. 서브도메인은 통과시키되(네이버 CDN 오탐 방지), 게시판 경로나 타 블로그 플랫폼 도메인은 걸러낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse([
        { link: "https://blog.example.com/real1.jpg" },
        { link: "https://cafe.example.com/real2.jpg" },
        { link: "https://example.com/cache/board/photo3.jpg" },
        { link: "https://example.tistory.com/photo4.jpg" },
        { link: "https://cdn.example.com/real5.jpg" },
      ])
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await searchRealImages("부평 이자카야", 5)

    expect(result).toEqual([
      "https://blog.example.com/real1.jpg",
      "https://cafe.example.com/real2.jpg",
      "https://cdn.example.com/real5.jpg",
    ])
  })

  it("GIF 등 정적 이미지가 아닌 확장자는 걸러낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse([
        { link: "https://cdn.example.com/animation.gif" },
        { link: "https://cdn.example.com/photo.jpg" },
        { link: "https://cdn.example.com/photo.png" },
      ])
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await searchRealImages("부평 이자카야", 5)

    expect(result).toEqual(["https://cdn.example.com/photo.jpg", "https://cdn.example.com/photo.png"])
  })

  it("count개만큼만 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse([
        { link: "https://example.com/1.jpg" },
        { link: "https://example.com/2.jpg" },
        { link: "https://example.com/3.jpg" },
      ])
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await searchRealImages("인천대공원", 2)

    expect(result).toEqual(["https://example.com/1.jpg", "https://example.com/2.jpg"])
  })

  it("응답 실패 시 빈 배열을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const result = await searchRealImages("부평 이자카야", 3)

    expect(result).toEqual([])
  })

  it("fetch 자체가 실패해도 빈 배열을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

    const result = await searchRealImages("부평 이자카야", 3)

    expect(result).toEqual([])
  })
})

describe("searchGoogleImages", () => {
  beforeEach(() => {
    process.env.GOOGLE_SEARCH_API_KEY = "test-key"
    process.env.GOOGLE_SEARCH_CX = "test-cx"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GOOGLE_SEARCH_API_KEY
    delete process.env.GOOGLE_SEARCH_CX
  })

  it("API 키나 검색엔진 ID가 없으면 빈 배열을 반환한다", async () => {
    delete process.env.GOOGLE_SEARCH_API_KEY
    const result = await searchGoogleImages("부평 이자카야", 3)
    expect(result).toEqual([])
  })

  it("정상 응답 시 필터링을 거쳐 이미지 URL 목록을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { link: "https://example.com/real1.jpg" },
          { link: "https://www.gettyimages.com/photo/2.jpg" },
          { link: "https://cdn.example.com/real2.jpg" },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await searchGoogleImages("부평 이자카야", 3)

    expect(result).toEqual(["https://example.com/real1.jpg", "https://cdn.example.com/real2.jpg"])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://www.googleapis.com/customsearch/v1")
    )
  })

  it("응답 실패 시 빈 배열을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    const result = await searchGoogleImages("부평 이자카야", 3)

    expect(result).toEqual([])
  })

  it("fetch 자체가 실패해도 빈 배열을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

    const result = await searchGoogleImages("부평 이자카야", 3)

    expect(result).toEqual([])
  })
})
