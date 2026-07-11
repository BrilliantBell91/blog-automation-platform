import { db } from "../src/lib/db"
import { hashPassword } from "../src/lib/auth"

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD 환경변수가 필요합니다.")
  }

  const passwordHash = await hashPassword(password)

  await db.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "관리자",
    },
    update: {
      passwordHash,
    },
  })

  console.log(`관리자 계정 시드 완료: ${email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
