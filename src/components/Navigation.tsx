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
          {/* 이모지는 순수 장식 요소이므로 스크린리더가 "블로그" 텍스트만 읽도록 처리 */}
          <span aria-hidden="true">📝</span> 블로그
        </Link>

        {/* 데스크톱: 검색바 + 로그인 버튼을 한 줄에 표시 */}
        <div className="hidden flex-1 items-center gap-4 md:flex">
          <div className="max-w-xs flex-1">
            <SearchBar id="nav-search-desktop" />
          </div>
          {/* 기본 버튼 높이(h-9=36px)는 44px 터치 타깃 기준에 못 미쳐 h-11로 보정 */}
          <Button variant="ghost" asChild className="h-11 shrink-0">
            <Link href="/login">로그인</Link>
          </Button>
        </div>

        {/* 모바일: 햄버거 메뉴로 검색/카테고리/로그인 노출 */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="메뉴 열기" className="h-11 w-11">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>메뉴</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Sheet는 Radix Portal로 body 직속에 렌더링되어 상단 <nav>의 id="search-input"과
                    분리해야 라벨-인풋 연결이 중복되지 않음 */}
                <SearchBar id="nav-search-mobile" />
                {/* Sheet 콘텐츠가 <nav> 바깥(Portal)에 렌더링되므로 카테고리 링크 목록을
                    별도의 nav 랜드마크로 감싸 스크린리더 탐색이 가능하도록 함 */}
                <nav aria-label="카테고리 메뉴" className="space-y-2">
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
                </nav>
                <Button variant="outline" asChild className="h-11 w-full">
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
