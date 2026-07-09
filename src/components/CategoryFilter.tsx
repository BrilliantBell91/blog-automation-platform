import Link from "next/link"
import { cn } from "@/lib/utils"
import { encodeUrl } from "@/lib/formatters"

interface CategoryFilterProps {
  categories: string[]
  activeCategory?: string
}

export function CategoryFilter({ categories, activeCategory }: CategoryFilterProps) {
  const chipClass = (isActive: boolean) =>
    cn(
      "flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      isActive ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent"
    )

  return (
    // 카테고리 필터는 페이지 이동을 수행하는 링크 그룹이므로 nav로 마크업
    // (aria-pressed는 role="button" 요소 전용이라 링크에는 aria-current="page" 사용)
    <nav className="flex flex-wrap gap-2" aria-label="카테고리 필터">
      <Link
        href="/"
        aria-current={activeCategory === undefined ? "page" : undefined}
        className={chipClass(activeCategory === undefined)}
      >
        전체
      </Link>
      {categories.map((category) => (
        <Link
          key={category}
          href={`/category/${encodeUrl(category)}`}
          aria-current={activeCategory === category ? "page" : undefined}
          className={chipClass(activeCategory === category)}
        >
          {category}
        </Link>
      ))}
    </nav>
  )
}
