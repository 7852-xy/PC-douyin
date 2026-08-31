import { Router } from 'express'
import { prisma } from '../prisma'
import { getAuth, optionalAuth, requireAuth } from '../auth'
import { toVideoItem, loadUserFlags, type VideoRow } from '../videoMapper'
import { notify } from '../notify'
import { cache, profileCountsKey } from '../cache'

export const usersRouter = Router()

// ---------- 用户主页资料 ----------
usersRouter.get('/:id', optionalAuth, async (req, res) => {
  const id = String(req.params.id)

  // 资料计数走缓存（无 Redis 时 no-op）；isFollowing 始终实时计算，不缓存
  let profile = await cache.get<{
    nickname: string
    videos: number
    followers: number
    following: number
    likes: number
  }>(profileCountsKey(id))
  if (!profile) {
    const u = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nickname: true,
        _count: {
          select: { videos: true, followers: true, following: true }
        }
      }
    })
    if (!u) return res.status(404).json({ error: '用户不存在' })

    // 收到的点赞总数 = 自己的视频被点赞的总次数（跨视频聚合）
    const receivedLikes = await prisma.like.count({ where: { video: { authorId: id } } })
    profile = {
      nickname: u.nickname,
      videos: u._count.videos,
      followers: u._count.followers,
      following: u._count.following,
      likes: receivedLikes
    }
    await cache.set(profileCountsKey(id), profile, 300)
  }

  const me = getAuth(req)?.sub
  const isFollowing = me
    ? !!(await prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: me, followeeId: id } }
      }))
    : false

  res.json({
    id,
    nickname: profile.nickname,
    avatar: '',
    videos: profile.videos,
    followers: profile.followers,
    following: profile.following,
    likes: profile.likes,
    isFollowing
  })
})

// ---------- 某用户的视频列表（分页） ----------
usersRouter.get('/:id/videos', optionalAuth, async (req, res) => {
  const authorId = String(req.params.id)
  const limit = Math.min(Number(req.query.limit) || 10, 30)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const rows: VideoRow[] = await prisma.video.findMany({
    where: { authorId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, nickname: true } },
      _count: { select: { likes: true, comments: true, collects: true } }
    }
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const flags = await loadUserFlags(getAuth(req)?.sub, page.map((v) => v.id))

  res.json({
    videos: page.map((v) => toVideoItem(v, flags.liked, flags.collected)),
    nextCursor: hasMore ? page[page.length - 1].id : null
  })
})

// ---------- 关注/取关切换 ----------
usersRouter.post('/:id/follow', requireAuth, async (req, res) => {
  const me = getAuth(req)!.sub
  const targetId = String(req.params.id)
  if (me === targetId) return res.status(400).json({ error: '不能关注自己' })

  const existing = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: me, followeeId: targetId } }
  })
  if (existing) {
    await prisma.follow.delete({
      where: { followerId_followeeId: { followerId: me, followeeId: targetId } }
    })
  } else {
    await prisma.follow.create({ data: { followerId: me, followeeId: targetId } })
    await notify({ type: 'follow', actorId: me, recipientId: targetId })
  }
  // 关注关系变化影响双方的 followers/following 计数缓存
  await Promise.all([cache.del(profileCountsKey(me)), cache.del(profileCountsKey(targetId))])
  res.json({ isFollowing: !existing })
})
