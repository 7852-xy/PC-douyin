import './env'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { getStorage } from './storage'

// 种子数据：把客户端 mock 视频经 storage 落盘/传 S3，建演示账号 + 5 条视频。
// 额外建一个小粉丝账号，关注演示君 + 点赞演示君首条视频，
// 让演示君登录后能看到通知（关注 + 点赞）。
const CLIENT_VIDEOS = path.resolve(process.cwd(), '../src/renderer/public/videos')

const SEED = [
  { file: 'v1.mp4', title: '城市夜景航拍', description: '周末爬楼拍的城市夜景，霓虹灯太美了 #摄影 #城市夜景', music: 'City Lights - 夜航星', duration: 6 },
  { file: 'v2.mp4', title: '海边日落延时', description: '等了两小时的日落延时摄影，值得！ #日落 #治愈系', music: 'Ocean Breeze - 沉稳', duration: 6 },
  { file: 'v3.mp4', title: '猫咪的下午', description: '我家橘猫的日常，睡姿满分 #萌宠 #橘猫', music: 'Lazy Afternoon - 慢半拍', duration: 6 },
  { file: 'v4.mp4', title: '公路骑行', description: '沿海公路骑行，风和自由都在路上 #骑行 #旅行', music: 'Ride On - 机车少年', duration: 6 },
  { file: 'v5.mp4', title: '街舞对决', description: '商场里的街舞快闪，最后一轮太燃了 #街舞 #Bboy', music: 'Hip Hop Beat - 节拍器', duration: 6 }
]

// 小粉丝账号的视频（1 条，让「关注」流里有内容）
const FAN_VIDEOS = [
  { file: 'v3.mp4', title: '粉丝也来打卡', description: '跟风拍一段，求关注 ❤️ #打卡 #新人', music: 'Fan Track - 报到', duration: 6 }
]

async function main() {
  // 1. 演示君（主账号）
  const author = await prisma.user.upsert({
    where: { nickname: '演示君' },
    update: {},
    create: {
      nickname: '演示君',
      passwordHash: await bcrypt.hash('demo1234', 10)
    }
  })

  for (const s of SEED) {
    const src = path.join(CLIENT_VIDEOS, s.file)
    if (!existsSync(src)) {
      console.warn(`跳过 ${s.file}：源文件不存在`)
      continue
    }
    const existing = await prisma.video.findFirst({ where: { title: s.title, authorId: author.id } })
    if (existing) continue

    // 经 storage 落盘/传 S3（local 写 uploads/，S3 传 MinIO；同一 key 契约）
    const filename = await getStorage().saveUpload(
      { buffer: readFileSync(src), originalname: s.file, mimetype: 'video/mp4' },
      'video'
    )
    await prisma.video.create({
      data: {
        title: s.title,
        description: s.description,
        filename,
        music: s.music,
        duration: s.duration,
        authorId: author.id
      }
    })
    console.log(`已导入: ${s.title}`)
  }

  // 2. 小粉丝（次要账号）
  const fan = await prisma.user.upsert({
    where: { nickname: '小粉丝' },
    update: {},
    create: {
      nickname: '小粉丝',
      passwordHash: await bcrypt.hash('fan1234', 10)
    }
  })

  for (const fv of FAN_VIDEOS) {
    const src = path.join(CLIENT_VIDEOS, fv.file)
    if (!existsSync(src)) continue
    const existing = await prisma.video.findFirst({ where: { title: fv.title, authorId: fan.id } })
    if (existing) continue
    const filename = await getStorage().saveUpload(
      { buffer: readFileSync(src), originalname: fv.file, mimetype: 'video/mp4' },
      'video'
    )
    await prisma.video.create({
      data: {
        title: fv.title,
        description: fv.description,
        filename,
        music: fv.music,
        duration: fv.duration,
        authorId: fan.id
      }
    })
    console.log(`已导入(粉丝): ${fv.title}`)
  }

  // 3. 社交种子：小粉丝 关注 演示君（幂等）
  const existingFollow = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: fan.id, followeeId: author.id } }
  })
  if (!existingFollow) {
    await prisma.follow.create({ data: { followerId: fan.id, followeeId: author.id } })
    // 关注通知（幂等：仅在首次 seed 时产生）
    await prisma.notification.create({
      data: { type: 'follow', actorId: fan.id, recipientId: author.id }
    })
    console.log('已建立关注: 小粉丝 → 演示君')
  }

  // 4. 点赞通知种子：小粉丝 点赞 演示君的首条视频
  const demoFirst = await prisma.video.findFirst({
    where: { authorId: author.id },
    orderBy: { createdAt: 'asc' }
  })
  if (demoFirst) {
    const existingLike = await prisma.like.findUnique({
      where: { userId_videoId: { userId: fan.id, videoId: demoFirst.id } }
    })
    if (!existingLike) {
      await prisma.like.create({ data: { userId: fan.id, videoId: demoFirst.id } })
      await prisma.notification.create({
        data: { type: 'like', actorId: fan.id, recipientId: author.id, videoId: demoFirst.id }
      })
      console.log(`已点赞: 小粉丝 → ${demoFirst.title}`)
    }
  }

  console.log('Seed 完成')
}

main().finally(() => prisma.$disconnect())
