import { isRedisEnabled } from './config'
import Redis from 'ioredis'

// 缓存抽象：无 Redis 全 no-op（沙箱默认，55 测试不受影响）；
// 有 Redis 用 ioredis + JSON 序列化。正确性不依赖缓存（DB 永远真源），缓存仅减压。
// 所有 cache 调用都 try/catch 吞错——缓存故障不得影响主流程。

let _redis: Redis | null = null
function redis(): Redis | null {
  if (!isRedisEnabled()) return null
  if (!_redis) _redis = new Redis(process.env.REDIS_URL!)
  return _redis
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const r = redis()
    if (!r) return null
    try {
      const v = await r.get(key)
      if (v == null) return null
      return JSON.parse(v) as T
    } catch {
      return null
    }
  },
  async set(key: string, val: unknown, ttlSec: number): Promise<void> {
    const r = redis()
    if (!r) return
    try {
      await r.set(key, JSON.stringify(val), 'EX', ttlSec)
    } catch {
      /* 缓存失败不影响主流程 */
    }
  },
  async del(key: string): Promise<void> {
    const r = redis()
    if (!r) return
    try {
      await r.del(key)
    } catch {
      /* 忽略 */
    }
  },
  async delByPrefix(prefix: string): Promise<void> {
    const r = redis()
    if (!r) return
    try {
      let cursor = '0'
      do {
        const [next, keys] = await r.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)
        cursor = next
        if (keys.length) await r.del(...keys)
      } while (cursor !== '0')
    } catch {
      /* 忽略 */
    }
  }
}

// 用户主页计数（videos/followers/following/likes + nickname），TTL 300s
export function profileCountsKey(userId: string): string {
  return `profile:counts:${userId}`
}

// 通知未读数（高频轮询），TTL 60s
export function notifUnreadKey(userId: string): string {
  return `notif:unread:${userId}`
}
