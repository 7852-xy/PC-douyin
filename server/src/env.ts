// 带副作用的 .env 加载模块：必须在所有读 process.env 的业务模块之前 import。
// ESM 按源序求值副作用 import——本模块除 fs 外不依赖任何读 env 的模块，
// 故其模块体（下方解析）会在后续 import（如 ./app → ./auth）求值前执行，
// 把 server/.env 写入 process.env，修复原先 index.ts 内联解析被 import 提升绕过的时序 bug。
// 不引入 dotenv 依赖，轻量手写解析；已存在的环境变量不被 .env 覆盖。
import { readFileSync } from 'fs'

try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_]\w*)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
} catch {
  // .env 不存在时用默认值（config.ts 内惰性兜底）
}
