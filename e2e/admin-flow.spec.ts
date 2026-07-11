import { test, expect } from "@playwright/test"

test.describe("관리자 대시보드 플로우", () => {
  test("로그인 → 초안 관리 대시보드", async ({ page }) => {
    // 로그인 페이지 방문
    await page.goto("/login")
    await expect(page).toHaveTitle(/로그인/)

    // 관리자 계정 정보 (테스트용)
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com"
    const adminPassword = process.env.ADMIN_PASSWORD || "password"

    // 로그인 폼 작성
    const emailInput = page.locator("input[type='email']")
    const passwordInput = page.locator("input[type='password']")

    await emailInput.fill(adminEmail)
    await passwordInput.fill(adminPassword)

    // 로그인 버튼 클릭
    const loginButton = page.locator("button").filter({ hasText: /로그인/ })
    await loginButton.click()

    // 대시보드 로드 대기
    await page.waitForLoadState("networkidle")

    // 로그인 성공 확인 (초안 관리 페이지로 리다이렉트)
    await expect(page).toHaveURL("/admin/drafts")
    await expect(page.locator("h1, h2").filter({ hasText: /초안|관리|대시보드/ })).toBeTruthy()
  })

  test("미인증 사용자는 관리자 페이지 접근 불가", async ({ page }) => {
    // 쿠키/세션 없이 관리자 페이지 접근 시도
    await page.goto("/admin/drafts")

    // 로그인 페이지로 리다이렉트되는지 확인
    await page.waitForLoadState("networkidle")
    expect(page.url()).toContain("/login")
  })
})
