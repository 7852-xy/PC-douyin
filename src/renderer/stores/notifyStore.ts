import { create } from 'zustand'
import { api, ApiError, setToken } from '../api/client'
import { useAppStore } from './appStore'
import { useUserStore } from './userStore'
import type { NotificationItem } from '../types'

// 通知 store：未读数轮询 + 列表加载 + 标记已读。仅 server 模式生效。
interface NotifyState {
  list: NotificationItem[]
  unread: number
  loading: boolean
  fetched: boolean
  fetchList: () => Promise<void>
  fetchUnread: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

const isServer = () => useAppStore.getState().mode === 'server'
const isLoggedIn = () => !!useUserStore.getState().current

function handleAuth(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    setToken(null)
    useUserStore.setState({ current: null })
    return true
  }
  return false
}

let timer: ReturnType<typeof setInterval> | null = null

// 未读数时序防护：与 dmStore.refreshUnread 同款——标记已读后若 30s 轮询
// tick 的在途旧响应后落地，会把未读数盖回去（徽标错误复现 30s）。
let unreadSeq = 0
let appliedSeq = 0

export const useNotifyStore = create<NotifyState>((set, get) => ({
  list: [],
  unread: 0,
  loading: false,
  fetched: false,

  fetchList: async () => {
    if (!isServer() || !isLoggedIn()) return
    set({ loading: true })
    try {
      const r = await api<{ notifications: NotificationItem[] }>('/api/notifications')
      set({ list: r.notifications, fetched: true })
    } catch (e) {
      handleAuth(e)
    } finally {
      set({ loading: false })
    }
  },

  fetchUnread: async () => {
    if (!isServer() || !isLoggedIn()) return
    const seq = ++unreadSeq
    try {
      const r = await api<{ count: number }>('/api/notifications/unread-count')
      if (seq > appliedSeq) {
        appliedSeq = seq
        set({ unread: r.count })
      }
    } catch (e) {
      handleAuth(e)
    }
  },

  markRead: async (id) => {
    if (!isServer()) return
    // 乐观：本地置已读 + 未读-1
    set((s) => ({
      list: s.list.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unread: Math.max(0, s.unread - 1)
    }))
    try {
      await api(`/api/notifications/${id}/read`, { method: 'POST' })
    } catch (e) {
      if (handleAuth(e)) return
    }
  },

  markAllRead: async () => {
    if (!isServer()) return
    set((s) => ({ list: s.list.map((n) => ({ ...n, read: true })), unread: 0 }))
    try {
      await api('/api/notifications/read-all', { method: 'POST' })
    } catch (e) {
      if (handleAuth(e)) return
    }
  },

  // 30 秒轮询未读数（仅 server 模式 + 已登录）
  startPolling: () => {
    if (timer) return
    void get().fetchUnread()
    timer = setInterval(() => void get().fetchUnread(), 30000)
  },

  stopPolling: () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
}))
