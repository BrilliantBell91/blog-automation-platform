import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { searchRealImages } from "./imageSearch"

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

  it("개인 블로그/게시판 경로나 호스트는 걸러낸다", async () => {
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

    expect(result).toEqual(["https://cdn.example.com/real5.jpg"])
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
