# PC抖音 云端部署指南

> 本指南把「云端部署」收敛为可在任一台 Ubuntu VPS 上照抄执行的命令。
> Docker 路径是主路径（一条命令起 API+Postgres+Redis+MinIO 全栈）；裸金属路径作备选。

## 前置条件

- 一台 Ubuntu 22.04+ VPS（2C2G 起），域名一条 A 记录指向它（下文用 `pcdouyin.example.com`）
- VPS 上装 Docker：`curl -fsSL https://get.docker.com | sh`
- 本地把整个项目目录上传到 VPS（`git clone` 或 `scp -r`）

## 路径 A：Docker 一键部署（推荐）

```bash
cd PC-douyin

# 1. 密钥写入根目录 .env（compose 自动读取；务必换掉默认值）
cat > .env <<'EOF'
POSTGRES_PASSWORD=换成强密码
MINIO_ROOT_USER=pcdouyin
MINIO_ROOT_PASSWORD=换成强密码
JWT_SECRET=换成随机长字符串
EOF

# 2. 构建 + 启动全栈（首次会拉镜像/构建，数分钟）
docker compose -f docker-compose.prod.yml up -d --build

# 3. 验证
curl http://127.0.0.1:3000/api/health
# {"ok":true,"service":"pc-douyin-server",...}  即成功
```

启动时容器会自动执行 `prisma migrate deploy`（幂等），Postgres/Redis/MinIO 健康后才起 API。
可选演示数据：`docker compose -f docker-compose.prod.yml exec api npm run seed`

### HTTPS + 反代

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pcdouyin.conf
sudo sed -i 's/pcdouyin.example.com/你的域名/' /etc/nginx/sites-available/pcdouyin.conf
sudo ln -s /etc/nginx/sites-available/pcdouyin.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d 你的域名   # 一条命令上 HTTPS，自动续期
```

验证：`curl https://你的域名/api/health`

## 路径 B：裸金属（无 Docker）

```bash
# Node 22 + nginx 假设已装
cd PC-douyin/server
cp .env.example .env   # 填 DATABASE_URL(本机 PG)/REDIS_URL/S3_*/JWT_SECRET，JWT_REFRESH_ENABLED=true
npm install
npm run db:generate:pg
npm run db:migrate:pg
npm run seed           # 可选

# 进程守护（二选一）
npm i -g pm2 && pm2 start "npm run start" --name pcdouyin-api && pm2 save && pm2 startup
# 或 systemd unit（ExecStart=/usr/bin/npm run start，WorkingDirectory=server 目录）
```

nginx 配置同路径 A（`deploy/nginx.conf`）。

## 桌面客户端指向云端

客户端 API 地址在**构建期**由 `VITE_API_BASE` 注入（默认 `http://localhost:3000`）。
打一个"云版"安装包：

```powershell
$env:VITE_API_BASE = 'https://你的域名'; npm run dist
```

云版 exe 启动后探测 `https://你的域名/api/health` 成功即进入 server 模式（登录、上传、私信、通知全走云端）。

## 自动更新源（可选，配合客户端自动更新）

客户端已内置 electron-updater（generic 源占位于 `electron-builder.yml`）。启用：

1. `sudo mkdir -p /var/www/pcdouyin/updates`
2. 把 `dist2/latest.yml` 和 `dist2/PCDouyin Setup x.y.z.exe` 上传到该目录
3. `electron-builder.yml` 的 `publish.url` 改为 `https://你的域名/updates/`，重打一个包分发
4. 以后发新版：改 `package.json` version → `npm run dist` → 把新的 `latest.yml` + exe 传到 updates 目录；已装旧版的客户端会在 4 小时内自动提示更新

## 运维速查

```bash
docker compose -f docker-compose.prod.yml logs -f api      # 看日志
docker compose -f docker-compose.prod.yml restart api      # 重启 API
docker compose -f docker-compose.prod.yml pull && \
docker compose -f docker-compose.prod.yml up -d --build    # 升级代码后重建
docker run --rm -v pcdouyin_pgdata:/data -v $(pwd):/backup alpine \
  tar czf /backup/pgdata-backup.tgz /data                  # 备份数据库
```

## 安全清单（上线前）

- [ ] `.env` 中 POSTGRES/MINIO/JWT_SECRET 全部换默认值
- [ ] Postgres/Redis/MinIO 端口**未**对公网开放（prod compose 已只绑 127.0.0.1 的仅 API；云防火墙再兜底）
- [ ] HTTPS 已启用（certbot）
- [ ] 客户端已用 `VITE_API_BASE` 云地址重打包
