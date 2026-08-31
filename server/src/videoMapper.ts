// 视频行形状与映射器：所有视频列表端点（feed/following/profile/search）共用，
// 保证 videoUrl/coverUrl/计数/liked/collected 字段一致。
import { prisma } from './prisma'
import type { Prisma } from '@prisma/client'

export type VideoRow = Prisma.VideoGetPayload<{
  include: {
    author: { select: { id: true; nickname: true } }
    _count: { select: { likes: true; comments: true; collects: true } }
  }
}>

export interface VideoItemOut {
  id: string
  title: string
  description: string
  author: { id: string; nickname: string; avatar: string }
  videoUrl: string
  coverUrl: string
  music: string
  duration: number
  likes: number
  comments: number
  collects: number
  shares: number
  liked: boolean
  collected: boolean
}

// 映射为客户端 VideoItem（videoUrl/coverUrl 为相对路径，客户端拼 API_BASE）
export function toVideoItem(
  v: VideoRow,
  likedIds: Set<string>,
  collectedIds: Set<string>
): VideoItemOut {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    author: { id: v.author.id, nickname: v.author.nickname, avatar: '' },
    videoUrl: `/media/${v.filename}`,
    coverUrl: v.cover ? `/media/${v.cover}` : '',
    music: v.music,
    duration: v.duration,
    likes: v._count?.likes ?? 0,
    comments: v._count?.comments ?? 0,
    collects: v._count?.collects ?? 0,
    shares: v.shares,
    liked: likedIds.has(v.id),
    collected: collectedIds.has(v.id)
  }
}

// 批量加载当前用户对这些视频的 liked/collected 标记
export async function loadUserFlags(userId: string | undefined, videoIds: string[]) {
  const liked = new Set<string>()
  const collected = new Set<string>()
  if (userId && videoIds.length) {
    const [ls, cs] = await Promise.all([
      prisma.like.findMany({ where: { userId, videoId: { in: videoIds } } }),
      prisma.collect.findMany({ where: { userId, videoId: { in: videoIds } } })
    ])
    ls.forEach((l) => liked.add(l.videoId))
    cs.forEach((c) => collected.add(c.videoId))
  }
  return { liked, collected }
}
