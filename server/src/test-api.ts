// API 集成测试：对运行中的服务（默认 localhost:3000）做全链路验证
import './env'
import { readFileSync } from 'fs'
import path from 'path'

const BASE = process.env.TEST_BASE || 'http://localhost:3000'
let failures = 0

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS ${name}`)
  else {
    failures++
    console.log(`FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '')
  }
}

async function api(path: string, init?: RequestInit & { token?: string }) {
  const headers: Record<string, string> = {}
  if (init?.token) headers.Authorization = `Bearer ${init.token}`
  if (init?.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + path, { ...init, headers })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* 非JSON（如媒体流） */
  }
  return { status: res.status, json, res }
}

async function main() {
  const uniq = Date.now().toString(36)
  const nickA = `测试A_${uniq}`
  const nickB = `测试B_${uniq}`
  let tokenA = ''
  let tokenB = ''

  // 1. 健康
  {
    const r = await api('/api/health')
    check('health', r.status === 200 && r.json?.ok === true, r.json)
  }

  // 2. 注册/重复注册/登录
  {
    let r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ nickname: nickA, password: '1234' }) })
    check('register A', r.status === 200 && !!r.json?.token, r.json)
    tokenA = r.json?.token
    r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ nickname: nickA, password: '1234' }) })
    check('register duplicate 409', r.status === 409, r.status)
    r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ nickname: nickA, password: 'wrong' }) })
    check('login wrong pwd 401', r.status === 401, r.status)
    r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ nickname: nickA, password: '1234' }) })
    check('login A', r.status === 200 && !!r.json?.token, r.json)
    r = await api('/api/auth/me', { token: tokenA })
    check('me A', r.status === 200 && r.json?.user?.nickname === nickA, r.json)
  }

  // 3. 空feed / 无token
  {
    const r = await api('/api/videos')
    check('feed anonymous ok', r.status === 200 && Array.isArray(r.json?.videos), r.status)
    const r2 = await api('/api/videos/xxx/like', { method: 'POST', token: '' })
    check('like without token 401', r2.status === 401, r2.status)
  }

  // 4. 上传（A 上传一个真实 mp4）
  let videoId = ''
  let videoUrl = ''
  {
    const buf = readFileSync(path.resolve(process.cwd(), '../src/renderer/public/videos/v1.mp4'))
    const fd = new FormData()
    fd.append('video', new Blob([new Uint8Array(buf)], { type: 'video/mp4' }), 'test.mp4')
    fd.append('title', '集成测试视频')
    fd.append('description', '上传链路验证 #测试')
    const r = await api('/api/videos', { method: 'POST', token: tokenA, body: fd })
    check('upload A', r.status === 200 && !!r.json?.video?.id, r.json)
    videoId = r.json?.video?.id ?? ''
    videoUrl = r.json?.video?.videoUrl ?? ''
  }

  // 5. feed 含新视频 + 作者正确
  {
    const r = await api('/api/videos')
    const v = r.json?.videos?.find((x: any) => x.id === videoId)
    check('feed contains uploaded', !!v, r.json?.videos?.length)
    check('feed author', v?.author?.nickname === nickA, v?.author)
  }

  // 6. 媒体访问 + Range
  {
    const r1 = await fetch(BASE + videoUrl)
    const buf = new Uint8Array(await r1.arrayBuffer())
    const src = readFileSync(path.resolve(process.cwd(), '../src/renderer/public/videos/v1.mp4'))
    check('media full ok', r1.status === 200 && buf.length === src.length, buf.length)
    const r2 = await fetch(BASE + videoUrl, { headers: { Range: 'bytes=0-99' } })
    const part = new Uint8Array(await r2.arrayBuffer())
    check('media range 206', r2.status === 206 && part.length === 100, r2.status)
  }

  // 7. 点赞切换（A 点赞 → 取消 → B 点赞）
  {
    let r = await api(`/api/videos/${videoId}/like`, { method: 'POST', token: tokenA })
    check('like A on', r.status === 200 && r.json?.liked === true && r.json?.likes === 1, r.json)
    r = await api(`/api/videos/${videoId}/like`, { method: 'POST', token: tokenA })
    check('like A off', r.json?.liked === false && r.json?.likes === 0, r.json)
    r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ nickname: nickB, password: '1234' }) })
    tokenB = r.json?.token
    r = await api(`/api/videos/${videoId}/like`, { method: 'POST', token: tokenB })
    check('like B on', r.json?.liked === true && r.json?.likes === 1, r.json)
    const feed = await api('/api/videos', { token: tokenB })
    const vb = feed.json?.videos?.find((x: any) => x.id === videoId)
    check('feed liked flag B', vb?.liked === true && vb?.likes === 1, vb)
  }

  // 8. 收藏切换
  {
    let r = await api(`/api/videos/${videoId}/collect`, { method: 'POST', token: tokenB })
    check('collect B on', r.json?.collected === true, r.json)
    r = await api(`/api/videos/${videoId}/collect`, { method: 'POST', token: tokenB })
    check('collect B off', r.json?.collected === false, r.json)
  }

  // 9. 评论：B 发 2 条 → 列表带作者 → A 点赞评论
  {
    let r = await api(`/api/videos/${videoId}/comments`, { method: 'POST', token: tokenB, body: JSON.stringify({ content: '第一条评论' }) })
    check('comment B1', r.status === 200 && r.json?.comment?.content === '第一条评论', r.json)
    const cid = r.json?.comment?.id
    r = await api(`/api/videos/${videoId}/comments`, { method: 'POST', token: tokenB, body: JSON.stringify({ content: '第二条评论' }) })
    check('comment B2', r.status === 200, r.status)
    r = await api(`/api/videos/${videoId}/comments`, { token: tokenA })
    check('comment list', r.json?.comments?.length === 2, r.json?.comments?.length)
    r = await api(`/api/videos/comments/${cid}/like`, { method: 'POST', token: tokenA })
    check('comment like A', r.json?.liked === true && r.json?.likes === 1, r.json)
    r = await api(`/api/videos/${videoId}/comments`, { token: tokenA })
    const c = r.json?.comments?.find((x: any) => x.id === cid)
    check('comment liked flag', c?.liked === true && c?.likes === 1, c)
    // feed 计数联动
    const feed = await api('/api/videos')
    const v = feed.json?.videos?.find((x: any) => x.id === videoId)
    check('feed counts', v?.likes === 1 && v?.comments === 2, v)
  }

  // 10. 分页
  {
    const p1 = await api('/api/videos?limit=2')
    check('page1 size', p1.json?.videos?.length === 2 && !!p1.json?.nextCursor, p1.json?.videos?.length)
    const p2 = await api(`/api/videos?limit=2&cursor=${p1.json.nextCursor}`)
    const ids1 = new Set(p1.json.videos.map((v: any) => v.id))
    check('page2 no overlap', p2.json?.videos?.every((v: any) => !ids1.has(v.id)), p2.json?.videos?.map((v: any) => v.id))
  }

  // 11. 用户主页资料
  let userA_id = ''
  let userB_id = ''
  {
    let r = await api('/api/auth/me', { token: tokenA })
    userA_id = r.json?.user?.id ?? ''
    check('me A has id', !!userA_id, userA_id)
    r = await api('/api/auth/me', { token: tokenB })
    userB_id = r.json?.user?.id ?? ''
    check('me B has id', !!userB_id, userB_id)
    r = await api(`/api/users/${userA_id}`, { token: tokenB })
    check(
      'profile shape',
      r.status === 200 &&
        typeof r.json?.videos === 'number' &&
        typeof r.json?.followers === 'number' &&
        typeof r.json?.following === 'number' &&
        typeof r.json?.likes === 'number' &&
        typeof r.json?.isFollowing === 'boolean',
      r.json
    )
    // B 点赞过 A 的视频 → A 获赞 >= 1；A 上传过视频 → 作品 >= 1
    check('profile A counts', r.json?.videos >= 1 && r.json?.likes >= 1, r.json)
    check('profile 404', (await api('/api/users/nope_xxx')).status === 404)
  }

  // 12. 关注切换 + 关注流
  {
    // B 关注 A（isFollowing false → true，A 收到 follow 通知）
    let r = await api(`/api/users/${userA_id}/follow`, { method: 'POST', token: tokenB })
    check('follow B->A on', r.json?.isFollowing === true, r.json)
    r = await api(`/api/users/${userA_id}`, { token: tokenB })
    check('profile isFollowing true', r.json?.isFollowing === true && r.json?.followers >= 1, r.json)
    // 关注流：B 能看到 A 的视频
    r = await api('/api/videos/following?limit=10', { token: tokenB })
    const f = r.json?.videos?.find((x: any) => x.id === videoId)
    check('following feed contains A', !!f, r.json?.videos?.map((x: any) => x.id))
    // 取关 → 关注流为空
    r = await api(`/api/users/${userA_id}/follow`, { method: 'POST', token: tokenB })
    check('follow B->A off', r.json?.isFollowing === false, r.json)
    r = await api('/api/videos/following?limit=10', { token: tokenB })
    check('following feed empty after unfollow', r.json?.videos?.length === 0, r.json)
    // 不能关注自己
    r = await api(`/api/users/${userB_id}/follow`, { method: 'POST', token: tokenB })
    check('follow self 400', r.status === 400, r.status)
    // 关注流未登录 401
    check('following without token 401', (await api('/api/videos/following')).status === 401)
  }

  // 13. 搜索
  {
    let r = await api(`/api/search?q=${encodeURIComponent(nickA)}`, { token: tokenB })
    const foundUser = r.json?.users?.some((u: any) => u.nickname === nickA)
    check('search by nickname', r.status === 200 && foundUser, r.json?.users)
    r = await api(`/api/search?q=${encodeURIComponent('集成测试视频')}`, { token: tokenB })
    const foundVideo = r.json?.videos?.some((v: any) => v.id === videoId)
    check('search by title', foundVideo, r.json?.videos?.map((v: any) => v.title))
    r = await api('/api/search?q=')
    check('search empty q', r.json?.videos?.length === 0 && r.json?.users?.length === 0, r.json)
  }

  // 14. 通知（A 收到：like + 2×comment(B 在 A 视频下评论) + follow，共 4 条未读）
  {
    let r = await api('/api/notifications/unread-count', { token: tokenA })
    check('unread count A >= 4', r.json?.count >= 4, r.json)
    r = await api('/api/notifications', { token: tokenA })
    check('notif list A non-empty', r.json?.notifications?.length >= 4, r.json?.notifications?.length)
    const firstId = r.json?.notifications?.[0]?.id
    // 标记单条已读：未读 -1
    r = await api(`/api/notifications/${firstId}/read`, { method: 'POST', token: tokenA })
    check('notif mark read', r.json?.ok === true, r.json)
    r = await api('/api/notifications/unread-count', { token: tokenA })
    check('unread decremented', r.json?.count >= 3, r.json)
    // 全部已读
    r = await api('/api/notifications/read-all', { method: 'POST', token: tokenA })
    check('notif read-all', r.json?.ok === true, r.json)
    r = await api('/api/notifications/unread-count', { token: tokenA })
    check('unread 0 after read-all', r.json?.count === 0, r.json)
    // B 的通知（comment_like 来自 A）
    r = await api('/api/notifications/unread-count', { token: tokenB })
    check('unread count B >= 1', r.json?.count >= 1, r.json)
    // 未登录 401
    check('notif without token 401', (await api('/api/notifications')).status === 401)
  }

  // 15. 封面上传：带 cover 图片
  {
    const buf = readFileSync(path.resolve(process.cwd(), '../src/renderer/public/videos/v1.mp4'))
    const fd = new FormData()
    fd.append('video', new Blob([new Uint8Array(buf)], { type: 'video/mp4' }), 'withcover.mp4')
    fd.append('title', '带封面视频')
    fd.append('description', '验证封面上传 #封面')
    // 最小 JPEG（SOI + EOI），mimetype 校验只看 file.mimetype 字符串
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    fd.append('cover', new Blob([new Uint8Array(jpg)], { type: 'image/jpeg' }), 'cover.jpg')
    const r = await api('/api/videos', { method: 'POST', token: tokenB, body: fd })
    check('upload with cover', r.status === 200 && !!r.json?.video?.id, r.json)
    const coverUrl = r.json?.video?.coverUrl ?? ''
    check('coverUrl non-empty', !!coverUrl, coverUrl)
    if (coverUrl) {
      const c = await fetch(BASE + coverUrl)
      check('cover media accessible', c.status === 200, c.status)
    }
    // 不带 cover 的上传 → coverUrl 为空字符串
    const fd2 = new FormData()
    fd2.append('video', new Blob([new Uint8Array(buf)], { type: 'video/mp4' }), 'nocover.mp4')
    fd2.append('title', '无封面视频')
    const r2 = await api('/api/videos', { method: 'POST', token: tokenB, body: fd2 })
    check('upload without cover', r2.status === 200 && r2.json?.video?.coverUrl === '', r2.json)
  }

  // 16. refresh 轮换 + 黑名单（仅 JWT_REFRESH_ENABLED=true 时跑；沙箱默认跳过）
  if (process.env.JWT_REFRESH_ENABLED === 'true') {
    const rnick = `rf_${uniq}`
    let r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ nickname: rnick, password: '1234' }) })
    check('refresh: register returns refreshToken', r.status === 200 && !!r.json?.refreshToken, r.json)
    const access = r.json?.token ?? ''
    const refresh = r.json?.refreshToken ?? ''
    check('refresh: me ok with access', (await api('/api/auth/me', { token: access })).status === 200)
    // 轮换：旧 refresh → 新 access + 新 refresh
    r = await api('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: refresh }) })
    check('refresh: rotation ok', r.status === 200 && !!r.json?.token && !!r.json?.refreshToken && r.json.token !== access, r.json)
    const newAccess = r.json?.token ?? ''
    const newRefresh = r.json?.refreshToken ?? ''
    // 旧 refresh 已撤销 → 401
    r = await api('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: refresh }) })
    check('refresh: old refresh revoked 401', r.status === 401, r.status)
    // 新 access 可用
    check('refresh: new access ok', (await api('/api/auth/me', { token: newAccess })).status === 200)
    // logout：带 refreshToken 撤销 + 拉黑当前 access
    r = await api('/api/auth/logout', { method: 'POST', token: newAccess, body: JSON.stringify({ refreshToken: newRefresh }) })
    check('refresh: logout ok', r.status === 200 && r.json?.ok === true, r.json)
    // 拉黑的 access 现在 401
    check('refresh: blacklisted access 401', (await api('/api/auth/me', { token: newAccess })).status === 401)
    // 登出后 refresh 也已撤销 → 401
    check('refresh: refresh revoked after logout 401', (await api('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: newRefresh }) })).status === 401)
  }

  // 17. 分享 / 热搜 / 私信
  {
    // 分享：匿名可 +1
    let r = await api(`/api/videos/${videoId}/share`, { method: 'POST' })
    check('share: anonymous increments', r.status === 200 && r.json?.shares >= 1, r.json)
    const shares1 = r.json?.shares
    r = await api(`/api/videos/${videoId}/share`, { method: 'POST' })
    check('share: increments again', r.status === 200 && r.json?.shares === shares1 + 1, r.json)
    check('share: missing video 404', (await api('/api/videos/xxx/share', { method: 'POST' })).status === 404)

    // 热搜：热门视频 + 话题聚合
    r = await api('/api/trending')
    check('trending: videos non-empty', r.status === 200 && Array.isArray(r.json?.videos) && r.json.videos.length > 0, r.status)
    check('trending: video has collects', typeof r.json?.videos?.[0]?.collects === 'number', r.json?.videos?.[0])
    check('trending: keywords array', Array.isArray(r.json?.keywords), r.json?.keywords)

    // 私信：A → B
    check('dm: self send 400', (await api(`/api/dm/${userA_id}`, { method: 'POST', token: tokenA, body: JSON.stringify({ content: 'hi' }) })).status === 400)
    check('dm: empty content 400', (await api(`/api/dm/${userB_id}`, { method: 'POST', token: tokenA, body: JSON.stringify({ content: '  ' }) })).status === 400)
    check('dm: send to missing user 404', (await api('/api/dm/xxx', { method: 'POST', token: tokenA, body: JSON.stringify({ content: 'hi' }) })).status === 404)
    r = await api(`/api/dm/${userB_id}`, { method: 'POST', token: tokenA, body: JSON.stringify({ content: `hello_${uniq}` }) })
    check('dm: send A->B ok', r.status === 200 && r.json?.message?.fromMe === true && r.json.message.content === `hello_${uniq}`, r.json)

    r = await api('/api/dm/unread-count', { token: tokenB })
    check('dm: B unread 1', r.status === 200 && r.json?.count === 1, r.json)
    r = await api('/api/dm/conversations', { token: tokenB })
    const convA = r.json?.conversations?.find((c: any) => c.user?.id === userA_id)
    check('dm: B conversation has A unread 1', !!convA && convA.unread === 1 && convA.lastMessage === `hello_${uniq}`, convA)
    r = await api(`/api/dm/with/${userA_id}`, { token: tokenB })
    check('dm: B thread has message', r.status === 200 && r.json?.messages?.some((m: any) => m.content === `hello_${uniq}` && m.fromMe === false), r.json?.messages)
    // B 标记已读 → 未读归零
    await api(`/api/dm/read/${userA_id}`, { method: 'POST', token: tokenB })
    r = await api('/api/dm/unread-count', { token: tokenB })
    check('dm: B unread 0 after read', r.json?.count === 0, r.json)
    // B 回复 → A 未读 1
    await api(`/api/dm/${userA_id}`, { method: 'POST', token: tokenB, body: JSON.stringify({ content: 'reply' }) })
    r = await api('/api/dm/unread-count', { token: tokenA })
    check('dm: A unread 1 after B reply', r.json?.count === 1, r.json)
  }

  console.log(failures === 0 ? '\n=== ALL TESTS PASSED ===' : `\n=== ${failures} FAILURES ===`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('TEST CRASH', e)
  process.exit(1)
})
