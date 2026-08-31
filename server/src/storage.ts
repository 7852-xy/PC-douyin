import path from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { isS3Enabled } from './config'

export interface UploadedFile {
  buffer: Buffer
  originalname: string
  mimetype: string
}

export interface Storage {
  // 落盘/传 S3，返回存储 key（local=纯文件名；S3=category/timestamp-uuid.ext）。
  // mediaUrl 统一 /media/<key>，客户端契约不变。
  saveUpload(file: UploadedFile, category: 'video' | 'cover'): Promise<string>
  mediaUrl(key: string): string
}

// 本地存储：写 uploads/，key=纯文件名（randomUUID+ext）。沙箱/单机默认路径。
class LocalStorage implements Storage {
  private dir = path.resolve(process.cwd(), 'uploads')
  constructor() {
    mkdirSync(this.dir, { recursive: true })
  }
  async saveUpload(file: UploadedFile, category: 'video' | 'cover'): Promise<string> {
    const ext = category === 'cover' ? '.jpg' : path.extname(file.originalname).toLowerCase()
    const key = `${randomUUID()}${ext}`
    writeFileSync(path.join(this.dir, key), file.buffer)
    return key
  }
  mediaUrl(key: string): string {
    return `/media/${key}`
  }
}

// S3 兼容存储（MinIO/OSS/R2 等）：PutObject，key=category/timestamp-uuid.ext。
// mediaUrl 仍走自家 /media/<key> 代理（见 routes/media.ts），客户端契约不变。
class S3Storage implements Storage {
  private client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
    }
  })
  private bucket = process.env.S3_BUCKET!
  async saveUpload(file: UploadedFile, category: 'video' | 'cover'): Promise<string> {
    const ext = category === 'cover' ? '.jpg' : path.extname(file.originalname).toLowerCase()
    const key = `${category}/${Date.now()}-${randomUUID()}${ext}`
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype
      })
    )
    return key
  }
  mediaUrl(key: string): string {
    return `/media/${key}`
  }
}

let _storage: Storage | null = null
// 工厂（单例）：S3_BUCKET 设了走 S3，否则本地。沙箱默认 LocalStorage。
export function getStorage(): Storage {
  if (!_storage) _storage = isS3Enabled() ? new S3Storage() : new LocalStorage()
  return _storage
}
