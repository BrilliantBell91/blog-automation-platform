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
    <div className="flex flex-wrap gap-2" role="group" aria-label="카테고리 필터">
      <Link
        href="/"
        aria-pressed={activeCategory === undefined}
        className={chipClass(activeCategory === undefined)}
      >
        전체
      </Link>
      {categories.map((category) => (
        <Link
          key={category}
          href={`/category/${encodeUrl(category)}`}
          aria-pressed={activeCategory === category}
          className={chipClass(activeCategory === category)}
        >
          {category}
        </Link>
      ))}
    </div>
  )
}
