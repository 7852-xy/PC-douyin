// API 客户端：统一请求封装 + token 管理 + 服务探测 + 401 单飞刷新（refresh 开启时）

const SERVER_URL_KEY = 'pc-douyin-server-url'

// 服务器地址：运行时设置（localStorage）优先，其次构建期 VITE_API_BASE，默认本机 3000。
// 去掉尾部斜杠，避免拼出 //api/... 双斜杠。
function resolveBase(): string {
  const saved = localStorage.getItem(SERVER_URL_KEY)
  if (saved) return saved.replace(/\/+$/, '')
  const fromEnv = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE
  return (fromEnv || 'http://localhost:3000').replace(/\/+$/, '')
}

export const API_BASE = resolveBase()

/**
 * 运行时切换服务器：持久化到 localStorage。
 * @returns true = 已保存，调用方应 location.reload() 让 API_BASE 重新求值
 * @throws 地址非 http(s) 开头时抛错
 */
export function setServerUrl(url: string): boolean {
  const clean = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\/.+/.test(clean)) throw new Error('地址需以 http:// 或 https:// 开头')
  if (clean === API_BASE) return false
  localStorage.setItem(SERVER_URL_KEY, clean)
  return true
}

const TOKEN_KEY = 'pc-douyin-token'
const REFRESH_KEY = 'pc-douyin-refresh-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(t: string | null) {
  if (t === null) localStorage.removeItem(TOKEN_KEY)
  else localStorage.setItem(TOKEN_KEY, t)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setRefreshToken(t: string | null) {
  if (t === null) localStorage.removeItem(REFRESH_KEY)
  else localStorage.setItem(REFRESH_KEY, t)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface ApiOpts {
  method?: string
  body?: unknown
  token?: string | null
  /** 内部：已重试过，不再走 401 刷新（防循环） */
  _retry?: boolean
}

// 模块级单飞：并发 401 共享一次刷新，刷新期间其他 401 等同一个 promise
let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const rt = getRefreshToken()
  if (!rt) return null
  try {
    const r = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt })
    })
    if (!r.ok) return null
    const j = (await r.json()) as { token: string; refreshToken: string }
    setToken(j.token)
    setRefreshToken(j.refreshToken)
    return j.token
  } catch {
    return null
  }
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = opts.token !== undefined ? opts.token : getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body = opts.body as BodyInit | undefined
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const res = await fetch(API_BASE + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body
  })
  if (!res.ok) {
    // 401 + 有 refresh + 非刷新请求本身 + 未重试过 → 单飞刷新 + 重放原请求
    // refresh 关闭时 getRefreshToken() 恒 null → 跳过，行为与改造前完全一致
    if (
      res.status === 401 &&
      !opts._retry &&
      getRefreshToken() &&
      !path.startsWith('/api/auth/refresh')
    ) {
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
          refreshPromise = null
        })
      }
      const newToken = await refreshPromise
      if (newToken) {
        return api<T>(path, { ...opts, token: newToken, _retry: true })
      }
      // 刷新失败：清 token，抛 401（各 store 的 handleAuth 兜底登出）
      setToken(null)
      setRefreshToken(null)
      throw new ApiError(401, '登录已过期，请重新登录')
    }
    let msg = `请求失败 (${res.status})`
    try {
      const j = (await res.json()) as { error?: string }
      if (j?.error) msg = j.error
    } catch {
      /* 非 JSON 响应 */
    }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

// 启动时探测服务是否可用（2 秒超时），失败则进入本地模式
export async function pingServer(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    const j = (await res.json()) as { ok?: boolean }
    return j?.ok === true
  } catch {
    return false
  }
}
