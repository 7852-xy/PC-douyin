#!/usr/bin/env bash
# PC抖音 VPS 一键部署（无域名 IP 模式；域名就绪后按 DEPLOY.md 补 HTTPS）
# 用法（VPS 上，项目已解压后）：
#   bash ~/pcdouyin/deploy/deploy-vps.sh
# 可用环境变量覆盖：APP_DIR（默认 ~/pcdouyin）
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/pcdouyin}"
COMPOSE="sudo docker compose -f $APP_DIR/docker-compose.prod.yml"

echo "==> [1/6] 安装 Docker（已装则跳过）"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo systemctl enable --now docker
fi

echo "==> [2/6] 生成强密钥写入 $APP_DIR/.env（仅存 VPS 本地，不经过任何传输）"
cd "$APP_DIR"
if [ -f .env ]; then
  echo "    .env 已存在，保留原密钥"
else
  cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
MINIO_ROOT_USER=pcdouyin
MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
EOF
  chmod 600 .env
fi

echo "==> [3/6] 构建并启动全栈（首次拉镜像/构建需数分钟）"
$COMPOSE up -d --build

echo "==> [4/6] 等待 API 健康（本机 3000）"
ok=""
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "✗ API 健康检查超时，排查：$COMPOSE logs api"
  exit 1
fi
echo "    API 健康 ✓"

echo "==> [5/6] 安装并配置 nginx（80 端口反代 → 127.0.0.1:3000）"
if ! command -v nginx >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y nginx
fi
sudo tee /etc/nginx/sites-available/pcdouyin.conf >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 200m;

    # electron-updater 更新源（可选）：latest.yml + 安装包放 /var/www/pcdouyin/updates/
    location /updates/ {
        alias /var/www/pcdouyin/updates/;
        add_header Cache-Control "no-cache";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 视频 Range 拉流（206）直传，不缓冲
        proxy_buffering off;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/pcdouyin.conf /etc/nginx/sites-enabled/pcdouyin.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> [6/6] 公网验证"
IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
pub=""
for i in $(seq 1 15); do
  if curl -fsS "http://$IP/api/health" >/dev/null 2>&1; then pub=1; break; fi
  sleep 1
done
if [ -z "$pub" ]; then
  echo "⚠ 本机 API 正常，但公网 http://$IP/api/health 未通"
  echo "  → 请检查云控制台安全组/防火墙是否放行 80 端口，放行后重试 curl http://$IP/api/health"
  exit 1
fi

echo ""
echo "✅ 部署完成：http://$IP"
echo "   日志：     $COMPOSE logs -f api"
echo "   演示数据： $COMPOSE exec api npm run seed   （可选）"
echo "   客户端云版：\$env:VITE_API_BASE='http://$IP'; npm run dist"
echo "   HTTPS：    域名解析后按 DEPLOY.md 用 certbot 一条命令开启"
