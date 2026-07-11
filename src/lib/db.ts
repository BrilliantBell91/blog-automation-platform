// eslint-disable-next-line @typescript-eslint/no-require-imports
import type { PrismaClient } from "@/generated/prisma"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient: PrismaCl } = require("@prisma/client")

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaCl() as PrismaClient
}

export const db = globalForPrisma.prisma as PrismaClient
