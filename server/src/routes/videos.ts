import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { prisma } from '../prisma'
import { getStorage } from '../storage'
import { getAuth, optionalAuth, requireAuth } from '../auth'
import { toVideoItem, loadUserFlags, type VideoRow } from '../videoMapper'
import { notify } from '../notify'
import { cache, profileCountsKey } from '../cache'

export const videosRouter = Router()

// ---------- 上传配置 ----------
const ALLOWED_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi'])
const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo'
])
const MAX_SIZE = 200 * 1024 * 1024 // 200MB

// 单 multer 实例同时接 video（必填）与 cover（可选图片）。
// memoryStorage：文件进 file.buffer，由 storage.saveUpload 统一落盘/传 S3（local/S3 同一契约）。
// fileFilter 按 fieldname 分流校验：video 走视频类型，cover 走图片类型。
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'cover') {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        cb(new Error('封面仅支持 jpg/png/webp'))
        return
      }
      cb(null, true)
      return
    }
    // video 字段
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('仅支持 mp4/webm/mov/mkv/avi 视频文件'))
      return
    }
    cb(null, true)
  },
  limits: { fileSize: MAX_SIZE }
})

// .fields：video 必填、cover 可选
const uploadMiddleware = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
])

// ---------- 视频流（cursor 分页，倒序） ----------
videosRouter.get('/', optionalAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 30)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const rows: VideoRow[] = await prisma.video.findMany({
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

// ---------- 关注的人的视频流 ----------
videosRouter.get('/following', requireAuth, async (req, res) => {
  const userId = getAuth(req)!.sub
  const limit = Math.min(Number(req.query.limit) || 10, 30)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  // 我关注的所有人 id
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followeeId: true }
  })
  const ids = follows.map((f) => f.followeeId)
  if (!ids.length) return res.json({ videos: [], nextCursor: null })

  const rows: VideoRow[] = await prisma.video.findMany({
    where: { authorId: { in: ids } },
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
  const flags = await loadUserFlags(userId, page.map((v) => v.id))

  res.json({
    videos: page.map((v) => toVideoItem(v, flags.liked, flags.collected)),
    nextCursor: hasMore ? page[page.length - 1].id : null
  })
})

// ---------- 上传（video 必填，cover 可选） ----------
videosRouter.post('/', requireAuth, uploadMiddleware, async (req, res) => {
  const files = (req as any).files as
    | { video?: Express.Multer.File[]; cover?: Express.Multer.File[] }
    | undefined
  const videoFile = files?.video?.[0]
  if (!videoFile) return res.status(400).json({ error: '请选择视频文件' })
  const title =
    String(req.body?.title ?? '')
      .trim()
      .slice(0, 50) || path.parse(videoFile.originalname).name.slice(0, 50)
  const description = String(req.body?.description ?? '')
    .trim()
    .slice(0, 200)
  const auth = getAuth(req)!
  const storage = getStorage()
  const videoKey = await storage.saveUpload(
    { buffer: videoFile.buffer, originalname: videoFile.originalname, mimetype: videoFile.mimetype },
    'video'
  )
  const coverFile = files?.cover?.[0]
  const coverKey = coverFile
    ? await storage.saveUpload(
        { buffer: coverFile.buffer, originalname: coverFile.originalname, mimetype: coverFile.mimetype },
        'cover'
      )
    : ''

  const video = await prisma.video.create({
    data: {
      title,
      description,
      filename: videoKey,
      cover: coverKey,
      authorId: auth.sub,
      duration: Number(req.body?.duration) || 0
    },
    include: {
      author: { select: { id: true, nickname: true } },
      _count: { select: { likes: true, comments: true, collects: true } }
    }
  })

  // 新视频改变作者的 videos 计数缓存
  await cache.del(profileCountsKey(auth.sub))

  res.json({ video: toVideoItem(video, new Set(), new Set()) })
})

// ---------- 点赞切换 ----------
videosRouter.post('/:id/like', requireAuth, async (req, res) => {
  const userId = getAuth(req)!.sub
  const videoId = String(req.params.id)
  // 作者查询提到顶部：两个分支都需要做计数缓存失效
  const v = await prisma.video.findUnique({ where: { id: videoId }, select: { authorId: true } })
  const existing = await prisma.like.findUnique({
    where: { userId_videoId: { userId, videoId } }
  })
  if (existing) {
    await prisma.like.delete({ where: { userId_videoId: { userId, videoId } } })
  } else {
    await prisma.like.create({ data: { userId, videoId } })
    // 通知视频作者被点赞
    if (v) await notify({ type: 'like', actorId: userId, recipientId: v.authorId, videoId })
  }
  // 点赞数变化影响作者的 likes 计数缓存
  if (v) await cache.del(profileCountsKey(v.authorId))
  const likes = await prisma.like.count({ where: { videoId } })
  res.json({ liked: !existing, likes })
})

// ---------- 分享计数（匿名可点，幂等无所谓——每次分享 +1） ----------
videosRouter.post('/:id/share', async (req, res) => {
  const videoId = String(req.params.id)
  try {
    const v = await prisma.video.update({
      where: { id: videoId },
      data: { shares: { increment: 1 } },
      select: { shares: true }
    })
    res.json({ shares: v.shares })
  } catch {
    res.status(404).json({ error: '视频不存在' })
  }
})

// ---------- 收藏切换 ----------
videosRouter.post('/:id/collect', requireAuth, async (req, res) => {
  const userId = getAuth(req)!.sub
  const videoId = String(req.params.id)
  const existing = await prisma.collect.findUnique({
    where: { userId_videoId: { userId, videoId } }
  })
  if (existing) await prisma.collect.delete({ where: { userId_videoId: { userId, videoId } } })
  else await prisma.collect.create({ data: { userId, videoId } })
  res.json({ collected: !existing })
})

// ---------- 评论 ----------
videosRouter.get('/:id/comments', optionalAuth, async (req, res) => {
  const videoId = String(req.params.id)
  const rows = await prisma.comment.findMany({
    where: { videoId },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, nickname: true } },
      _count: { select: { likes: true } }
    }
  })
  const userId = getAuth(req)?.sub
  const myLikes = userId
    ? await prisma.commentLike.findMany({ where: { userId, commentId: { in: rows.map((c) => c.id) } } })
    : []
  const likedSet = new Set(myLikes.map((l) => l.commentId))

  res.json({
    comments: rows.map((c) => ({
      id: c.id,
      videoId: c.videoId,
      author: { id: c.author.id, nickname: c.author.nickname, avatar: '' },
      content: c.content,
      likes: c._count.likes,
      liked: likedSet.has(c.id),
      createdAt: c.createdAt.toISOString()
    }))
  })
})

videosRouter.post('/:id/comments', requireAuth, async (req, res) => {
  const content = String(req.body?.content ?? '').trim()
  if (!content) return res.status(400).json({ error: '评论不能为空' })
  if (content.length > 200) return res.status(400).json({ error: '评论最多 200 字' })
  const auth = getAuth(req)!
  const videoId = String(req.params.id)
  const comment = await prisma.comment.create({
    data: { content, videoId, authorId: auth.sub },
    include: {
      author: { select: { id: true, nickname: true } },
      _count: { select: { likes: true } }
    }
  })
  // 通知视频作者被评论
  const v = await prisma.video.findUnique({ where: { id: videoId }, select: { authorId: true } })
  if (v) await notify({ type: 'comment', actorId: auth.sub, recipientId: v.authorId, videoId })

  res.json({
    comment: {
      id: comment.id,
      videoId: comment.videoId,
      author: { id: comment.author.id, nickname: comment.author.nickname, avatar: '' },
      content: comment.content,
      likes: 0,
      liked: false,
      createdAt: comment.createdAt.toISOString()
    }
  })
})

// ---------- 评论点赞切换 ----------
videosRouter.post('/comments/:commentId/like', requireAuth, async (req, res) => {
  const userId = getAuth(req)!.sub
  const commentId = String(req.params.commentId)
  const existing = await prisma.commentLike.findUnique({
    where: { userId_commentId: { userId, commentId } }
  })
  if (existing) {
    await prisma.commentLike.delete({ where: { userId_commentId: { userId, commentId } } })
  } else {
    await prisma.commentLike.create({ data: { userId, commentId } })
    // 通知评论作者被点赞
    const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true, videoId: true } })
    if (c) await notify({ type: 'comment_like', actorId: userId, recipientId: c.authorId, videoId: c.videoId ?? undefined, commentId })
  }
  const likes = await prisma.commentLike.count({ where: { commentId } })
  res.json({ liked: !existing, likes })
})
