import { SearchQuery } from "@/types"

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 검색 쿼리 유효성 검증
 */
export function validateSearchQuery(query: SearchQuery): ValidationResult {
  throw new Error("Not implemented — Task 007")
}

/**
 * 포스트 ID 유효성 검증
 */
export function validatePostId(id: string): ValidationResult {
  throw new Error("Not implemented — Task 007")
}

/**
 * 카테고리명 유효성 검증
 */
export function validateCategory(category: string): ValidationResult {
  throw new Error("Not implemented — Task 007")
}
