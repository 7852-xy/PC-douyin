import { useEffect } from 'react'
import { useProfileStore } from '../stores/profileStore'
import { useAppStore } from '../stores/appStore'
import { useUserStore } from '../stores/userStore'
import { useVideoStore } from '../stores/videoStore'
import { API_BASE } from '../api/client'
import { formatCount } from '../utils/format'
import type { VideoItem } from '../types'

// 视频封面格：有 coverUrl 显示封面，否则渐变 + 首字母占位
function Cover({ v }: { v: VideoItem }) {
  const cover = v.coverUrl ? (v.coverUrl.startsWith('http') ? v.coverUrl : API_BASE + v.coverUrl) : ''
  return (
    <div className="relative aspect-[9/16] rounded-md overflow-hidden bg-neutral-800 group cursor-pointer">
      {cover ? (
        <img src={cover} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-pink-600/40 to-indigo-600/40 flex items-center justify-center">
          <span className="text-3xl text-white/70 font-bold">{(v.title || '视').charAt(0)}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="absolute left-2 bottom-1.5 text-xs text-white drop-shadow line-clamp-1">
        {v.title}
      </div>
      <div className="absolute right-1.5 top-1.5 text-[10px] text-white/80 bg-black/40 px-1.5 rounded">
        ♥ {formatCount(v.likes)}
      </div>
    </div>
  )
}

export default function UserProfileView() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const me = useUserStore((s) => s.current)
  const { profile, videos, loading, loadProfile, loadMoreVideos, toggleFollow, videosHasMore, loadingVideos } =
    useProfileStore()
  const playVideo = useVideoStore((s) => s.playVideo)

  const userId = view.type === 'profile' ? view.userId : ''

  useEffect(() => {
    if (userId) void loadProfile(userId)
  }, [userId, loadProfile])

  // local 模式或未加载到资料：空态
  if (!profile && !loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-neutral-500">
        <div className="text-5xl mb-3">👤</div>
        <p className="text-sm">离线模式下无法查看用户主页</p>
        <button
          onClick={() => setView({ type: 'feed' })}
          className="mt-5 px-4 py-2 rounded-lg bg-neutral-800 text-white text-sm hover:bg-neutral-700"
        >
          ← 返回
        </button>
      </div>
    )
  }

  if (loading && !profile) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 text-sm">加载中…</div>
    )
  }

  if (!profile) return null
  const isSelf = me?.id === profile.id

  return (
    <div className="h-full overflow-y-auto bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* 返回 */}
        <button
          onClick={() => setView({ type: 'feed' })}
          className="text-sm text-neutral-400 hover:text-white mb-4"
        >
          ← 返回首页
        </button>

        {/* 资料卡 */}
        <div className="flex items-center gap-6 mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-3xl font-bold shrink-0">
            {profile.nickname.charAt(0)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{profile.nickname}</h1>
            <div className="flex gap-6 mt-3 text-sm">
              <span><b className="text-white">{profile.videos}</b> <span className="text-neutral-400">作品</span></span>
              <span><b className="text-white">{formatCount(profile.followers)}</b> <span className="text-neutral-400">粉丝</span></span>
              <span><b className="text-white">{profile.following}</b> <span className="text-neutral-400">关注</span></span>
              <span><b className="text-white">{formatCount(profile.likes)}</b> <span className="text-neutral-400">获赞</span></span>
            </div>
          </div>
          {!isSelf && (
            <button
              onClick={() => toggleFollow(profile.id)}
              className={
                'px-5 py-2 rounded-lg text-sm font-medium transition-colors ' +
                (profile.isFollowing
                  ? 'bg-neutral-800 text-white hover:bg-neutral-700'
                  : 'bg-gradient-to-r from-pink-600 to-pink-500 text-white hover:from-pink-500 hover:to-pink-400')
              }
            >
              {profile.isFollowing ? '已关注' : '+ 关注'}
            </button>
          )}
        </div>

        {/* 作品网格 */}
        <h2 className="text-sm text-neutral-400 mb-3">作品</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-neutral-600 py-10 text-center">还没有发布作品</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {videos.map((v) => (
              <div
                key={v.id}
                onClick={() => {
                  playVideo({ ...v, videoUrl: v.videoUrl || `/media/${(v as any).filename || ''}` })
                  setView({ type: 'feed' })
                }}
              >
                <Cover v={v} />
              </div>
            ))}
          </div>
        )}
        {videosHasMore && (
          <div className="text-center mt-4">
            <button
              onClick={() => void loadMoreVideos(userId)}
              disabled={loadingVideos}
              className="px-4 py-2 rounded-lg bg-neutral-800 text-white text-sm hover:bg-neutral-700 disabled:opacity-40"
            >
              {loadingVideos ? '加载中…' : '加载更多'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
