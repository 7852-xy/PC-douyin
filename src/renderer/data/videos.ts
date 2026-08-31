import type { VideoItem } from '../types'

// Mock 视频数据。第二阶段接入本地视频文件（src/renderer/public/videos/），
// 通过 Vite 静态服务以 /videos/xxx.mp4 访问，离线可播、无跨域与可达性问题。
// 后续接后端时只换数据层即可。
export const videos: VideoItem[] = [
  {
    id: 'v1',
    title: '城市夜景航拍',
    description: '夜色里的灯火与车流，俯瞰整座城市 ✨ #夜景 #航拍',
    author: { id: 'u1', nickname: '航拍小哥', avatar: '' },
    videoUrl: '/videos/v1.mp4',
    coverUrl: '',
    music: '原创音乐 - 夜行',
    duration: 15,
    likes: 12800,
    comments: 326,
    shares: 412,
    collects: 2340,
    collected: false,
    liked: false
  },
  {
    id: 'v2',
    title: '逃离日常',
    description: '周末就该给自己放个假 🏕️ #旅行 #治愈',
    author: { id: 'u2', nickname: '在路上', avatar: '' },
    videoUrl: '/videos/v2.mp4',
    coverUrl: '',
    music: '轻快 BGM - 远行',
    duration: 15,
    likes: 95200,
    comments: 1200,
    shares: 880,
    collects: 6100,
    collected: false,
    liked: false
  },
  {
    id: 'v3',
    title: '快乐就是这么简单',
    description: '一个下午，一只猫，一杯咖啡 ☕ #生活日常',
    author: { id: 'u3', nickname: '慢生活日记', avatar: '' },
    videoUrl: '/videos/v3.mp4',
    coverUrl: '',
    music: '舒缓钢琴曲',
    duration: 15,
    likes: 41200,
    comments: 560,
    shares: 1200,
    collects: 18900,
    collected: false,
    liked: false
  },
  {
    id: 'v4',
    title: '追风少年',
    description: '速度与自由，永远热泪盈眶 🏍️ #机车 #户外',
    author: { id: 'u4', nickname: '追风', avatar: '' },
    videoUrl: '/videos/v4.mp4',
    coverUrl: '',
    music: '炸场 Beat - 狂飙',
    duration: 15,
    likes: 67800,
    comments: 240,
    shares: 660,
    collects: 9800,
    collected: false,
    liked: false
  },
  {
    id: 'v5',
    title: '燃炸现场',
    description: '总决赛最后一轮，气氛顶到天花板 🔥 #街舞 #现场',
    author: { id: 'u5', nickname: '街舞直击', avatar: '' },
    videoUrl: '/videos/v5.mp4',
    coverUrl: '',
    music: '炸场 Beat - Meltdown',
    duration: 15,
    likes: 153000,
    comments: 2100,
    shares: 3300,
    collects: 45200,
    collected: false,
    liked: false
  }
]
