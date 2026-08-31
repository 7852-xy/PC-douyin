import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, setToken, setRefreshToken } from '../api/client'
import { useAppStore } from './appStore'

// 账号体系：server 模式走后端 API（JWT），local 模式用本机 mock（localStorage）。
// 登录态持久化，重启自动恢复；接后端时 UI 无需改动。
// refresh 开启时额外存 refreshToken；client 的 401 拦截器用它单飞刷新。

export interface User {
  id: string
  nickname: string
  avatar: string
}

interface UserRecord extends User {
  password: string
}

interface UserState {
  // 已注册账号表（仅 local 模式使用）
  users: Record<string, UserRecord>
  current: User | null
  login: (nickname: string, password: string) => Promise<string | null>
  register: (nickname: string, password: string, confirm: string) => Promise<string | null>
  loginGuest: () => Promise<void>
  logout: () => void
}

// 返回错误信息；null 表示成功
export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      users: {},
      current: null,

      login: async (nickname, password) => {
        const name = nickname.trim()
        if (!name || !password) return '请输入昵称和密码'
        if (useAppStore.getState().mode === 'server') {
          try {
            const r = await api<{ token: string; refreshToken?: string; user: User }>('/api/auth/login', {
              body: { nickname: name, password }
            })
            setToken(r.token)
            if (r.refreshToken) setRefreshToken(r.refreshToken)
            set({ current: r.user })
            return null
          } catch (e) {
            return e instanceof Error ? e.message : '登录失败'
          }
        }
        const u = get().users[name]
        if (!u) return '账号不存在，请先注册'
        if (u.password !== password) return '密码错误'
        set({ current: { id: u.id, nickname: u.nickname, avatar: u.avatar } })
        return null
      },

      register: async (nickname, password, confirm) => {
        const name = nickname.trim()
        if (name.length < 2 || name.length > 12) return '昵称需 2-12 个字符'
        if (password.length < 4) return '密码至少 4 位'
        if (password !== confirm) return '两次输入的密码不一致'
        if (useAppStore.getState().mode === 'server') {
          try {
            const r = await api<{ token: string; refreshToken?: string; user: User }>('/api/auth/register', {
              body: { nickname: name, password }
            })
            setToken(r.token)
            if (r.refreshToken) setRefreshToken(r.refreshToken)
            set({ current: r.user })
            return null
          } catch (e) {
            return e instanceof Error ? e.message : '注册失败'
          }
        }
        const users = get().users
        if (users[name]) return '该昵称已被注册'
        const record: UserRecord = {
          id: `u-${Date.now()}`,
          nickname: name,
          password,
          avatar: ''
        }
        set({
          users: { ...users, [name]: record },
          current: { id: record.id, nickname: record.nickname, avatar: '' }
        })
        return null
      },

      loginGuest: async () => {
        if (useAppStore.getState().mode === 'server') {
          // 服务器模式：自动注册一个随机游客账号（服务端需要身份才能拉流/互动）
          const rand = Math.random().toString(36).slice(2, 6)
          const nickname = `游客${rand}`
          const password = `guest-${Date.now()}`
          try {
            const r = await api<{ token: string; refreshToken?: string; user: User }>('/api/auth/register', {
              body: { nickname, password }
            })
            setToken(r.token)
            if (r.refreshToken) setRefreshToken(r.refreshToken)
            set({ current: r.user })
          } catch {
            // 昵称撞车等极小概率失败，换号重试一次
            const nickname2 = `游客${Math.random().toString(36).slice(2, 8)}`
            try {
              const r = await api<{ token: string; refreshToken?: string; user: User }>('/api/auth/register', {
                body: { nickname: nickname2, password }
              })
              setToken(r.token)
              if (r.refreshToken) setRefreshToken(r.refreshToken)
              set({ current: r.user })
            } catch {
              /* 仍失败则保持未登录 */
            }
          }
          return
        }
        set({ current: { id: 'guest', nickname: '游客', avatar: '' } })
      },

      logout: () => {
        if (useAppStore.getState().mode === 'server') {
          setToken(null)
          setRefreshToken(null)
        }
        set({ current: null })
      }
    }),
    {
      name: 'pc-douyin-user',
      version: 1
    }
  )
)
