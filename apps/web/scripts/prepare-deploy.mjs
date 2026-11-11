// 构建产物注入部署配置：Worker 名、自定义域名路由、API 地址。
// .output 每次构建都会重生成，name / routes / vars 必须每次重新注入，
// 否则部署会回到 preset 生成的默认名，自定义域名也不会生效。
// 用法：npm run build && node scripts/prepare-deploy.mjs && wrangler deploy --config .output/server/wrangler.json
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const configPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.output', 'server', 'wrangler.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
config.name = 'english-study-web'
config.routes = [{ pattern: 'english.ikber.cc', custom_domain: true }]
config.vars = { NUXT_PUBLIC_API_BASE: 'https://api.english.ikber.cc/api' }
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
console.log('部署配置已注入：Worker english-study-web，自定义域名 english.ikber.cc')
