import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { videos } from '../data/videos'
import { seedComments } from '../data/comments'
import { api, ApiError, setToken, API_BASE } from '../api/client'
import { useAppStore } from './appStore'
import { useUserStore } from './userStore'
import type { VideoItem, CommentItem } from '../types'

// 用户行为覆盖层：仅 local 模式持久化，避免把整份 mock 视频数据冻进 localStorage
interface UserOverlay {
  liked: boolean
  collected: boolean
  likes: number
}

interface PersistedShape {
  overlays: Record<string, UserOverlay>
  comments: Record<string, CommentItem[]>
  uploads: VideoItem[]
}

const isServerMode = () => useAppStore.getState().mode === 'server'

// 401：token 失效 → 清登录态回到登录页
function handleAuthError(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    setToken(null)
    useUserStore.setState({ current: null })
    return true
  }
  return false
}

const buildOverlays = (list: VideoItem[]): Record<string, UserOverlay> =>
  Object.fromEntries(
    list.map((v) => [v.id, { liked: v.liked, collected: v.collected, likes: v.likes }])
  )

interface VideoState {
  list: VideoItem[]
  currentIndex: number
  current: VideoItem
  // 当前视频是否暂停（切到新视频时自动重置为播放）
  paused: boolean
  // 切换方向：1=下一个（上滑出场），-1=上一个
  direction: 1 | -1
  // 评论数据：按 videoId 分组
  comments: Record<string, CommentItem[]>
  // 评论弹层开关
  commentPanelOpen: boolean

  // server 模式分页状态
  feedLoaded: boolean
  loading: boolean
  hasMore: boolean
  cursor: string | null
  // feed 子 tab：recommend 全量 / following 关注的人
  feedTab: 'recommend' | 'following'

  goNext: () => void
  goPrev: () => void
  goTo: (index: number) => void
  togglePause: () => void
  toggleLike: (id: string) => void
  toggleCollect: (id: string) => void
  // 分享：本地 +1；server 模式调 /share 接口回填真实计数
  shareVideo: (id: string) => void
  setCommentPanel: (open: boolean) => void
  addComment: (videoId: string, content: string) => Promise<void>
  toggleCommentLike: (videoId: string, commentId: string) => void
  // 上传/本地模式共用：追加视频并跳转
  addUpload: (video: VideoItem) => void
  // 从主页/搜索网格点开某视频：若已在列表则定位，否则插到队首并播放
  playVideo: (video: VideoItem) => void

  // server 模式专用
  initServerFeed: () => Promise<void>
  loadMore: () => Promise<void>
  fetchComments: (videoId: string) => Promise<void>
  // 切换 feed 子 tab（recommend/following），重新拉流
  switchTab: (tab: 'recommend' | 'following') => Promise<void>
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set, get) => ({
      list: videos,
      currentIndex: 0,
      current: videos[0],
      paused: false,
      direction: 1,
      comments: seedComments,
      commentPanelOpen: false,
      feedLoaded: false,
      loading: false,
      hasMore: false,
      cursor: null,
      feedTab: 'recommend',

      goNext: () => {
        const { currentIndex, list, hasMore, loading, feedLoaded } = get()
        // server 模式：到底部自动翻页
        if (isServerMode() && feedLoaded && currentIndex >= list.length - 1 && hasMore && !loading) {
          void get()
            .loadMore()
            .then(() => {
              const nl = get().list
              const next = Math.min(currentIndex + 1, nl.length - 1)
              if (next !== currentIndex)
                set({ direction: 1, currentIndex: next, current: nl[next], paused: false })
            })
          return
        }
        const next = Math.min(currentIndex + 1, list.length - 1)
        if (next !== currentIndex)
          set({ direction: 1, currentIndex: next, current: list[next], paused: false })
      },

      goPrev: () => {
        const { currentIndex, list } = get()
        const prev = Math.max(currentIndex - 1, 0)
        if (prev !== currentIndex)
          set({ direction: -1, currentIndex: prev, current: list[prev], paused: false })
      },

      goTo: (index) => {
        const { list, currentIndex } = get()
        if (index >= 0 && index < list.length && index !== currentIndex) {
          set({
            direction: index > currentIndex ? 1 : -1,
            currentIndex: index,
            current: list[index],
            paused: false
          })
        }
      },

      togglePause: () => set((s) => ({ paused: !s.paused })),

      toggleLike: (id) => {
        // 乐观更新：先翻状态，server 模式失败则回滚
        const apply = (delta: number, liked: boolean) =>
          set((s) => {
            const patch = (v: VideoItem) =>
              v.id === id ? { ...v, liked, likes: v.likes + delta } : v
            const cur = s.current.id === id ? { ...s.current, liked, likes: s.current.likes + delta } : s.current
            return { list: s.list.map(patch), current: cur }
          })

        const before = get().list.find((v) => v.id === id)
        if (!before) return
        apply(before.liked ? -1 : 1, !before.liked)

        if (!isServerMode()) return
        void api<{ liked: boolean; likes: number }>(`/api/videos/${id}/like`, { method: 'POST' })
          .then((r) => {
            set((s) => {
              const patch = (v: VideoItem) =>
                v.id === id ? { ...v, liked: r.liked, likes: r.likes } : v
              const cur = s.current.id === id ? { ...s.current, liked: r.liked, likes: r.likes } : s.current
              return { list: s.list.map(patch), current: cur }
            })
          })
          .catch((e) => {
            if (handleAuthError(e)) return
            apply(before.liked ? -1 : 1, before.liked) // 回滚
          })
      },

      toggleCollect: (id) => {
        const apply = (collected: boolean) =>
          set((s) => {
            const patch = (v: VideoItem) => (v.id === id ? { ...v, collected } : v)
            const cur = s.current.id === id ? { ...s.current, collected } : s.current
            return { list: s.list.map(patch), current: cur }
          })
        const before = get().list.find((v) => v.id === id)
        if (!before) return
        apply(!before.collected)

        if (!isServerMode()) return
        void api<{ collected: boolean }>(`/api/videos/${id}/collect`, { method: 'POST' })
          .then((r) => apply(r.collected))
          .catch((e) => {
            if (handleAuthError(e)) return
            apply(before.collected)
          })
      },

      shareVideo: (id) => {
        const bump = (delta: number) =>
          set((s) => {
            const patch = (v: VideoItem) => (v.id === id ? { ...v, shares: v.shares + delta } : v)
            const cur = s.current.id === id ? { ...s.current, shares: s.current.shares + delta } : s.current
            return { list: s.list.map(patch), current: cur }
          })
        bump(1)
        if (!isServerMode()) return
        void api<{ shares: number }>(`/api/videos/${id}/share`, { method: 'POST' })
          .then((r) =>
            set((s) => {
              const patch = (v: VideoItem) => (v.id === id ? { ...v, shares: r.shares } : v)
              const cur = s.current.id === id ? { ...s.current, shares: r.shares } : s.current
              return { list: s.list.map(patch), current: cur }
            })
          )
          .catch((e) => {
            if (handleAuthError(e)) return
            bump(-1) // 回滚
          })
      },

      setCommentPanel: (open) => set({ commentPanelOpen: open }),

      addComment: async (videoId, content) => {
        if (isServerMode()) {
          const r = await api<{ comment: CommentItem }>(`/api/videos/${videoId}/comments`, {
            body: { content }
          })
          set((s) => ({
            comments: { ...s.comments, [videoId]: [r.comment, ...(s.comments[videoId] ?? [])] },
            current: s.current.id === videoId ? { ...s.current, comments: s.current.comments + 1 } : s.current
          }))
          return
        }
        const u = useUserStore.getState().current
        const item: CommentItem = {
          id: `my-${Date.now()}`,
          videoId,
          author: { id: u?.id ?? 'me', nickname: u?.nickname ?? '游客', avatar: '' },
          content,
          likes: 0,
          createdAt: '刚刚'
        }
        set((s) => ({ comments: { ...s.comments, [videoId]: [item, ...(s.comments[videoId] ?? [])] } }))
      },

      toggleCommentLike: (videoId, commentId) => {
        const flip = () =>
          set((s) => {
            const list = s.comments[videoId] ?? []
            return {
              comments: {
                ...s.comments,
                [videoId]: list.map((c) =>
                  c.id === commentId
                    ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) }
                    : c
                )
              }
            }
          })
        flip()

        if (!isServerMode()) return
        void api<{ liked: boolean; likes: number }>(`/api/videos/comments/${commentId}/like`, {
          method: 'POST'
        })
          .then((r) =>
            set((s) => ({
              comments: {
                ...s.comments,
                [videoId]: (s.comments[videoId] ?? []).map((c) =>
                  c.id === commentId ? { ...c, liked: r.liked, likes: r.likes } : c
                )
              }
            }))
          )
          .catch((e) => {
            if (handleAuthError(e)) return
            flip() // 回滚
          })
      },

      addUpload: (video) =>
        set((s) => {
          const list = [...s.list, video]
          return {
            list,
            currentIndex: list.length - 1,
            current: video,
            paused: false
          }
        }),

      playVideo: (video) =>
        set((s) => {
          const idx = s.list.findIndex((v) => v.id === video.id)
          if (idx >= 0) {
            return { currentIndex: idx, current: s.list[idx], paused: false }
          }
          // 不在列表：插到队首播放（保留原 list 不破坏 feed 分页）
          const fixed = { ...video, videoUrl: video.videoUrl || '' }
          return {
            list: [fixed, ...s.list],
            currentIndex: 0,
            current: fixed,
            paused: false,
            commentPanelOpen: false
          }
        }),

      // ---------- server 模式 ----------

      // 按 feedTab 拉取首页流：recommend→/api/videos，following→/api/videos/following
      initServerFeed: async () => {
        if (get().feedLoaded || get().loading) return
        set({ loading: true })
        try {
          const tab = get().feedTab
          const path = tab === 'following' ? '/api/videos/following?limit=20' : '/api/videos?limit=20'
          const r = await api<{ videos: VideoItem[]; nextCursor: string | null }>(path)
          const list = r.videos.map((v) => ({
            ...v,
            videoUrl: v.videoUrl.startsWith('http') ? v.videoUrl : API_BASE + v.videoUrl,
            coverUrl: v.coverUrl && !v.coverUrl.startsWith('http') ? API_BASE + v.coverUrl : v.coverUrl
          }))
          set({
            list,
            current: list[0] ?? videos[0],
            currentIndex: 0,
            cursor: r.nextCursor,
            hasMore: r.nextCursor !== null,
            feedLoaded: true,
            paused: false,
            comments: {}
          })
        } catch (e) {
          handleAuthError(e)
        } finally {
          set({ loading: false })
        }
      },

      // 切换 feed 子 tab：重置加载状态并重新拉首页
      switchTab: async (tab) => {
        if (get().feedTab === tab) return
        set({ feedTab: tab, feedLoaded: false, cursor: null, hasMore: false, list: videos, current: videos[0], currentIndex: 0 })
        await get().initServerFeed()
      },

      loadMore: async () => {
        const { cursor, loading, hasMore, feedTab } = get()
        if (loading || !hasMore || !cursor) return
        set({ loading: true })
        try {
          const base = feedTab === 'following' ? '/api/videos/following' : '/api/videos'
          const r = await api<{ videos: VideoItem[]; nextCursor: string | null }>(
            `${base}?limit=20&cursor=${encodeURIComponent(cursor)}`
          )
          const more = r.videos.map((v) => ({
            ...v,
            videoUrl: v.videoUrl.startsWith('http') ? v.videoUrl : API_BASE + v.videoUrl,
            coverUrl: v.coverUrl && !v.coverUrl.startsWith('http') ? API_BASE + v.coverUrl : v.coverUrl
          }))
          set((s) => ({
            list: [...s.list, ...more],
            cursor: r.nextCursor,
            hasMore: r.nextCursor !== null
          }))
        } catch (e) {
          handleAuthError(e)
        } finally {
          set({ loading: false })
        }
      },

      fetchComments: async (videoId) => {
        if (get().comments[videoId]) return // 已加载
        set((s) => ({ comments: { ...s.comments, [videoId]: [] } })) // 占位防重复请求
        try {
          const r = await api<{ comments: CommentItem[] }>(`/api/videos/${videoId}/comments`)
          set((s) => ({ comments: { ...s.comments, [videoId]: r.comments } }))
        } catch (e) {
          handleAuthError(e)
        }
      }
    }),
    {
      name: 'pc-douyin',
      version: 1,
      partialize: (s): PersistedShape => ({
        overlays: buildOverlays(s.list),
        comments: s.comments,
        uploads: s.list.filter((v) => v.id.startsWith('up-')).map((v) => ({ ...v }))
      }),
      // 启动合并：server 模式下数据以服务端为准，跳过本地覆盖层；
      // local 模式把覆盖层合并回 mock 列表，上传视频接到队尾
      merge: (persistedState, currentState) => {
        if (localStorage.getItem('pc-douyin-mode') === 'server') return currentState
        const p = (persistedState ?? {}) as Partial<PersistedShape>
        const overlays = p.overlays ?? {}
        const list = [
          ...currentState.list.map((v) => {
            const o = overlays[v.id]
            return o ? { ...v, liked: o.liked, collected: o.collected, likes: o.likes } : v
          }),
          ...(p.uploads ?? [])
        ]
        return {
          ...currentState,
          list,
          current: list[0] ?? currentState.current,
          comments: p.comments ?? currentState.comments
        }
      }
    }
  )
)
