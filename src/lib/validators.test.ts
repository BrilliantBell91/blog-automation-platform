import { describe, it, expect } from "vitest"
import {
  validateSearchQuery,
  validatePostId,
  validateCategory,
} from "./validators"

describe("validators", () => {
  describe("validateSearchQuery", () => {
    it("유효한 쿼리를 검증한다", () => {
      const result = validateSearchQuery({
        query: "검색어",
        limit: 10,
        offset: 0,
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("빈 검색어는 실패한다", () => {
      const result = validateSearchQuery({
        query: "",
        limit: 10,
        offset: 0,
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("검색어를 입력해주세요.")
    })

    it("공백만 있는 검색어는 실패한다", () => {
      const result = validateSearchQuery({
        query: "   ",
        limit: 10,
        offset: 0,
      })
      expect(result.valid).toBe(false)
    })

    it("200자 초과는 실패한다", () => {
      const result = validateSearchQuery({
        query: "a".repeat(201),
        limit: 10,
        offset: 0,
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("검색어는 200자 이하로 입력해주세요.")
    })

    it("200자는 통과한다", () => {
      const result = validateSearchQuery({
        query: "a".repeat(200),
        limit: 10,
        offset: 0,
      })
      expect(result.valid).toBe(true)
    })

    it("limit이 0이면 실패한다", () => {
      const result = validateSearchQuery({
        query: "검색어",
        limit: 0,
        offset: 0,
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("limit은 1~100 사이의 정수여야 합니다.")
    })

    it("limit이 100 초과면 실패한다", () => {
      const result = validateSearchQuery({
        query: "검색어",
        limit: 101,
        offset: 0,
      })
      expect(result.valid).toBe(false)
    })

    it("offset이 음수면 실패한다", () => {
      const result = validateSearchQuery({
        query: "검색어",
        limit: 10,
        offset: -1,
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("offset은 0 이상의 정수여야 합니다.")
    })

    it("offset이 0은 통과한다", () => {
      const result = validateSearchQuery({
        query: "검색어",
        limit: 10,
        offset: 0,
      })
      expect(result.valid).toBe(true)
    })
  })

  describe("validatePostId", () => {
    it("유효한 ID를 검증한다", () => {
      const result = validatePostId("valid-id-123")
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("빈 ID는 실패한다", () => {
      const result = validatePostId("")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("포스트 ID가 필요합니다.")
    })

    it("공백만 있는 ID는 실패한다", () => {
      const result = validatePostId("   ")
      expect(result.valid).toBe(false)
    })
  })

  describe("validateCategory", () => {
    it("유효한 카테고리를 검증한다", () => {
      const result = validateCategory("맛집")
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("빈 카테고리는 실패한다", () => {
      const result = validateCategory("")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("카테고리명이 필요합니다.")
    })

    it("공백만 있는 카테고리는 실패한다", () => {
      const result = validateCategory("   ")
      expect(result.valid).toBe(false)
    })

    it("50자 카테고리는 통과한다", () => {
      const result = validateCategory("a".repeat(50))
      expect(result.valid).toBe(true)
    })

    it("50자 초과는 실패한다", () => {
      const result = validateCategory("a".repeat(51))
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("카테고리명은 50자 이하여야 합니다.")
    })
  })
})
