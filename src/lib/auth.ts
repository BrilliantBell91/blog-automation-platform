import bcryptjs from "bcryptjs"
import { db } from "./db"
import type { User } from "@/generated/prisma/client"

const SALT_ROUNDS = 10

/**
 * 비밀번호를 bcrypt로 해싱
 */
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, SALT_ROUNDS)
}

/**
 * 입력 비밀번호와 저장된 해시 비교
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash)
}

/**
 * 이메일로 사용자 조회
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  return db.user.findUnique({ where: { email } })
}

/**
 * 사용자 생성 또는 비밀번호 갱신 (upsert)
 */
export async function createUser(
  email: string,
  password: string,
  name?: string
): Promise<User> {
  const passwordHash = await hashPassword(password)
  return db.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name,
    },
    update: {
      passwordHash,
      name,
    },
  })
}
