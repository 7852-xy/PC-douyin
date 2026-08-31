# ============================================================
# PC 抖音 · 生产一键部署（需已安装并启动 Docker Desktop）
#
# 用法:
#   .\deploy.ps1              # 全流程: compose -> 迁移 -> seed -> 启动 -> 验收
#   .\deploy.ps1 -SkipSeed    # 跳过种子（保留已有数据）
#
# 前提:
#   1. Docker Desktop 已安装并运行（国内建议配置镜像加速:
#      Docker Engine 设置 -> registry-mirrors）
#   2. server/.env 指向 Postgres（脚本会校验，见第 3 步提示）
#
# 回滚开发态:
#   npm --prefix server run db:generate   # 恢复 sqlite client
#   还原 server/.env 的 DATABASE_URL 为 file:./dev.db
# ============================================================
param([switch]$SkipSeed)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$server = Join-Path (Get-Location) 'server'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "  x $m" -ForegroundColor Red; exit 1 }

# ---------- 0. 前置检查 ----------
Step '前置检查'
try {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'docker not ready' }
} catch { Fail '未检测到可用的 Docker，请先安装并启动 Docker Desktop' }

# ---------- 1. 起基础设施 ----------
Step 'docker compose up -d (Postgres 15 + Redis 7 + MinIO)'
docker compose -f (Join-Path (Get-Location) 'docker-compose.yml') up -d
if ($LASTEXITCODE -ne 0) { Fail 'compose 启动失败（首次运行需拉取镜像，检查网络/镜像加速）' }

function Wait-Port($port, $name) {
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    $ok = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($ok) { Write-Host "  ok $name (:$port)" -ForegroundColor Green; return }
    Start-Sleep -Seconds 2
  }
  Fail "$name (:$port) 120s 内未就绪"
}
Step '等待服务端口就绪'
Wait-Port 5432 'Postgres'
Wait-Port 6379 'Redis'
Wait-Port 9000 'MinIO'

# ---------- 2. 校验 server/.env ----------
Step '校验 server/.env'
$envFile = Join-Path $server '.env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $server '.env.example') $envFile
  Write-Host '  已从 .env.example 创建 server/.env'
}
$envContent = Get-Content $envFile -Raw
if ($envContent -match 'DATABASE_URL\s*=\s*file:') {
  Write-Host '  server/.env 当前是 SQLite（开发库）。生产部署需切到 Postgres。' -ForegroundColor Yellow
  Write-Host '  为保护开发数据，脚本不会自动修改，请手工编辑后重跑：' -ForegroundColor Yellow
  Write-Host "    1) 打开 $envFile"
  Write-Host '    2) 注释 DATABASE_URL=file:./dev.db，启用 DATABASE_URL=postgresql://pcdouyin:pcdouyin@localhost:5432/pcdouyin'
  Write-Host '    3) 打开 JWT_REFRESH_ENABLED=true / REDIS_URL / S3_* 各行（参考文件内注释）'
  exit 1
}
Write-Host '  DATABASE_URL 指向 Postgres，OK'

# ---------- 3. client + 迁移 + 种子 ----------
Step '生成 Postgres client (db:generate:pg)'
$env:DATABASE_URL = 'postgresql://pcdouyin:pcdouyin@localhost:5432/pcdouyin'
npm --prefix $server run db:generate:pg
if ($LASTEXITCODE -ne 0) { Fail 'prisma generate 失败' }

Step '应用 Postgres 迁移 (db:migrate:pg)'
npm --prefix $server run db:migrate:pg
if ($LASTEXITCODE -ne 0) { Fail 'prisma migrate deploy 失败' }

if (-not $SkipSeed) {
  Step '写入种子数据 (seed，视频经 S3Storage 上传 MinIO)'
  npm --prefix $server run seed
  if ($LASTEXITCODE -ne 0) { Fail 'seed 失败' }
} else {
  Step '跳过 seed (-SkipSeed)'
}

# ---------- 4. 启动 API ----------
Step '启动 API 服务 (新窗口, :3000)'
$busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($busy) { Fail '端口 3000 已被占用，请先停掉现有服务（Get-NetTCPConnection -LocalPort 3000 | Stop-Process -Id OwningProcess）' }
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$server'; npm run start"

Step '等待 API 健康'
$h = $null
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  try { $h = Invoke-RestMethod 'http://localhost:3000/api/health' -TimeoutSec 2; if ($h.ok) { break } } catch {}
  Start-Sleep -Seconds 2
}
if (-not $h.ok) { Fail 'API 60s 内未就绪，请查看服务窗口日志' }
Write-Host '  ok /api/health' -ForegroundColor Green

# ---------- 5. 验收 ----------
Step '验收: test:api (refresh 分支随 server/.env 自动激活, 预期 63/63)'
npm --prefix $server run test:api
if ($LASTEXITCODE -ne 0) { Fail 'test:api 未全部通过，请检查上方输出' }

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host ' 生产栈激活完成: Postgres + Redis + MinIO + 双令牌 JWT' -ForegroundColor Green
Write-Host ' 服务运行在 http://localhost:3000（独立窗口）' -ForegroundColor Green
Write-Host ' 桌面客户端启动后自动探测并进入 server 模式' -ForegroundColor Green
Write-Host ' 回滚开发态: npm --prefix server run db:generate + 还原 .env' -ForegroundColor DarkGray
Write-Host '============================================' -ForegroundColor Green
