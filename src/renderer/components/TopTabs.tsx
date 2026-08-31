import { useVideoStore } from '../stores/videoStore'
import { useAppStore } from '../stores/appStore'

// 顶部 tab：推荐/关注可切换。关注 tab 仅 server 模式可用（离线无关注数据）。
export default function TopTabs() {
  const feedTab = useVideoStore((s) => s.feedTab)
  const switchTab = useVideoStore((s) => s.switchTab)
  const mode = useAppStore((s) => s.mode)

  const tabs: { key: 'recommend' | 'following'; label: string }[] =
    mode === 'server'
      ? [
          { key: 'recommend', label: '推荐' },
          { key: 'following', label: '关注' }
        ]
      : [{ key: 'recommend', label: '推荐' }]

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6 py-4">
      {tabs.map((t) => {
        const active = feedTab === t.key
        return (
          <button
            key={t.key}
            onClick={() => void switchTab(t.key)}
            className={
              'relative text-sm transition-colors ' +
              (active ? 'text-white font-semibold' : 'text-neutral-400 hover:text-white')
            }
          >
            {t.label}
            {active && (
              <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-0.5 w-6 bg-white rounded" />
            )}
          </button>
        )
      })}
    </div>
  )
}
