import type { CommentItem } from '../types'

// Mock 评论种子数据：每条视频预置几条，后续接后端时只换数据层。
let seq = 0
const mk = (
  videoId: string,
  nickname: string,
  content: string,
  likes: number,
  createdAt: string
): CommentItem => ({
  id: `c${++seq}`,
  videoId,
  author: { id: `uc${seq}`, nickname, avatar: '' },
  content,
  likes,
  createdAt
})

export const seedComments: Record<string, CommentItem[]> = {
  v1: [
    mk('v1', '城市漫游者', '这个机位绝了，求坐标！', 342, '12分钟前'),
    mk('v1', 'Luna', '每一帧都能当壁纸 🌃', 128, '30分钟前'),
    mk('v1', '深夜摄影师', '调色参数分享一下呗', 56, '1小时前')
  ],
  v2: [
    mk('v2', '背包客阿凯', '这才是生活啊，羡慕了', 891, '5分钟前'),
    mk('v2', '小鱼干', '目的地是哪里？周末也想冲', 233, '22分钟前'),
    mk('v2', '风一样的女子', 'BGM 也太搭了吧', 77, '2小时前')
  ],
  v3: [
    mk('v3', '摸鱼大师', '看完立刻给自己泡了杯咖啡 ☕', 456, '8分钟前'),
    mk('v3', '橘座本座', '猫：铲屎的又拍我', 302, '40分钟前'),
    mk('v3', '慢半拍', '治愈了，白天再累也值了', 98, '3小时前')
  ],
  v4: [
    mk('v4', '机车少年', '风自由我也自由 🏍️', 666, '3分钟前'),
    mk('v4', 'Safety First', '帅是帅，头盔戴好！', 512, '18分钟前'),
    mk('v4', '追光者', '这条路跑山太爽了', 145, '1小时前')
  ],
  v5: [
    mk('v5', '街舞社社长', '最后一轮的 freeze 直接封神 🔥', 1024, '1分钟前'),
    mk('v5', 'Bboy 小白', '有人知道这场的比赛名字吗', 388, '15分钟前'),
    mk('v5', '节拍器', '这 Beat 求歌名！', 201, '50分钟前')
  ]
}
