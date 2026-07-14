import { describe, it, expect } from "vitest"
import { parseNaverDraft, naverDraftToHtml } from "./naverDraftParser"

describe("parseNaverDraft", () => {
  it("사진 마커를 image 블록으로 변환한다", () => {
    const content = "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/a.jpg]"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([{ type: "image", url: "https://example.com/a.jpg", caption: undefined }])
  })

  it("참고링크 마커를 link 블록으로 변환한다 (라벨 추출 실패 시 기본 문구)", () => {
    const content = "[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/123]"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      { type: "link", url: "https://map.naver.com/p/123", label: "지도에서 위치 보기" },
    ])
  })

  it("지도 URL의 searchText 쿼리에서 장소명을 라벨로 추출한다", () => {
    const content =
      "[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/search/place?searchText=%EB%B6%80%ED%8F%89%20%EC%9D%B4%EC%9E%90%EC%B9%B4%EC%95%BC]"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      {
        type: "link",
        url: "https://map.naver.com/p/search/place?searchText=%EB%B6%80%ED%8F%89%20%EC%9D%B4%EC%9E%90%EC%B9%B4%EC%95%BC",
        label: "부평 이자카야",
      },
    ])
  })

  it("#으로만 구성된 줄을 hashtags 블록으로 변환한다", () => {
    const content = "#분위기 #이자카야 #부평맛집"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([{ type: "hashtags", tags: ["분위기", "이자카야", "부평맛집"] }])
  })

  it("모든 줄이 '>'로 시작하는 문단을 quote 블록으로 변환한다", () => {
    const content = "> 주소 : 인천 부평구\n> 전화 : 032-000-0000"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([{ type: "quote", lines: ["주소 : 인천 부평구", "전화 : 032-000-0000"] }])
  })

  it("일반 문단은 paragraph 블록으로 변환한다", () => {
    const content = "오늘은 날씨가 좋아서 산책을 다녀왔다."
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([{ type: "paragraph", text: "오늘은 날씨가 좋아서 산책을 다녀왔다." }])
  })

  it("소제목(>)과 본문이 같은 문단에 붙어있으면 quote와 paragraph로 분리한다", () => {
    const content = "> 신청 방법 및 기한\n1. 온라인 신청\n2. 방문 신청"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      { type: "quote", lines: ["신청 방법 및 기한"] },
      { type: "paragraph", text: "1. 온라인 신청\n2. 방문 신청" },
    ])
  })

  it("여러 줄짜리 진짜 인용구 블록은 분리하지 않는다", () => {
    const content = "> 주소 : 인천 부평구\n> 전화 : 032-000-0000\n> 영업시간 : 24시"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      { type: "quote", lines: ["주소 : 인천 부평구", "전화 : 032-000-0000", "영업시간 : 24시"] },
    ])
  })

  it("여러 문단을 순서대로 파싱한다", () => {
    const content = "첫 문단.\n\n> 주소 : 서울\n\n#태그1 #태그2"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      { type: "paragraph", text: "첫 문단." },
      { type: "quote", lines: ["주소 : 서울"] },
      { type: "hashtags", tags: ["태그1", "태그2"] },
    ])
  })
})

describe("naverDraftToHtml", () => {
  it("사진 마커를 실제 img 태그로 변환한다", () => {
    const html = naverDraftToHtml(
      "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/a.jpg]"
    )
    expect(html).toContain('<img src="https://example.com/a.jpg"')
  })

  it("**볼드**를 <strong>으로 변환한다", () => {
    const html = naverDraftToHtml("이건 **중요한** 내용입니다.")
    expect(html).toContain("이건 <strong>중요한</strong> 내용입니다.")
  })

  it("인용구를 blockquote 태그로 변환한다", () => {
    const html = naverDraftToHtml("> 주소 : 서울\n> 전화 : 02-000-0000")
    expect(html).toContain("<blockquote>주소 : 서울<br>전화 : 02-000-0000</blockquote>")
  })

  it("HTML 특수문자를 이스케이프한다", () => {
    const html = naverDraftToHtml("이건 <script>태그</script> 테스트입니다.")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("문단 내 줄바꿈을 <br>로 변환한다", () => {
    const html = naverDraftToHtml("첫 줄입니다.\n둘째 줄입니다.")
    expect(html).toContain("첫 줄입니다.<br>둘째 줄입니다.")
  })

  it("참고링크는 원본 URL 대신 추출된 장소명을 링크 텍스트로 사용한다", () => {
    const html = naverDraftToHtml(
      "[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/search/place?searchText=%EB%B6%80%ED%8F%89]"
    )
    expect(html).toContain('<a href="https://map.naver.com/p/search/place?searchText=%EB%B6%80%ED%8F%89">부평</a>')
  })
})
