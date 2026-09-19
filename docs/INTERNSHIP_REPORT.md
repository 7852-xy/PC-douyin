# 实习报告：PC 桌面版短视频平台开发

---

## 目录

- 一、实习目的………………………………………………………1
- 三、实习过程………………………………………………………2
  - 3.1 总体实习过程……………………………………………2
  - 3.2 具体实习过程……………………………………………2
- 四、实习时间………………………………………………………3
  - 4.1 总体时间安排……………………………………………3
  - 4.2 具体时间安排……………………………………………3
- 五、实习内容………………………………………………………3
  - 5.1 环境搭建…………………………………………………3
    - 5.1.1 Node.js 22 安装…………………………………3
    - 5.1.2 VS Code / Trae IDE 安装………………………3
    - 5.1.3 Git + GitHub SSH 配置…………………………3
    - 5.1.4 Electron 开发脚手架创建………………………4
    - 5.1.5 Prisma + SQLite 初始化………………………4
    - 5.1.6 Postman 安装………………………………………4
  - 5.2 项目需求分析……………………………………………4
    - 5.2.1 用户角色……………………………………………4
    - 5.2.2 游客端………………………………………………4
    - 5.2.3 会员端………………………………………………5
  - 5.3 网站开发流程……………………………………………5
    - 5.3.1 数据库设计…………………………………………5
    - 5.3.2 前端设计……………………………………………5
    - 5.3.3 后端业务实现………………………………………6
  - 5.4 TypeScript + React 基础………………………………6
    - 5.4.1 TypeScript 类型系统……………………………6
    - 5.4.2 React 核心概念……………………………………6
    - 5.4.3 Zustand 状态管理…………………………………7
    - 5.4.4 Express 路由与中间件……………………………7
    - 5.4.5 Prisma 查询………………………………………7
  - 5.5 Prisma schema 设计与数据库搭建……………………8
    - 5.5.1 SQLite 开发库……………………………………8
    - 5.5.2 PostgreSQL 生产库………………………………8
    - 5.5.3 双 schema 维护规范………………………………8
  - 5.6 Electron + Express 框架搭建…………………………9
    - 5.6.1 Electron 多进程架构……………………………9
    - 5.6.2 Express 服务骨架…………………………………9
    - 5.6.3 Dockerfile…………………………………………10
  - 5.7 前端页面制作及项目功能整合…………………………10
    - 5.7.1 核心页面清单……………………………………10
    - 5.7.2 视频上传全链路…………………………………10
    - 5.7.3 JWT 401 单飞刷新链路…………………………11
    - 5.7.4 未读数竞态修复链路……………………………11
- 六、实习心得……………………………………………………12

---

## 一、实习目的

本次实习以企业内部真实项目为载体，目标是独立完成一款 PC 桌面端短视频应用的全栈开发。通过实习，旨在达到以下几点：

1. 熟练掌握 Electron + React + TypeScript 桌面应用开发栈，理解多进程架构（主进程/渲染进程/预加载脚本）与 IPC 通信机制
2. 掌握 Node.js 后端开发技术（Express 框架、Prisma ORM、JWT 认证体系），具备从零搭建 RESTful API 的能力
3. 学习 Docker 容器化部署流程，理解生产环境与开发环境的差异及环境变量门控策略
4. 培养完整的软件交付意识：从需求分析 → 架构设计 → 编码实现 → 测试验证 → 部署上线的闭环能力
5. 在 AI 辅助开发环境下，建立"用自动化测试兜住 AI 产出质量"的工程思维

---

## 三、实习过程

### 3.1 总体实习过程

实习共分为五个阶段，时间跨度约四周：

| 阶段 | 内容 | 周期 |
|---|---|---|
| 第一阶段 | 环境搭建 + 技术预研 | 第 1 周前 2 天 |
| 第二阶段 | 需求分析 + 架构设计 + 数据库建模 | 第 1 周后 3 天 |
| 第三阶段 | 核心功能开发（v0.1：视频流/互动/基础社交） | 第 2 周 |
| 第四阶段 | 扩展功能开发（v0.2：分享/热门/私信/自动更新） | 第 3 周 |
| 第五阶段 | 生产加固 + 部署交付（v0.2.1：竞态修复/服务器切换/Docker 部署） | 第 4 周 |

每个阶段结束后进行阶段性自测与代码评审，确保质量后方可进入下一阶段。

### 3.2 具体实习过程

**第一周**：搭建 Electron + React + Prisma 开发环境，完成技术预研（自定义协议视频流、JWT 双 Token 机制、双数据库切换）；输出需求文档与架构设计文档；完成 Prisma schema 设计与 SQLite 迁移。

**第二周**：实现视频域核心功能（feed 流、视频上传与 Range 流式播放、点赞/收藏/评论）、基础社交（关注/搜索/通知）、认证模块（JWT 双 Token + 401 单飞刷新）。后端 API 全部实现后即编写 API 集成测试（69 项断言），确保每次改动可立即回归验证。

**第三周**：实现扩展功能（分享计数、热门趋势 Top10、私信 1:1 会话与未读徽标、electron-updater 自动更新）；后端升级：PostgreSQL 双 schema、S3 存储抽象、Redis 缓存门控（全部环境变量开关，开发零依赖）。

**第四周**：修复未读数 stale 响应竞态（30s 轮询 tick 在途旧响应盖回已读数）；新增服务器运行时切换功能；编写 Docker Compose 全栈编排与 nginx 反代配置；VPS 一键部署脚本验证；打包产物 E2E 测试（Playwright 驱动真实 exe，12 步全链路）；最终上线 GitHub。

---

## 四、实习时间

### 4.1 总体时间安排

```
2026年08月05日 — 2026年08月31日（共 4 周，约 20 个工作日）
```

### 4.2 具体时间安排

| 时间 | 工作内容 |
|---|---|
| 8月5日 — 8月6日 | 环境搭建 + 技术预研 |
| 8月7日 — 8月9日 | 需求分析 + 架构设计 + 数据库建模 |
| 8月10日 — 8月16日 | v0.1 核心功能开发 |
| 8月17日 — 8月23日 | v0.2 扩展功能开发 |
| 8月24日 — 8月31日 | v0.2.1 生产加固 + 部署交付 + 文档整理 |

---

## 五、实习内容

### 5.1 环境搭建

#### 5.1.1 Node.js 22 安装

后端运行时。官网下载安装包，验证 `node -v` 与 `npm -v`。由于国内网络原因，额外配置 npmmirror 加速：

```powershell
npm config set registry https://registry.npmmirror.com
```

#### 5.1.2 VS Code / Trae IDE 安装

主开发工具。安装核心插件：ESLint、Prettier、Tailwind CSS IntelliSense、Prisma。

#### 5.1.3 Git + GitHub SSH 配置

```powershell
ssh-keygen -t ed25519 -C "2144294384@qq.com"
# 公钥粘贴到 GitHub Settings → SSH Keys
ssh -T git@github.com  # 验证：Hi 7852-xy!
```

#### 5.1.4 Electron 开发脚手架创建

```powershell
npm create @quick-start/electron@latest  # 选择 react-ts 模板
npm install
npm run dev                              # 验证热更新正常
```

#### 5.1.5 Prisma + SQLite 初始化

```powershell
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
# 编辑 schema.prisma 定义 User / Video / Like 等模型
npx prisma migrate dev --name init
```

#### 5.1.6 Postman 安装

用于 API 接口调试。

### 5.2 项目需求分析

#### 5.2.1 用户角色

| 角色 | 说明 |
|---|---|
| 游客 | 无需登录，可浏览推荐流、搜索、查看用户主页，无法点赞/评论/关注/私信 |
| 普通用户 | 注册登录后可上传视频、点赞/收藏/评论/分享、关注/私信、接收通知 |

#### 5.2.2 游客端

- 推荐流浏览（视频播放 + 自动播放）
- 搜索（用户 / 视频）
- 用户主页查看（作品列表、粉丝数）
- 服务器地址配置（登录页 ⚙ 弹窗）

#### 5.2.3 会员端（登录后）

- 全部游客功能 + 视频上传 + 互动（点赞/收藏/评论/分享）+ 关注/粉丝体系 + 通知中心（未读徽标、已读）+ 私信（1:1 会话、未读徽标）+ 热门趋势排行 + 自动更新检测

### 5.3 网站开发流程

#### 5.3.1 数据库设计

采用 Prisma schema-first 方式建模。核心 10 个模型：

- **User**：id / nickname / passwordHash / avatar / bio / createdAt
- **Video**：id / userId / title / description / mediaUrl / coverUrl / likesCount / commentsCount / sharesCount / createdAt
- **Like / Collect / Comment / CommentLike**：互动关系表，复合索引防重复
- **Follow**：关注关系，userId + followerId 复合唯一
- **Notification**：actorId / recipientId / type / targetId / readAt
- **Message**：senderId / recipientId / content / readAt，复合索引 `[recipientId, readAt]` 加速未读数查询
- **RefreshToken**：token / userId / jti / expiresAt / revokedAt

双 schema 策略：`schema.prisma`（sqlite 开发）+ `schema.postgres.prisma`（生产），字段完全一致，仅 provider 不同。Postgres 迁移通过 `migrate diff --from-empty` 离线生成基线 SQL。

#### 5.3.2 前端设计

- **UI 框架**：Tailwind CSS + framer-motion 动画
- **状态管理**：Zustand（7 个 store：user / app / video / follow / notify / dm / profile），持久化数据（token/用户信息）用 `persist` 中间件写 localStorage，瞬态 UI 状态（弹窗开关、loading）不落盘
- **组件架构**：Sidebar（侧栏导航 + 未读徽标）+ TopTabs（推荐/关注/热门切换）+ VideoFeed（卡片滑动容器）+ ActionBar（互动按钮组）+ ChatView（私信详情）
- **双模式探测**：启动时 `probeMode()` fetch `/api/health`，4s 超时则降级本地 mock（内置 5 条示例视频 + localStorage 持久化互动数据）

#### 5.3.3 后端业务实现

- **框架**：Express 5 + TypeScript（tsx watch 热重载）
- **认证**：bcrypt 哈希密码；JWT 双 Token（access 30min + refresh 7d），refresh 轮换 + jti 内存黑名单；并发 401 单飞刷新（模块级 Promise 共享）
- **上传**：multer 单实例 `.fields([{video},{cover}])`，fileFilter 按 fieldname 分流 MIME 白名单；文件名 UUID 重建，防路径穿越
- **视频流**：后端 `/api/media/:filename` 做 Range 代理（本地磁盘或 S3），主进程 `media://` 协议拦截渲染层请求返回 206 分片
- **通知**：服务端 `notify()` 统一入口，`actorId === recipientId` 早返回防自通知；30s 轮询未读数（Redis 门控 TTL 60s）
- **私信**：1:1 会话按对端聚合在 JS 层（双向最近消息分组排序），消息游标分页（desc 取旧消息后反转入列），`updateMany` 批量标记已读

### 5.4 TypeScript + React 基础（核心语法与框架要点）

#### 5.4.1 TypeScript 类型系统

- **接口与类型别名**：`interface VideoItem { id: string; title: string; likes: number; ... }` 用于 API 响应类型约束
- **联合类型与字面量类型**：`type Mode = 'server' | 'mock'`、`type NotifyType = 'like' | 'follow' | 'comment'`
- **泛型**：`api<T = unknown>(path: string, opts?: ApiOpts): Promise<T>` 统一请求封装
- **模块增强**：`import.meta.env.VITE_API_BASE` 需要 `vite/client` 类型声明

#### 5.4.2 React 核心概念

- **函数组件 + Hooks**：`useState` / `useEffect` / `useCallback` / `useMemo`
- **受控组件**：表单输入用 `value + onChange` 双向绑定（注意自动化测试需原生 setter 绕过 React 合成事件）
- **组合式组件**：VideoFeed → VideoCard → ActionBar 层级
- **key prop**：列表渲染唯一标识（视频 id 而非 index，避免滑动时复用错位）

#### 5.4.3 Zustand 状态管理

```typescript
export const useUserStore = create<UserState & UserActions>()(
  persist(
    (set) => ({
      user: null,
      login: async (nickname, password) => { ... },
      logout: () => set({ user: null }),
    }),
    { name: 'pc-douyin-user' }
  )
)
// 使用：const user = useUserStore((s) => s.user)  // 精确订阅
```

#### 5.4.4 Express 路由与中间件

```typescript
app.post('/api/auth/login', rateLimit(60), async (req, res) => { ... })
app.get('/api/videos', requireAuth, async (req, res) => { ... })
// 错误处理中间件：所有路由抛 ApiError 统一返回 { error, status }
```

#### 5.4.5 Prisma 查询

```typescript
const video = await prisma.video.findUnique({
  where: { id },
  include: { user: true, _count: { select: { likes: true, comments: true } } }
})
// Postgres 专用：
const users = await prisma.user.findMany({
  where: { nickname: { contains: q, mode: 'insensitive' } }
})
```

### 5.5 Prisma schema 设计与数据库搭建

#### 5.5.1 SQLite 开发库

```powershell
npx prisma migrate dev --name init        # 首次建模
npx prisma migrate dev --name social      # 添加关注/通知后
npx prisma studio                         # 可视化管理数据库
```

#### 5.5.2 PostgreSQL 生产库

```powershell
# schema.postgres.prisma 与 schema.prisma 字段一致，改 provider = "postgresql"
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgres.prisma --script > migrations-postgres/0_init/migration.sql
# 生产部署：prisma migrate deploy（幂等，无锁竞争）
```

#### 5.5.3 双 schema 维护规范

每次改表必须同步改两个 schema 文件，然后分别跑 `migrate dev`（sqlite）和 `migrate diff`（postgres），确保生产迁移 SQL 与开发 schema 对齐。

### 5.6 Electron + Express 框架搭建

#### 5.6.1 Electron 多进程架构

```
main/index.ts：
  - BrowserWindow 创建（webPreferences: { contextIsolation: true, preload }）
  - protocol.handle('media', ...)  ← 自定义视频协议拦截
  - electron-updater 初始化
  - commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

preload/index.ts：
  contextBridge.exposeInMainWorld('pcApi', {
    openUpdateDialog: () => ipcRenderer.send(...),
    onUpdateAvailable: (cb) => ipcRenderer.on(...),
  })

renderer/App.tsx：
  - probeMode() 探测后端 → 设置 store.mode
  - startNotify() + startDm() 30s 未读轮询
```

#### 5.6.2 Express 服务骨架

```typescript
// env.ts 必须是最先 import（ESM hoisting 会提前求值）
import './env'
import express from 'express'
import { prisma } from './prisma'
import authRoutes from './routes/auth'
import videoRoutes from './routes/videos'
// ...
app.use('/api/auth', authRoutes)
app.use('/api/videos', videoRoutes)
app.listen(3000)
```

#### 5.6.3 Dockerfile（生产）

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
# 容器启动时先迁移再起 API
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
```

### 5.7 前端页面制作及项目功能整合

#### 5.7.1 核心页面清单

| 页面 | 路由/触发 | 核心功能 | 依赖接口 |
|---|---|---|---|
| LoginView | 启动（未登录） | 登录/注册/服务器设置 | POST /auth/login /auth/register |
| VideoFeed | 启动（已登录） | 视频卡片滑动、自动播放 | GET /videos |
| TopTabs | 切换 | 推荐/关注/热门 | GET /videos?feed=following /trending |
| ActionBar | 点击 | 点赞/收藏/评论/分享 | POST /videos/:id/like 等 |
| CommentPanel | 评论图标 | 评论列表/发表评论 | GET/POST /videos/:id/comments |
| SearchResultsView | 搜索栏提交 | 用户/视频搜索 | GET /search?q= |
| NotificationsView | 通知徽标点击 | 通知列表/已读 | GET /notifications /read-all |
| MessagesView | 私信徽标点击 | 会话列表 | GET /dm/conversations |
| ChatView | 会话点击 | 消息线程/发送/已读 | GET/POST /dm/messages |
| UserProfileView | 用户点击 | 主页/粉丝/关注列表 | GET /users/:id /videos |
| ServerSettings | ⚙ 弹窗 | 服务器地址配置 | localStorage 读写 |

#### 5.7.2 视频上传全链路

```
Upload 按钮 → 选择文件 → extractCover()（隐藏 video + canvas seek 1s → JPEG）
→ FormData.append('video', file) + append('cover', coverBlob)
→ POST /api/videos  → multer .fields() 分流校验
→ 文件名 UUID 重建 → 写入 uploads/ → 返回 videoUrl: media://local/<uuid>.mp4
→ feed 接口返回 → <video src="media://local/xxx"> → 主进程拦截 → Range 206
```

#### 5.7.3 JWT 401 单飞刷新链路

```
api() 请求 → 服务端返回 401
→ 检查：有 refreshToken + 非 refresh 请求 + 未重试过
→ 创建 refreshPromise（模块级，仅首次）
→ refreshPromise 完成后：setToken(新 access) + setRefreshToken(新 refresh)
→ 重放原请求（带 _retry: true 标记，跳过刷新逻辑）
→ 后续 401 直接 await 同一个 refreshPromise，不重复刷
```

#### 5.7.4 未读数竞态修复链路（v0.2.1 新增）

```
30s 轮询 refreshUnread() → 服务端 unread-count → store.set({ unread: count })
进入聊天 → POST read/:userId（服务端 unread-count → 0）
→ 立即 refreshUnread() → store.set({ unread: 0 })
竞态：轮询 tick 的在途旧响应可能在 read 之后落地
修复：单调序号 unreadSeq++ 仅当响应的 seq > appliedSeq 才写 store
→ stale 响应被丢弃，徽标保持已清零状态
```

---

## 六、实习心得

### 6.1 技术成长

本次实习从零独立完成了一款桌面端短视频应用，技术栈覆盖 Electron 多进程架构、React + TypeScript 前端生态、Express + Prisma 后端开发、Docker 容器化部署。相比学校课程中单一的 Web 开发，桌面端开发涉及的面更广：自定义协议拦截、自动播放策略、打包签名、自动更新等都是课堂不会覆盖的工程问题。

**印象最深的三个技术点**：

1. **JWT 双 Token 机制**：之前只接触过单 Token，这次完整实现了 access 短命 + refresh 轮换 + jti 黑名单 + 并发 401 单飞刷新的安全链路。单飞模式尤其巧妙——用模块级 Promise 让并发 401 共享一次刷新，既避免了刷新风暴，又不需要加锁。

2. **未读数竞态修复**：这是 AI 一次写不对的典型 bug——表面上代码逻辑没问题，实际上 30s 轮询 tick 的在途响应在已读之后落地，把旧未读数盖回去了。靠网络时序观测定位到根因后，用单调序号防护（unreadSeq/appliedSeq）完美解决，同时在 E2E 里加了观测式轮询（失败自动 dump outerHTML + 服务端真值）防止复发。这让我意识到：**AI 写代码的速度 × 工程师的验证闭环 = 可交付质量**。

3. **双数据库 + 环境门控**：SQLite 开发零依赖、Postgres 生产零代码改动切换，Redis 缓存不配就是 no-op。这种"开发零依赖、生产按需开启"的设计让团队协作成本大幅降低，也让我理解了环境变量门控在云原生时代的价值。

### 6.2 工程思维

**测试先行，持续回归**：后端 API 写了 69 项集成测试（每个接口的正常路径 + 边界条件 + 错误码），任何改动立即跑一遍，回归问题毫秒级暴露。打包产物 E2E 用 Playwright 驱动真实 exe，12 步全链路兜底。这是 AI 辅助开发的"质量闸门"——AI 生成代码快，但人必须用测试确保每一步都对。

**环境一致性**：开发环境和生产环境的差异（SQLite vs Postgres、本地磁盘 vs S3、无 Redis vs 有 Redis）全部收敛到环境变量，代码层不感知差异。这避免了"我本地跑好的，线上挂了"的经典问题。

### 6.3 AI 协作心得

实习全程在 AI 辅助下完成，深刻体会到：**AI 擅长编码，人擅长决策和验证**。AI 一次写不对竞态 bug、搞不定 BOM 编码问题、会编造不存在的 API 参数——但人可以通过建立测试闭环、踩坑积累、系统性思考来兜住。

具体协作模式：
1. 需求拆解：人先输出清晰的功能规格，AI 按模块生成骨架
2. 编码实现：AI 写核心代码，人负责边界条件、安全检查、类型签名
3. 验收测试：人写 API 测试 + E2E，AI 跑不过立即改
4. 疑难诊断：人插桩观测 → 定位根因 → 给出修复方案 → AI 落地

### 6.4 不足与改进

1. **单元测试缺失**：目前只有 API 集成测试和 E2E，缺少前端 Zustand store 的单元测试和后端业务层的 mock 测试，后续应补充
2. **WebSocket 缺失**：私信用 30s 轮询而非 WebSocket，实时性有差距，但考虑到桌面端离线场景 + 轻量级需求，轮询方案足够
3. **CDN 未接入**：视频文件直接走源站，生产环境应加 CDN 加速静态资源
4. **监控缺失**：生产部署后应接入日志系统 + 性能监控

---

*实习报告完*
