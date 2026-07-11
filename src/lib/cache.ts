// 메모리 기반 TTL 캐시 (Phase 4에서 Redis로 교체 가능하도록 인터페이스 단순화)

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

/**
 * 캐시에서 값 조회 (만료 시 undefined 반환 및 자동 삭제)
 */
export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined

  // 만료 시간 초과 여부 확인
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }

  return entry.value as T
}

/**
 * 캐시에 값 저장 (기본 TTL 5분)
 */
export function setCached<T>(key: string, value: T, ttlMs = 5 * 60 * 1000): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

/**
 * 캐시 초기화 (key 미지정 시 전체 삭제)
 */
export function clearCache(key?: string): void {
  if (key) {
    store.delete(key)
  } else {
    store.clear()
  }
}
