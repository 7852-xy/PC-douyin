import { PrismaClient } from '@prisma/client'

// PrismaClient 单例（dev 热重载防重复实例）
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// 自保底：未设 DATABASE_URL 时回落到本地 sqlite 文件（dev/沙箱默认路径）。
// 生产设 DATABASE_URL=postgresql://... 即切 Postgres（须先 db:generate:pg 重生成 postgres 客户端）。
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:./dev.db'

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error']
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
