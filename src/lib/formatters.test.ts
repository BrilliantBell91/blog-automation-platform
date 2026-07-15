import { describe, it, expect } from "vitest"
import {
  formatDate,
  arrayToTags,
  tagsToArray,
  truncateExcerpt,
  encodeUrl,
  extractApiErrorMessage,
} from "./formatters"

describe("formatters", () => {
  describe("formatDate", () => {
    it("한국 형식으로 날짜를 포맷한다", () => {
      const date = new Date("2026-07-11T00:00:00Z")
      const result = formatDate(date)
      expect(result).toMatch(/\d{4}년.*\d{1,2}월.*\d{1,2}일/)
    })

    it("문자열을 입력받으면 Date로 변환 후 포맷한다", () => {
      const result = formatDate("2026-07-11T00:00:00Z")
      expect(result).toMatch(/\d{4}년.*\d{1,2}월.*\d{1,2}일/)
    })
  })

  describe("arrayToTags / tagsToArray 왕복 변환", () => {
    it("배열을 문자열로 변환 후 다시 배열로 변환하면 원본과 같다", () => {
      const tags = ["태그1", "태그2", "태그3"]
      const tagged = arrayToTags(tags)
      const result = tagsToArray(tagged)
      expect(result).toEqual(tags)
    })

    it("빈 배열을 변환하면 빈 배열로 돌아온다", () => {
      const tags: string[] = []
      const tagged = arrayToTags(tags)
      const result = tagsToArray(tagged)
      expect(result).toEqual([])
    })

    it("빈 문자열을 변환하면 빈 배열을 반환한다", () => {
      const result = tagsToArray("")
      expect(result).toEqual([])
    })

    it("쉼표로 구분된 태그를 배열로 변환한다", () => {
      const result = tagsToArray("태그1,태그2,태그3")
      expect(result).toEqual(["태그1", "태그2", "태그3"])
    })
  })

  describe("truncateExcerpt", () => {
    it("지정된 길이 이하의 텍스트는 그대로 반환한다", () => {
      const text = "짧은 텍스트"
      const result = truncateExcerpt(text, 100)
      expect(result).toBe(text)
    })

    it("지정된 길이를 초과하면 ...를 추가한다", () => {
      const text = "a".repeat(150)
      const result = truncateExcerpt(text, 100)
      expect(result).toBe("a".repeat(100) + "...")
      expect(result.length).toBe(103)
    })

    it("기본 길이(100)로 작동한다", () => {
      const text = "a".repeat(150)
      const result = truncateExcerpt(text)
      expect(result).toBe("a".repeat(100) + "...")
    })

    it("지정 길이에서 마지막 공백을 제거하고 자른다", () => {
      const text = "이것은 길이가 20 이상인 긴 텍스트입니다"
      const result = truncateExcerpt(text, 10)
      expect(result).toMatch(/\.\.\.$/)
      expect(result.length).toBeLessThanOrEqual(13) // 10 + "..."
    })
  })

  describe("encodeUrl", () => {
    it("한글을 인코딩한다", () => {
      const result = encodeUrl("맛집")
      expect(result).toMatch(/%[0-9A-F]{2}/)
      expect(decodeURIComponent(result)).toBe("맛집")
    })

    it("특수문자를 인코딩한다", () => {
      const result = encodeUrl("category/name&id=1")
      expect(result).toContain("%")
      expect(decodeURIComponent(result)).toBe("category/name&id=1")
    })

    it("영문은 대부분 그대로 유지된다", () => {
      const result = encodeUrl("restaurant")
      expect(result).toBe("restaurant")
    })
  })

  describe("extractApiErrorMessage", () => {
    it("{ error } JSON 응답이면 그 메시지를 반환한다", async () => {
      const res = new Response(JSON.stringify({ error: "커스텀 에러" }), { status: 400 })
      const result = await extractApiErrorMessage(res, "기본 메시지")
      expect(result).toBe("커스텀 에러")
    })

    it("Vercel 타임아웃처럼 JSON이 아닌 본문(504)이면 사람이 읽을 수 있는 안내 문구를 반환한다", async () => {
      // res.json()이 실패해도 res.text()를 다시 호출하지 않고(body stream already
      // read 방지) 안전하게 폴백하는지가 핵심 - 실측으로 이 순서 버그가 확인됐다.
      const res = new Response("An error occurred with your deployment", { status: 504 })
      const result = await extractApiErrorMessage(res, "기본 메시지")
      expect(result).toContain("시간이 초과")
    })

    it("JSON도 아니고 504도 아니면 원문 텍스트를 그대로 반환한다", async () => {
      const res = new Response("Internal Server Error", { status: 500 })
      const result = await extractApiErrorMessage(res, "기본 메시지")
      expect(result).toBe("Internal Server Error")
    })

    it("본문이 완전히 비어있으면 기본 메시지를 반환한다", async () => {
      const res = new Response("", { status: 500 })
      const result = await extractApiErrorMessage(res, "기본 메시지")
      expect(result).toBe("기본 메시지")
    })
  })
})
