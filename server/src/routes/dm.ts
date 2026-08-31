// 私信：1:1 会话/消息线程/发送/标记已读/未读总数（轮询模型，无 WebSocket）
import { Router } from 'express'
import { prisma } from '../prisma'
import { requireAuth, getAuth } from '../auth'

export const dmRouter = Router()

const userSelect = { select: { id: true, nickname: true } }

// ---------- 会话列表（按对端聚合：最后一条消息 + 未读数） ----------
dmRouter.get('/conversations', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  const rows = await prisma.message.findMany({
    where: { OR: [{ senderId: me }, { recipientId: me }] },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { sender: userSelect, recipient: userSelect }
  })

  interface Conv {
    user: { id: string; nickname: string; avatar: string }
    lastMessage: string
    lastAt: string
    unread: number
    fromMe: boolean
  }
  const map = new Map<string, Conv>()
  for (const m of rows) {
    const fromMe = m.senderId === me
    const peerId = fromMe ? m.recipientId : m.senderId
    const peer = fromMe ? m.recipient : m.sender
    let conv = map.get(peerId)
    if (!conv) {
      conv = {
        user: { id: peer.id, nickname: peer.nickname, avatar: '' },
        lastMessage: m.content,
        lastAt: m.createdAt.toISOString(),
        unread: 0,
        fromMe
      }
      map.set(peerId, conv)
    }
    if (!fromMe && !m.readAt) conv.unread++
  }
  const conversations = [...map.values()]
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, 50)
  res.json({ conversations })
})

// ---------- 与某人的消息线程（倒序分页，返回正序） ----------
dmRouter.get('/with/:userId', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  const peerId = String(req.params.userId)
  const limit = Math.min(Number(req.query.limit) || 30, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const rows = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: me, recipientId: peerId },
        { senderId: peerId, recipientId: me }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { sender: userSelect }
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? page[page.length - 1].id : null

  res.json({
    messages: [...page].reverse().map((m) => ({
      id: m.id,
      fromMe: m.senderId === me,
      from: { id: m.sender.id, nickname: m.sender.nickname, avatar: '' },
      content: m.content,
      read: !!m.readAt,
      createdAt: m.createdAt.toISOString()
    })),
    nextCursor
  })
})

// ---------- 发送私信 ----------
dmRouter.post('/:userId', requireAuth, async (req, res) => {
  const me = getAuth(req)!
  const peerId = String(req.params.userId)
  const content = String(req.body?.content ?? '').trim()
  if (!content) return res.status(400).json({ error: '消息不能为空' })
  if (content.length > 500) return res.status(400).json({ error: '消息最多 500 字' })
  if (me.sub === peerId) return res.status(400).json({ error: '不能给自己发私信' })
  const peer = await prisma.user.findUnique({ where: { id: peerId }, select: { id: true } })
  if (!peer) return res.status(404).json({ error: '用户不存在' })

  const m = await prisma.message.create({
    data: { content, senderId: me.sub, recipientId: peerId }
  })
  res.json({
    message: {
      id: m.id,
      fromMe: true,
      from: { id: me.sub, nickname: me.nickname, avatar: '' },
      content: m.content,
      read: false,
      createdAt: m.createdAt.toISOString()
    }
  })
})

// ---------- 标记与某人的会话全部已读 ----------
dmRouter.post('/read/:userId', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  const peerId = String(req.params.userId)
  await prisma.message.updateMany({
    where: { recipientId: me, senderId: peerId, readAt: null },
    data: { readAt: new Date() }
  })
  res.json({ ok: true })
})

// ---------- 未读总数（侧栏徽标轮询用） ----------
dmRouter.get('/unread-count', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  const count = await prisma.message.count({ where: { recipientId: me, readAt: null } })
  res.json({ count })
})
