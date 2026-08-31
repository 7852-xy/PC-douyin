import { create } from 'zustand'
import { api, ApiError, setToken } from '../api/client'
import { useAppStore } from './appStore'
import { useUserStore } from './userStore'
import { useFollowStore } from './followStore'
import type { UserProfile, VideoItem } from '../types'

// 用户主页 store：查看他人或自己主页的资料 + 视频。
// local 模式无真实用户表，降级为空态（profile=null）。
interface ProfileState {
  loading: boolean
  profile: UserProfile | null
  videos: VideoItem[]
  videosCursor: string | null
  videosHasMore: boolean
  loadingVideos: boolean
  loadProfile: (userId: string) => Promise<void>
  loadMoreVideos: (userId: string) => Promise<void>
  // 关注切换：乐观更新 followers/isFollowing，server 模式同步
  toggleFollow: (userId: string) => void
  reset: () => void
}

const isServer = () => useAppStore.getState().mode === 'server'

function handleAuth(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    setToken(null)
    useUserStore.setState({ current: null })
    return true
  }
  return false
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  loading: false,
  profile: null,
  videos: [],
  videosCursor: null,
  videosHasMore: false,
  loadingVideos: false,

  loadProfile: async (userId) => {
    if (!isServer()) {
      set({ profile: null, videos: [] })
      return
    }
    set({ loading: true, profile: null, videos: [], videosCursor: null, videosHasMore: false })
    try {
      const [p, v] = await Promise.all([
        api<UserProfile>(`/api/users/${userId}`),
        api<{ videos: VideoItem[]; nextCursor: string | null }>(`/api/users/${userId}/videos?limit=12`)
      ])
      set({
        profile: p,
        videos: v.videos.map((x) => ({
          ...x,
          videoUrl: x.videoUrl.startsWith('http') ? x.videoUrl : '' // 主页网格用封面，不预载视频
        })),
        videosCursor: v.nextCursor,
        videosHasMore: v.nextCursor !== null
      })
    } catch (e) {
      handleAuth(e)
    } finally {
      set({ loading: false })
    }
  },

  loadMoreVideos: async (userId) => {
    const { videosCursor, loadingVideos, videosHasMore } = get()
    if (!isServer() || loadingVideos || !videosHasMore || !videosCursor) return
    set({ loadingVideos: true })
    try {
      const r = await api<{ videos: VideoItem[]; nextCursor: string | null }>(
        `/api/users/${userId}/videos?limit=12&cursor=${encodeURIComponent(videosCursor)}`
      )
      set((s) => ({
        videos: [...s.videos, ...r.videos.map((x) => ({ ...x, videoUrl: '' }))],
        videosCursor: r.nextCursor,
        videosHasMore: r.nextCursor !== null
      }))
    } catch (e) {
      handleAuth(e)
    } finally {
      set({ loadingVideos: false })
    }
  },

  toggleFollow: (userId) => {
    const p = get().profile
    if (!p || p.id !== userId) return
    // 乐观更新
    const before = p.isFollowing
    set({
      profile: {
        ...p,
        isFollowing: !before,
        followers: p.followers + (before ? -1 : 1)
      }
    })
    useFollowStore.getState().setFollowed(userId, !before)
    if (!isServer()) return
    void api<{ isFollowing: boolean }>(`/api/users/${userId}/follow`, { method: 'POST' })
      .then((r) => {
        set((s) => (s.profile ? { profile: { ...s.profile, isFollowing: r.isFollowing } } : {}))
        useFollowStore.getState().setFollowed(userId, r.isFollowing)
      })
      .catch((e) => {
        if (handleAuth(e)) return
        // 回滚
        set((s) =>
          s.profile ? { profile: { ...s.profile, isFollowing: before, followers: p.followers } } : {}
        )
        useFollowStore.getState().setFollowed(userId, before)
      })
  },

  reset: () =>
    set({ profile: null, videos: [], videosCursor: null, videosHasMore: false, loading: false })
}))
