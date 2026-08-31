import { useEffect, useState } from 'react'
import { api, API_BASE } from '../api/client'
import { useAppStore } from '../stores/appStore'
import { useVideoStore } from '../stores/videoStore'
import { formatCount } from '../utils/format'
import type { VideoItem } from '../types'

interface SearchResult {
  videos: VideoItem[]
  users: { id: string; nickname: string; avatar: string }[]
}

interface Trending {
  videos: VideoItem[]
  keywords: { keyword: string; count: number }[]
}

export default function SearchResultsView() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const playVideo = useVideoStore((s) => s.playVideo)
  const q = view.type === 'search' ? view.q : ''
  const isTrending = !q
  const [data, setData] = useState<SearchResult>({ videos: [], users: [] })
  const [trend, setTrend] = useState<Trending | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    if (q) {
      api<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => setData(r))
        .catch(() => setData({ videos: [], users: [] }))
        .finally(() => setLoading(false))
    } else {
      api<Trending>('/api/trending')
        .then((r) => setTrend(r))
        .catch(() => setTrend(null))
        .finally(() => setLoading(false))
    }
  }, [q])

  // 视频网格：搜索结果与热搜榜共用
  const renderVideos = (videos: VideoItem[]) => (
    <div className="grid grid-cols-3 gap-2">
      {videos.map((v) => {
        const cover = v.coverUrl
          ? v.coverUrl.startsWith('http')
            ? v.coverUrl
            : API_BASE + v.coverUrl
          : ''
        return (
          <div
            key={v.id}
            onClick={() => {
              playVideo(v)
              setView({ type: 'feed' })
            }}
            className="relative aspect-[9/16] rounded-md overflow-hidden bg-neutral-800 cursor-pointer group"
          >
            {cover ? (
              <img src={cover} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-600/40 to-indigo-600/40 flex items-center justify-center">
                <span className="text-3xl text-white/70 font-bold">{(v.title || '视').charAt(0)}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute left-2 bottom-1 text-xs text-white line-clamp-1">{v.title}</div>
            <div className="absolute right-1.5 top-1 text-[10px] text-white/80 bg-black/40 px-1.5 rounded">
              ♥ {formatCount(v.likes)}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="h-full overflow-y-auto bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-base">
            {isTrending ? (
              <>
                <span className="text-pink-400">🔥 热搜榜</span>
              </>
            ) : (
              <>
                搜索「<span className="text-pink-400">{q}</span>」
              </>
            )}
          </h1>
          <button
            onClick={() => setView({ type: 'feed' })}
            className="text-sm text-neutral-400 hover:text-white"
          >
            ← 返回
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">加载中…</p>
        ) : isTrending ? (
          trend ? (
            <>
              {trend.keywords.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-sm text-neutral-400 mb-3">热门话题</h2>
                  <div className="flex flex-wrap gap-2">
                    {trend.keywords.map((k, i) => (
                      <button
                        key={k.keyword}
                        onClick={() => setView({ type: 'search', q: k.keyword })}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-sm"
                      >
                        <span className={i < 3 ? 'text-pink-500 font-bold' : 'text-neutral-500'}>
                          {i + 1}
                        </span>
                        <span className="text-pink-300">#{k.keyword}</span>
                        <span className="text-xs text-neutral-500">{formatCount(k.count)} 条</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {trend.videos.length > 0 && (
                <section>
                  <h2 className="text-sm text-neutral-400 mb-3">热门视频</h2>
                  {renderVideos(trend.videos)}
                </section>
              )}
              {trend.keywords.length === 0 && trend.videos.length === 0 && (
                <p className="text-sm text-neutral-600 py-10 text-center">暂无热搜数据</p>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-600 py-10 text-center">热搜暂不可用（离线模式）</p>
          )
        ) : data.users.length === 0 && data.videos.length === 0 ? (
          <p className="text-sm text-neutral-600 py-10 text-center">没有匹配结果</p>
        ) : (
          <>
            {data.users.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm text-neutral-400 mb-3">用户</h2>
                <div className="flex flex-col gap-2">
                  {data.users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setView({ type: 'profile', userId: u.id })}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold">
                        {u.nickname.charAt(0)}
                      </div>
                      <span className="text-sm">{u.nickname}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {data.videos.length > 0 && (
              <section>
                <h2 className="text-sm text-neutral-400 mb-3">视频</h2>
                {renderVideos(data.videos)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
