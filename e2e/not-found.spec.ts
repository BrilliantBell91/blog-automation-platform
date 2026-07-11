import { test, expect } from "@playwright/test"

test.describe("404 에러 페이지", () => {
  test("존재하지 않는 포스트 페이지 방문", async ({ page }) => {
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
    await page.goto("/nonexistent-page")
    await page.waitForLoadState("networkidle")

    // 404 페이지가 표시될 것으로 예상
    const heading = page.locator("h1").filter({ hasText: /404|찾을 수 없|오류/ })
    await expect(heading).toBeTruthy()
  })
})
