// 集中导出惰性 env getter：在函数体内读 process.env，
// 避免模块加载期捕获（env.ts 已保证 .env 先于业务模块加载，
// 惰性读取也兼容运行时翻转 env 与单测场景）。所有新模块只从这里读 env。

export function jwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret'
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL || 'file:./dev.db'
}

// 当前是否 Postgres（prod）。dev/沙箱走 sqlite。
// 用于跨 provider 查询分支：如 contains 大小写不敏感——sqlite 默认不敏感无需 mode，
// postgres 默认敏感需 mode:'insensitive' 走 ILIKE。
export function isPostgres(): boolean {
  return databaseUrl().startsWith('postgres')
}

// JWT refresh 轮换：默认关闭（沙箱 55 测试走 7d 单 token 兼容分支）
export function isRefreshEnabled(): boolean {
  return process.env.JWT_REFRESH_ENABLED === 'true'
}

export function isRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL)
}

export function isS3Enabled(): boolean {
  return Boolean(process.env.S3_BUCKET)
}

export function accessTtlMin(): number {
  const n = Number(process.env.ACCESS_TOKEN_TTL_MIN)
  return Number.isFinite(n) && n > 0 ? n : 15
}

export function refreshTtlDays(): number {
  const n = Number(process.env.REFRESH_TOKEN_TTL_DAYS)
  return Number.isFinite(n) && n > 0 ? n : 7
}
