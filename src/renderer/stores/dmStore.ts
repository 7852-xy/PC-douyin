// 私信 store：会话列表 + 消息线程 + 30s 未读轮询（与 notifyStore 同款模式）
import { create } from 'zustand'
import { api, ApiError, setToken } from '../api/client'
import { useAppStore } from './appStore'
import { useUserStore } from './userStore'
import type { ConversationItem, MessageItem } from '../types'

// 401：token 失效 → 清登录态回到登录页
function handleAuthError(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    setToken(null)
    useUserStore.setState({ current: null })
    return true
  }
  return false
}

interface DmState {
  conversations: ConversationItem[]
  unread: number
  // 当前打开的会话线程（正序）
  thread: MessageItem[]
  threadCursor: string | null
  threadHasMore: boolean
  peer: { id: string; nickname: string } | null
  sending: boolean

  startPolling: () => void
  stopPolling: () => void
  refreshUnread: () => Promise<void>
  refreshConversations: () => Promise<void>
  // 进入聊天页：拉线程 + 标记已读
  openChat: (userId: string, nickname: string) => Promise<void>
  send: (content: string) => Promise<void>
  loadOlder: () => Promise<void>
}

let timer: ReturnType<typeof setInterval> | null = null

// 未读数时序防护：已读操作后会立即 refreshUnread，若 30s 轮询 tick 的在途
// 响应（发起更早）在这之后落地，会把旧未读数盖回去（徽标错误复现 30s）。
// 仅接受比已应用序号更新的响应，stale 响应直接丢弃。
let unreadSeq = 0
let appliedSeq = 0

export const useDmStore = create<DmState>((set, get) => ({
  conversations: [],
  unread: 0,
  thread: [],
  threadCursor: null,
  threadHasMore: false,
  peer: null,
  sending: false,

  startPolling: () => {
    if (timer) return
    void get().refreshUnread()
    timer = setInterval(() => {
      void get().refreshUnread()
      // 停留在会话列表页时顺带刷新列表（在线状态/新会话）
      if (useAppStore.getState().view.type === 'dm') void get().refreshConversations()
    }, 30000)
  },

  stopPolling: () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  },

  refreshUnread: async () => {
    const seq = ++unreadSeq
    try {
      const r = await api<{ count: number }>('/api/dm/unread-count')
      if (seq > appliedSeq) {
        appliedSeq = seq
        set({ unread: r.count })
      }
    } catch (e) {
      handleAuthError(e)
    }
  },

  refreshConversations: async () => {
    try {
      const r = await api<{ conversations: ConversationItem[] }>('/api/dm/conversations')
      set({ conversations: r.conversations })
    } catch (e) {
      handleAuthError(e)
    }
  },

  openChat: async (userId, nickname) => {
    set({ peer: { id: userId, nickname }, thread: [], threadCursor: null, threadHasMore: false })
    try {
      const r = await api<{ messages: MessageItem[]; nextCursor: string | null }>(
        `/api/dm/with/${userId}`
      )
      // 会话可能已被切走（快速点击），仅当还是当前对端时写入
      if (get().peer?.id !== userId) return
      set({ thread: r.messages, threadCursor: r.nextCursor, threadHasMore: r.nextCursor !== null })
      await api(`/api/dm/read/${userId}`, { method: 'POST' }).catch(() => {})
      void get().refreshUnread()
      void get().refreshConversations()
    } catch (e) {
      handleAuthError(e)
    }
  },

  send: async (content) => {
    const p = get().peer
    if (!p || get().sending) return
    set({ sending: true })
    try {
      const r = await api<{ message: MessageItem }>(`/api/dm/${p.id}`, { body: { content } })
      set((s) => ({
        thread: [...s.thread, r.message],
        conversations: s.conversations.map((c) =>
          c.user.id === p.id
            ? { ...c, lastMessage: r.message.content, lastAt: r.message.createdAt, fromMe: true }
            : c
        )
      }))
    } catch (e) {
      if (!handleAuthError(e)) throw e
    } finally {
      set({ sending: false })
    }
  },

  loadOlder: async () => {
    const { peer, threadCursor, threadHasMore } = get()
    if (!peer || !threadHasMore || !threadCursor) return
    try {
      const r = await api<{ messages: MessageItem[]; nextCursor: string | null }>(
        `/api/dm/with/${peer.id}?cursor=${encodeURIComponent(threadCursor)}`
      )
      if (get().peer?.id !== peer.id) return
      set((s) => ({
        thread: [...r.messages, ...s.thread],
        threadCursor: r.nextCursor,
        threadHasMore: r.nextCursor !== null
      }))
    } catch (e) {
      handleAuthError(e)
    }
  }
}))
