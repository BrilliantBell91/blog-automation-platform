import "dotenv/config"
import { createClient } from "@libsql/client"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations")

async function main() {
  const url = process.env.DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || !url.startsWith("libsql://")) {
    throw new Error(
      "DATABASE_URL이 libsql:// 형식이 아닙니다. Turso 원격 DB URL을 설정하세요."
    )
  }

  const client = createClient({ url, authToken })

  const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  console.log(`총 ${migrationDirs.length}개 마이그레이션을 Turso에 적용합니다.`)

  for (const dir of migrationDirs) {
    const sqlPath = join(MIGRATIONS_DIR, dir, "migration.sql")
    const sql = readFileSync(sqlPath, "utf-8")

    console.log(`\n[적용 중] ${dir}`)
    await client.executeMultiple(sql)
    console.log(`[완료] ${dir}`)
  }

  console.log("\n모든 마이그레이션이 Turso에 성공적으로 적용되었습니다.")
  client.close()
}

main().catch((err) => {
  console.error("마이그레이션 적용 실패:", err)
  process.exit(1)
})
