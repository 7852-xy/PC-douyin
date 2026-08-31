import { app, BrowserWindow, shell, dialog, ipcMain, protocol, net, clipboard } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { promises as fsp } from 'fs'
import { pathToFileURL } from 'url'

// 仅开发环境将 userData 重定向到项目内目录（沙盒/便携友好，不污染用户目录）；
// 打包后安装到 Program Files 不可写，保持系统默认 %APPDATA% 路径。
if (!app.isPackaged) {
  app.setPath('userData', join(__dirname, '../../userData'))
}

// 桌面应用豁免自动播放手势限制：短视频流无需用户先点击即可出声播放
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 自定义 media 协议：安全地向渲染进程供给本地上传的视频文件（标准流式协议，video 标签可直接用）
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
])

// 分享链接协议：pcdouyin://video/<id>。重复唤起时聚焦已有窗口（单实例锁）
app.setAsDefaultProtocolClient('pcdouyin')
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) app.quit()

function focusMainWindow() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

// 用户上传视频的存放目录（跟随 userData）
const getUploadsDir = () => join(app.getPath('userData'), 'uploads')

// 自动更新：打包后启动时静默检查，下载完成通知渲染层（提示用户退出时自动装/立即重启安装）。
// 未部署更新源（默认 example.com 占位）时 checkForUpdates 静默失败，不影响任何功能。
function setupAutoUpdate(win: BrowserWindow) {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', () => {}) // 静默：无更新源时必有网络错误
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update:ready', info.version)
  })
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

// 创建窗口
function createWindow(): BrowserWindow | null {
  const win = new BrowserWindow({
    title: 'PC 抖音',
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // dev: 加载 vite dev server；prod: 加载本地构建产物
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  if (!gotTheLock) return // 第二实例：已退出，不再建窗口

  // 确保上传目录存在
  fsp.mkdir(getUploadsDir(), { recursive: true }).catch(() => {})

  // media://local/<文件名> → uploads 目录下的文件（standard 协议必须带 host，用 local 占位）
  protocol.handle('media', (request) => {
    const url = new URL(request.url)
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    // 防目录穿越：只允许纯文件名
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
      return new Response('bad request', { status: 400 })
    }
    return net.fetch(pathToFileURL(join(getUploadsDir(), name)).toString())
  })

  // 上传：弹出系统文件选择框，选中后拷贝进 uploads 目录
  ipcMain.handle('upload:select', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win!, {
      title: '选择要发布的视频',
      filters: [{ name: '视频文件', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths[0]) return null
    const src = r.filePaths[0]
    const base = src.split(/[\\/]/).pop() ?? 'video.mp4'
    const name = `${Date.now()}-${base}`
    await fsp.copyFile(src, join(getUploadsDir(), name))
    return { name }
  })

  // 剪贴板写文本（分享链接）
  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
  })

  // 用户确认后立即安装更新（退出并安装）
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  const win = createWindow()
  if (win) setupAutoUpdate(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', focusMainWindow)
app.on('open-url', (e) => {
  e.preventDefault()
  focusMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
