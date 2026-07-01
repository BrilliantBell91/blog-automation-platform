import { auth, signOut } from "@/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default async function Home() {
  const session = await auth()

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Next.js 스타터킷</h1>
          {session?.user ? (
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <Button variant="outline" type="submit">로그아웃</Button>
            </form>
          ) : (
            <Button asChild>
              <Link href="/login">로그인</Link>
            </Button>
          )}
        </div>

        {session?.user && (
          <Card>
            <CardHeader>
              <CardTitle>환영합니다, {session.user.name}님!</CardTitle>
              <CardDescription>{session.user.email}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Next.js 15</CardTitle>
              <CardDescription>App Router + Server Components</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                풀스택 리액트 프레임워크로 빠른 개발이 가능합니다.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Prisma + SQLite</CardTitle>
              <CardDescription>타입 안전한 데이터베이스</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                로컬 SQLite로 즉시 시작하고, 나중에 PostgreSQL로 전환 가능합니다.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>shadcn/ui</CardTitle>
              <CardDescription>아름다운 UI 컴포넌트</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Tailwind CSS 기반의 재사용 가능한 컴포넌트 모음입니다.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
