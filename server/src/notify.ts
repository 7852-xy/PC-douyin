// 通知写入助手：actor 对 recipient 触发 type 动作。自通知（actor===recipient）跳过。
import { prisma } from './prisma'
import { cache, notifUnreadKey } from './cache'

type NotifType = 'like' | 'comment' | 'follow' | 'comment_like'

export async function notify(opts: {
  type: NotifType
  actorId: string
  recipientId: string
  videoId?: string
  commentId?: string
}) {
  if (opts.actorId === opts.recipientId) return // 不通知自己
  await prisma.notification.create({
    data: {
      type: opts.type,
      actorId: opts.actorId,
      recipientId: opts.recipientId,
      videoId: opts.videoId ?? null,
      commentId: opts.commentId ?? null
    }
  })
  await cache.del(notifUnreadKey(opts.recipientId)) // 未读数 +1，缓存失效
}
