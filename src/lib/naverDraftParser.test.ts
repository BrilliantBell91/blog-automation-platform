import { describe, it, expect } from "vitest"
import { parseNaverDraft, naverDraftToHtml, refreshDraftImageUrls } from "./naverDraftParser"

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

  it("마커([참고링크...]) 없이 URL 한 줄뿐인 문단도 link 블록으로 변환한다 (회귀 테스트)", () => {
    // LLM이 "마커 형식을 그대로 유지하라"는 지시를 어기고 대괄호 래퍼 없이 URL만
    // 남기는 경우가 실측으로 확인됐다 — 파서가 이를 흡수하지 못하면 원본 URL이
    // 그대로 텍스트로 노출된다(위치 카드 대신).
    const content = "https://map.naver.com/p/entry/place/1377140070?lng=126.77&lat=37.50"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      {
        type: "link",
        url: "https://map.naver.com/p/entry/place/1377140070?lng=126.77&lat=37.50",
        label: "지도에서 위치 보기",
      },
    ])
  })

  it("마커가 앞 텍스트와 같은 문단에 줄바꿈으로 붙어있으면 텍스트와 마커를 분리한다 (회귀 테스트)", () => {
    // 실측 확인된 사고: LLM이 "위치는 요기 ▼"와 [참고링크...] 마커를 지시(별도 문단으로
    // 분리)를 어기고 같은 문단에 줄바꿈만으로 붙여 써서, 마커가 문단 맨 앞에 오지 않아
    // 파싱에 실패하고 마커 원본 텍스트가 그대로 노출됐다.
    const content =
      "위치는 요기 ▼\n[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/123]"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      { type: "paragraph", text: "위치는 요기 ▼" },
      { type: "link", url: "https://map.naver.com/p/123", label: "지도에서 위치 보기" },
    ])
  })

  it("사진 마커가 앞 텍스트와 같은 문단에 붙어있어도 텍스트와 이미지를 분리한다 (회귀 테스트)", () => {
    const content =
      "매장 내부 사진이에요\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://example.com/a.jpg]"
    const blocks = parseNaverDraft(content)
    expect(blocks).toEqual([
      { type: "paragraph", text: "매장 내부 사진이에요" },
      { type: "image", url: "https://example.com/a.jpg", caption: undefined },
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

  it("참고링크는 네이버 에디터의 지도 위젯 자동 변환을 위해 링크 없이 순수 URL 텍스트로 남긴다", () => {
    const html = naverDraftToHtml(
      "[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/search/place?searchText=%EB%B6%80%ED%8F%89]"
    )
    expect(html).toContain(
      "<p>https://map.naver.com/p/search/place?searchText=%EB%B6%80%ED%8F%89</p>"
    )
    expect(html).not.toContain("<a href=")
  })
})

describe("refreshDraftImageUrls", () => {
  it("경로가 일치하는 Notion 첨부 사진 URL을 최신 서명 URL로 치환한다", () => {
    const content =
      "안녕하세요.\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://prod-files-secure.s3.ap-northeast-2.amazonaws.com/abc/photo.jpg?X-Amz-Signature=stale]\n\n마무리 인사."
    const attachments = [
      {
        kind: "image" as const,
        url: "https://prod-files-secure.s3.ap-northeast-2.amazonaws.com/abc/photo.jpg?X-Amz-Signature=fresh",
      },
    ]

    const result = refreshDraftImageUrls(content, attachments)

    expect(result).toContain(
      "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://prod-files-secure.s3.ap-northeast-2.amazonaws.com/abc/photo.jpg?X-Amz-Signature=fresh]"
    )
    expect(result).not.toContain("X-Amz-Signature=stale")
  })

  it("경로가 일치하는 첨부가 없으면(검색/생성 이미지 등) URL을 그대로 둔다", () => {
    const content =
      "[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: https://search.example.com/real.jpg]"
    const attachments = [
      { kind: "image" as const, url: "https://prod-files-secure.s3.ap-northeast-2.amazonaws.com/abc/photo.jpg?sig=fresh" },
    ]

    const result = refreshDraftImageUrls(content, attachments)

    expect(result).toBe(content)
  })

  it("첨부가 없으면 원본 텍스트를 그대로 반환한다", () => {
    const content = "안녕하세요.\n\n마무리 인사."
    expect(refreshDraftImageUrls(content, [])).toBe(content)
  })

  it("텍스트/링크/해시태그 문단은 건드리지 않는다", () => {
    const content =
      "일반 문단입니다.\n\n[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: https://map.naver.com/p/123]\n\n#태그1 #태그2"
    const attachments = [
      { kind: "image" as const, url: "https://prod-files-secure.s3.ap-northeast-2.amazonaws.com/abc/photo.jpg?sig=fresh" },
    ]

    expect(refreshDraftImageUrls(content, attachments)).toBe(content)
  })
})
