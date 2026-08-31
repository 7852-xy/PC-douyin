# PC抖音 API 服务端镜像（Postgres 版）
# tsx/prisma 在 devDeps，生产镜像保留全部依赖以支持 tsx 运行与迁移命令
FROM node:22-alpine
WORKDIR /app

# 依赖层（package.json 变化才重建）
COPY package.json ./
RUN npm install --no-audit --no-fund

# Prisma client（生产用 Postgres schema）
COPY prisma ./prisma
RUN npx prisma generate --schema=prisma/schema.postgres.prisma

# 源码
COPY tsconfig.json ./
COPY src ./src

EXPOSE 3000

# 启动前幂等应用迁移（migrate deploy 只应用未执行的迁移，多实例安全）
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.postgres.prisma && npm run start"]
