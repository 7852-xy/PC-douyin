// 1:1 聊天视图：消息气泡 + 底部输入（Enter 发送）
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useDmStore } from '../stores/dmStore'

export default function ChatView() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const thread = useDmStore((s) => s.thread)
  const peer = useDmStore((s) => s.peer)
  const sending = useDmStore((s) => s.sending)
  const openChat = useDmStore((s) => s.openChat)
  const send = useDmStore((s) => s.send)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const userId = view.type === 'dmChat' ? view.userId : ''
  const nickname = view.type === 'dmChat' ? view.nickname : ''

  // 进入聊天：拉线程 + 标记已读
  useEffect(() => {
    if (userId) void openChat(userId, nickname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // 新消息自动滚到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [thread])

  const onSend = async () => {
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    try {
      await send(content)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '发送失败')
      setInput(content) // 恢复输入
    }
  }

  return (
    <div className="h-full flex flex-col bg-neutral-950 text-white">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-neutral-800/80 shrink-0">
        <button
          onClick={() => setView({ type: 'dm' })}
          className="text-sm text-neutral-400 hover:text-white"
        >
          ← 返回
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
          {(peer?.nickname || nickname || '?').charAt(0)}
        </div>
        <span className="text-sm font-medium">{peer?.nickname || nickname}</span>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
        {thread.length === 0 ? (
          <p className="text-xs text-neutral-600 text-center py-6">还没有消息，打个招呼吧～</p>
        ) : (
          thread.map((m) => (
            <div key={m.id} className={'flex flex-col max-w-[70%] ' + (m.fromMe ? 'self-end items-end' : 'self-start items-start')}>
              <div
                className={
                  'px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ' +
                  (m.fromMe ? 'bg-pink-600 text-white rounded-br-sm' : 'bg-neutral-800 text-white rounded-bl-sm')
                }
              >
                {m.content}
              </div>
              <span className="text-[10px] text-neutral-600 mt-0.5">
                {new Date(m.createdAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-neutral-800/80 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void onSend()
            }
          }}
          maxLength={500}
          placeholder={peer ? `发给 ${peer.nickname}…` : '输入消息…'}
          className="flex-1 bg-neutral-900 rounded-full px-4 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-pink-500/70"
        />
        <button
          onClick={() => void onSend()}
          disabled={!input.trim() || sending}
          className="px-4 py-2 rounded-full bg-gradient-to-r from-pink-600 to-pink-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? '发送中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
