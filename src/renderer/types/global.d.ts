// 渲染进程全局类型：preload 暴露的 API
export {}

declare global {
  interface Window {
    /** 仅在 Electron 环境存在；普通浏览器里为 undefined（需优雅降级） */
    pcApi?: {
      selectVideo: () => Promise<{ name: string } | null>
      writeText: (text: string) => Promise<void>
      /** 注册"更新包已就绪"监听，返回取消订阅函数 */
      onUpdateReady: (cb: (version: string) => void) => () => void
      /** 退出并立即安装更新 */
      installUpdate: () => Promise<void>
    }
  }
}
