import { create } from 'zustand'
import { api, ApiError, setToken } from '../api/client'
import { useAppStore } from './appStore'
import { useUserStore } from './userStore'

// 关注状态缓存（非持久化）：视频流 ActionBar 的 "+" 角标用它做乐观切换，
// 服务端为真值。打开用户主页时由 profileStore.setFollowed 同步进来。
interface FollowState {
  followed: Record<string, boolean>
  setFollowed: (authorId: string, val: boolean) => void
  toggle: (authorId: string) => void
}

function handleAuth(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    setToken(null)
    useUserStore.setState({ current: null })
    return true
  }
  return false
}

export const useFollowStore = create<FollowState>((set, get) => ({
  followed: {},
  setFollowed: (authorId, val) =>
    set((s) => ({ followed: { ...s.followed, [authorId]: val } })),
  toggle: (authorId) => {
    const before = get().followed[authorId] ?? false
    set((s) => ({ followed: { ...s.followed, [authorId]: !before } }))
    if (useAppStore.getState().mode !== 'server') return
    void api<{ isFollowing: boolean }>(`/api/users/${authorId}/follow`, { method: 'POST' })
      .then((r) => get().setFollowed(authorId, r.isFollowing))
      .catch((e) => {
        if (handleAuth(e)) return
        get().setFollowed(authorId, before) // 回滚
      })
  }
}))
