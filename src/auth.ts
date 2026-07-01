import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        // 실제 프로젝트에서는 DB 조회 + 비밀번호 해싱 검증으로 교체
        if (credentials?.email === "admin@example.com" && credentials?.password === "password") {
          return { id: "1", name: "관리자", email: "admin@example.com" }
        }
        return null
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
})
