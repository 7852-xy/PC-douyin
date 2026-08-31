import { useState } from 'react'
import { useAppStore } from '../stores/appStore'

// 顶部搜索框：回车触发搜索视图。仅在 server 模式有意义（离线无真实用户/视频库）。
export default function SearchBar() {
  const setView = useAppStore((s) => s.setView)
  const mode = useAppStore((s) => s.mode)
  const [q, setQ] = useState('')

  if (mode !== 'server') return null

  return (
    <div className="absolute top-3 right-4 z-30">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // 空回车 → 热搜榜
          if (e.key === 'Enter') setView({ type: 'search', q: q.trim() })
        }}
        placeholder="搜索作者 / 视频"
        className="w-56 bg-neutral-800/90 rounded-full px-4 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-pink-500/70"
      />
    </div>
  )
}
