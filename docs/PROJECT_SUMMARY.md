# PC抖音（PC 桌面版短视频平台）— 项目总结

> 版本 v0.2.1 · Electron 44 + React 18 + TypeScript 5 × Express 5 + Prisma
> 仓库：https://github.com/7852-xy/PC-douyin

---

## 一、项目概述

仿抖音的 PC 桌面端短视频应用，个人全栈项目。客户端采用 Electron + React 构建沉浸式竖屏视频体验，后端采用 Express + Prisma 提供完整 REST API，两端通过 JWT 认证联动。支持：

- **双模式运行**：启动时探测后端（`/api/health`），在线模式走 REST + JWT；后端不可用时自动降级本地 mock 模式（数据存 localStorage），永不白屏
- **双数据库**：SQLite（开发零配置）/ PostgreSQL（生产），Prisma 双 schema 无缝切换
- **可插拔基础设施**：本地磁盘 / S3（MinIO）存储、Redis 缓存——全部环境变量门控，开发零依赖、生产按需开启
- **一键部署**：Docker Compose 全栈（API + Postgres + Redis + MinIO）+ nginx 反代 + HTTPS

## 二、功能清单

### 2.1 视频域
| 功能 | 说明 |
|---|---|
| 双信息流 | 推荐流（全量分页）+ 关注流（仅关注者作品） |
| 沉浸播放 | 卡片全屏滑动、点击暂停、键盘快捷键 |
| 流式加载 | 自定义 `media://` 协议 + HTTP Range 206 分片，进度条可拖动 |
| 视频上传 | multipart 上传，MIME 白名单校验，文件名服务端重建防路径穿越 |
| 智能封面 | 客户端 canvas 抽帧（video seek 1s → JPEG toBlob），4s 超时回退，无 ffmpeg 依赖 |
| 互动 | 点赞 / 收藏 / 评论 / 评论点赞 / 分享计数（匿名） |

### 2.2 社交域
| 功能 | 说明 |
|---|---|
| 关注体系 | 关注/取关、粉丝列表、关注流 |
| 通知中心 | 点赞/关注/评论触发；未读徽标；单条/全部已读；服务端防自通知 |
| 私信 | 1:1 会话聚合、消息线程游标分页、readAt 已读回执、未读徽标 |
| 搜索 | 用户昵称 / 视频标题（PostgreSQL 下 insensitive 匹配） |
| 热门趋势 | 互动加权 Top10 + #话题正则聚合（近 300 条） |

### 2.3 平台能力
| 功能 | 说明 |
|---|---|
| 认证 | 注册/登录/游客；昵称长度校验；bcrypt 密码哈希 |
| JWT 双 Token | access + refresh；refresh 轮换 + jti 黑名单；并发 401 单飞刷新 |
| 服务器切换 | 运行时改服务器地址（登录页/侧边栏 ⚙ 弹窗），localStorage 持久化，免重装 |
| 自动更新 | electron-updater，下载完成 → IPC → 渲染层提示条 → 退出即装 |
| 状态管理 | Zustand：持久化数据（token/用户数据）与瞬态 UI 状态分离 |

## 三、技术架构

```
┌─ Electron 主进程：窗口生命周期、media:// 协议拦截（Range 分片）、
│                    electron-updater、autoplay 命令行兜底
│    └─ preload：contextBridge 白名单 IPC → window.pcApi
├─ 渲染层：React 组件树
│    ├─ stores（7 个 Zustand store：user/app/video/follow/notify/dm/profile）
│    ├─ api/client.ts：统一请求封装、token 管理、服务探测、401 单飞刷新
│    └─ utils：canvas 封面抽取、格式化
└─ 后端（Express 5）
     ├─ routes：auth / videos / users / search / notifications / dm /
     │          trending / media（Range 代理）
     ├─ 业务层：auth（JWT 签发轮换）、notify（防自通知）、
     │          storage（Local/S3 抽象）、cache（Redis 门控 no-op）
     └─ Prisma → SQLite / PostgreSQL
```

**数据模型**（10 个）：User、Video、Like、Collect、Comment、CommentLike、Follow、Notification、Message、RefreshToken

## 四、关键技术实现

### 4.1 自定义协议视频流
渲染层拿到 `media://local/<filename>` 地址 → 主进程 `protocol.handle` 拦截 → 文件名消毒（防 `../` 穿越）→ 有 Range 头返回 206 + Content-Range 分片流，否则 200 全量。媒体地址不暴露真实文件系统路径。

### 4.2 JWT 双 Token 安全链路
登录签发 access + refresh（refresh 入库带 jti）→ 请求 401 时进入模块级单飞刷新（并发 401 共享同一个刷新 Promise，刷新完成各自重放）→ 刷新时轮换：旧 refresh 的 jti 进黑名单，防重放 → 防循环：重放带 `_retry` 标记。`JWT_REFRESH_ENABLED` 门控，关闭时行为与单 token 完全一致。

### 4.3 未读数竞态防护
通知/私信未读走 30s 轮询。进入聊天标记已读后，轮询 tick 的**在途旧响应**可能后落地，把旧未读数盖回（徽标错误复现最长 30s）。修复：单调序号防护（unreadSeq/appliedSeq），仅 seq 更大才写 store，stale 响应直接丢弃。notifyStore 与 dmStore 同款修复。

### 4.4 双数据库与方言收口
`schema.prisma`（sqlite）/ `schema.postgres.prisma`（生产）双 schema 同步维护；Postgres 迁移用 `migrate diff --from-empty` 离线生成基线。方言差异在业务层收口：如 `mode:'insensitive'` 仅 `isPostgres()` 时传入（sqlite 运行时拒绝该参数），不泄漏到路由层。

### 4.5 上传安全
multer **单实例** `.fields([{video},{cover}])` + fileFilter 按 fieldname 分流（双实例会互吃请求流导致解析失败）；文件名服务端 UUID 重建，用户原始文件名永不落盘。

## 五、测试体系

| 层 | 内容 | 结果 |
|---|---|---|
| 类型检查 | `tsc --noEmit`（根 + server） | 通过 |
| API 集成测试 | 17 节 69 项断言：health → 认证/401/409 → 上传/Range 206 → 互动 → 关注流 → 通知 → 分享/热门 → 私信全流程 | 69/69 |
| 打包产物 E2E | `playwright-core` `_electron.launch()` 启动真实 exe（非 dev 页面），12 步全链路：登录感知 → feed → 搜索 → 关注流 → 通知已读 → 私信徽标清零 → 分享弹窗 → 服务器设置 | 12/12 × 6 连绿 |

E2E 工程细节：登录态感知（探测登录页元素，兼容残留会话）；前置 API 造确定性数据（注册临时账号发私信保证徽标可观测）；失败自动截图 + 观测式轮询（dump 匹配元素 outerHTML 与服务端真值，偶发失败可事后定位）。

## 六、部署方案

**VPS 一键部署**（`deploy/deploy-vps.sh`）：
装 Docker → 本地 openssl 生成强密钥写 `.env`（chmod 600，密钥不落传输链路）→ `docker compose up -d --build`（容器 CMD 内先 `prisma migrate deploy` 幂等迁移）→ API 仅绑 127.0.0.1:3000 → nginx 80 反代（`client_max_body_size 200m`、`proxy_buffering off` 适配视频流）→ 公网健康自检。

**客户端云版**：构建期注入 `$env:VITE_API_BASE` 出包；运行期可用内置 ⚙ 弹窗随时改服务器地址。

## 七、踩坑记录（精华）

1. **协议 URL 三段式**：`media:///file` 会被 Chromium 误解析 host 导致 400，必须 `media://local/<file>`
2. **BOM 灾难**：PowerShell `Set-Content -Encoding UTF8` 写 JSON（含中文）= BOM + 截断，构建报「Unexpected token '锘?'」；Write 工具覆写已存在文件会保留旧 BOM——**JSON 数据文件一律 Node `fs.writeFileSync` 或 Edit 工具处理**
3. **PS1 与数据文件编码相反**：含中文的 PowerShell 脚本要 UTF-8 **带 BOM**（5.1 才按 UTF-8 解析），`.env`/迁移 SQL 要**无 BOM**
4. **播放策略**：autoplay 双兜底——主进程命令行开关 + 渲染层静音重试
5. **孤儿进程**：杀 npm 包装进程不杀 tsx 子进程，端口 3000 仍被占；按端口找 PID 再 Stop-Process
6. **E2E 细节**：React 受控组件需原生 setter + input 事件；`locator.count()` 统计含隐藏元素，截图只反映可见状态——先 dump outerHTML 再分析
7. **tsc 严格性**：`lib` 名必须小写合法 token（`dom.iterable`）；给共享类型加必填字段，tsc 能揪出所有构造点（mock 数据、添加上传、跳转视频）——把类型系统当测试用
8. **TS1345**：Zustand 里 `if (handleAuth(e))` 要求返回 boolean 不能是 void
9. **测试数据污染**：API 测试每次灌 3 条测试视频，feed 前 30 条会被刷满——定位种子用户要用搜索接口而非 feed
10. **防自通知**：`notify()` 对 `actorId === recipientId` 早返回，否则自己赞自己刷屏自己的收件箱

## 八、版本演进

| 版本 | 内容 |
|---|---|
| v0.1.x | 基础框架：feed/播放/点赞/评论/上传/搜索/关注/通知，双模式探测 |
| v0.2.0 | 分享计数、热门趋势、私信系统、electron-updater 自动更新 |
| v0.2.1 | 服务器运行时切换（ServerSettings 弹窗）；未读数 stale 竞态修复；E2E 观测式轮询 |

## 九、质量数据

- 源码：94 个文件入库（前端 45+ / 后端 30+ / 部署与测试 10+）
- 测试：69 项 API 断言 + 12 步打包产物 E2E，全绿
- 已验证链路：本地开发 → 打包安装 → E2E 全链路 → Docker 全栈编排 → VPS 部署脚本
