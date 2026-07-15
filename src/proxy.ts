import { auth } from "@/auth"
import { NextResponse } from "next/server"

export const proxy = auth((req) => {
  // 로그인하지 않은 사용자가 /login이 아닌 다른 경로에 접근하면 /login으로 리다이렉트
  if (!req.auth && req.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin))
  }
})

export const config = {
  // API 라우트, 정적 파일, 이미지 최적화는 proxy 대상에서 제외
  // /login 자체는 matcher에 포함되지만 proxy에서 처리하지 않으므로 정상 렌더링됨
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
