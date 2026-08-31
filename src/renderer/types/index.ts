// 视频作者
export interface Author {
  id: string
  nickname: string
  avatar: string
}

// 单条视频
export interface VideoItem {
  id: string
  title: string
  description: string
  author: Author
  videoUrl: string
  coverUrl: string
  music: string
  duration: number
  likes: number
  comments: number
  collects: number
  shares: number
  collected: boolean
  liked: boolean
}

// 评论
export interface Comment {
  id: string
  videoId: string
  author: Author
  content: string
  likes: number
  createdAt: string
}

// 带交互状态的评论（本地点赞）
export interface CommentItem extends Comment {
  liked?: boolean
}

// 用户主页资料
export interface UserProfile {
  id: string
  nickname: string
  avatar: string
  videos: number
  followers: number
  following: number
  likes: number
  isFollowing: boolean
}

// 通知类型
export type NotificationType = 'like' | 'comment' | 'follow' | 'comment_like'

export interface NotificationItem {
  id: string
  type: NotificationType
  actor: Author
  videoId: string | null
  videoTitle: string | null
  commentId: string | null
  read: boolean
  createdAt: string
}

// 私信会话（按对端聚合）
export interface ConversationItem {
  user: Author
  lastMessage: string
  lastAt: string
  unread: number
  fromMe: boolean
}

// 单条私信
export interface MessageItem {
  id: string
  fromMe: boolean
  from: Author
  content: string
  read: boolean
  createdAt: string
}
