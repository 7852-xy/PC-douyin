import { create } from 'zustand'
import { pingServer } from '../api/client'

// 运行模式：server = 后端可用；local = 离线本地模式（localStorage 全套）
export type AppMode = 'local' | 'server'

// 主界面视图状态（项目无 react-router，用 appStore.view 做轻量路由）
export type View =
  | { type: 'feed' }
  | { type: 'profile'; userId: string }
  | { type: 'search'; q: string }
  | { type: 'notifications' }
  | { type: 'dm' }
  | { type: 'dmChat'; userId: string; nickname: string }

interface AppState {
  mode: AppMode
  ready: boolean
  view: View
  setMode: (m: AppMode) => void
  setView: (v: View) => void
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'local',
  ready: false,
  view: { type: 'feed' },
  setMode: (m) => {
    set({ mode: m, ready: true })
    localStorage.setItem('pc-douyin-mode', m)
  },
  setView: (view) => set({ view })
}))

export function probeMode(): Promise<AppMode> {
  return pingServer().then((ok) => (ok ? 'server' : 'local'))
}
