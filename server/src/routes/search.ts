import { Router } from 'express'
import { prisma } from '../prisma'
import { optionalAuth, getAuth } from '../auth'
import { isPostgres } from '../config'
import { toVideoItem, loadUserFlags, type VideoRow } from '../videoMapper'

export const searchRouter = Router()

// ---------- 搜索：按视频标题 + 用户昵称模糊匹配 ----------
searchRouter.get('/', optionalAuth, async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  const limit = Math.min(Number(req.query.limit) || 20, 30)
  if (!q) return res.json({ videos: [], users: [] })

  // 跨 provider 大小写不敏感：
  //   sqlite 的 contains 默认对 ASCII 大小写不敏感（LIKE），中文按子串匹配 → 不传 mode
  //   postgres 的 contains 默认大小写敏感 → 需 mode:'insensitive' 走 ILIKE
  // 注意：sqlite 生成的客户端类型不含 mode 字段、运行时也会拒绝 mode 参数；
  //       故仅在 isPostgres() 时注入 mode（spread 自变量，规避 excess property 检查，
  //       两端类型与运行时皆通过）。
  const insMode = isPostgres() ? { mode: 'insensitive' as const } : {}

  const [vrows, users] = await Promise.all([
    prisma.video.findMany({
      where: { title: { contains: q, ...insMode } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: { select: { id: true, nickname: true } },
        _count: { select: { likes: true, comments: true, collects: true } }
      }
    }),
    prisma.user.findMany({
      where: { nickname: { contains: q, ...insMode } },
      take: limit,
      select: { id: true, nickname: true }
    })
  ])

  const flags = await loadUserFlags(getAuth(req)?.sub, (vrows as VideoRow[]).map((v) => v.id))
  res.json({
    videos: (vrows as VideoRow[]).map((v) => toVideoItem(v, flags.liked, flags.collected)),
    users: users.map((u) => ({ id: u.id, nickname: u.nickname, avatar: '' }))
  })
})
