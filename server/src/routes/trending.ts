// 热搜榜：热门视频 top10（互动量 = 点赞+评论+分享）+ 热门话题 top10（#话题 从标题/描述聚合）
import { Router } from 'express'
import { prisma } from '../prisma'
import { getAuth } from '../auth'
import { toVideoItem, loadUserFlags, type VideoRow } from '../videoMapper'

export const trendingRouter = Router()

// 提取文本中的 #话题 标签（1-20 字，非空白/#）
function extractTags(text: string): string[] {
  const out: string[] = []
  const re = /#([^#\s]{1,20})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1])
  return out
}

trendingRouter.get('/', async (_req, res) => {
  const rows: VideoRow[] = await prisma.video.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: {
      author: { select: { id: true, nickname: true } },
      _count: { select: { likes: true, comments: true, collects: true } }
    }
  })

  // 热门视频：互动量降序 top10
  const hot = [...rows]
    .sort(
      (a, b) =>
        b._count.likes + b._count.comments + b.shares -
        (a._count.likes + a._count.comments + a.shares)
    )
    .slice(0, 10)

  // 话题聚合：#标签 出现次数降序 top10
  const tagCount = new Map<string, number>()
  for (const v of rows) {
    for (const t of extractTags(`${v.title} ${v.description}`)) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
    }
  }
  const keywords = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }))

  res.json({ videos: hot.map((v) => toVideoItem(v, new Set(), new Set())), keywords })
})
