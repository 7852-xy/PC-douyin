import express from 'express'
import cors from 'cors'
import path from 'path'
import { authRouter } from './routes/auth'
import { videosRouter } from './routes/videos'
import { usersRouter } from './routes/users'
import { searchRouter } from './routes/search'
import { notificationsRouter } from './routes/notifications'
import { trendingRouter } from './routes/trending'
import { dmRouter } from './routes/dm'
import { isS3Enabled } from './config'
import { mediaRouter } from './routes/media'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  // 健康检查：客户端启动时探测，决定 server/local 模式
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'pc-douyin-server', time: Date.now() })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/videos', videosRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/search', searchRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/trending', trendingRouter)
  app.use('/api/dm', dmRouter)

  // 媒体服务：S3 开启走代理（流式 + Range 206，保留 /media/<key> 契约）；
  // 否则 express.static 本地 uploads/（原生 Range，沙箱 206 测试路径）。
  if (isS3Enabled()) {
    app.use('/media', mediaRouter)
  } else {
    app.use('/media', express.static(path.resolve(process.cwd(), 'uploads')))
  }

  // 统一错误处理（multer 文件类型错误等）
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(400).json({ error: err.message || '服务器错误' })
    }
  )

  return app
}
