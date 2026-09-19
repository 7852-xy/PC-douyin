# 实习每日开发笔记

---

## Day 1（8月5日）：环境搭建

**任务完成**
1. 安装 Node.js 22 LTS、VS Code、Git
2. 配置 GitHub SSH 密钥（ed25519），验证推送正常
3. 创建 Electron 项目脚手架：`npm create @quick-start/electron@latest`，选择 React + TypeScript 模板
4. 安装 Prisma 并初始化 SQLite 数据库：`npx prisma init --datasource-provider sqlite`
5. 配置 PowerShell 执行策略：`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

**遇到的问题**
- Prisma 首次安装失败（网络超时）：配置 npmmirror registry 后解决
- PowerShell 不认 `&&` 分隔符：改用分号 `;` 或分行执行

**今日心得**：开发环境搭建是第一步但最磨人，提前配好镜像和执行策略能省很多时间。Electron 脚手架选 vite 模板，热更新体验比 webpack 好很多。

---

## Day 2（8月6日）：技术预研与架构设计

**任务完成**
1. 研究 Electron 多进程架构：主进程 / 渲染进程 / preload 脚本 / contextBridge
2. 设计自定义 `media://` 协议拦截视频流方案（主进程 `protocol.handle` + Range 206）
3. 设计 JWT 双 Token 安全链路（access 30min + refresh 7d + 轮换 + 黑名单 + 401 单飞刷新）
4. 确定双数据库策略：SQLite 开发 + PostgreSQL 生产，Prisma 双 schema 维护
5. 输出架构设计文档（三层架构图 + 数据流图）

**遇到的问题**
- `media:///file`（两段式）被 Chromium 误解析 host，导致视频 400：必须 `media://local/<file>` 三段式
- 单飞刷新的防循环逻辑设计：重放请求不能再次触发刷新，需加 `_retry` 标记

**今日心得**：自定义协议的 URL 格式是 Chromium 的坑，三段式是硬要求。单飞刷新的核心是模块级 Promise 共享——并发 401 等同一个，刷新完成各自重放。

---

## Day 3（8月7日）：数据库建模与迁移

**任务完成**
1. 编写 Prisma `schema.prisma`，定义 10 个模型：User / Video / Like / Collect / Comment / CommentLike / Follow / Notification / Message / RefreshToken
2. 设计复合索引：Message 的 `[recipientId, readAt]` 加速未读数查询，Like 的 `[userId, videoId]` 防重复点赞
3. 首次 SQLite 迁移：`npx prisma migrate dev --name init`
4. 编写 `schema.postgres.prisma`（字段一致，改 provider 为 postgresql）
5. 生成 Postgres 基线迁移：`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgres.prisma --script`

**遇到的问题**
- 首次写 schema 漏了 `@@unique` 约束，导致可重复点赞：补上 `@@unique([userId, videoId])`
- Postgres 迁移脚本生成的 SQL 带了 `CREATE UNIQUE INDEX`，但 SQLite 不支持——双 schema 维护时要注意方言差异

**今日心得**：Prisma schema-first 开发体验好，但约束和索引要想清楚，后期加会有迁移冲突。双 schema 维护是把双刃剑——保证开发零依赖，但每次改表要同步两份。

---

## Day 4（8月8日）：Express 后端骨架 + 认证模块

**任务完成**
1. 创建 Express 5 + TypeScript 后端项目，配置 tsx watch 热重载
2. 编写 `env.ts`（环境变量解析，必须最先 import，ESM hoisting 会提前求值）
3. 实现 bcrypt 密码哈希 + JWT 签发/校验
4. 实现注册/登录接口：`POST /api/auth/register` + `POST /api/auth/login`
5. 实现 refresh 轮换：`POST /api/auth/refresh`（旧 refresh 的 jti 进内存黑名单）
6. 实现并发 401 单飞刷新：模块级 `refreshPromise`，第一个 401 创建 Promise，后续共享

**遇到的问题**
- `env.ts` 不是最先 import，ESM hoisting 提前求值导致 `process.env` 未初始化：调整 import 顺序
- 单飞刷新的 `_retry` 标记在重放时被错误继承：用展开运算符 `{ ...opts, token: newToken, _retry: true }` 覆盖

**今日心得**：ESM hoisting 是反直觉的坑——side-effect import 必须放在最顶部，否则配置文件还没解析就开始用了。单飞模式真的很优雅，用一个 Promise 解决了并发刷新风暴。

---

## Day 5（8月9日）：视频域核心功能

**任务完成**
1. 实现视频上传接口：multer 单实例 `.fields([{video},{cover}])` + fileFilter 按 fieldname 分流 MIME 白名单
2. 文件名服务端 UUID 重建（用户原始文件名永不落盘，防路径穿越）
3. 实现自定义 `media://` 协议：主进程 `protocol.handle` 拦截 → Range 206 分片流
4. 实现 `/api/media/:filename` Range 代理（本地磁盘）
5. 实现 feed 接口：`GET /api/videos`（分页，limit 30）
6. 实现点赞/收藏/评论接口

**遇到的问题**
- multer 双实例（video + cover）会互吃请求流导致解析失败：合并成单实例 `.fields()`
- Range 206 的 `Content-Range` 头格式必须是 `bytes start-end/total`，少一个字符浏览器都不认
- autoplay 被拦截：主进程 `commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')` + 渲染层静音重试双兜底

**今日心得**：multer 单实例 `.fields()` 是官方推荐方式，但文档里没说双实例会互吃流——踩了才知道。Range 请求的字节数要精确到文件大小，不能靠估算。

---

## Day 6（8月10日）：前端骨架 + Zustand 状态管理

**任务完成**
1. 搭建 React + Tailwind CSS 渲染层骨架
2. 实现 7 个 Zustand store：user / app / video / follow / notify / dm / profile
3. 持久化策略：token/用户数据用 `persist` 中间件写 localStorage，UI 瞬态（弹窗开关、loading）不落盘
4. 实现 API 客户端 `api/client.ts`：统一请求封装 + token 管理 + 服务探测
5. 实现双模式探测：`probeMode()` fetch `/api/health`，4s 超时降级本地 mock

**遇到的问题**
- Zustand 的 `if (handleAuth(e)) return ...rollback` 需要返回 boolean 不能是 void（TS1345）：改为 `if (handleAuth(e)) return false; ... return true`
- mock 数据的视频 URL 直接写 `file://` 在 Electron 里会被拦截：改用 `media://local/` 格式

**今日心得**：TypeScript 的严格性在 Zustand 里尤其容易被忽略——共享类型加必填字段，tsc 能揪出所有构造点（mock 数据、添加上传、跳转视频），把类型系统当测试用。双模式探测是"永不白屏"的关键，后端挂了客户端照样能用。

---

## Day 7（8月11日）：社交域 + 通知 + 搜索

**任务完成**
1. 实现关注体系：`POST /api/users/:id/follow` + 关注流 `GET /api/videos?feed=following`
2. 实现通知中心：`notify()` 统一入口（`actorId === recipientId` 早返回防自通知）
3. 通知未读：`GET /api/notifications/unread-count` + 30s 轮询
4. 实现搜索：`GET /api/search?q=`（PostgreSQL 下 `mode:'insensitive'` 条件启用）
5. 实现前端 Sidebar（侧栏导航 + 通知/私信未读徽标）+ TopTabs（推荐/关注/热门切换）

**遇到的问题**
- 服务端 `notify()` 忘防自通知，导致用户点赞自己时刷屏自己的收件箱：加 `if (actorId === recipientId) return`
- 未读数轮询 tick 在 app useEffect 里重复触发：加 `useRef` guard 防止重挂载

**今日心得**：防自通知看似简单，不写就会出 bug——AI 一次没想到，靠人工补充。30s 轮询是个简单粗暴但有效的方案，比 WebSocket 实现成本低很多，适合桌面端场景。

---

## Day 8（8月12日）：v0.1 收尾 + seed + API 测试

**任务完成**
1. 实现智能封面：客户端 `extractCover()`（隐藏 video + canvas seek 1s → JPEG toBlob，4s 超时回退 null），无 ffmpeg 依赖
2. 实现 seed 脚本：注册演示君/小粉丝账号 + 上传 5 条演示视频
3. 编写 API 集成测试 `test-api.ts`：69 项断言，覆盖 17 个场景（health → 认证 → 上传 → 互动 → 社交 → 通知）
4. 全部测试通过：`npm --prefix server run test:api`
5. 打包 Electron 应用验证：`npm run dist`

**遇到的问题**
- cover 生成超时 4s 后返回 null，multer 跳过该 field：后端 `req.file?.cover?.path ?? ''` 做空值处理
- API 测试每次灌 3 条测试视频，feed 前 30 条被刷满——定位种子用户要用搜索接口而非 feed：`/api/search?q=演示君` → `/api/users/{id}/videos`

**今日心得**：客户端生成封面太巧妙——把 ffmpeg 的事交给浏览器，零依赖还跨平台。测试数据污染是经典坑，定位用户/视频要靠搜索接口，别直接从 feed 取。

---

## Day 9（8月13日）：v0.2 扩展 — 分享 + 热门 + 私信

**任务完成**
1. 视频表加 `sharesCount` 列，实现 `POST /api/videos/:id/share`（匿名计数，返回分享链接）
2. 实现热门趋势：近 300 条视频内按 `likes + comments + shares` 加权取 Top10，话题标签正则聚合
3. 实现私信系统：Message 表 + 复合索引 `[senderId, recipientId]` + `[recipientId, readAt]`
4. 会话聚合：JS 层双向最近消息按对端分组 + lastAt 排序
5. 私信未读：`GET /api/dm/unread-count` + 30s 轮询 + 进入聊天 `POST /api/dm/read/:userId`
6. 前端 ChatView + MessagesView 组件

**遇到的问题**
- 会话聚合一开始用 SQL 窗口函数，SQLite 不支持——改成 JS 层聚合，数据量可控时更简单
- 私信已读 `updateMany` 批量标记，要同时更新 sender 和 recipient 视角：`updateMany({ where: { senderId: me, recipientId: other, readAt: null }, data: { readAt: now } })` 反过来也要

**今日心得**：SQL 窗口函数很方便，但 SQLite 不支持——JS 层聚合在数据量可控时足够用，开发成本更低。私信未读数查询必须用 `[recipientId, readAt]` 复合索引，否则每次全表扫。

---

## Day 10（8月14日）：v0.2 — electron-updater + S3 + Redis 门控

**任务完成**
1. 接入 electron-updater：generic provider + `update-downloaded` 事件 → IPC → 渲染层提示条
2. 必须注册静默 `error` 监听器（否则未处理的更新错误会变成 unhandled rejection）
3. 实现 S3 存储抽象 `storage.ts`：LocalStorage（默认）/ S3Storage（MinIO 或 AWS S3），环境变量门控
4. 实现 Redis 缓存 `cache.ts`：profile:counts TTL 300s、notif:unread TTL 60s，不配 `REDIS_URL` 则 no-op
5. 更新 API 测试至 69 项（加分享/热门/私信 7 项）

**遇到的问题**
- 打包时 NSIS 工具链从 GitHub 下载极慢：补设 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`
- electron-updater 没注册 error 监听器，开发模式下每次检查更新都会抛 unhandled rejection：加 `autoUpdater.on('error', () => {})`

**今日心得**：环境门控是云原生的基本姿势——不配 `S3_BUCKET` 就用本地磁盘、不配 `REDIS_URL` 就走 no-op。开发零依赖、生产一键切换。electron-updater 的 error 监听器是必须注册的，不然应用会因为未处理异常崩溃。

---

## Day 11（8月15日）：v0.2.1 — 竞态修复 + 服务器切换 + Docker

**任务完成**
1. 修复未读数 stale 响应竞态（30s 轮询 tick 的在途旧响应在已读之后落地，把旧未读数盖回）
2. 单调序号防护：unreadSeq/appliedSeq——仅 seq > appliedSeq 才写 store，stale 响应直接丢弃
3. 实现服务器运行时切换：`setServerUrl()` 写 localStorage + `location.reload()`，登录页和侧边栏 ⚙ 弹窗双入口
4. 编写 Docker Compose 全栈编排：api + postgres15 + redis7 + minio + minio-init（一次性建桶）
5. 编写 nginx 反代配置：`client_max_body_size 200m`、`proxy_buffering off` 适配视频流

**遇到的问题**
- 竞态修复用了单调序号，AI 第一次写的是"加延迟等待"——不对，正确做法是**让 stale 响应被丢弃**，而不是让它晚到
- Dockerfile 里 CMD 直接起 API 而没先迁移：改成 `sh -c "prisma migrate deploy && npm run start"`，幂等

**今日心得**：竞态 bug 的根因分析比修复本身重要——通过网络时序观测（console.log 打 unread-count 返回值 vs UI 徽标状态）定位到 stale 响应落地，再用序号防护一招致命。Docker Compose 的 depends_on + condition: service_healthy 保证了启动顺序。

---

## Day 12（8月16日）：打包 + E2E + 上线 GitHub

**任务完成**
1. 打包 Electron 应用：`npm run dist`，产物 `dist2/win-unpacked/PCDouyin.exe` + NSIS 安装包
2. 编写 Playwright E2E `e2e/packaged.mjs`：`playwright-core` 的 `_electron.launch()` 启动真实 exe，12 步全链路
3. E2E 关键设计：登录态感知（探测登录页元素，兼容残留会话）；前置 API 造确定性数据（注册临时账号发私信保证徽标可观测）；失败自动截图 + 观测式轮询
4. 修复 E2E 偶发失败（未读徽标清除偶挂）：诊断后验证是服务端即时生效 + 客户端轮询 stale 响应竞态（已在 Day 11 修复）
5. 初始化 Git 仓库 + `.gitignore`（排除 node_modules/.env/dist2/缓存）+ `.eb-cache`/`.electron-cache`
6. 推送 GitHub：https://github.com/7852-xy/PC-douyin
7. 验证 API 测试 69/69 全绿 + E2E 12/12 × 6 连绿

**遇到的问题**
- `git add .` 首次混入 1200+ 工具缓存文件（`.electron-cache`、`.eb-cache`、旧 `dist/`、`.trae/`）：补全 `.gitignore` 后重新暂存降到 94 个
- PowerShell 不支持 bash heredoc 写 commit 消息：改用 `-F` 文件方式，验证 UTF-8 无 BOM
- E2E 的 `locator.count()` 统计含隐藏元素，但截图只反映可见状态：先 `evaluateAll` dump outerHTML 再分析

**今日心得**：E2E 驱动真实打包产物（而非 dev 服务页面）是关键——真正验证了 `electron-updater`、`media://` 协议、打包后的资源路径等。Git 清理（排除缓存/密钥/构建产物）是推送前必须做的事，不然仓库会膨胀几百 MB。

---

*12 天开发笔记完*
