import { describe, it, expect, vi, afterEach } from "vitest"
import { extractNaverPlaceId, fetchNaverPlaceDetail, fetchNaverPlacePhotos } from "./naverPlaceDetail"

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

  it("PlaceDetailBase 객체 안에서 상호명/주소/전화/편의시설을 추출한다", async () => {
    const html = `<script>window.__APOLLO_STATE__ = {
      "PlaceDetailBase:1370160067":{"__typename":"PlaceDetailBase","id":"1370160067","name":"잇키","roadAddress":"인천 부평구 마장로 397 1층","address":"인천 부평구 청천동 366-37","category":"이자카야","conveniences":["예약","포장"],"missingInfo":{"__typename":"MissingInfo","isBizHourMissing":true}},
      "phoneInfo":{"__typename":"PlacePhoneInfo","phone":"0507-1490-0634"}
    }</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

    const result = await fetchNaverPlaceDetail("1370160067")

    expect(result).toEqual({
      name: "잇키",
      address: "인천 부평구 청천동 366-37",
      roadAddress: "인천 부평구 마장로 397 1층",
      telephone: "0507-1490-0634",
      category: "이자카야",
      conveniences: ["예약", "포장"],
    })
  })

  // 실측 확인된 실제 사고 재현: 페이지 앞부분에 이 place와 무관한 다른 캐시 객체
  // (PoiInfoShapeKey)의 name이 먼저 나오고, 진짜 상호명은 뒤쪽 PlaceDetailBase 객체 안에
  // 있다. 페이지 전체에서 첫 "name" 매치를 가져오면 무관한 업체 이름으로 뒤바뀐다.
  it("페이지 앞쪽의 무관한 캐시 객체가 아니라 PlaceDetailBase 객체 안의 진짜 상호명을 가져온다", async () => {
    const html = `<script>window.__APOLLO_STATE__ = {
      "PoiInfoShapeKey:11574457":{"__typename":"PoiInfoShapeKey","id":"11574457","name":"RELA","version":"1.0"},
      "PlaceDetailBase:11574457":{"__typename":"PlaceDetailBase","id":"11574457","name":"에버랜드","roadAddress":"경기 용인시 처인구 포곡읍 에버랜드로 199","address":"경기 용인시 처인구 포곡읍 전대리 310","conveniences":["주차","발렛파킹"],"missingInfo":{"__typename":"MissingInfo","isBizHourMissing":true}},
      "phoneInfo":{"__typename":"PlacePhoneInfo","phone":"031-320-5000"}
    }</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

    const result = await fetchNaverPlaceDetail("11574457")

    expect(result?.name).toBe("에버랜드")
    expect(result?.name).not.toBe("RELA")
  })

  // 실측 확인된 사고: businessHours(WorkingHoursInfo)는 PlaceDetailBase 객체 밖(요일별
  // 배열)에 있어 이 place 소유인지 특정할 수 없다. PlaceDetailBase가 스스로
  // isBizHourMissing:true(정보 없음)라고 밝히는데도, 페이지 어딘가의 무관한 업체
  // 영업시간을 그대로 가져다 붙이면 안 된다.
  it("PlaceDetailBase가 isBizHourMissing:true면 다른 곳의 영업시간을 가져오지 않는다", async () => {
    const html = `<script>window.__APOLLO_STATE__ = {
      "PlaceDetailBase:11574457":{"__typename":"PlaceDetailBase","id":"11574457","name":"에버랜드","roadAddress":"경기 용인시 처인구 포곡읍 에버랜드로 199","address":"경기 용인시 처인구 포곡읍 전대리 310","missingInfo":{"__typename":"MissingInfo","isBizHourMissing":true}},
      "SomeOtherPlace:99999":{"businessHours":[{"__typename":"WorkingHoursInfo","day":"화","businessHours":{"__typename":"StartEndTime","start":"10:00","end":"22:00"}}]}
    }</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

    const result = await fetchNaverPlaceDetail("11574457")

    expect(result?.businessHours).toBeUndefined()
  })

  it("isBizHourMissing이 false면 영업시간을 추출한다", async () => {
    const html = `<script>window.__APOLLO_STATE__ = {
      "PlaceDetailBase:1":{"__typename":"PlaceDetailBase","id":"1","name":"테스트카페","roadAddress":"서울 강남구 테스트로 1","address":"서울 강남구 테스트동 1","missingInfo":{"__typename":"MissingInfo","isBizHourMissing":false}},
      "hours":[{"__typename":"WorkingHoursInfo","day":"매일","businessHours":{"__typename":"StartEndTime","start":"09:00","end":"21:00"}}]
    }</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

    const result = await fetchNaverPlaceDetail("1")

    expect(result?.businessHours).toBe("매일 09:00 - 21:00")
  })

  it("PlaceDetailBase 객체 자체를 찾지 못하면 null을 반환한다(페이지 구조가 바뀐 경우 방어)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => `<script>{"name":"잇키"}</script>` })
    )

    const result = await fetchNaverPlaceDetail("1370160067")

    expect(result).toBeNull()
  })

  it("주소 필드가 전혀 없으면 null을 반환한다(페이지 구조가 바뀐 경우 방어)", async () => {
    const html = `<script>window.__APOLLO_STATE__ = {
      "PlaceDetailBase:1370160067":{"__typename":"PlaceDetailBase","id":"1370160067","name":"잇키"}
    }</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

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

describe("fetchNaverPlacePhotos", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 첨부된 지도 URL이 가리키는 그 장소의 실제 사진(업체 등록 + 방문자 인증)만 가져와야
  // 키워드 검색처럼 완전히 다른 장소 사진이 섞이지 않는다(실측 확인된 사고 - 이자카야
  // 글에 무관한 피자 사진이 검색으로 섞여 들어옴).
  it("업체 등록 사진을 방문자 사진보다 먼저 반환하고, 유니코드 이스케이프된 URL을 디코딩한다", async () => {
    const html = `<script>window.__APOLLO_STATE__ = {
      "PlaceDetailTopPhotoItem:visitor_1":{"__typename":"PlaceDetailTopPhotoItem","id":"visitor_1","origin":"https:\\u002F\\u002Fblogfiles.pstatic.net\\u002Fvisitor1.jpg","type":"visitor","photoType":"visitor"},
      "PlaceDetailTopPhotoItem:business_1":{"__typename":"PlaceDetailTopPhotoItem","id":"business_1","origin":"https:\\u002F\\u002Fldb-phinf.pstatic.net\\u002Fbusiness1.jpg","type":"business","photoType":"business"}
    }</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

    const result = await fetchNaverPlacePhotos("1370160067", 5)

    expect(result).toEqual([
      "https://ldb-phinf.pstatic.net/business1.jpg",
      "https://blogfiles.pstatic.net/visitor1.jpg",
    ])
  })

  it("count만큼만 반환한다", async () => {
    const html = `<script>window.__APOLLO_STATE__ = {
      "PlaceDetailTopPhotoItem:visitor_1":{"origin":"https:\\u002F\\u002Fexample.com\\u002F1.jpg","type":"visitor"},
      "PlaceDetailTopPhotoItem:visitor_2":{"origin":"https:\\u002F\\u002Fexample.com\\u002F2.jpg","type":"visitor"},
      "PlaceDetailTopPhotoItem:visitor_3":{"origin":"https:\\u002F\\u002Fexample.com\\u002F3.jpg","type":"visitor"}
    }</script>`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }))

    const result = await fetchNaverPlacePhotos("1370160067", 2)

    expect(result).toHaveLength(2)
  })

  it("count가 0 이하면 요청 없이 빈 배열을 반환한다", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const result = await fetchNaverPlacePhotos("1370160067", 0)

    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("사진 객체가 없으면 빈 배열을 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "<script>{}</script>" })
    )

    const result = await fetchNaverPlacePhotos("1370160067", 5)

    expect(result).toEqual([])
  })

  it("응답 실패 시 빈 배열을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    const result = await fetchNaverPlacePhotos("1370160067", 5)

    expect(result).toEqual([])
  })

  it("fetch 자체가 실패해도 빈 배열을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

    const result = await fetchNaverPlacePhotos("1370160067", 5)

    expect(result).toEqual([])
  })
})
