import { useEffect } from 'react'
import { useVideoStore } from '../stores/videoStore'

// 全局键盘控制：
//  ↑ / ↓   上一条 / 下一条视频
//  空格    暂停 / 播放
//  L       点赞当前视频
export function useKeyControls() {
  const goNext = useVideoStore((s) => s.goNext)
  const goPrev = useVideoStore((s) => s.goPrev)
  const togglePause = useVideoStore((s) => s.togglePause)
  const toggleLike = useVideoStore((s) => s.toggleLike)
  const currentId = useVideoStore((s) => s.current.id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          goNext()
          break
        case 'ArrowUp':
          e.preventDefault()
          goPrev()
          break
        case ' ':
          e.preventDefault()
          togglePause()
          break
        case 'l':
        case 'L':
          toggleLike(currentId)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, togglePause, toggleLike, currentId])
}
