import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useVideoStore } from '../stores/videoStore'
import { useUserStore } from '../stores/userStore'
import { useAppStore } from '../stores/appStore'
import { useKeyControls } from '../hooks/useKeyControls'
import VideoCard from './VideoCard'
import CommentPanel from './CommentPanel'
import type { VideoItem } from '../types'

export default function VideoFeed() {
  const current = useVideoStore((s) => s.current)
  const direction = useVideoStore((s) => s.direction)
  const goNext = useVideoStore((s) => s.goNext)
  const goPrev = useVideoStore((s) => s.goPrev)
  const feedLoaded = useVideoStore((s) => s.feedLoaded)
  const initServerFeed = useVideoStore((s) => s.initServerFeed)
  const user = useUserStore((s) => s.current)
  const mode = useAppStore((s) => s.mode)
  useKeyControls()

  // server 模式：登录后拉取视频流
  useEffect(() => {
    if (mode === 'server' && user && !feedLoaded) void initServerFeed()
  }, [mode, user, feedLoaded, initServerFeed])

  // ---- 手动双卡过渡 ----
  // 不用 AnimatePresence 的 exit：实测退场动画不完成时旧卡片会永久残留
  // （隐藏但可交互、占内存，还劫持点赞等查询）。改为：切换时暂存旧卡片，
  // 动画 420ms 后确定性地移除。
  const prevRef = useRef<VideoItem>(current)
  const [exiting, setExiting] = useState<VideoItem | null>(null)
  useEffect(() => {
    if (prevRef.current.id === current.id) return
    const old = prevRef.current
    prevRef.current = current
    setExiting(old)
    const t = setTimeout(() => setExiting((e) => (e?.id === old.id ? null : e)), 420)
    return () => clearTimeout(t)
  }, [current])

  // 滚轮切换（节流，避免一次滚动连切多条）
  const lockRef = useRef(false)
  const onWheel = (e: React.WheelEvent) => {
    if (lockRef.current) return
    if (Math.abs(e.deltaY) < 12) return
    lockRef.current = true
    setTimeout(() => (lockRef.current = false), 450)
    if (e.deltaY > 0) goNext()
    else goPrev()
  }

  return (
    <div
      className="flex-1 h-full flex items-center justify-center bg-neutral-950 overflow-hidden"
      onWheel={onWheel}
    >
      {/* 竖屏视频卡片容器，按高度自适应宽度 */}
      <div className="relative h-full aspect-[9/16] max-w-full overflow-hidden">
        {/* 旧卡片：反向滑出淡出（在下层，先渲染） */}
        {exiting && (
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={{
              y: direction > 0 ? '-30%' : '30%',
              opacity: 0.2,
              transition: { type: 'tween', duration: 0.4, ease: 'easeOut' }
            }}
          >
            <VideoCard video={exiting} active={false} />
          </motion.div>
        )}
        {/* 当前卡片：从下方/上方滑入（在上层，后渲染） */}
        <motion.div
          key={current.id}
          className="absolute inset-0"
          initial={{ y: direction > 0 ? '100%' : '-100%' }}
          animate={{ y: 0, transition: { type: 'tween', duration: 0.35, ease: 'easeOut' } }}
        >
          <VideoCard video={current} active />
        </motion.div>

        {/* 评论弹层：单实例，不属于任何一张卡片 */}
        <CommentPanel />
      </div>
    </div>
  )
}
