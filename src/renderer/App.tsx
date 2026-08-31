import { useEffect, useState } from 'react'
import { useUserStore } from './stores/userStore'
import { useAppStore } from './stores/appStore'
import { useNotifyStore } from './stores/notifyStore'
import { useDmStore } from './stores/dmStore'
import LoginView from './components/LoginView'
import Sidebar from './components/Sidebar'
import VideoFeed from './components/VideoFeed'
import TopTabs from './components/TopTabs'
import SearchBar from './components/SearchBar'
import UserProfileView from './components/UserProfileView'
import SearchResultsView from './components/SearchResultsView'
import NotificationsView from './components/NotificationsView'
import MessagesView from './components/MessagesView'
import ChatView from './components/ChatView'

// 应用根组件：未登录 → 登录页；已登录 → 桌面主界面
// 主界面按 appStore.view 做轻量路由：feed / profile / search / notifications
export default function App() {
  const user = useUserStore((s) => s.current)
  const mode = useAppStore((s) => s.mode)
  const view = useAppStore((s) => s.view)
  const startNotify = useNotifyStore((s) => s.startPolling)
  const stopNotify = useNotifyStore((s) => s.stopPolling)
  const startDm = useDmStore((s) => s.startPolling)
  const stopDm = useDmStore((s) => s.stopPolling)
  // 自动更新：包已下载就绪 → 右下角提示条
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)

  useEffect(() => {
    const off = window.pcApi?.onUpdateReady((v) => setUpdateVersion(v))
    return () => off?.()
  }, [])

  // 登录且 server 模式：开启通知 + 私信未读轮询；退出/离线则停止
  useEffect(() => {
    if (mode === 'server' && user) {
      startNotify()
      startDm()
    }
    return () => {
      stopNotify()
      stopDm()
    }
  }, [mode, user, startNotify, stopNotify, startDm, stopDm])

  if (!user) return <LoginView />

  // 进入 feed 视图时确保 tab 与 view 一致（从其它视图返回不强制重置）
  const main = (() => {
    switch (view.type) {
      case 'profile':
        return <UserProfileView />
      case 'search':
        return <SearchResultsView />
      case 'notifications':
        return <NotificationsView />
      case 'dm':
        return <MessagesView />
      case 'dmChat':
        return <ChatView />
      default:
        return <VideoFeed />
    }
  })()

  return (
    <div className="relative h-full w-full flex bg-neutral-950 text-white overflow-hidden">
      <Sidebar />
      <main className="relative flex-1 h-full overflow-hidden">
        {view.type === 'feed' && <TopTabs />}
        <SearchBar />
        {main}
      </main>

      {/* 自动更新就绪提示条 */}
      {updateVersion && (
        <div className="absolute bottom-4 right-4 z-50 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 shadow-xl flex items-center gap-3">
          <span className="text-sm text-white">
            新版本 v{updateVersion} 已就绪，退出时自动安装
          </span>
          <button
            onClick={() => void window.pcApi?.installUpdate()}
            className="px-3 py-1 rounded-full bg-pink-600 hover:bg-pink-500 text-white text-xs"
          >
            立即重启安装
          </button>
          <button
            onClick={() => setUpdateVersion(null)}
            title="稍后"
            className="text-neutral-500 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
