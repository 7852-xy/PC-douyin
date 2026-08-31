# PC抖音 — PC 桌面版短视频平台

仿抖音的桌面端短视频应用，全栈个人项目：Electron + React 客户端 × Express + Prisma 后端，覆盖短视频完整业务链路（feed / 上传 / 社交 / 私信 / 通知 / 热门趋势），支持 Docker 一键部署与客户端自动更新。

## 功能特性

**视频**
- 推荐流 + 关注流，沉浸式滑动播放
- 视频上传（自定义 `media://` 协议 + Range 206 流式播放）
- 客户端 canvas 智能抽帧封面（无 ffmpeg 依赖）
- 点赞 / 收藏 / 评论（含评论点赞）/ 分享计数

**社交**
- 关注 / 粉丝 / 个人主页
- 通知中心（未读徽标、单条/全部已读）
- 私信（1:1 会话、消息线程分页、已读回执、未读徽标）
- 用户 / 视频搜索
- 热门趋势（互动加权 Top10 + #话题聚合）

**平台能力**
- 双模式运行：自动探测后端，在线模式 / 离线 mock 模式无缝降级
- 服务器运行时切换（登录页与侧边栏 ⚙ 弹窗，改完即生效）
- JWT 双 Token 认证：refresh token 轮换 + jti 黑名单 + 并发 401 单飞刷新
- electron-updater 自动更新
- 双数据库：SQLite（开发零配置）/ PostgreSQL（生产）；本地磁盘 / S3 存储门控切换；Redis 缓存可选启用

## 技术栈

| 层 | 技术 |
|---|---|
| 客户端 | Electron 44 · React 18 · TypeScript 5 · Zustand · Tailwind CSS · framer-motion |
| 后端 | Express 5 · Prisma ORM · SQLite / PostgreSQL · JWT · bcrypt |
| 基础设施 | MinIO (S3) · Redis · nginx · Docker Compose |
| 测试 | 自研 API 集成测试（69 项）· Playwright E2E（驱动真实打包产物） |

## 快速开始

```bash
# 1. 启动后端（localhost:3000）
npm install --prefix server
npm run server

# （可选）灌入演示数据：演示君/小粉丝 账号 + 视频素材
npm run seed

# 2. 启动客户端（开发模式，热更新）
npm install
npm run dev
```

客户端启动时自动探测 `localhost:3000`：后端在线则全功能可用；未启动则自动降级本地 mock 模式（数据存 localStorage），不会白屏。

演示账号（需先 seed）：`演示君 / demo1234`

## 测试

```bash
# API 集成测试（69 项断言，需后端运行中）
npm --prefix server run test:api

# 打包产物 E2E（先 npm run dist 打包，再驱动真实 exe 跑 12 步全链路）
npm run typecheck
npm run test:e2e
```

## 云端部署

详见 [DEPLOY.md](DEPLOY.md)：VPS 上一键脚本 `deploy/deploy-vps.sh`（Docker 全栈：API + PostgreSQL + Redis + MinIO，nginx 反代 + certbot HTTPS），客户端云版打包：

```powershell
$env:VITE_API_BASE = 'https://你的域名'; npm run dist
```

## 目录结构

```
├── src/main        # Electron 主进程：窗口、media:// 协议、自动更新
├── src/preload     # contextBridge 白名单 IPC
├── src/renderer    # React UI：组件 + Zustand stores + API 客户端
├── server/src      # Express 路由 / 认证 / 通知 / 存储抽象 / 缓存
├── server/prisma   # 双 schema（sqlite / postgres）+ 迁移
├── deploy          # 一键部署脚本 + nginx 配置模板
├── e2e             # 打包产物 E2E
└── DEPLOY.md       # 云端部署指南
```

## License

[MIT](LICENSE)
