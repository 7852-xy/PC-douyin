import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { probeMode, useAppStore } from './stores/appStore'

// 启动时先探测后端是否可用（决定 server/local 模式），再渲染应用
probeMode().then((mode) => {
  useAppStore.getState().setMode(mode)
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
