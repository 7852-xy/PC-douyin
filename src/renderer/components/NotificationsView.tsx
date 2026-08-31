import { useEffect } from 'react'
import { useNotifyStore } from '../stores/notifyStore'
import { useAppStore } from '../stores/appStore'
import { useVideoStore } from '../stores/videoStore'
import type { NotificationItem } from '../types'

// 通知文案：按类型生成
function notifText(n: NotificationItem): { icon: string; text: string } {
  switch (n.type) {
    case 'like':
      return { icon: '♥', text: '赞了你的视频' }
    case 'comment':
      return { icon: '💬', text: '评论了你的视频' }
    case 'follow':
      return { icon: '➕', text: '关注了你' }
    case 'comment_like':
      return { icon: '♥', text: '赞了你的评论' }
    default:
      return { icon: '🔔', text: '' }
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return `${d} 天前`
}

export default function NotificationsView() {
  const { list, loading, fetched, fetchList, markAllRead, markRead } = useNotifyStore()
  const setView = useAppStore((s) => s.setView)
  const playVideo = useVideoStore((s) => s.playVideo)

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const goVideo = (n: NotificationItem) => {
    if (!n.videoId) return
    // 用最小 VideoItem 跳进 feed 播放（title/cover 来自通知）
    playVideo({
      id: n.videoId,
      title: n.videoTitle ?? '',
      description: '',
      author: n.actor,
      videoUrl: '',
      coverUrl: '',
      music: '',
      duration: 0,
      likes: 0,
      comments: 0,
      collects: 0,
      shares: 0,
      collected: false,
      liked: false
    })
    void markRead(n.id)
    setView({ type: 'feed' })
  }

  return (
    <div className="h-full overflow-y-auto bg-neutral-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-base font-semibold">消息通知</h1>
          <div className="flex gap-3">
            {list.some((n) => !n.read) && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-neutral-400 hover:text-white"
              >
                全部已读
              </button>
            )}
            <button
              onClick={() => setView({ type: 'feed' })}
              className="text-sm text-neutral-400 hover:text-white"
            >
              ← 返回
            </button>
          </div>
        </div>

        {loading && !fetched ? (
          <p className="text-sm text-neutral-500">加载中…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-neutral-600 py-10 text-center">暂无通知</p>
        ) : (
          <div className="flex flex-col gap-1">
            {list.map((n) => {
              const { icon, text } = notifText(n)
              return (
                <div
                  key={n.id}
                  className={
                    'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ' +
                    (n.read ? 'hover:bg-neutral-900' : 'bg-pink-600/10 hover:bg-neutral-900')
                  }
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {n.actor.nickname.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <b>{n.actor.nickname}</b>{' '}
                      <span className="text-neutral-300">{text}</span>
                      {n.videoTitle && (
                        <span className="text-neutral-500"> · {n.videoTitle}</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  <span className="text-pink-500 text-lg">{icon}</span>
                  {!n.read && (
                    <span
                      onClick={() => void markRead(n.id)}
                      className="w-2 h-2 rounded-full bg-pink-500 cursor-pointer"
                      title="标记已读"
                    />
                  )}
                  {n.videoId && (
                    <button
                      onClick={() => goVideo(n)}
                      className="text-xs text-pink-400 hover:text-pink-300 ml-1"
                    >
                      查看
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
