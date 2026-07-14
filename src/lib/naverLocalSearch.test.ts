import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { searchNaverPlace } from "./naverLocalSearch"

function mockFetchResponse(items: Record<string, string>[]) {
  return {
    ok: true,
    json: async () => ({ items }),
  }
}

describe("searchNaverPlace", () => {
  beforeEach(() => {
    process.env.NAVER_SEARCH_CLIENT_ID = "test-id"
    process.env.NAVER_SEARCH_CLIENT_SECRET = "test-secret"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NAVER_SEARCH_CLIENT_ID
    delete process.env.NAVER_SEARCH_CLIENT_SECRET
  })

  it("API 키가 없으면 null을 반환한다", async () => {
    delete process.env.NAVER_SEARCH_CLIENT_ID
    const result = await searchNaverPlace("부평 이자카야 잇키")
    expect(result).toBeNull()
  })

  it("검색어가 비어있으면 null을 반환한다", async () => {
    const result = await searchNaverPlace("  ")
    expect(result).toBeNull()
  })

  it("첫 번째 결과의 주소/전화/상호명을 반환하고 HTML 태그를 제거한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse([
          {
            title: "<b>부평</b> 이자카야 잇키",
            address: "인천 부평구 경원대로1403번길 15",
            roadAddress: "인천광역시 부평구 경원대로1403번길 15",
            telephone: "032-000-0000",
          },
        ])
      )
    )

    const result = await searchNaverPlace("부평 이자카야 잇키")

    expect(result).toEqual({
      name: "부평 이자카야 잇키",
      address: "인천 부평구 경원대로1403번길 15",
      roadAddress: "인천광역시 부평구 경원대로1403번길 15",
      telephone: "032-000-0000",
    })
  })

  it("roadAddress가 없으면 address로 대체한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse([{ title: "가게", address: "서울 어딘가 1", telephone: "" }])
      )
    )

    const result = await searchNaverPlace("가게")

    expect(result?.roadAddress).toBe("서울 어딘가 1")
    expect(result?.telephone).toBeUndefined()
  })

  it("검색 결과가 없으면 null을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse([])))

    const result = await searchNaverPlace("존재하지않는곳")

    expect(result).toBeNull()
  })

  it("응답 실패 시 null을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const result = await searchNaverPlace("부평 이자카야 잇키")

    expect(result).toBeNull()
  })

  it("fetch 자체가 실패해도 null을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

    const result = await searchNaverPlace("부평 이자카야 잇키")

    expect(result).toBeNull()
  })
})
