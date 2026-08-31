import { Router } from 'express'
import { prisma } from '../prisma'
import { requireAuth, getAuth } from '../auth'
import { cache, notifUnreadKey } from '../cache'

export const notificationsRouter = Router()

// ---------- 通知列表 ----------
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  const rows = await prisma.notification.findMany({
    where: { recipientId: me },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      actor: { select: { id: true, nickname: true } },
      video: { select: { id: true, title: true } }
    }
  })
  res.json({
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      actor: { id: n.actor.id, nickname: n.actor.nickname, avatar: '' },
      videoId: n.videoId ?? null,
      videoTitle: n.video?.title ?? null,
      commentId: n.commentId ?? null,
      read: n.read,
      createdAt: n.createdAt.toISOString()
    }))
  })
})

// ---------- 未读数（轮询用，轻量） ----------
notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  const cached = await cache.get<number>(notifUnreadKey(me))
  if (cached !== null) return res.json({ count: cached })
  const count = await prisma.notification.count({ where: { recipientId: me, read: false } })
  await cache.set(notifUnreadKey(me), count, 60)
  res.json({ count })
})

// ---------- 标记单条已读 ----------
notificationsRouter.post('/:id/read', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  await prisma.notification.updateMany({
    where: { id: String(req.params.id), recipientId: me },
    data: { read: true }
  })
  await cache.del(notifUnreadKey(me))
  res.json({ ok: true })
})

// ---------- 全部已读 ----------
notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  await prisma.notification.updateMany({
    where: { recipientId: me, read: false },
    data: { read: true }
  })
  await cache.del(notifUnreadKey(me))
  res.json({ ok: true })
})
