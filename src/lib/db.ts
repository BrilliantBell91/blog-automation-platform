import type { PrismaClient } from "@/generated/prisma"
import { PrismaClient as PrismaCl } from "@/generated/prisma"

type GlobalWithPrisma = {
  prisma?: PrismaClient
}

const globalForPrisma = globalThis as GlobalWithPrisma

export const db = (
  globalForPrisma.prisma ||
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (PrismaCl as any)()
) as PrismaClient

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
}
