import { useEffect, useRef } from 'react'

// 控制 <video> 元素的播放/暂停。
// 调用方传入 playing（= 当前卡片激活 && 未暂停），内部据此调用 play/pause。
// 浏览器自动播放策略要求 video 静音，所以 VideoCard 上 video 需带 muted 属性。
export function useVideoPlayer(playing: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (playing) {
      const tryPlay = () =>
        v.play().catch(() => {
          // 自动播放策略拦截时，静音后重试（Electron 已豁免手势限制，此兜底用于普通浏览器环境）
          v.muted = true
          return v.play().catch(() => {})
        })
      // 立即尝试播放；若数据未就绪，等 canplay 再试
      tryPlay()
      if (v.readyState < 3) {
        v.addEventListener('canplay', tryPlay, { once: true })
      }
    } else {
      v.pause()
    }
  }, [playing])

  return videoRef
}
