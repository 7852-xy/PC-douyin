import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../prisma'
import {
  getAuth,
  requireAuth,
  signToken,
  signRefreshToken,
  hashRefreshToken,
  type JwtPayload
} from '../auth'
import { isRefreshEnabled, refreshTtlDays, accessTtlMin } from '../config'
import { blacklist } from '../tokenBlacklist'

export const authRouter = Router()

// 统一的用户公开信息
export function publicUser(u: { id: string; nickname: string }) {
  return { id: u.id, nickname: u.nickname, avatar: '' }
}

// 签发不透明 refresh token 并入库（hash + 过期）。仅在 refresh 开启时调用。
async function issueRefresh(userId: string): Promise<string> {
  const raw = signRefreshToken()
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + refreshTtlDays() * 24 * 60 * 60 * 1000)
    }
  })
  return raw
}

authRouter.post('/register', async (req, res) => {
  const nickname = String(req.body?.nickname ?? '').trim()
  const password = String(req.body?.password ?? '')
  if (nickname.length < 2 || nickname.length > 12)
    return res.status(400).json({ error: '昵称需 2-12 个字符' })
  if (password.length < 4) return res.status(400).json({ error: '密码至少 4 位' })

  const exists = await prisma.user.findUnique({ where: { nickname } })
  if (exists) return res.status(409).json({ error: '该昵称已被注册' })

  const user = await prisma.user.create({
    data: { nickname, passwordHash: await bcrypt.hash(password, 10) }
  })
  const token = signToken({ sub: user.id, nickname: user.nickname })
  if (isRefreshEnabled()) {
    const refreshToken = await issueRefresh(user.id)
    return res.json({ token, refreshToken, user: publicUser(user) })
  }
  res.json({ token, user: publicUser(user) })
})

authRouter.post('/login', async (req, res) => {
  const nickname = String(req.body?.nickname ?? '').trim()
  const password = String(req.body?.password ?? '')
  const user = await prisma.user.findUnique({ where: { nickname } })
  if (!user) return res.status(401).json({ error: '账号不存在，请先注册' })
  if (!(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: '密码错误' })
  const token = signToken({ sub: user.id, nickname: user.nickname })
  if (isRefreshEnabled()) {
    const refreshToken = await issueRefresh(user.id)
    return res.json({ token, refreshToken, user: publicUser(user) })
  }
  res.json({ token, user: publicUser(user) })
})

// refresh 轮换：验旧 refresh（hash + 未过期 + 未撤销）→ 撤销旧 → 签新 access + 新 refresh
authRouter.post('/refresh', async (req, res) => {
  if (!isRefreshEnabled()) return res.status(404).json({ error: 'refresh 未启用' })
  const refreshToken = String(req.body?.refreshToken ?? '')
  if (!refreshToken) return res.status(400).json({ error: '缺少 refreshToken' })
  const found = await prisma.refreshToken.findFirst({
    where: { tokenHash: hashRefreshToken(refreshToken) }
  })
  if (!found || found.revokedAt || found.expiresAt < new Date()) {
    return res.status(401).json({ error: 'refresh 无效或已过期' })
  }
  await prisma.refreshToken.update({
    where: { id: found.id },
    data: { revokedAt: new Date() }
  })
  const user = await prisma.user.findUnique({
    where: { id: found.userId },
    select: { id: true, nickname: true }
  })
  if (!user) return res.status(401).json({ error: '用户不存在' })
  const token = signToken({ sub: user.id, nickname: user.nickname })
  const newRefresh = await issueRefresh(user.id)
  res.json({ token, refreshToken: newRefresh })
})

// 登出：撤销 refresh（如有）+ 把当前 access 的 jti 加黑名单（TTL=剩余寿命）
authRouter.post('/logout', requireAuth, async (req, res) => {
  const auth = getAuth(req)! as JwtPayload
  if (isRefreshEnabled()) {
    const refreshToken = String(req.body?.refreshToken ?? '')
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() }
      })
    }
    if (auth.jti) {
      const remaining = auth.exp
        ? Math.max(0, auth.exp - Math.floor(Date.now() / 1000))
        : accessTtlMin() * 60
      await blacklist(auth.jti, remaining)
    }
  }
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const auth = getAuth(req)!
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id: true, nickname: true }
  })
  if (!user) return res.status(401).json({ error: '用户不存在' })
  res.json({ user: publicUser(user) })
})
