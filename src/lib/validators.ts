import { SearchQuery } from "@/types"

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 검색 쿼리 유효성 검증
 */
export function validateSearchQuery(query: SearchQuery): ValidationResult {
  const errors: string[] = []

  if (!query.query?.trim()) {
    errors.push("검색어를 입력해주세요.")
  }

  if (query.query && query.query.trim().length > 200) {
    errors.push("검색어는 200자 이하로 입력해주세요.")
  }

  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    errors.push("limit은 1~100 사이의 정수여야 합니다.")
  }

  if (!Number.isInteger(query.offset) || query.offset < 0) {
    errors.push("offset은 0 이상의 정수여야 합니다.")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 포스트 ID 유효성 검증
 */
export function validatePostId(id: string): ValidationResult {
  const errors: string[] = []

  if (!id?.trim()) {
    errors.push("포스트 ID가 필요합니다.")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 카테고리명 유효성 검증
 */
export function validateCategory(category: string): ValidationResult {
  const errors: string[] = []

  if (!category?.trim()) {
    errors.push("카테고리명이 필요합니다.")
  }

  if (category && category.length > 50) {
    errors.push("카테고리명은 50자 이하여야 합니다.")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
