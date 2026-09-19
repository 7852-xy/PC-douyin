# 实习每日开发笔记（6 天版）

---

## Day 1（8月5日）：环境搭建 + 架构设计 + 数据库建模

### 上午：开发环境搭建

**1. Node.js 22 LTS 安装**

官网下载安装包（`node-v22.14.0-x64.msi`），安装时勾选 Add to PATH。安装完成后验证：

```powershell
node -v    # v22.14.0
npm -v     # 10.8.2
```

国内网络环境下，配置 npmmirror 加速（否则 Electron 包 100+ MB 下载会超时）：

```powershell
npm config set registry https://registry.npmmirror.com
npm config set ELECTRON_BUILDER_BINARIES_MIRROR https://npmmirror.com/mirrors/electron-builder-binaries/
```

**2. Git + GitHub SSH 密钥配置**

检查本机是否已有密钥：

```powershell
Test-Path ~/.ssh/id_ed25519.pub  # False 则生成
ssh-keygen -t ed25519 -C "2144294384@qq.com"
# 一路回车，passphrase 留空（本地开发机）
Get-Content ~/.ssh/id_ed25519.pub
# 输出：ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... 2144294384@qq.com
```

将公钥粘贴到 GitHub Settings → SSH and GPG keys → New SSH key。验证连通性：

```powershell
ssh -T git@github.com
# Hi 7852-xy! You've successfully authenticated, but GitHub does not provide shell access.
```

**3. Electron + React + TypeScript 脚手架创建**

```powershell
cd "D:\Vibe Coding"
npm create @quick-start/electron@latest PC-douyin
# Select a framework: React
# Select a variant: TypeScript
# Enable git? No（后面自己 init）
cd PC-douyin
npm install
```

首次 `npm install` 下载 Electron 二进制（约 100 MB），npmmirror 镜像下约 30 秒完成。验证脚手架正常：

```powershell
npm run dev
# 期望：Vite 编译 → Electron 窗口弹出，显示 Quick Start 页面
```

**4. Prisma + SQLite 初始化**

```powershell
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
# 生成 prisma/ 目录 + schema.prisma + .env
```

**遇到的问题**

- Prisma 首次 `npm install prisma` 报 `ETIMEDOUT`：`https://registry.npmjs.org/prisma/-/prisma-6.19.3.tgz` 连接超时。原因是 npm 官方 registry 对 CN 网络不稳定。修复：`npm config set registry https://registry.npmmirror.com` 后重试，10 秒完成。
- PowerShell 不认 `&&` 作为命令分隔符：`npm install && npm run dev` 报「"&&"运算符是为将来使用而保留的」。修复：改用分号 `;` 分隔，或每行单独执行。

### 下午：架构设计 + 数据库建模

**1. 技术预研：自定义 media:// 协议**

Electron 主进程提供 `protocol.handle()` API，可以拦截自定义协议请求。设计方案：

```
渲染层 <video src="media://local/abc123.mp4">
    ↓ HTTP 请求
主进程 protocol.handle('media', (req) => {
    const url = new URL(req.url)
    const filename = url.pathname.slice(1)  // abc123.mp4
    // 文件名消毒：防 ../ 路径穿越
    if (filename.includes('..')) throw new Error('invalid filename')
    const filePath = path.join(UPLOAD_DIR, filename)
    const stat = fs.statSync(filePath)
    // 解析 Range 头
    const range = req.headers.get('range')
    if (range) {
        // 返回 206 + Content-Range + 分片流
    } else {
        // 返回 200 + 全量流
    }
})
```

预研时踩了第一个坑：`media:///file.mp4`（host 段为空，三段式变成两段式）被 Chromium 误解析，`url.pathname` 返回 `/file.mp4` 但 `url.hostname` 返回空字符串，导致 Electron 的 `protocol.handle` 内部路由匹配失败，视频全部返回 400。正确格式必须是 `media://local/file.mp4`（host 段为 `local`，path 段为 `/file.mp4`）。

**2. 技术预研：JWT 双 Token + 401 单飞刷新**

设计认证链路：

```
登录 → 签发 access(30min) + refresh(7d)，refresh 入库带 jti
请求 → 携带 Bearer → 401 时进入刷新逻辑：
  模块级 refreshPromise = null
  if (refreshPromise === null) {
      refreshPromise = doRefresh().finally(() => refreshPromise = null)
  }
  const newToken = await refreshPromise  // 并发 401 共享同一个 Promise
  return api(path, { ...opts, token: newToken, _retry: true })
防循环：刷新请求本身 path === '/api/auth/refresh' 不进入刷新逻辑
```

**3. Prisma schema 建模（10 个模型）**

```prisma
model User {
  id        String   @id @default(uuid())
  nickname  String   @unique @db.VarChar(32)
  passwordHash String
  avatar    String?
  bio       String?
  videos    Video[]
  likes     Like[]
  follows   Follow[] @relation("FollowFollower")
  followers Follow[] @relation("FollowFollowing")
  notifications Notification[] @relation("NotifRecipient")
  refreshTokens RefreshToken[]
}

model Video {
  id           String   @id @default(uuid())
  userId       String
  title        String
  description  String?
  mediaUrl     String   // "media://local/xxx.mp4"
  coverUrl     String?  // "media://local/xxx.jpg"
  likesCount    Int      @default(0)
  commentsCount Int      @default(0)
  sharesCount   Int      @default(0)
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id])
  likes        Like[]   @unique([userId, videoId])
  comments     Comment[]
}

model Message {
  id           String   @id @default(uuid())
  senderId     String
  recipientId  String
  content      String
  readAt       DateTime?
  createdAt    DateTime @default(now())
  sender       User     @relation("DmSent", fields: [senderId], references: [id])
  recipient    User     @relation("DmReceived", fields: [recipientId], references: [id])
  @@index([senderId, recipientId])
  @@index([recipientId, readAt])  // 未读数查询加速
}
```

完整 10 个模型：User、Video、Like、Collect、Comment、CommentLike、Follow、Notification、Message、RefreshToken。每个互动表（Like/Collect）都加 `@@unique([userId, videoId])` 复合唯一约束，防重复点赞。

**4. 双 schema 策略**

创建 `schema.postgres.prisma`，字段与 `schema.prisma` 完全一致，仅 datasource.provider 改为 `postgresql`。后续每次改表必须同步改两个文件，然后分别跑迁移。

**遇到的问题**

- 首次写 schema 漏了 `@@unique` 约束，导致 Postman 可以重复点赞。发现后补上 `@@unique([userId, videoId])` 并 `prisma migrate dev` 重新生成迁移。
- Postgres 迁移脚本生成：`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgres.prisma --script` 输出的 SQL 包含 `CREATE UNIQUE INDEX` 语句，但 SQLite 不支持直接执行这些语句（SQLite 通过 `CREATE TABLE` 的 `UNIQUE` 约束来实现）。这就是为什么要双 schema 分开维护迁移——sqlite 走 `prisma migrate dev`，postgres 走 `migrate diff`。

### 今日心得

环境搭建最磨人但最关键，提前配好 npmmirror 和 PowerShell 执行策略能省大量时间。`media://` 协议的 URL 三段式规则（host 段必须存在）是 Chromium 的硬要求，踩完这个坑后面就顺了。Prisma schema-first 开发体验很好，但约束（`@@unique`）和索引（`@@index`）要在第一次建模时就想清楚，后期加会有迁移冲突。

---

## Day 2（8月6日）：Express 后端骨架 + JWT 认证 + 视频域核心

### 上午：Express 后端骨架 + JWT 双 Token 认证

**1. Express 5 + TypeScript 项目初始化**

```powershell
cd server
npm install express @types/express typescript tsx
# tsconfig.json：outDir: dist, module: ESNext, moduleResolution: bundler
```

编写 `env.ts`（**必须是整个应用的第一个 import**，因为 ESM hoisting 会提前求值所有顶层 import，如果其他模块先 import 了但 process.env 还没解析，就会读到 undefined）：

```typescript
// env.ts —— side-effect 模块，import 时立即解析 .env
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
export const PORT = parseInt(process.env.PORT || '3000')
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
export const JWT_REFRESH_ENABLED = process.env.JWT_REFRESH_ENABLED === 'true'
// ...
```

编写 `index.ts`（入口文件）：

```typescript
import './env'  // ← 第一行！ESM hoisting 会提前求值
import express from 'express'
import authRoutes from './routes/auth'
import videoRoutes from './routes/videos'
const app = express()
app.use(express.json({ limit: '10mb' }))
app.use('/api/auth', authRoutes)
app.use('/api/videos', videoRoutes)
app.listen(PORT, () => console.log(`Server running on :${PORT}`))
```

**2. bcrypt 密码哈希 + JWT 签发/校验**

```typescript
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export async function hashPassword(pwd: string): Promise<string> {
  return bcrypt.hash(pwd, 10)
}
export async function verifyPassword(pwd: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pwd, hash)
}
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30m' })
}
export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti }, JWT_SECRET, { expiresIn: '7d' })
}
```

**3. refresh 轮换 + jti 黑名单 + 401 单飞刷新**

后端 refresh 接口：

```typescript
// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body
  const payload = jwt.verify(refreshToken, JWT_SECRET) as { sub: string; jti: string }
  // 校验 refresh 是否在库中、是否已撤销
  const stored = await prisma.refreshToken.findUnique({ where: { jti: payload.jti } })
  if (!stored || stored.revokedAt) throw new ApiError(401, 'invalid refresh token')
  // 轮换：撤销旧 token
  await prisma.refreshToken.update({ where: { jti: payload.jti }, data: { revokedAt: new Date() } })
  // 签发新对
  const newJti = uuidv4()
  await prisma.refreshToken.create({ data: { userId: payload.sub, jti: newJti } })
  res.json({ token: signAccessToken(payload.sub), refreshToken: signRefreshToken(payload.sub, newJti) })
})
```

前端单飞刷新（`api/client.ts`）：

```typescript
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
    const j = await r.json()
    setToken(j.token); setRefreshToken(j.refreshToken)
    return j.token
  } catch { return null }
}

// api() 函数内：
if (res.status === 401 && !opts._retry && getRefreshToken()) {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  const newToken = await refreshPromise
  if (newToken) return api<T>(path, { ...opts, token: newToken, _retry: true })
}
```

**遇到的问题**

- `env.ts` 不是最先 import：第一次把 `import './env'` 放在了 `import express from 'express'` 之后，结果 `dotenv.config()` 执行时 express 已经 import 了其他模块，那些模块里 `process.env.PORT` 读到 undefined，express 监听了随机端口。修复：把 `import './env'` 移到第一行。
- 单飞刷新的 `_retry` 标记：第一次写的是 `return api(path, { ...opts, token: newToken, _retry: true })`，但展开运算符会先展开 `opts._retry`（此时是 undefined），然后 `_retry: true` 覆盖——这部分没问题。真正的 bug 是刷新请求本身 `POST /api/auth/refresh` 不应该进入刷新逻辑，需要在 if 条件里加 `&& !path.startsWith('/api/auth/refresh')`。

### 下午：视频域核心功能

**1. multer 单实例 .fields() 上传**

```typescript
import multer from 'multer'

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      // 用户原始文件名永不落盘，用 UUID + 扩展名
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${uuidv4()}${ext}`)
    }
  }),
  fileFilter: (req, file, cb) => {
    // 按 fieldname 分流 MIME 白名单
    if (file.fieldname === 'video') {
      const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo']
      allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('不支持的视频格式'))
    } else if (file.fieldname === 'cover') {
      const allowed = ['image/jpeg', 'image/png', 'image/webp']
      allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('不支持的图片格式'))
    } else {
      cb(null, false)
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 }  // 200MB
})

router.post('/', requireAuth, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  // req.files.video[0] — 视频文件
  // req.files.cover[0] — 封面文件（可选）
})
```

**2. 自定义 media:// 协议 + Range 206 流式播放**

主进程代码：

```typescript
import { protocol } from 'electron'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(app.getPath('userData'), 'uploads')

protocol.handle('media', async (request) => {
  const url = new URL(request.url)
  const filename = url.pathname.slice(1)  // 去掉开头的 /
  // 文件名消毒：防 ../ 路径穿越
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return new Response('invalid filename', { status: 400 })
  }
  const filePath = path.join(UPLOAD_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return new Response('not found', { status: 404 })
  }
  const stat = fs.statSync(filePath)
  const range = request.headers.get('range')
  
  if (range) {
    // Range: bytes=start-end 或 bytes=start-
    const match = range.match(/bytes=(\d+)-(\d*)/)
    if (!match) return new Response('invalid range', { status: 416 })
    const start = parseInt(match[1])
    const end = match[2] ? parseInt(match[2]) : stat.size - 1
    const chunkSize = end - start + 1
    const stream = fs.createReadStream(filePath, { start, end })
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': 'video/mp4'
      }
    })
  } else {
    const stream = fs.createReadStream(filePath)
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Length': stat.size.toString(),
        'Content-Type': 'video/mp4'
      }
    })
  }
})
```

**3. Express /api/media/:filename Range 代理（S3 场景用）**

```typescript
router.get('/:filename', async (req, res) => {
  const filename = req.params.filename
  if (filename.includes('..')) return res.status(400).send('invalid filename')
  const filePath = path.join(UPLOAD_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).send('not found')
  const stat = fs.statSync(filePath)
  const range = req.headers.range
  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/)
    if (!match) return res.status(416).end()
    const start = parseInt(match[1])
    const end = match[2] ? parseInt(match[2]) : stat.size - 1
    const chunkSize = end - start + 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Length': stat.size })
    fs.createReadStream(filePath).pipe(res)
  }
})
```

**遇到的问题**

- multer 双实例互吃请求流：第一次写的是 `upload.single('video')` + `upload.single('cover')` 两个独立中间件，但 multer 的每个实例都会尝试消费整个请求体流，第二个实例读到的是空流，导致 cover 文件永远取不到。修复：合并成单实例 `upload.fields([{name:'video'},{name:'cover'}])`，这是官方推荐方式但文档里没说双实例会互吃流。
- Range 206 的 Content-Range 头格式：必须是 `bytes start-end/total`，少写 `/total` 浏览器不认；start 和 end 必须是具体数字，不能是 `*`；end 可以省略表示到文件末尾。写错一个字符视频就卡住不动。
- autoplay 被拦截：Electron 的 Chromium 版本较新，autoplay 策略和浏览器一样——带声音的视频自动播放会被拦截。双兜底方案：主进程 `commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')` + 渲染层 `video.play().catch(() => { video.muted = true; video.play() })`。

### 今日心得

`env.ts` 必须最先 import 这个教训刻骨铭心——ESM hoisting 的执行顺序反直觉，side-effect 模块必须置顶。单飞刷新的代码量不大但设计精巧，用模块级 Promise 解决并发 401 刷新风暴，不需要加锁也不需要信号量。multer 单实例 `.fields()` 是文档没说清的坑，踩过就记住了。

---

## Day 3（8月7日）：前端骨架 + Zustand + 社交域 + 通知

### 上午：前端骨架 + Zustand 状态管理 + API 客户端

**1. React + Tailwind CSS 骨架**

```powershell
# 在已有 Electron 脚手架基础上
npm install tailwindcss postcss autoprefixer framer-motion
npx tailwindcss init -p
```

tailwind.config.js 配置：

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FE2C55',  // 抖音红
        secondary: '#25F4EE'  // 抖音青
      }
    }
  },
  plugins: []
}
```

index.css 引入 Tailwind：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; margin: 0; }
body { background: #000; color: #fff; font-family: -apple-system, sans-serif; }
```

**2. 7 个 Zustand store + 持久化策略**

安装 Zustand：`npm install zustand`

核心 store 设计原则：**持久化数据（token/用户信息）与瞬态 UI 状态（弹窗开关、loading）分离**。

userStore（需要持久化）：

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UserState {
  user: { id: string; nickname: string } | null
  login: (nickname: string, password: string) => Promise<void>
  register: (nickname: string, password: string) => Promise<void>
  logout: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      login: async (nickname, password) => {
        const { token } = await api<{ token: string }>('/api/auth/login', {
          method: 'POST', body: { nickname, password }
        })
        setToken(token)
        const me = await api<{ id: string; nickname: string }>('/api/auth/me')
        set({ user: me })
      },
      register: async (nickname, password) => {
        const { token } = await api<{ token: string }>('/api/auth/register', {
          method: 'POST', body: { nickname, password }
        })
        setToken(token)
        const me = await api<{ id: string; nickname: string }>('/api/auth/me')
        set({ user: me })
      },
      logout: () => { setToken(null); setRefreshToken(null); set({ user: null }) }
    }),
    { name: 'pc-douyin-user' }
  )
)
```

appStore（不需要持久化，瞬态 UI 状态）：

```typescript
interface AppState {
  mode: 'server' | 'mock'
  view: 'feed' | 'following' | 'trending' | 'notifications' | 'dm' | 'profile'
  showSettings: boolean
  setMode: (mode: 'server' | 'mock') => void
  setView: (view: AppState['view']) => void
  toggleSettings: () => void
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'mock',
  view: 'feed',
  showSettings: false,
  setMode: (mode) => set({ mode }),
  setView: (view) => set({ view }),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings }))
}))
```

**3. API 客户端 + 服务探测 + 双模式**

api/client.ts 完整封装（含 Day2 写的单飞刷新）：

```typescript
const SERVER_URL_KEY = 'pc-douyin-server-url'
function resolveBase(): string {
  const saved = localStorage.getItem(SERVER_URL_KEY)
  if (saved) return saved.replace(/\/+$/, '')
  const fromEnv = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE
  return (fromEnv || 'http://localhost:3000').replace(/\/+$/, '')
}
export const API_BASE = resolveBase()

export async function probeMode(): Promise<'server' | 'mock'> {
  try {
    await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(4000) })
    return 'server'
  } catch {
    return 'mock'
  }
}
```

**遇到的问题**

- TS1345：Zustand 里写 `if (handleAuth(e)) return ...rollback`，其中 `handleAuth` 返回 `void`，TypeScript 报错「expression of type void cannot be tested for truthiness」。修复：让 `handleAuth` 返回 `boolean`（认证失败返回 true，成功返回 false），或者改为 `handleAuth(e); if (someError) ...`。三个社交 store（followStore/notifyStore/profileStore）都踩了这个坑，tsc 全部揪出来了。
- mock 数据的视频 URL：直接写 `file:///D:/...` 在 Electron 里被 CSP 拦截。改用 `media://local/v1.mp4` 格式，但主进程 `protocol.handle` 只拦截 Electron 窗口内的请求——mock 模式下后端没启动，主进程也不会拦截。修复：mock 模式下 videoStore 直接返回本地 mp4 的 import URL（Vite 打包后变成 hash 文件路径），不经过 media:// 协议。

### 下午：社交域 + 通知 + 搜索

**1. 关注体系**

后端接口：

```
POST   /api/users/:id/follow     关注
DELETE /api/users/:id/follow     取关
GET    /api/users/:id/followers  粉丝列表
GET    /api/users/:id/follows    关注列表
GET    /api/videos?feed=following  关注流（只返回关注者的作品）
```

前端 followStore：

```typescript
export const useFollowStore = create<FollowState & FollowActions>()((set, get) => ({
  followingIds: new Set<string>(),
  toggleFollow: async (userId: string) => {
    const isFollowing = get().followingIds.has(userId)
    // 乐观更新
    set((s) => {
      const next = new Set(s.followingIds)
      isFollowing ? next.delete(userId) : next.add(userId)
      return { followingIds: next }
    })
    try {
      await api(`/api/users/${userId}/follow`, { method: isFollowing ? 'DELETE' : 'POST' })
    } catch (e) {
      // 回滚
      if (handleAuth(e)) return false
      set((s) => {
        const next = new Set(s.followingIds)
        isFollowing ? next.add(userId) : next.delete(userId)
        return { followingIds: next }
      })
      return false
    }
  }
}))
```

**2. 通知系统 + 30s 轮询未读数**

后端 notify() 统一入口（防自通知）：

```typescript
// notify.ts — 所有触发通知的地方都调用这个函数
export async function notify(params: {
  actorId: string
  recipientId: string
  type: 'like' | 'follow' | 'comment' | 'share'
  targetId: string
}) {
  // 防自通知：自己点赞/评论自己的视频，不入箱
  if (params.actorId === params.recipientId) return
  await prisma.notification.create({
    data: { ...params, readAt: null }
  })
  // Redis 门控：缓存未读数
  if (cache.available()) {
    cache.del(`notif:unread:${params.recipientId}`)
  }
}
```

前端 notifyStore 30s 轮询：

```typescript
let timer: NodeJS.Timeout | null = null
export const useNotifyStore = create<NotifyState & NotifyActions>()((set, get) => ({
  unread: 0,
  startPoll: () => {
    if (timer) return
    get().fetchUnread()
    timer = setInterval(() => get().fetchUnread(), 30000)
  },
  stopPoll: () => { if (timer) { clearInterval(timer); timer = null } },
  fetchUnread: async () => {
    const { count } = await api<{ count: number }>('/api/notifications/unread-count')
    set({ unread: count })
  }
}))
```

**3. 搜索（PostgreSQL insensitive 匹配）**

后端路由：

```typescript
router.get('/', async (req, res) => {
  const q = req.query.q as string
  if (!q) return res.json({ users: [], videos: [] })
  
  // Postgres 下 mode: 'insensitive' 实现大小写不敏感
  const userWhere = isPostgres()
    ? { nickname: { contains: q, mode: 'insensitive' } }
    : { nickname: { contains: q } }
  
  const [users, videos] = await Promise.all([
    prisma.user.findMany({ where: userWhere, take: 20 }),
    prisma.video.findMany({ where: { title: { contains: q } }, take: 20, include: { user: true } })
  ])
  res.json({ users, videos })
})
```

**遇到的问题**

- 服务端 `notify()` 忘防自通知：第一天测试时发现用户点赞自己的视频会在自己的通知中心看到"XXX 赞了你的视频"（XXX 就是自己）。加 `if (actorId === recipientId) return` 一行解决。AI 第一次没加，靠人工补充。
- 通知轮询 tick 重复触发：App.tsx 里 useEffect 调 `startPoll()`，StrictMode 下 React 18 会双重调用 useEffect，导致两个 30s 定时器同时跑。修复：加 `if (timer) return` guard。
- Postgres 搜索的 `mode: 'insensitive'` 参数在 SQLite 下会报错「Unknown argument mode」。用 `isPostgres()` 条件判断收口方言差异。

### 今日心得

Zustand 的 persist 中间件 + 精确订阅（`useStore(s => s.user)`）让前端状态管理非常清爽。TS1345 这个坑提醒我：**AI 生成的 Zustand 代码里，handleAuth 的返回类型一定要盯紧**——void 不能用于条件判断。防自通知是个看似微不足道的边界条件，不写就会出 bug。双模式探测是"永不白屏"的关键设计，后端挂了客户端照样能用。

---

## Day 4（8月8日）：v0.1 收尾 + API 测试 + v0.2 扩展

### 上午：v0.1 收尾 — 客户端智能封面 + seed + 69 项 API 测试

**1. extractCover() — 无 ffmpeg 依赖的客户端封面生成**

```typescript
export async function extractCover(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = URL.createObjectURL(file)
    
    const cleanup = () => {
      URL.revokeObjectURL(video.src)
      video.remove()
    }
    
    // 4 秒超时兜底：视频解码失败或格式不支持
    const timeout = setTimeout(() => { cleanup(); resolve(null) }, 4000)
    
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2)  // seek 到 1s 或中间
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 720; canvas.height = 1280
      canvas.getContext('2d')!.drawImage(video, 0, 0, 720, 1280)
      canvas.toBlob((blob) => {
        clearTimeout(timeout); cleanup(); resolve(blob)
      }, 'image/jpeg', 0.85)
    }
    video.onerror = () => { clearTimeout(timeout); cleanup(); resolve(null) }
  })
}
```

后端空值处理：

```typescript
const coverPath = req.files.cover?.[0]?.path ?? ''
// 前端没生成封面时 coverPath 为空字符串，Video.coverUrl 存空串
```

**2. seed 脚本**

注册两个账号 + 上传 5 条演示视频：

```typescript
// seed.ts
async function seed() {
  // 清空旧数据
  await prisma.notification.deleteMany()
  await prisma.like.deleteMany()
  await prisma.video.deleteMany()
  await prisma.user.deleteMany()
  
  const demo = await prisma.user.create({
    data: {
      nickname: '演示君',
      passwordHash: await hashPassword('demo1234'),
      bio: 'AI 辅助开发的短视频爱好者'
    }
  })
  
  // 上传 5 条视频到 uploads/，对应 public/videos/v1.mp4 ~ v5.mp4
  for (let i = 1; i <= 5; i++) {
    await prisma.video.create({
      data: {
        userId: demo.id,
        title: `演示视频 ${i}`,
        mediaUrl: `media://local/v${i}.mp4`,
        coverUrl: '',
        likesCount: Math.floor(Math.random() * 100)
      }
    })
  }
}
```

**3. API 集成测试（69 项断言）**

自研 test-api.ts，真实 HTTP + 真实 SQLite：

```typescript
const BASE = 'http://localhost:3000'
let passed = 0, failed = 0

async function test(name: string, fn: () => Promise<boolean>, detail?: unknown) {
  try {
    const ok = await fn()
    ok ? passed++ : failed++
    console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} ${detail ?? ''}`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${name} ${(e as Error).message}`)
  }
}

async function post(path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(BASE + path, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined })
}

// 17 个测试节
await test('health', async () => {
  const r = await fetch(`${BASE}/api/health`)
  return r.ok && (await r.json()).ok === true
})

await test('register ok', async () => {
  const r = await post('/api/auth/register', { nickname: `t_${Date.now()}`, password: '1234' })
  return r.ok && (await r.json()).token !== undefined
})

await test('login 401 wrong password', async () => {
  const r = await post('/api/auth/login', { nickname: '演示君', password: 'wrong' })
  return r.status === 401
})

await test('upload + media Range 206', async () => {
  // 上传视频 → 拿到 videoUrl → 用 Range 头请求 → 期望 206
  // ...
})

// ... 共 69 项
console.log(`\n总计 ${passed + failed} 项，通过 ${passed}，失败 ${failed}`)
```

运行结果：`npm --prefix server run test:api` → 69/69 全绿。

**遇到的问题**

- cover 生成超时 4s 后返回 null，但 multer 的 `.fields()` 如果某个 field 没有文件，`req.files.cover` 可能是 undefined 或空数组。后端用可选链 `req.files.cover?.[0]?.path ?? ''` 做空值兜底。
- API 测试每次灌 3 条测试视频（测试A/测试B），feed 前 30 条会被刷满——**测试数据污染**。定位种子用户不能直接从 feed 取，必须用搜索接口：`/api/search?q=演示君` → 拿到用户 id → `/api/users/{id}/videos`。E2E 的 preflight 也用了同样策略。

### 下午：v0.2 扩展 — 分享 + 热门 + 私信

**1. 分享计数 + 热门趋势**

数据库迁移：

```sql
ALTER TABLE Video ADD COLUMN sharesCount INTEGER NOT NULL DEFAULT 0;
```

分享接口：

```typescript
router.post('/:id/share', async (req, res) => {
  await prisma.video.update({
    where: { id: req.params.id },
    data: { sharesCount: { increment: 1 } }
  })
  // 匿名计数，不需要登录
  const shareUrl = `${FRONTEND_ORIGIN}/video/${req.params.id}`
  res.json({ success: true, shareUrl })
})
```

热门趋势（Top10 + 话题聚合）：

```typescript
router.get('/', async (req, res) => {
  // 取最近 300 条视频做聚合，避免全表扫
  const recent = await prisma.video.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { _count: { select: { likes: true, comments: true } } }
  })
  
  // 加权：likes + comments + shares
  const ranked = recent
    .map((v) => ({
      ...v,
      score: v._count.likes + v._count.comments + v.sharesCount
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  
  // #话题聚合：正则从描述提取
  const tagRegex = /#([^\s#]+)/g
  const tagCount: Record<string, number> = {}
  recent.forEach((v) => {
    const matches = v.description?.match(tagRegex) || []
    matches.forEach((m) => {
      const tag = m.slice(1)
      tagCount[tag] = (tagCount[tag] || 0) + 1
    })
  })
  const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 20)
  
  res.json({ videos: ranked, tags })
})
```

**2. 私信系统 — Message 表 + 会话聚合 + 未读数**

数据库迁移：

```sql
CREATE TABLE Message (
  id TEXT PRIMARY KEY,
  senderId TEXT NOT NULL,
  recipientId TEXT NOT NULL,
  content TEXT NOT NULL,
  readAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (senderId) REFERENCES User(id),
  FOREIGN KEY (recipientId) REFERENCES User(id)
);
CREATE INDEX Message_senderId_recipientId_idx ON Message(senderId, recipientId);
CREATE INDEX Message_recipientId_readAt_idx ON Message(recipientId, readAt);
```

会话列表聚合（JS 层，因为 SQLite 不支持窗口函数）：

```typescript
router.get('/conversations', async (req, res) => {
  const me = req.user!.id
  // 取所有与我相关的消息（双向）
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: me }, { recipientId: me }] },
    orderBy: { createdAt: 'desc' },
    take: 500  // 性能保护
  })
  
  // 按对端聚合
  const convMap = new Map<string, { peerId: string; lastAt: Date; unread: number; lastContent: string }>()
  for (const msg of messages) {
    const peerId = msg.senderId === me ? msg.recipientId : msg.senderId
    if (!convMap.has(peerId)) {
      convMap.set(peerId, {
        peerId,
        lastAt: msg.createdAt,
        lastContent: msg.content,
        unread: msg.recipientId === me && !msg.readAt ? 1 : 0
      })
    } else {
      const conv = convMap.get(peerId)!
      conv.lastAt = msg.createdAt
      conv.lastContent = msg.content
      if (msg.recipientId === me && !msg.readAt) conv.unread++
    }
  }
  
  // 按 lastAt 排序
  const conversations = Array.from(convMap.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
  
  // 附上对端用户信息
  const peerIds = conversations.map((c) => c.peerId)
  const peers = await prisma.user.findMany({ where: { id: { in: peerIds } } })
  const peerMap = new Map(peers.map((p) => [p.id, p]))
  
  res.json({
    conversations: conversations.map((c) => ({
      ...c,
      peer: peerMap.get(c.peerId)
    }))
  })
})
```

消息线程游标分页：

```typescript
router.get('/:userId/messages', async (req, res) => {
  const me = req.user!.id
  const other = req.params.userId
  const cursor = req.query.cursor as string | undefined
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
  
  // desc 取旧消息（分页往前翻）
  const where: Prisma.MessageWhereInput = {
    OR: [
      { AND: [{ senderId: me }, { recipientId: other }] },
      { AND: [{ senderId: other }, { recipientId: me }] }
    ]
  }
  if (cursor) where.createdAt = { lt: new Date(cursor) }
  
  const messages = await prisma.message.findMany({
    where, orderBy: { createdAt: 'desc' }, take: limit + 1
  })
  const hasMore = messages.length > limit
  const trimmed = hasMore ? messages.slice(0, limit) : messages
  
  // 反转入列（前端期望正序：旧 → 新）
  res.json({
    messages: trimmed.reverse(),
    nextCursor: hasMore ? trimmed[0]?.createdAt?.toISOString() : null
  })
})
```

已读标记：

```typescript
router.post('/:userId/read', async (req, res) => {
  const me = req.user!.id
  const other = req.params.userId
  // 标记"对方发给我的"消息为已读（sender = other, recipient = me）
  await prisma.message.updateMany({
    where: { senderId: other, recipientId: me, readAt: null },
    data: { readAt: new Date() }
  })
  res.json({ success: true })
})
```

未读数接口（30s 轮询调用）：

```typescript
router.get('/unread-count', async (req, res) => {
  const me = req.user!.id
  const count = await prisma.message.count({
    where: { recipientId: me, readAt: null }
  })
  res.json({ count })
})
```

**遇到的问题**

- 会话聚合一开始用 SQL 窗口函数 `ROW_NUMBER() OVER(PARTITION BY peerId ORDER BY createdAt DESC)`，SQLite 不支持——**SQLite 3.25+ 才支持窗口函数，但 Prisma 的 SQLite 驱动默认用 3.x**。改成 JS 层聚合，数据量可控时完全够用（每个用户最多 500 条历史消息，一次性拉回来也没问题）。
- 私信未读数查询必须走 `[recipientId, readAt]` 复合索引。没有这个索引时每次 `SELECT COUNT(*) FROM Message WHERE recipientId = ? AND readAt IS NULL` 都要全表扫，30s 轮询下数据库会爆。加索引后查询从 O(N) 变成 O(logN)。
- 已读标记 updateMany 只标记 `senderId = other AND recipientId = me` 的消息——我发给对方的消息不需要标记（对方那边还没读是对方的事）。

### 今日心得

客户端生成封面（canvas seek + toBlob）这个设计太巧妙——把 ffmpeg 的事交给浏览器，零依赖还跨平台。API 测试的"测试数据污染"坑提醒我：**定位种子数据要用搜索接口，别直接从 feed 取**。SQL 窗口函数虽然好用但 SQLite 不支持，JS 层聚合在数据量可控时是更简单的方案。私信未读数的复合索引是性能关键，Prisma schema 里要显式声明 `@@index([recipientId, readAt])`。

---

## Day 5（8月9日）：electron-updater + S3/Redis 门控 + 竞态修复 + Docker

### 上午：electron-updater + S3 存储抽象 + Redis 缓存门控

**1. electron-updater 接入**

主进程：

```typescript
import { autoUpdater } from 'electron-updater'

// dev 模式跳过检查
if (!app.isPackaged) {
  autoUpdater.autoDownload = false
  // 必须注册静默 error 监听器！否则未处理的更新错误会变成 unhandled rejection
  autoUpdater.on('error', () => {})
}

autoUpdater.on('update-downloaded', (info) => {
  // 通知渲染层有更新可安装
  win?.webContents.send('update-downloaded', info.version)
})

// 渲染层调用时才检查更新
ipcMain.handle('check-update', async () => {
  try {
    return await autoUpdater.checkForUpdates()
  } catch { return null }
})
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall())
```

electron-builder.yml 配置：

```yaml
publish:
  provider: generic
  url: https://your-server.com/updates/
```

渲染层更新提示条：

```typescript
// App.tsx
useEffect(() => {
  window.pcApi?.onUpdateAvailable((version) => {
    setUpdateInfo({ version, show: true })
  })
  window.pcApi?.onUpdateDownloaded((version) => {
    setUpdateInfo({ version, downloaded: true, show: true })
  })
}, [])
```

**2. S3 存储抽象（LocalStorage / S3Storage）**

```typescript
// storage.ts
export interface Storage {
  save(filename: string, data: Buffer, mimeType: string): Promise<string>
  getUrl(filename: string): string
  delete(filename: string): Promise<void>
}

class LocalStorage implements Storage {
  async save(filename: string, data: Buffer) {
    const filePath = path.join(UPLOAD_DIR, filename)
    fs.writeFileSync(filePath, data)
    return filename  // 本地存储只存文件名
  }
  getUrl(filename: string) {
    return `media://local/${filename}`
  }
}

class S3Storage implements Storage {
  private s3: S3
  constructor() {
    this.s3 = new S3({ region: process.env.S3_REGION, ... })
  }
  async save(filename: string, data: Buffer, mimeType: string) {
    await this.s3.putObject({ Bucket: BUCKET, Key: filename, Body: data, ContentType: mimeType }).promise()
    return filename
  }
  getUrl(filename: string) {
    // S3 文件由后端 /api/media/:filename Range 代理（生产环境走 nginx 反代 + S3 直传）
    return filename
  }
}

// 环境变量门控
export const storage: Storage = process.env.S3_BUCKET
  ? new S3Storage()
  : new LocalStorage()
```

**3. Redis 缓存门控（no-op 降级）**

```typescript
// cache.ts
interface Cache {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, ttlSec?: number): Promise<void>
  del(key: string): Promise<void>
  available(): boolean
}

class NoOpCache implements Cache {
  async get<T>(): Promise<T | null> { return null }
  async set() { /* no-op */ }
  async del() { /* no-op */ }
  available() { return false }
}

class RedisCache implements Cache {
  private client: Redis
  constructor() { this.client = createClient({ url: process.env.REDIS_URL! }) }
  async get<T>(key: string): Promise<T | null> { ... }
  async set(key: string, value: unknown, ttlSec?: number) { ... }
  async del(key: string) { ... }
  available() { return true }
}

export const cache: Cache = process.env.REDIS_URL
  ? new RedisCache()
  : new NoOpCache()
```

缓存应用点（未读数 + 用户计数）：

```typescript
// 未读数查询前先查缓存
const cacheKey = `notif:unread:${userId}`
const cached = await cache.get<number>(cacheKey)
if (cached !== null) return { count: cached }

const count = await prisma.notification.count({ where: { recipientId: userId, readAt: null } })
await cache.set(cacheKey, count, 60)  // TTL 60s
```

**遇到的问题**

- NSIS 工具链从 GitHub 下载极慢：electron-builder 打包时 `Downloading NSIS from https://github.com/electron-userland/electron-builder-binaries/releases/download/...` 卡在连接超时。修复：设置环境变量 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`，从 npmmirror 镜像下载，几十秒完成。
- electron-updater 没注册 error 监听器：开发模式下每次启动都会抛 `UnhandledPromiseRejectionWarning: Error: ENOENT: no such file or directory, access 'latest.yml'`，导致 Electron 进程崩溃。修复：加 `autoUpdater.on('error', () => {})` 静默吞掉。这是 electron-updater 的已知坑，官方文档没特别强调但必须做。
- S3 接入时 MinIO 在沙盒里拉不到（CN 网络 `dl.min.io` 超时），npmmirror 也没有 minio 二进制（`/-/binary/minio` → NOT_FOUND）。**S3/Redis/Postgres 在沙盒里无法真实演练**，只能靠代码审查 + 单元测试验证门控逻辑。

### 下午：竞态修复 + 服务器运行时切换 + Docker 全栈

**1. 未读数 stale 响应竞态修复（核心 bug）**

**问题**：E2E 偶发失败——进入私信聊天发送后，未读徽标偶尔不会清零。手动测试发现：服务端 unread-count 立即变成 0，但 UI 徽标仍然显示 1，最长持续 30 秒才自动消失。

**根因**：30s 轮询 `refreshUnread()` 发出的在途 fetch 请求，可能在 `POST /api/dm/read/:userId`（标记已读）**之后**才落地。这个 stale 响应带着旧的 unread count（比如 1），覆盖了 store 里刚写入的 0。

**诊断**：在 dmStore 的 fetchUnread 里加时间戳 + 序号观测：

```typescript
async function fetchUnread(seq: number) {
  const { count } = await api<{ count: number }>('/api/dm/unread-count')
  console.log(`[dmStore] seq=${seq} count=${count} appliedSeq=${appliedSeq}`)
  set((s) => ({ ...s, unread: count }))
}
```

手动操作后看到：

```
[dmStore] seq=3 count=1 appliedSeq=0   ← 轮询 tick，旧响应
[dmStore] seq=4 count=0 appliedSeq=1   ← 进入聊天后立即刷新
[dmStore] seq=3 count=1 appliedSeq=1   ← stale 响应后落地！把 0 盖回 1
```

**修复**：单调序号防护——只有 seq 更大的响应才写 store，stale 响应直接丢弃：

```typescript
let unreadSeq = 0
let appliedSeq = 0

async function fetchUnread() {
  unreadSeq++
  const mySeq = unreadSeq
  const { count } = await api<{ count: number }>('/api/dm/unread-count')
  if (mySeq <= appliedSeq) return  // stale 响应，丢弃
  appliedSeq = mySeq
  set({ unread: count })
}
```

notifyStore 的 fetchUnread 也加了同款修复。修复后 E2E 连续 6 轮全绿。

**2. 服务器运行时切换**

api/client.ts：

```typescript
export function setServerUrl(url: string): boolean {
  const clean = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\/.+/.test(clean)) throw new Error('地址需以 http:// 或 https:// 开头')
  if (clean === API_BASE) return false
  localStorage.setItem(SERVER_URL_KEY, clean)
  return true
}
```

ServerSettings.tsx 弹窗组件：

```typescript
const [input, setInput] = useState('')
const [error, setError] = useState('')
const [saved, setSaved] = useState(false)

async function handleSave() {
  try {
    const changed = setServerUrl(input)
    setSaved(true)
    setError('')
    if (changed) {
      // 重新加载页面让 API_BASE 重新求值
      setTimeout(() => location.reload(), 800)
    }
  } catch (e) {
    setError((e as Error).message)
  }
}
```

双入口：LoginView 登录页有 "⚙ 服务器设置" 链接，Sidebar 底部有 ⚙ 按钮。

**3. Docker Compose 全栈 + nginx 反代**

docker-compose.prod.yml：

```yaml
version: '3.8'
services:
  api:
    build: ./server
    ports:
      - "127.0.0.1:3000:3000"  # 只绑本地，nginx 反代对外
    environment:
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/pcdouyin
      - REDIS_URL=redis://redis:6379
      - S3_BUCKET=pcdouyin
      - S3_ENDPOINT=http://minio:9000
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_ENABLED=true
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
  
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: pcdouyin
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      retries: 5
  
  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      retries: 5
  
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      retries: 5
  
  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      bash -c "mc alias set myminio http://minio:9000 minioadmin ${MINIO_ROOT_PASSWORD} && mc mb --ignore-existing myminio/pcdouyin"

volumes:
  pgdata:
  redisdata:
  miniodata:
```

nginx.conf：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    client_max_body_size 200m;     # 对齐上传上限
    proxy_buffering off;           # Range 206 直传不缓冲，视频拖进度条低延迟
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    location /updates/ {
        alias /var/www/updates/;   # electron-updater 托管位置
    }
}
```

**遇到的问题**

- 竞态修复 AI 第一次给的方案是"加 sleep(500) 等一下"——这不对，正确做法是让 stale 响应被丢弃，而不是让它晚到。时序问题靠 sleep 是碰运气，序号防护是根治。
- Dockerfile 的 CMD 直接 `npm run start` 会在容器启动时 API 还没迁移就报错"找不到表"。改成 `CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]`，`prisma migrate deploy` 是幂等的（已应用的迁移不会重复执行）。
- nginx 的 `proxy_buffering off` 对 Range 206 至关重要——如果开启缓冲，nginx 会先把整个视频文件读完再转发，拖进度条就会卡顿。

### 今日心得

环境门控模式（LocalStorage/S3、NoOpCache/RedisCache）让开发零依赖、生产按需开启，这是云原生时代的基本姿势。竞态 bug 的根因分析比修复本身重要——**通过 console.log 打序号观测到 stale 响应的落地顺序，再用单调序号防护一招致命**。electron-updater 必须注册 error 监听器，这是官方文档没强调但生产必须做的事。

---

## Day 6（8月10日）：打包 + E2E + GitHub 上线

### 上午：Electron 打包 + Playwright E2E

**1. Electron 打包（NSIS 安装包）**

electron-builder.yml 配置：

```yaml
appId: com.pcdouyin.app
productName: PCDouyin
directories:
  output: dist2
files:
  - out/**/*
  - package.json
win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
```

打包命令：

```powershell
npm run dist
# electron-vite build → electron-builder --win
# 产物：dist2/win-unpacked/PCDouyin.exe + dist2/PCDouyin Setup 0.2.1.exe
```

**2. Playwright 驱动真实 exe 的 E2E（12 步全链路）**

e2e/packaged.mjs 核心设计：

```javascript
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'fs'

const EXE = path.join(ROOT, 'dist2', 'win-unpacked', 'PCDouyin.exe')
const BASE = 'http://localhost:3000'

// 前置检查
if (!existsSync(EXE)) { console.error('未找到打包产物'); process.exit(2) }
try { await fetch(`${BASE}/api/health`) } catch { console.error('后端未运行'); process.exit(2) }

// 注入确定性数据：注册临时账号给演示君点一条赞 + 发一条私信
// 这样通知/私信的未读徽标在每次 E2E 前都稳定为 1
const uniq = Date.now().toString(36)
const reg = await post('/api/auth/register', { nickname: `n_${uniq}`, password: '1234' })
const demo = await searchUser('演示君')
const video = await firstVideoOf(demo.id)
await post(`/api/videos/${video.id}/like`, {}, reg.token)
await post(`/api/dm/conversations/${demo.id}/messages`, { content: 'E2E测试' }, reg.token)

// 启动真实打包的 Electron 应用
const electronApp = await electron.launch({ executablePath: EXE })
const win = await electronApp.firstWindow()

// 12 步测试
// STEP1: 登录感知（探测登录页元素，兼容残留会话）
const hasLoginForm = await win.locator('input[placeholder*="昵称"]').first().isVisible().catch(() => false)
if (hasLoginForm) {
  await win.fill('input[placeholder*="昵称"]', '演示君')
  await win.fill('input[placeholder*="密码"]', 'demo1234')
  await win.click('button:has-text("登录")')
}

// STEP2: feed 视频卡片可见
await poll(() => win.locator('video').count() > 0, { timeout: 10000 })

// STEP3: 点赞
const likeBtn = win.locator('button:has-text("❤")').first()
await likeBtn.click()

// STEP4: 搜索
await win.click('input[placeholder*="搜索"]')
await win.fill('input[placeholder*="搜索"]', '演示君')
await win.press('input[placeholder*="搜索"]', 'Enter')
await poll(() => win.locator('h3:has-text("演示君")').first().isVisible())

// STEP5: 关注
await win.click('button:has-text("+ 关注")')
await poll(() => win.locator('button:has-text("已关注")').first().isVisible())

// STEP6: 关注流切换
await win.click('button:has-text("关注")').first()
await poll(() => win.locator('video').count() > 0)

// STEP7: 通知徽标 → 通知列表 → 已读
await poll(() => win.locator('span.bg-red-500').count() > 0)  // 徽标可见
await win.click('div:has-text("通知")')
await win.click('button:has-text("全部已读")')
await poll(() => win.locator('span.bg-red-500').count() === 0)  // 徽标消失

// STEP8: 私信徽标 → 会话 → 发送消息 → 徽标清零
await poll(() => win.locator('div:has-text("私信") span.bg-red-500').count() > 0)
await win.click('div:has-text("私信")')
await poll(() => win.locator('div:has-text("n_")').first().isVisible())
await win.click('div:has-text("n_")').first()
await poll(() => win.locator('input[placeholder*="输入消息"]').isVisible())
await win.fill('input[placeholder*="输入消息"]', 'E2E回复')
await win.press('input[placeholder*="输入消息"]', 'Enter')
// 回到侧边栏，验证徽标清零（轮询加 seq 防护，见 Day5）
const dmBadgeGone = await poll(() => {
  // 先点其他 tab 触发未读数刷新
  win.click('div:has-text("首页")')
  return win.locator('div:has-text("私信") span.bg-red-500').count() === 0
}, { timeout: 15000 })

// STEP9: 分享（alert 弹窗）
let shareMsg = ''
win.on('dialog', async (dlg) => { shareMsg = dlg.message(); await dlg.accept() })
const shareBtn = win.locator('button:has-text("↗")').first()
await shareBtn.click()
await poll(() => shareMsg.includes('分享链接已复制'), { timeout: 6000 })

// STEP10: 服务器设置弹窗
await win.click('button[title="服务器设置"]')
await poll(() => win.locator('h2:has-text("服务器地址")').first().isVisible())
await win.click('button:has-text("取消")')
await poll(() => !win.locator('h2:has-text("服务器地址")').first().isVisible())

// STEP11/12: 热门 tab + 退出登录（略）

await electronApp.close()
console.log(`\n总计 12 项，通过 ${passed}，失败 ${failed}`)
```

**E2E 关键设计**

- **登录态感知**：探测登录页的昵称输入框是否可见。如果不可见，说明残留了之前的登录态，跳过登录步骤——真实反映生产环境用户的使用情况。
- **前置 API 造数据**：每个测试 run 开始前，通过 HTTP API 注册临时账号给演示君发一条私信，保证未读徽标可观测。幂等设计（每次注册新临时账号），不受前一次 run 数据污染影响。
- **失败自动截图**：任何一步 `check()` 失败，自动 `win.screenshot({ path: ... })` 存到 `e2e/screenshots/`，方便事后排查。
- **观测式轮询**：DM 徽标清除轮询里，当 count() 返回 >0 时，自动 `evaluateAll` dump 匹配元素的 outerHTML + fetch 服务端 unread-count 真值——区分"UI 真没更新"还是"匹配到了 ghost 元素"。

**运行结果**：`npm run test:e2e` → 12/12 全绿。连续跑 6 轮均全绿（修复竞态前偶挂率 ~1/5，修复后稳定）。

**遇到的问题**

- `locator.count()` 统计含隐藏元素，但截图只反映可见状态——count() 返回 1 但截图里看不到徽标。这时候不能对着选择器瞎猜，先用 `evaluateAll(els => els.map(e => e.outerHTML))` dump 出来看看匹配到的到底是什么。
- React 受控组件在 Playwright 里：`win.fill()` 原生处理了合成事件，不需要自己用原生 setter + dispatch input（浏览器 E2E 里才需要，之前在裸 `browser_evaluate` 脚本里踩过这个坑）。
- E2E 的 DM 徽标清除轮询原来只有 10s 超时，修复竞态后加了 seq 防护，还是把超时加到 15s 更稳妥（30s 轮询 tick 的最坏情况）。

### 下午：GitHub 上线 + 最终验证

**1. Git 仓库初始化 + 清理**

`.gitignore` 必须排除：

```
node_modules/
dist2/           # 打包产物
.env             # 开发密钥（GitHub 只存 .env.example）
server/.env
.electron-cache/  # 打包工具缓存（约 300 MB）
.eb-cache/
userData/        # 本地运行数据
uploads/         # 上传的视频
dev.db           # SQLite 开发库
*.log
```

首次 `git add .` 混入了 1200+ 个缓存文件（`.electron-cache/builder/nsis-3.0.4.1/...` 几百个 NSIS 本地化文件）。补全 `.gitignore` 后重新暂存，最终 94 个文件入库。

**2. 提交 + 推送**

PowerShell 不支持 bash heredoc 写 commit 消息——用 `-F` 文件方式：

```powershell
# 先用 Node 写消息文件（避免 BOM）
node -e "require('fs').writeFileSync('msg.txt', '初始提交：PC 桌面版短视频平台 v0.2.1\n\nElectron + React + TypeScript 客户端 × Express 5 + Prisma 后端：\n视频流/上传/点赞收藏评论/分享/关注/搜索/通知/私信/热门趋势；\nJWT 双 Token 认证、双数据库与 S3/Redis 环境门控、\n69 项 API 集成测试 + 打包产物级 Playwright E2E、Docker 全栈部署。', 'utf8')"
git add .
git commit -F msg.txt
git branch -M main
git remote add origin git@github.com:7852-xy/PC-douyin.git
git push -u origin main
```

字节级验证 commit 消息的 UTF-8 编码（`e5889d` = "初"，无 BOM），GitHub 上显示正常。

**3. 最终验证**

```powershell
# 类型检查
npm run typecheck          # 根目录 tsc --noEmit
npm --prefix server run typecheck  # server 目录 tsc --noEmit

# API 测试
npm --prefix server run test:api  # 69/69 全绿

# E2E
npm run test:e2e           # 12/12 × 6 连绿

# GitHub
git ls-remote origin       # main 分支 HEAD = 15bce71
```

### 今日心得

Playwright 驱动真实打包产物（而非 dev 服务页面）是 E2E 质量的关键——真正验证了 `electron-updater`、`media://` 协议、打包后的资源路径、contextBridge IPC 等 dev 模式下根本不会走到的逻辑。Git 清理（排除缓存/密钥/构建产物）是推送前必须做的事，不然仓库会膨胀几百 MB。PowerShell 的编码坑（BOM/GBK/UTF-8）是 Windows 开发的日常——数据文件一律 Node `fs.writeFileSync` 或 Edit 工具处理，别用 `Set-Content`。

---

*6 天开发笔记完*
