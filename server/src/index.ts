import './env'
import { createApp } from './app'

const PORT = Number(process.env.PORT) || 3000
const app = createApp()

app.listen(PORT, () => {
  console.log(`PC 抖音 API 服务已启动: http://localhost:${PORT}`)
})
