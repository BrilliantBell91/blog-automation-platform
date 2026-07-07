"use client"

import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SearchBar } from "@/components/SearchBar"
import { DEFAULT_CATEGORIES } from "@/constants"
import { encodeUrl } from "@/lib/formatters"

export function Navigation() {
  return (
    <nav aria-label="주 메뉴" className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4">
        <Link href="/" className="shrink-0 text-lg font-bold">
          📝 블로그
        </Link>

        {/* 데스크톱: 검색바 + 로그인 버튼을 한 줄에 표시 */}
        <div className="hidden flex-1 items-center gap-4 md:flex">
          <div className="max-w-xs flex-1">
            <SearchBar />
          </div>
          <Button variant="ghost" asChild className="shrink-0">
            <Link href="/login">로그인</Link>
          </Button>
        </div>

        {/* 모바일: 햄버거 메뉴로 검색/카테고리/로그인 노출 */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="메뉴 열기" className="h-11 w-11">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>메뉴</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <SearchBar />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">카테고리</p>
                  <div className="flex flex-col gap-1">
                    {DEFAULT_CATEGORIES.map((category) => (
                      <Link
                        key={category}
                        href={`/category/${encodeUrl(category)}`}
                        className="flex min-h-11 items-center rounded-md px-2 hover:bg-accent"
                      >
                        {category}
                      </Link>
                    ))}
                  </div>
                </div>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/login">로그인</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  )
}
