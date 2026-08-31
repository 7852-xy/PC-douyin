// 上传前用 canvas 截取视频首帧作为封面，避免服务端 ffmpeg 依赖。
// 思路：URL.createObjectURL(file) 喂给隐藏 <video>，seek 到 ~1s，绘制到 canvas 导出 JPEG。
// 失败（极短视频/解码失败）返回 null，调用方降级为无封面上传。
export async function extractCover(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    const url = URL.createObjectURL(file)
    let settled = false
    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.remove()
    }
    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(null)
    }
    const tryDraw = () => {
      if (settled) return
      settled = true
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 360
        canvas.height = video.videoHeight || 640
        const ctx = canvas.getContext('2d')
        if (!ctx) return fail()
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (b) => {
            cleanup()
            resolve(b)
          },
          'image/jpeg',
          0.7
        )
      } catch {
        fail()
      }
    }
    // 加载元数据后 seek 到 1s（或视频 10%）
    video.onloadedmetadata = () => {
      const target = Math.min(1, (video.duration || 0) * 0.1) || 0.1
      // seeked 事件触发后绘制
      video.onseeked = tryDraw
      try {
        video.currentTime = target
      } catch {
        fail()
      }
    }
    video.onerror = fail
    // 超时兜底（4s）
    setTimeout(fail, 4000)
    video.src = url
  })
}
