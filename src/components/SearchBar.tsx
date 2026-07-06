"use client"

import { Input } from "@/components/ui/input"

interface SearchBarProps {
  defaultValue?: string
}

export function SearchBar({ defaultValue = "" }: SearchBarProps) {
  return (
    <div>
      {/* TODO Task 004: 검색 입력, debounce, 제출 동작, 검색 타입 필터 */}
      <Input
        type="search"
        placeholder="검색..."
        defaultValue={defaultValue}
        className="w-full"
      />
    </div>
  )
}
