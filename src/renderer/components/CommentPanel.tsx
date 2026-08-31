import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useVideoStore } from '../stores/videoStore'
import { useAppStore } from '../stores/appStore'
import { formatCount } from '../utils/format'

// ISO 时间 → "M月D日 HH:mm"；本地模式直接用"xx分钟前"这类文案
function formatCreatedAt(t: string): string {
  if (!/^\d{4}-/.test(t)) return t
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 评论弹层：从视频区右侧滑入，覆盖在视频上方。ESC 关闭。
// server 模式：打开时从后端拉取评论；local 模式：读 localStorage 数据。
export default function CommentPanel() {
  const open = useVideoStore((s) => s.commentPanelOpen)
  const videoId = useVideoStore((s) => s.current.id)
  const comments = useVideoStore((s) => s.comments[videoId])
  const setCommentPanel = useVideoStore((s) => s.setCommentPanel)
  const addComment = useVideoStore((s) => s.addComment)
  const toggleCommentLike = useVideoStore((s) => s.toggleCommentLike)
  const fetchComments = useVideoStore((s) => s.fetchComments)
  const mode = useAppStore((s) => s.mode)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const list = comments ?? []

  // server 模式：打开时拉取该视频的评论
  useEffect(() => {
    if (open && mode === 'server') void fetchComments(videoId)
  }, [open, videoId, mode, fetchComments])

  // ESC 关闭弹层
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommentPanel(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setCommentPanel])

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 320)
  }, [open])

  const submit = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      await addComment(videoId, t)
      setText('')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '发送失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0, transition: { type: 'tween', duration: 0.28, ease: 'easeOut' } }}
          exit={{ x: '100%', transition: { type: 'tween', duration: 0.22, ease: 'easeIn' } }}
          className="absolute right-0 top-0 bottom-0 z-30 w-[360px] bg-neutral-900/95 backdrop-blur border-l border-neutral-800 flex flex-col"
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-sm font-medium text-white">
              全部评论 ({list.length})
            </span>
            <button
              onClick={() => setCommentPanel(false)}
              className="w-7 h-7 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>

          {/* 评论列表 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {mode === 'server' && comments === undefined && (
              <div className="text-center text-neutral-500 text-sm pt-10">加载中…</div>
            )}
            {comments !== undefined && list.length === 0 && (
              <div className="text-center text-neutral-500 text-sm pt-10">
                还没有评论，来抢沙发～
              </div>
            )}
            {list.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                  {c.author.nickname.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-neutral-400">{c.author.nickname}</div>
                  <p className="text-sm text-neutral-100 mt-0.5 break-words">{c.content}</p>
                  <div className="text-xs text-neutral-500 mt-1">{formatCreatedAt(c.createdAt)}</div>
                </div>
                <button
                  onClick={() => toggleCommentLike(videoId, c.id)}
                  className="flex flex-col items-center gap-0.5 pt-1 group"
                >
                  <motion.span
                    whileTap={{ scale: 0.7 }}
                    animate={c.liked ? { scale: [1, 1.4, 1] } : {}}
                    className={
                      'text-sm ' + (c.liked ? 'text-pink-500' : 'text-neutral-500 group-hover:text-neutral-300')
                    }
                  >
                    ♥
                  </motion.span>
                  <span className="text-[10px] text-neutral-500">{formatCount(c.likes)}</span>
                </button>
              </div>
            ))}
          </div>

          {/* 输入区 */}
          <div className="p-3 border-t border-neutral-800 flex gap-2">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                // 阻止全局快捷键（空格暂停/上下切换）在输入时触发
                e.stopPropagation()
              }}
              onKeyUp={(e) => e.stopPropagation()}
              placeholder="留下你的精彩评论吧"
              maxLength={200}
              className="flex-1 bg-neutral-800 rounded-full px-4 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-pink-500/60"
            />
            <button
              onClick={submit}
              disabled={!text.trim() || sending}
              className="px-4 rounded-full bg-pink-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pink-500"
            >
              发送
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
