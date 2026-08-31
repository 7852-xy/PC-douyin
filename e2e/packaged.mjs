/**
 * 打包后 Electron 应用的正式 E2E（Playwright electron 驱动真实打包二进制）。
 *
 * 前置条件（缺失会在脚本里给出明确提示）：
 *   1. 后端在 http://localhost:3000 运行：根目录 `npm run server`（或 `cd server; npm run start`）
 *   2. seed 数据已写入（演示君/demo1234、小粉丝）：`npm run seed`
 *   3. 已打包 exe：`npm run dist`（产物 dist2/win-unpacked/PCDouyin.exe）
 *
 * 运行：npm run test:e2e
 *
 * 设计说明：
 *   - 脚本会自动注册一个临时账号给「演示君」点一条赞 + 发一条私信（先清空其 DM 未读），
 *     以保证通知/私信未读徽标可被稳定观测。
 *   - 应用 userData 可能残留登录态，故登录步骤为「感知式」——检测到登录页则登录演示君，否则直接验证。
 *   - 任一步失败会截图到 e2e/screenshots/ 便于排查。
 */
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const EXE = path.join(ROOT, 'dist2', 'win-unpacked', 'PCDouyin.exe')
const SHOT_DIR = path.join(ROOT, 'e2e', 'screenshots')
const BASE = 'http://localhost:3000'

// ---- 工具 ----
let failures = 0
const results = []
const check = (name, cond, detail) => {
  if (cond) {
    results.push({ name, ok: true })
    console.log('  ✓', name)
  } else {
    failures++
    results.push({ name, ok: false, detail })
    console.log('  ✗', name, detail === undefined ? '' : JSON.stringify(detail))
  }
  return cond
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const poll = async (fn, { timeout = 10000, step = 400 } = {}) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await fn()) return true
    await sleep(step)
  }
  return false
}
const shot = async (win, tag) => {
  try {
    mkdirSync(SHOT_DIR, { recursive: true })
    await win.screenshot({ path: path.join(SHOT_DIR, `${tag}.png`) })
    console.log(`    （已截图 ${tag}.png）`)
  } catch {
    /* 截图失败不影响结果 */
  }
}

// ---- 前置检查 ----
if (!existsSync(EXE)) {
  console.error(`✗ 未找到打包产物：${EXE}`)
  console.error('  请先运行：npm run dist')
  process.exit(2)
}
try {
  const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) })
  if (!r.ok) throw new Error('health 非 200')
} catch {
  console.error(`✗ 后端未在 ${BASE} 运行`)
  console.error('  请先运行：npm run server（或 cd server; npm run start）')
  process.exit(2)
}

// ---- 注入一条点赞通知，保证未读徽标可观测（幂等：每次注册新临时账号）----
const uniq = Date.now().toString(36) // 临时账号昵称后缀，STEP8 会话定位也用它
try {
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: `n_${uniq}`, password: '1234' })
  }).then((r) => r.json())
  if (!reg?.token) throw new Error(JSON.stringify(reg))
  // 经搜索定位演示君 → 拉其主页视频列表（feed 前 30 条可能被 test:api 的测试视频刷满）
  const sr = await fetch(`${BASE}/api/search?q=${encodeURIComponent('演示君')}`).then((r) => r.json())
  const u = sr.users?.[0]
  if (!u) throw new Error('未找到演示君——请先 npm run seed')
  const mine = await fetch(`${BASE}/api/users/${u.id}/videos`).then((r) => r.json())
  const v = mine.videos?.[0]
  if (!v) throw new Error('未找到演示君的视频——请先 npm run seed')
  await fetch(`${BASE}/api/videos/${v.id}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${reg.token}` }
  })
  // DM 预置：先清空演示君所有会话未读（幂等），再由临时账号发一条私信 → 未读稳定为 1
  const lg = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '演示君', password: 'demo1234' })
  }).then((r) => r.json())
  if (lg?.token) {
    globalThis.__demoToken = lg.token
    const convs = await fetch(`${BASE}/api/dm/conversations`, {
      headers: { Authorization: `Bearer ${lg.token}` }
    }).then((r) => r.json())
    for (const c of convs.conversations ?? []) {
      await fetch(`${BASE}/api/dm/read/${c.user.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lg.token}` }
      })
    }
  }
  await fetch(`${BASE}/api/dm/${u.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` },
    body: JSON.stringify({ content: `e2e_dm_${uniq}` })
  })
} catch (e) {
  console.error('✗ 预置未读通知失败：', e.message)
  process.exit(2)
}

// ---- 主流程 ----
console.log('启动打包应用：', EXE)
const app = await electron.launch({ executablePath: EXE })
let win
try {
  win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await sleep(2500)

  // STEP 1 登录感知
  const loginInput = win.locator('input[placeholder*="昵称"]')
  if (await loginInput.isVisible().catch(() => false)) {
    await win.fill('input[placeholder*="昵称"]', '演示君')
    await win.fill('input[placeholder*="密码"]', 'demo1234')
    await win.press('input[placeholder*="密码"]', 'Enter')
  }
  const onMain = await poll(
    () => win.locator('text=发布视频').first().isVisible().catch(() => false),
    { timeout: 20000 }
  )
  if (!check('STEP1 主界面加载（演示君登录态）', onMain)) {
    await shot(win, 'step1-main')
    throw new Error('未进入主界面，中止')
  }

  // STEP 2 通知未读徽标
  const badgeSel = 'button:has-text("通知") span[class*="bg-pink-600"]'
  const badgeBefore = await win.locator(badgeSel).count()
  if (!check('STEP2 通知未读徽标存在', badgeBefore > 0, { badgeCount: badgeBefore })) {
    await shot(win, 'step2-badge')
  }

  // STEP 3 通知列表
  await win.click('button:has-text("通知")')
  await poll(() => win.locator('text=消息通知').first().isVisible().catch(() => false), { timeout: 10000 })
  const hasRow =
    (await win.isVisible('text=赞了你的视频').catch(() => false)) ||
    (await win.isVisible('text=关注了你').catch(() => false))
  if (!check('STEP3 通知列表含 like/follow 行', hasRow)) await shot(win, 'step3-list')

  // STEP 4 全部已读
  const markAll = win.locator('button:has-text("全部已读")')
  if (await markAll.count()) {
    await markAll.first().click()
    await sleep(1000)
  }
  const badgeAfter = await win.locator(badgeSel).count()
  if (!check('STEP4 全部已读后徽标消失', badgeAfter === 0, { badgeCount: badgeAfter })) {
    await shot(win, 'step4-markall')
  }

  // STEP 5 搜索小粉丝
  await win.fill('input[placeholder="搜索作者 / 视频"]', '小粉丝')
  await win.press('input[placeholder="搜索作者 / 视频"]', 'Enter')
  const onSearch = await poll(
    () => win.locator('text=用户').first().isVisible().catch(() => false),
    { timeout: 10000 }
  )
  const fanRow = win.locator('button:has-text("小粉丝")')
  if (!check('STEP5 搜索命中小粉丝', onSearch && (await fanRow.count()) > 0)) {
    await shot(win, 'step5-search')
  }

  // STEP 6 小粉丝主页 + 关注
  await fanRow.first().click()
  const onProfile = await poll(
    () => win.locator('text=作品').first().isVisible().catch(() => false),
    { timeout: 10000 }
  )
  const followBtn = win.locator('button:has-text("+ 关注")')
  if (await followBtn.count()) {
    await followBtn.first().click()
    await sleep(800)
  }
  const followed = (await win.locator('button:has-text("已关注")').count()) > 0
  if (!check('STEP6 小粉丝主页加载并关注成功', onProfile && followed)) {
    await shot(win, 'step6-follow')
  }

  // STEP 7 关注流
  await win.click('button:has-text("返回首页")')
  await poll(() => win.locator('text=首页').first().isVisible().catch(() => false), { timeout: 10000 })
  await win.locator('main button:has-text("关注")').first().click()
  const found = await poll(
    () => win.locator('text=@小粉丝').first().isVisible().catch(() => false),
    { timeout: 12000 }
  )
  if (!check('STEP7 关注流含小粉丝视频', found)) await shot(win, 'step7-following')

  // STEP 8 私信：徽标 → 会话列表 → 进入聊天 → 回复 → 徽标清零
  const dmBadgeSel = 'button:has-text("私信") span[class*="bg-pink-600"]'
  const dmBadge = await poll(
    () => win.locator(dmBadgeSel).first().isVisible().catch(() => false),
    { timeout: 10000 }
  )
  check('STEP8a 私信未读徽标存在', dmBadge)
  await win.click('button:has-text("私信")')
  const onDmList = await poll(
    () => win.locator('h1:has-text("私信")').first().isVisible().catch(() => false),
    { timeout: 10000 }
  )
  await win.locator(`button:has-text("n_${uniq}")`).first().click({ position: { x: 40, y: 20 } })
  const onChat = await poll(
    () => win.locator('input[placeholder*="发给"]').first().isVisible().catch(() => false),
    { timeout: 10000 }
  )
  const reply = `e2e_reply_${uniq}`
  await win.fill('input[placeholder*="发给"]', reply)
  await win.press('input[placeholder*="发给"]', 'Enter')
  const replyShown = await poll(
    () => win.locator(`text=${reply}`).first().isVisible().catch(() => false),
    { timeout: 8000 }
  )
  // 观测式轮询：count>0 时打印匹配元素 outerHTML + 服务端真值，抓 ghost 元素
  let dmBadgeGone = false
  let diagDumped = false
  {
    const end = Date.now() + 15000
    while (Date.now() < end) {
      const c = await win.locator(dmBadgeSel).count()
      if (c === 0) {
        dmBadgeGone = true
        break
      }
      if (!diagDumped) {
        diagDumped = true
        const html = await win
          .locator(dmBadgeSel)
          .evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 200)))
          .catch((e) => ['EVAL_ERR ' + e.message])
        console.log('    [diag] badge 匹配元素:', JSON.stringify(html))
        const srv = await fetch(`${BASE}/api/dm/unread-count`, {
          headers: { Authorization: `Bearer ${globalThis.__demoToken}` }
        })
          .then((r) => r.json())
          .catch(() => null)
        console.log('    [diag] 服务端未读:', srv?.count)
      }
      await sleep(500)
    }
  }
  if (!check('STEP8b 私信会话/回复/已读清徽标', onDmList && onChat && replyShown && dmBadgeGone, {
    onDmList, onChat, replyShown, dmBadgeGone
  })) await shot(win, 'step8-dm')

  // 回到首页 feed（聊天 → 会话列表 → 首页），逐步容错
  for (let i = 0; i < 2; i++) {
    const back = win.locator('button:has-text("返回")').first()
    if (await back.isVisible().catch(() => false)) {
      await back.click().catch(() => {})
      await sleep(700)
    }
  }
  if (!(await win.locator('button:has-text("推荐")').first().isVisible().catch(() => false))) {
    const home = win.locator('button:has-text("首页")').first()
    if (await home.isVisible().catch(() => false)) await home.click().catch(() => {})
  }
  const backFeed = await poll(
    () => win.locator('button:has-text("推荐")').first().isVisible().catch(() => false),
    { timeout: 10000 }
  )
  if (!check('STEP8c 回到首页', backFeed)) await shot(win, 'step8c-home')

  // STEP 9 分享：点击 ↗ → 剪贴板提示弹窗 + 计数显示
  let shareMsg = ''
  const dlgHandler = async (d) => {
    shareMsg = d.message()
    await d.dismiss().catch(() => {})
  }
  win.on('dialog', dlgHandler)
  const shareBtn = win.locator('button:has-text("↗")').first()
  await shareBtn.click()
  const alertOk = await poll(() => shareMsg.includes('分享链接已复制'), { timeout: 6000 })
  win.off('dialog', dlgHandler)
  const countShown = await poll(async () => {
    try {
      return !(await shareBtn.innerText()).includes('分享')
    } catch {
      return false
    }
  }, { timeout: 6000 })
  if (!check('STEP9 分享：复制提示 + 计数显示', alertOk && countShown, { shareMsg, countShown })) {
    await shot(win, 'step9-share')
  }

  // STEP 10 服务器设置弹窗开/关
  await win.click('button[title="服务器设置"]')
  const settingsOpen = await poll(
    () => win.locator('h2:has-text("服务器地址")').first().isVisible().catch(() => false),
    { timeout: 6000 }
  )
  await win.click('button:has-text("取消")')
  const settingsClosed = await poll(
    async () => !(await win.locator('h2:has-text("服务器地址")').first().isVisible().catch(() => false)),
    { timeout: 6000 }
  )
  if (!check('STEP10 服务器设置弹窗开/关', settingsOpen && settingsClosed, {
    settingsOpen, settingsClosed
  })) await shot(win, 'step10-server')
} catch (e) {
  console.error('\n异常/中止：', e.message)
  if (win) await shot(win, 'error')
} finally {
  await app.close().catch(() => {})
}

const passed = results.length - failures
console.log(`\n=== E2E: ${passed}/${results.length} 通过${failures === 0 ? '（全绿）' : ''} ===`)
process.exit(failures === 0 ? 0 : 1)
