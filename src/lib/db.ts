import type { PrismaClient } from "@/generated/prisma"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient: PrismaCl } = require("@prisma/client")

const globalForPrisma = globalThis as { prisma?: PrismaClient }

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaCl()
}

export const db = globalForPrisma.prisma
