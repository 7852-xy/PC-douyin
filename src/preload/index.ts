import { contextBridge, ipcRenderer } from 'electron'

// 通过 contextBridge 暴露安全 API 给渲染进程（渲染进程无 Node 能力）
contextBridge.exposeInMainWorld('pcApi', {
  // 弹出系统文件选择框选择视频，拷贝到 uploads 目录后返回文件名；取消返回 null
  selectVideo: (): Promise<{ name: string } | null> => ipcRenderer.invoke('upload:select'),
  // 写文本到系统剪贴板（分享链接用）
  writeText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
  // 自动更新：监听"更新包已下载就绪"事件；用户确认后退出并安装
  onUpdateReady: (cb: (version: string) => void): (() => void) => {
    const handler = (_e: unknown, version: string) => cb(version)
    ipcRenderer.on('update:ready', handler)
    return () => ipcRenderer.removeListener('update:ready', handler)
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install')
})
