import { Router } from 'express'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import type { Readable } from 'stream'

export const mediaRouter = Router()

// 惰性创建 S3Client：仅在 S3 启用且 mediaRouter 真被挂载并命中请求时构造，
// 沙箱（S3 关闭、走 express.static）不会触发，避免无谓的客户端实例化。
let _client: S3Client | null = null
function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
      }
    })
  }
  return _client
}

// S3 媒体代理：保留客户端 /media/<key> 契约（key 可含 category/ 前缀）。
// 用 router.use + req.path 做 catch-all（规避 Express 5 path-to-regexp 通配语法差异）。
// 流式 + Range 206，头语义对齐 express.static。
mediaRouter.use(async (req, res, next) => {
  if (req.method !== 'GET') return next()
  const key = req.path.replace(/^\/+/, '')
  if (!key) return res.status(404).json({ error: '缺少 key' })
  const range = req.headers.range
  try {
    const obj = await getClient().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Range: range || undefined
      })
    )
    const stream = obj.Body as Readable
    const len = obj.ContentLength != null ? Number(obj.ContentLength) : undefined
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    if (range && obj.ContentRange) {
      res.status(206)
      res.setHeader('Content-Range', obj.ContentRange)
    } else {
      res.status(200)
    }
    if (len != null) res.setHeader('Content-Length', String(len))
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end()
    })
    stream.pipe(res)
  } catch {
    if (!res.headersSent) res.status(404).json({ error: '对象不存在' })
  }
})
