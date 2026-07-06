interface CategoryFilterProps {
  categories: string[]
  activeCategory?: string
}

export function CategoryFilter({
  categories,
  activeCategory,
}: CategoryFilterProps) {
  return (
    <div className="flex gap-2">
      {/* TODO Task 004: 각 카테고리 버튼, 활성 상태 표시, 클릭 동작 */}
      {categories.map((category) => (
        <button
          key={category}
          className={`rounded px-3 py-1 text-sm ${
            activeCategory === category
              ? "bg-primary text-primary-foreground"
              : "border"
          }`}
        >
          {category}
        </button>
      ))}
    </div>
  )
}
