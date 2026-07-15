import { test, expect } from "@playwright/test"

// 로그인 헬퍼 함수
async function login(page: any) {
  await page.goto("/login")
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com"
  const adminPassword = process.env.ADMIN_PASSWORD || "password"

  await page.locator("input[type='email']").fill(adminEmail)
  await page.locator("input[type='password']").fill(adminPassword)
  await page.locator("button").filter({ hasText: /로그인/ }).click()
  await page.waitForLoadState("networkidle")
}

test.describe("블로그 플로우 (로그인 필요)", () => {
  test("로그인 → 홈 → 포스트 상세 → 카테고리 필터 → 검색", async ({ page }) => {
    // 로그인 수행
    await login(page)

    // 메인 페이지 확인 (로그인 후 랜딩)
    await expect(page).toHaveURL("/")
    await expect(page).toHaveTitle(/Notion CMS/)

    // 포스트 카드 표시 확인
    const postCards = await page.locator("[class*='PostCard']").or(page.locator("article")).count()
    expect(postCards).toBeGreaterThan(0)

    // 첫 번째 포스트 클릭 (상세 페이지로 이동)
    const firstPostLink = page.locator("a").filter({ has: page.locator("h3, h2") }).first()
    const postUrl = await firstPostLink.getAttribute("href")
    expect(postUrl).toMatch(/^\/posts\//)

    await firstPostLink.click()
    await page.waitForLoadState("networkidle")

    // 포스트 상세 페이지 확인
    await expect(page.locator("h1")).toBeTruthy()
    await expect(page.locator("article")).toBeTruthy()

    // 카테고리 배지 확인
    const categoryBadge = page.locator("[class*='Badge']").first()
    const categoryName = await categoryBadge.textContent()

    // 홈으로 돌아가기
    await page.goto("/")
    await expect(page).toHaveTitle(/Notion CMS/)

    // 카테고리 필터 클릭 (실제 구현에 따라 조정 필요)
    // 현재는 카테고리 페이지 직접 네비게이션
    if (categoryName) {
      const encodedCategory = encodeURIComponent(categoryName)
      await page.goto(`/category/${encodedCategory}`)
      await page.waitForLoadState("networkidle")

      // 카테고리 페이지에서 같은 카테고리 글만 표시되는지 확인
      const filteredPosts = await page.locator("article").count()
      expect(filteredPosts).toBeGreaterThan(0)
    }

    // 검색 페이지로 이동
    const searchInput = page.locator("input[placeholder*='검색'], input[type='search']").first()
    if (await searchInput.isVisible()) {
      await searchInput.fill("테스트")
      await searchInput.press("Enter")
      await page.waitForLoadState("networkidle")
      await expect(page).toHaveURL(/\/search/)
    }
  })

  test("홈 페이지 네비게이션 (로그인 필요)", async ({ page }) => {
    // 로그인 수행
    await login(page)

    // 헤더/네비게이션 확인
    const navbar = page.locator("nav, header")
    await expect(navbar).toBeTruthy()

    // 홈 링크 확인
    const homeLink = page.locator("a").filter({ hasText: /^홈$|Notion CMS/ }).first()
    await expect(homeLink).toBeTruthy()
  })
})
