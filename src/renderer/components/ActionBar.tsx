import { motion } from 'framer-motion'
import { useVideoStore } from '../stores/videoStore'
import { useAppStore } from '../stores/appStore'
import { useUserStore } from '../stores/userStore'
import { useFollowStore } from '../stores/followStore'
import { formatCount } from '../utils/format'
import type { VideoItem } from '../types'

interface Props {
  video: VideoItem
}

export default function ActionBar({ video }: Props) {
  const toggleLike = useVideoStore((s) => s.toggleLike)
  const toggleCollect = useVideoStore((s) => s.toggleCollect)
  const shareVideo = useVideoStore((s) => s.shareVideo)
  const setCommentPanel = useVideoStore((s) => s.setCommentPanel)
  const setView = useAppStore((s) => s.setView)
  const me = useUserStore((s) => s.current)
  const toggleFollow = useFollowStore((s) => s.toggle)
  const followed = useFollowStore((s) => s.followed[video.author.id] ?? false)
  const isSelf = me?.id === video.author.id

  // 阻止冒泡到 VideoCard 的 togglePause
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  // 分享：计数 +1，复制分享链接到剪贴板（Electron），浏览器降级提示
  const onShare = () => {
    shareVideo(video.id)
    const text = `【PC抖音】${video.title} · ${video.author.nickname}：pcdouyin://video/${video.id}`
    if (window.pcApi?.writeText) {
      void window.pcApi.writeText(text).then(() => window.alert('分享链接已复制到剪贴板'))
    } else {
      window.alert('分享：' + text)
    }
  }

  return (
    <div className="absolute right-3 bottom-5 flex flex-col items-center gap-4 z-20">
      {/* 作者头像（点击进主页）+ 关注角标 */}
      <div className="relative mb-1">
        <button
          onClick={stop(() => setView({ type: 'profile', userId: video.author.id }))}
          className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white font-bold"
          title={`${video.author.nickname} 的主页`}
        >
          {video.author.nickname.charAt(0)}
        </button>
        {!isSelf && (
          <button
            onClick={stop(() => toggleFollow(video.author.id))}
            className={
              'absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center ' +
              (followed ? 'bg-neutral-700' : 'bg-pink-500')
            }
            title={followed ? '已关注' : '关注'}
          >
            {followed ? '✓' : '+'}
          </button>
        )}
      </div>

      {/* 点赞 */}
      <button onClick={stop(() => toggleLike(video.id))} className="flex flex-col items-center gap-1 group">
        <motion.span
          whileTap={{ scale: 0.75 }}
          animate={video.liked ? { scale: [1, 1.45, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
          className={
            'w-11 h-11 rounded-full flex items-center justify-center text-xl transition-colors ' +
            (video.liked
              ? 'bg-pink-600/30 text-pink-500'
              : 'bg-neutral-800/80 text-white group-hover:bg-neutral-700')
          }
        >
          ♥
        </motion.span>
        <span className="text-xs text-white drop-shadow">{formatCount(video.likes)}</span>
      </button>

      {/* 评论 */}
      <button onClick={stop(() => setCommentPanel(true))} className="flex flex-col items-center gap-1 group">
        <motion.span
          whileTap={{ scale: 0.75 }}
          className="w-11 h-11 rounded-full bg-neutral-800/80 text-white flex items-center justify-center text-lg group-hover:bg-neutral-700"
        >
          💬
        </motion.span>
        <span className="text-xs text-white drop-shadow">{formatCount(video.comments)}</span>
      </button>

      {/* 收藏 */}
      <button onClick={stop(() => toggleCollect(video.id))} className="flex flex-col items-center gap-1 group">
        <motion.span
          whileTap={{ scale: 0.75 }}
          animate={video.collected ? { rotate: [0, -20, 0], scale: [1, 1.35, 1] } : {}}
          transition={{ duration: 0.4 }}
          className={
            'w-11 h-11 rounded-full flex items-center justify-center text-xl transition-colors ' +
            (video.collected
              ? 'bg-yellow-600/30 text-yellow-400'
              : 'bg-neutral-800/80 text-white group-hover:bg-neutral-700')
          }
        >
          ★
        </motion.span>
        <span className="text-xs text-white drop-shadow">{formatCount(video.collects)}</span>
      </button>

      {/* 分享 */}
      <button onClick={stop(onShare)} className="flex flex-col items-center gap-1 group">
        <motion.span
          whileTap={{ scale: 0.75 }}
          className="w-11 h-11 rounded-full bg-neutral-800/80 text-white flex items-center justify-center text-xl group-hover:bg-neutral-700"
        >
          ↗
        </motion.span>
        <span className="text-xs text-white drop-shadow">
          {video.shares > 0 ? formatCount(video.shares) : '分享'}
        </span>
      </button>
    </div>
  )
}
