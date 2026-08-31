import { isRedisEnabled } from './config'

// access token 的 jti 黑名单：logout 时把当前 access 的 jti 加黑名单（TTL=剩余寿命），
// 后续请求命中即 401。
//
// 后端存储：Redis 在 → 持久化 SETEX/EXISTS（多实例共享）；无 Redis → 进程内 Map（单实例够用）。
// 注：ioredis 依赖在 Phase 4 引入；当前 isRedisEnabled() 为 true 时仍回落到内存 Map
//     （单实例 prod 可用，多实例需 Phase 4 的 Redis 共享——届时把下方 Redis 分支替换为 cache.get/set）。
//
// 沙箱内 refresh 关闭（JWT_REFRESH_ENABLED 未设）→ signToken 不签 jti → 本模块恒不被命中，55 测试不受影响。

const mem = new Map<string, number>() // jti -> 过期 epoch(ms)

export async function isBlacklisted(jti: string): Promise<boolean> {
  if (isRedisEnabled()) {
    // Phase 4 接入 cache.ts 后：return Boolean(await cache.get(`blacklist:jti:${jti}`))
  }
  const exp = mem.get(jti)
  if (exp === undefined) return false
  if (exp < Date.now()) {
    mem.delete(jti)
    return false
  }
  return true
}

export async function blacklist(jti: string, ttlSec: number): Promise<void> {
  if (ttlSec <= 0) return
  if (isRedisEnabled()) {
    // Phase 4 接入后：await cache.set(`blacklist:jti:${jti}`, '1', ttlSec); return
  }
  mem.set(jti, Date.now() + ttlSec * 1000)
  // 惰性清理过期项，防 Map 无限增长
  if (mem.size > 1024) {
    const now = Date.now()
    for (const [k, e] of mem) if (e < now) mem.delete(k)
  }
}
