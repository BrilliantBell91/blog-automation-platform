import { PrismaClient } from "@/generated/prisma"
import { PrismaLibSql } from "@prisma/adapter-libsql"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

if (!globalForPrisma.prisma) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다.")
  }

  const adapter = new PrismaLibSql({
    url: databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  globalForPrisma.prisma = new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma
