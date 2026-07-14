import { describe, it, expect, vi, afterEach } from "vitest"
import { extractNaverPlaceId, fetchNaverPlaceDetail } from "./naverPlaceDetail"

describe("extractNaverPlaceId", () => {
  it("URL 경로에서 place ID를 추출한다", () => {
    expect(extractNaverPlaceId("https://map.naver.com/p/search/잇키/place/1370160067")).toBe(
      "1370160067"
    )
  })

  it("place ID가 없으면 null을 반환한다", () => {
    expect(extractNaverPlaceId("https://map.naver.com/p/search/place?searchText=잇키")).toBeNull()
  })
})

describe("fetchNaverPlaceDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("응답 HTML에서 상호명/주소/전화를 추출한다", async () => {
    const html = `<script>{"name":"잇키","roadAddress":"인천 부평구 마장로 397 1층","address":"인천 부평구 청천동 366-37","phone":"0507-1490-0634","category":"이자카야"}</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

    const result = await fetchNaverPlaceDetail("1370160067")

    expect(result).toEqual({
      name: "잇키",
      address: "인천 부평구 청천동 366-37",
      roadAddress: "인천 부평구 마장로 397 1층",
      telephone: "0507-1490-0634",
      category: "이자카야",
    })
  })

  it("주소 필드가 전혀 없으면 null을 반환한다(페이지 구조가 바뀐 경우 방어)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => `<script>{"name":"잇키"}</script>` })
    )

    const result = await fetchNaverPlaceDetail("1370160067")

    expect(result).toBeNull()
  })

  it("응답 실패 시 null을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const result = await fetchNaverPlaceDetail("1370160067")

    expect(result).toBeNull()
  })

  it("fetch 자체가 실패해도 null을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

    const result = await fetchNaverPlaceDetail("1370160067")

    expect(result).toBeNull()
  })
})
