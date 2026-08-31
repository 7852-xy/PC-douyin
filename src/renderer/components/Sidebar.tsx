import { useRef, useState } from 'react'
import { useUserStore } from '../stores/userStore'
import { useVideoStore } from '../stores/videoStore'
import { useAppStore } from '../stores/appStore'
import { useNotifyStore } from '../stores/notifyStore'
import { useDmStore } from '../stores/dmStore'
import ServerSettings from './ServerSettings'
import { api, API_BASE } from '../api/client'
import { extractCover } from '../utils/extractCover'
import type { VideoItem } from '../types'

interface NavItem {
  icon: string
  label: string
  serverOnly?: boolean
  onClick: () => void
  match: 'feed' | 'profile' | 'notifications' | 'follow' | 'dm'
}

export default function Sidebar() {
  const user = useUserStore((s) => s.current)
  const logout = useUserStore((s) => s.logout)
  const addUpload = useVideoStore((s) => s.addUpload)
  const switchTab = useVideoStore((s) => s.switchTab)
  const mode = useAppStore((s) => s.mode)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const unread = useNotifyStore((s) => s.unread)
  const dmUnread = useDmStore((s) => s.unread)
  const [showServer, setShowServer] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isServer = mode === 'server'

  // NAV：首页→feed；关注→feed + switchTab('following')（仅 server）；我的→当前用户主页；通知（仅 server）
  const NAV: NavItem[] = [
    {
      icon: '🏠',
      label: '首页',
      onClick: () => setView({ type: 'feed' }),
      match: 'feed'
    },
    {
      icon: '📡',
      label: '关注',
      serverOnly: true,
      onClick: () => {
        setView({ type: 'feed' })
        void switchTab('following')
      },
      match: 'follow'
    },
    {
      icon: '👤',
      label: '我的',
      onClick: () => user && setView({ type: 'profile', userId: user.id }),
      match: 'profile'
    },
    {
      icon: '🔔',
      label: '通知',
      serverOnly: true,
      onClick: () => setView({ type: 'notifications' }),
      match: 'notifications'
    },
    {
      icon: '✉️',
      label: '私信',
      serverOnly: true,
      onClick: () => setView({ type: 'dm' }),
      match: 'dm'
    }
  ]

  const isItemActive = (it: NavItem) => {
    if (it.match === 'feed') return view.type === 'feed' && useVideoStore.getState().feedTab !== 'following'
    if (it.match === 'follow') return view.type === 'feed' && useVideoStore.getState().feedTab === 'following'
    if (it.match === 'profile') return view.type === 'profile' && view.userId === user?.id
    if (it.match === 'notifications') return view.type === 'notifications'
    if (it.match === 'dm') return view.type === 'dm' || view.type === 'dmChat'
    return false
  }

  // 发布：server 模式 → 渲染层文件选择直传 multipart；local 模式 → IPC 拷贝进 userData
  const onPublish = () => {
    if (mode === 'server') {
      fileRef.current?.click()
      return
    }
    const app = window.pcApi
    if (!app) {
      window.alert('请在桌面应用中使用上传功能')
      return
    }
    void app.selectVideo().then((res) => {
      if (!res) return // 用户取消
      const name = res.name
      const title = name.replace(/^\d+-/, '').replace(/\.[^.]+$/, '')
      addUpload({
        id: `up-${Date.now()}`,
        title,
        description: `${title} #原创`,
        author: {
          id: user?.id ?? 'me',
          nickname: user?.nickname ?? '游客',
          avatar: ''
        },
        videoUrl: `media://local/${name}`,
        coverUrl: '',
        music: '原创',
        duration: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        collects: 0,
        collected: false,
        liked: false
      })
    })
  }

  // server 模式：选中文件后先抽取封面，再 multipart 直传（视频 + 可选封面）
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!f) return
    const title = f.name.replace(/\.[^.]+$/, '').slice(0, 50)
    const fd = new FormData()
    fd.append('video', f)
    fd.append('title', title)
    fd.append('description', `${title} #原创`)
    // 截取首帧作为封面；失败则不上传 cover 字段（服务端 cover 为空字符串）
    try {
      const cover = await extractCover(f)
      if (cover) fd.append('cover', cover, 'cover.jpg')
    } catch {
      // 封面抽取失败不影响视频上传
    }
    api<{ video: VideoItem }>('/api/videos', { body: fd })
      .then((r) => {
        const v = r.video
        addUpload({
          ...v,
          videoUrl: v.videoUrl.startsWith('http') ? v.videoUrl : API_BASE + v.videoUrl,
          coverUrl: v.coverUrl && !v.coverUrl.startsWith('http') ? API_BASE + v.coverUrl : v.coverUrl
        })
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : '上传失败')
      })
  }

  return (
    <aside className="w-56 shrink-0 h-full bg-neutral-950 border-r border-neutral-800/80 flex flex-col py-6">
      <div className="px-6 mb-8 flex items-center gap-2">
        <span className="text-2xl">🎵</span>
        <span className="text-xl font-bold text-white">PC 抖音</span>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV.filter((it) => !it.serverOnly || isServer).map((it) => {
          const active = isItemActive(it)
          return (
            <button
              key={it.label}
              onClick={it.onClick}
              className={
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ' +
                (active
                  ? 'bg-neutral-800 text-white font-medium'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-white')
              }
            >
              <span className="text-lg">{it.icon}</span>
              <span className="flex-1 text-left">{it.label}</span>
              {(it.match === 'notifications' && unread > 0) ||
              (it.match === 'dm' && dmUnread > 0) ? (
                <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-pink-600 text-white text-[10px] leading-5 text-center">
                  {(it.match === 'dm' ? dmUnread : unread) > 99
                    ? '99+'
                    : it.match === 'dm'
                      ? dmUnread
                      : unread}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* 发布按钮 */}
      <div className="px-3 mt-6">
        <button
          onClick={onPublish}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-pink-600 to-pink-500 text-white text-sm font-medium hover:from-pink-500 hover:to-pink-400"
        >
          ＋ 发布视频
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* 当前用户卡片 + 退出 */}
      <div className="mt-auto px-3 space-y-2">
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-neutral-900">
            <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
              {user.nickname.charAt(0)}
            </div>
            <span className="flex-1 truncate text-sm text-white">{user.nickname}</span>
            <button
              onClick={logout}
              title="退出登录"
              className="text-xs text-neutral-500 hover:text-pink-500"
            >
              退出
            </button>
          </div>
        )}
        <div className="px-3 text-xs text-neutral-600 flex items-center gap-1.5">
          <span>MVP v0.4 · {mode === 'server' ? '在线模式' : '离线模式'}</span>
          <button
            onClick={() => setShowServer(true)}
            title="服务器设置"
            className="text-[11px] text-neutral-600 hover:text-neutral-300"
          >
            ⚙
          </button>
        </div>
      </div>

      {showServer && <ServerSettings onClose={() => setShowServer(false)} />}
    </aside>
  )
}
