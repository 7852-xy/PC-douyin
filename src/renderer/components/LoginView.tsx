import { useState } from 'react'
import { motion } from 'framer-motion'
import { useUserStore } from '../stores/userStore'
import ServerSettings from './ServerSettings'

// 登录/注册页：未登录时全屏展示。本机 mock 账号，也支持游客体验。
export default function LoginView() {
  const login = useUserStore((s) => s.login)
  const register = useUserStore((s) => s.register)
  const loginGuest = useUserStore((s) => s.loginGuest)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [showServer, setShowServer] = useState(false)

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
  }

  const submit = () => {
    const p =
      mode === 'login' ? login(nickname, password) : register(nickname, password, confirm)
    void p.then((err) => setError(err ?? ''))
  }

  const inputCls =
    'w-full bg-neutral-800 rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-pink-500/70'

  return (
    <div className="h-full w-full bg-neutral-950 flex items-center justify-center overflow-hidden">
      {/* 背景装饰光斑 */}
      <div className="absolute w-96 h-96 rounded-full bg-pink-600/10 blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl -bottom-20 -right-20 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
        className="relative w-[380px] bg-neutral-900 border border-neutral-800 rounded-2xl p-8"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-indigo-500 flex items-center justify-center text-2xl mb-3">
            🎵
          </div>
          <h1 className="text-xl font-bold text-white">PC 抖音</h1>
          <p className="text-xs text-neutral-500 mt-1">登录后开始刷视频</p>
        </div>

        {/* 模式切换 */}
        <div className="flex mb-5 bg-neutral-800 rounded-lg p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={
                'flex-1 py-2 rounded-md text-sm transition-colors ' +
                (mode === m
                  ? 'bg-pink-600 text-white font-medium'
                  : 'text-neutral-400 hover:text-white')
              }
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <div className="space-y-3">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="昵称（2-12 个字符）"
            maxLength={12}
            className={inputCls}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="密码（至少 4 位）"
            type="password"
            maxLength={32}
            className={inputCls}
          />
          {mode === 'register' && (
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="确认密码"
              type="password"
              maxLength={32}
              className={inputCls}
            />
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-pink-500 mt-3"
          >
            {error}
          </motion.p>
        )}

        {/* 主按钮 */}
        <button
          onClick={submit}
          className="w-full mt-5 py-3 rounded-lg bg-gradient-to-r from-pink-600 to-pink-500 text-white text-sm font-medium hover:from-pink-500 hover:to-pink-400 disabled:opacity-40"
          disabled={!nickname.trim() || !password}
        >
          {mode === 'login' ? '登 录' : '注 册 并 登 录'}
        </button>

        {/* 游客体验 */}
        <button
          onClick={loginGuest}
          className="w-full mt-3 py-2.5 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800"
        >
          游客体验 →
        </button>

        {/* 服务器设置（登录前也能改后端地址） */}
        <button
          onClick={() => setShowServer(true)}
          className="w-full mt-1 py-1.5 rounded-lg text-xs text-neutral-600 hover:text-neutral-400"
        >
          ⚙ 服务器设置
        </button>

        <p className="text-[10px] text-neutral-600 text-center mt-3">
          演示版：账号数据仅保存在本机
        </p>
      </motion.div>

      {showServer && <ServerSettings onClose={() => setShowServer(false)} />}
    </div>
  )
}
