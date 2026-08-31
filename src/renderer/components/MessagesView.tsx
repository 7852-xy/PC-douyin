// 私信会话列表
import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useDmStore } from '../stores/dmStore'

export default function MessagesView() {
  const conversations = useDmStore((s) => s.conversations)
  const refresh = useDmStore((s) => s.refreshConversations)
  const setView = useAppStore((s) => s.setView)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const sameYear = d.getFullYear() === now.getFullYear()
    return sameYear
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <div className="h-full overflow-y-auto bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-base">✉️ 私信</h1>
          <button
            onClick={() => setView({ type: 'feed' })}
            className="text-sm text-neutral-400 hover:text-white"
          >
            ← 返回
          </button>
        </div>

        {conversations.length === 0 ? (
          <p className="text-sm text-neutral-600 py-10 text-center">
            还没有会话——去用户主页发起第一条私信吧
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {conversations.map((c) => (
              <button
                key={c.user.id}
                onClick={() => setView({ type: 'dmChat', userId: c.user.id, nickname: c.user.nickname })}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-left"
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold">
                  {c.user.nickname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.user.nickname}</span>
                    <span className="ml-auto text-xs text-neutral-500 shrink-0">
                      {fmtTime(c.lastAt)}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 truncate">
                    {c.fromMe ? '我：' : ''}
                    {c.lastMessage}
                  </div>
                </div>
                {c.unread > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-pink-600 text-white text-[10px] leading-5 text-center shrink-0">
                    {c.unread > 99 ? '99+' : c.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
