import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useVideoPlayer } from '../hooks/useVideoPlayer'
import { useVideoStore } from '../stores/videoStore'
import { useAppStore } from '../stores/appStore'
import ActionBar from './ActionBar'
import type { VideoItem } from '../types'

interface Props {
  video: VideoItem
  active: boolean
}

// 双击点赞的大心动效
interface Burst {
  id: number
  x: number
  y: number
}

export default function VideoCard({ video, active }: Props) {
  const paused = useVideoStore((s) => s.paused)
  const togglePause = useVideoStore((s) => s.togglePause)
  const toggleLike = useVideoStore((s) => s.toggleLike)
  const setView = useAppStore((s) => s.setView)
  const videoRef = useVideoPlayer(active && !paused)

  const [bursts, setBursts] = useState<Burst[]>([])

  // 双击点赞：未点赞时自动点赞 + 在点击位置爆出大心
  const onDoubleClick = (e: React.MouseEvent) => {
    if (!video.liked) toggleLike(video.id)
    const id = Date.now() + Math.random()
    setBursts((b) => [...b, { id, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }])
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 900)
  }

  return (
    <div
      className="relative h-full w-full bg-black overflow-hidden cursor-pointer select-none"
      onClick={togglePause}
      onDoubleClick={onDoubleClick}
    >
      <video
        ref={videoRef}
        src={video.videoUrl}
        poster={video.coverUrl || undefined}
        className="h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />

      {/* 双击点赞大心 */}
      <AnimatePresence>
        {bursts.map((b) => (
          <motion.span
            key={b.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.4, 1.1], opacity: [0, 1, 1] }}
            exit={{ scale: 1.3, opacity: 0, y: -40, transition: { duration: 0.35 } }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="absolute text-pink-500 text-6xl pointer-events-none drop-shadow-lg"
            style={{ left: b.x - 32, top: b.y - 48 }}
          >
            ♥
          </motion.span>
        ))}
      </AnimatePresence>

      {/* 暂停遮罩 */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
            <span className="text-white text-3xl ml-1">▶</span>
          </div>
        </div>
      )}

      {/* 渐变遮罩，让底部信息更易读 */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* 底部信息 */}
      <div className="absolute left-4 right-20 bottom-5 space-y-2 pointer-events-none">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setView({ type: 'profile', userId: video.author.id })
          }}
          className="pointer-events-auto text-white font-semibold drop-shadow hover:text-pink-400"
        >
          @{video.author.nickname}
        </button>
        <p className="text-sm text-neutral-100 line-clamp-2 drop-shadow">{video.description}</p>
        <div className="flex items-center gap-1 text-xs text-neutral-200 drop-shadow">
          <span>🎵</span>
          <span className="truncate max-w-[60%]">{video.music}</span>
        </div>
      </div>

      {/* 右侧操作栏 */}
      <ActionBar video={video} />
    </div>
  )
}
