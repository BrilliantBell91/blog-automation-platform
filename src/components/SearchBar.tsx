"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface SearchBarProps {
  defaultValue?: string
}

const DEBOUNCE_MS = 400

export function SearchBar({ defaultValue = "" }: SearchBarProps) {
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
      <label htmlFor="search-input" className="sr-only">
        검색어
      </label>
      <Input
        id="search-input"
        type="search"
        placeholder="검색..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full"
      />
      <Button type="submit" size="icon" variant="outline" aria-label="검색">
        <Search className="h-4 w-4" />
      </Button>
    </form>
  )
}
