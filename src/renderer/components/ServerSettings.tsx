// 服务器地址设置弹窗：运行时切换后端（登录前后均可用）。保存后整页刷新重连。
import { useState } from 'react'
import { API_BASE, setServerUrl } from '../api/client'

export default function ServerSettings({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(API_BASE)
  const [err, setErr] = useState('')

  const save = () => {
    try {
      const changed = setServerUrl(url)
      if (changed) location.reload()
      else onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '无效地址')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[360px] bg-neutral-900 border border-neutral-800 rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-white mb-1">服务器地址</h2>
        <p className="text-xs text-neutral-500 mb-4">运行时切换后端，保存后自动重连</p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="http://localhost:3000"
          spellCheck={false}
          className="w-full bg-neutral-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-pink-500/70"
        />
        {err && <p className="text-xs text-pink-500 mt-2">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            onClick={save}
            className="flex-1 py-2 rounded-lg text-sm bg-gradient-to-r from-pink-600 to-pink-500 text-white font-medium"
          >
            保存并重连
          </button>
        </div>
      </div>
    </div>
  )
}
