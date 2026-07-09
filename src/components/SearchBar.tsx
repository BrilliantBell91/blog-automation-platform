"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface SearchBarProps {
  defaultValue?: string
  /** label-input 연결용 id. 같은 페이지에 SearchBar가 여러 번 렌더링될 때(예: 데스크톱/모바일 동시 마운트) id 충돌을 막기 위해 호출부에서 고유값을 지정 */
  id?: string
}

const DEBOUNCE_MS = 400

export function SearchBar({ defaultValue = "", id = "search-input" }: SearchBarProps) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const query = value.trim()
      router.replace(query ? `/search?q=${encodeURIComponent(query)}` : "/search")
    }, DEBOUNCE_MS)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        const query = value.trim()
        router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search")
      }}
      className="flex w-full items-center gap-2"
    >
      <label htmlFor={id} className="sr-only">
        검색어
      </label>
      {/* min-w-0: flex 아이템 기본 min-width(auto)로 인해 좁은 뷰포트에서 버튼이 밀려나거나 잘리는 것을 방지 */}
      <Input
        id={id}
        type="search"
        placeholder="검색..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-full min-w-0"
      />
      {/* size="icon"(36px) 대신 h-11 w-11(44px)로 터치 타깃 확보 */}
      <Button
        type="submit"
        size="icon"
        variant="outline"
        aria-label="검색"
        className="h-11 w-11 shrink-0"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  )
}
