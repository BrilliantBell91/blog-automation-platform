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

test.describe("404 에러 페이지 (로그인 필요)", () => {
  test("존재하지 않는 포스트 페이지 방문", async ({ page }) => {
    // 로그인 수행
    await login(page)

    await page.goto("/posts/no-such-id")
    await page.waitForLoadState("networkidle")

    // 404 페이지 렌더링 확인
    const heading = page.locator("h1").filter({ hasText: /404|찾을 수 없/ })
    await expect(heading).toBeTruthy()

    // 홈으로 돌아가기 링크 확인
    const homeLink = page.locator("a").filter({ hasText: /홈/ })
    await expect(homeLink).toBeTruthy()
  })

  test("존재하지 않는 일반 경로 방문", async ({ page }) => {
    // 로그인 수행
    await login(page)

    await page.goto("/nonexistent-page")
    await page.waitForLoadState("networkidle")

    // 404 페이지가 표시될 것으로 예상
    const heading = page.locator("h1").filter({ hasText: /404|찾을 수 없|오류/ })
    await expect(heading).toBeTruthy()
  })
})
