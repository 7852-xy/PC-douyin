import jwt from 'jsonwebtoken'
import { randomUUID, createHash } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { jwtSecret, isRefreshEnabled, accessTtlMin } from './config'
import { isBlacklisted } from './tokenBlacklist'

// 惰性读取密钥：避免模块加载期捕获（env.ts 已先于业务模块加载 .env，
// 惰性取也兼容运行时翻转 env 与 refresh 轮换分支）。
function getSecret(): string {
  return jwtSecret()
}

export interface JwtPayload {
  sub: string
  nickname: string
  /** access token 的唯一 id（refresh 开启时签发），用于黑名单吊销 */
  jti?: string
  /** token 类型：refresh 开启时 access 带 'access'，requireAuth 拒绝非 access */
  type?: 'access' | 'refresh'
  /** 过期时间（秒，jwt 自动注入），logout 黑名单 TTL 用 */
  exp?: number
}

// 签发 access token：
//   refresh 开启 → {sub,nickname,jti,type:'access'}，expiresIn = accessTtlMin()m
//   refresh 关闭 → {sub,nickname}，expiresIn = '7d'（兼容旧沙箱分支，55 测试零改动）
export function signToken(payload: JwtPayload): string {
  if (isRefreshEnabled()) {
    return jwt.sign(
      { sub: payload.sub, nickname: payload.nickname, jti: randomUUID(), type: 'access' },
      getSecret(),
      { expiresIn: `${accessTtlMin()}m` }
    )
  }
  return jwt.sign({ sub: payload.sub, nickname: payload.nickname }, getSecret(), { expiresIn: '7d' })
}

// 签发不透明 refresh token（UUID，本身不携带用户信息；验证靠 DB 里的 sha256 hash + 过期/撤销）
export function signRefreshToken(): string {
  return randomUUID()
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload
  } catch {
    return null
  }
}

// 从请求头解析 Bearer token（可选：解析失败返回 null）
export function parseBearer(req: Request): string | null {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return null
  return h.slice(7)
}

// 必须登录的中间件（async：refresh 开启时需查 jti 黑名单）
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseBearer(req)
  const payload = token ? verifyToken(token) : null
  if (!payload) {
    res.status(401).json({ error: '未登录或登录已过期' })
    return
  }
  // refresh 开启时校验 type 与 jti 黑名单；关闭时 token 无 type/jti，检查自动跳过
  if (payload.type && payload.type !== 'access') {
    res.status(401).json({ error: '令牌类型错误' })
    return
  }
  if (payload.jti && (await isBlacklisted(payload.jti))) {
    res.status(401).json({ error: '登录已失效，请重新登录' })
    return
  }
  ;(req as Request & { auth: JwtPayload }).auth = payload
  next()
}

// 可选登录：有 token 就解析（feed 需要知道"我"是否点过赞）
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = parseBearer(req)
  const payload = token ? verifyToken(token) : null
  if (payload) (req as Request & { auth?: JwtPayload }).auth = payload
  next()
}

export function getAuth(req: Request): JwtPayload | undefined {
  return (req as Request & { auth?: JwtPayload }).auth
}
