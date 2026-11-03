# 单词簿 · 课本单词学习系统

面向小学、初中学生的课本同步单词学习工具。学生按课本单元练习，系统按记忆强度安排复习；家长查看学习报告，并用完全自定义的规则记录激励；管理员维护课本、单词、图片与账号。

本期为 MVP，包含学生端、家长端、管理端三套界面，不包含游戏化、AI 生图、社交、付费与多语言。

## 技术架构

| 层 | 技术 |
| --- | --- |
| Web | Nuxt 4（SPA，`ssr: false`）+ Vue 3 + Tailwind CSS v4 + lucide-vue-next |
| API | Hono + Cloudflare Workers |
| 数据库 | Cloudflare D1（SQLite） |
| 文件存储 | Cloudflare R2（单词图片） |
| 共享代码 | `@english-study/shared`（类型、文案、格式化函数） |
| 认证 | 手机号 + PBKDF2 密码；JWT 7 天；HttpOnly Cookie + Bearer Token 双支持 |

```
english_study/
├── apps/
│   ├── api/                 # Hono Worker
│   │   ├── migrations/      # D1 schema
│   │   ├── seed.sql         # 演示数据
│   │   └── src/
│   │       ├── routes/      # auth / student / parent / admin / family / images
│   │       └── lib/         # 出题、SRS、激励判定、鉴权、查询
│   └── web/                 # Nuxt 4 SPA
│       ├── app/pages/       # student / parent / admin / login
│       ├── app/components/  # 通用 UI
│       └── public/          # favicon 与种子图片
├── packages/shared/         # 共享类型与文案
└── scripts/dev.mjs          # 同时启动 API 与 Web
```

开发时 Web 通过 Vite 将 `/api` 代理到 `http://127.0.0.1:8787`。生产环境建议将 Web 与 API 部署在同一域名下（例如 `https://app.example.com` 与 `https://app.example.com/api`），以避免跨域 Cookie 问题。

## 本地初始化

### 1. 环境要求

- Node.js `^22.21.0`、`^24.11.0` 或 `>=26.0.0`（Nuxt 4.6 要求；低于该版本会提示 unsupported）
- npm 10 或更高版本
- Cloudflare Wrangler（作为项目依赖安装，无需全局安装）

### 2. 安装依赖

```bash
npm install
```

### 3. 配置本地密钥

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

确认 `JWT_SECRET` 至少 32 个字符。`.dev.vars` 已被 `.gitignore` 忽略。

### 4. 初始化 D1

```bash
npm run db:migrate
npm run db:seed
```

首次执行 `wrangler d1 migrations apply` 时，Wrangler 会在 `apps/api/.wrangler/` 下创建本地 D1 数据库。`seed.sql` 会清空并重建演示数据，请勿在正式环境执行。

### 5. 启动开发环境

```bash
npm run dev
```

- Web：<http://localhost:3000>
- API：<http://127.0.0.1:8787/api/health>

也可以分别启动：

```bash
npm run dev:api
npm run dev:web
```

### 6. 演示账号

| 角色 | 手机号 | 密码 |
| --- | --- | --- |
| 管理员 | `13800000000` | `admin1234` |
| 家长 | `13800000001` | `demo1234` |
| 学生 | `13800000002` | `demo1234` |
| 学生 | `13800000003` | `demo1234` |
| 家长 | `13800000004` | `demo1234` |

正式使用前请创建新的管理员账号并修改演示密码。

## 常用命令

```bash
npm run dev            # 同时启动 API 与 Web
npm run dev:api        # 仅启动 Worker
npm run dev:web        # 仅启动 Nuxt
npm run typecheck      # API tsc + Web nuxt typecheck
npm run build          # 构建 Web 并检查 API 类型
npm run db:migrate     # 应用本地 D1 migration
npm run db:seed        # 导入本地演示数据
npm run db:reset       # 重建本地 schema 并导入演示数据
npm run deploy:api     # 部署 Worker
npm run deploy:web     # 构建并部署 Web
```

## 功能说明

### 学生端

- 选择课本与单元，查看单元进度、掌握度与待复习数量。
- 练习按单词数据动态生成，支持释义选词、补全字母、句子填空、看图选词等题型。
- 服务端判分并写入 `practice_record`，同时更新 `word_mastery`。
- 今日复习队列包含到期词与薄弱词；薄弱词每日强制进入复习。
- 奖励页只读展示家庭规则、待确认、待兑现与已兑换记录。

### 家长端

- 通过手机号向学生发送绑定邀请；学生确认后查看学习报告。
- 学习报告包含今日、本周、单元进度、薄弱词、复习原因与趋势。
- 激励规则支持完成指定单元、连续学习、单日正确率、本周错词上限、单日复习量。
- 奖励内容完全由家长填写，平台不提供建议。
- 奖励账本支持确认、撤销、标记已兑换与备注。
- 单词管理支持按课本查看、搜索、查看详情与标记重点关注。

### 管理端

- 数据概览：用户、活跃、练习量、图片覆盖率、激励使用情况。
- 课本与单元：创建、编辑、发布/归档、维护排序。
- 单词库：搜索筛选、增删改、例句/搭配、Excel/CSV 批量导入、单元关联。
- 图片管理：批量上传、审核通过/驳回、缺图列表；通过后自动替换旧图。
- 题库：补充人工校对题目与解析；同一单词存在已发布人工题时优先用于练习。
- 用户与家庭：创建账号、启停用、重置密码、建立绑定、处理成员状态。

## 记忆算法（SRS）

- 记忆强度 `strength` 范围 0–5。
- 答对 +1，连续答对 3 次额外 +1；答错 -2（最低 0）。
- 复习间隔：强度 0–5 对应 1 / 1 / 3 / 7 / 15 / 30 天。
- 近 7 次正确率低于 50%，或连续答错 2 次，标记为薄弱词。
- 薄弱词每日进入复习队列；定时任务每日刷新薄弱标记。

## 图片流程

1. 管理员在图片管理中上传图片（JPG / PNG / WebP / GIF / SVG，≤ 5MB）。
2. 图片写入 R2，`word_image.status = 'pending'`。
3. 管理员审核通过后，旧 `approved` 图变为 `replaced`，并更新 `word.image_id`。
4. 只有 `approved` 图片会用于看图选词与前端展示。

种子图片位于 `apps/web/public/seed-images/`，数据库保存相对 URL（如 `/seed-images/apple.svg`）。R2 上传图片通过 `/api/images/:id` 读取。

## 正式部署

### 1. 创建 Cloudflare 资源

```bash
cd apps/api
npx wrangler d1 create english-study
npx wrangler r2 bucket create english-study-images
```

将 `wrangler.jsonc` 中 `d1_databases[0].database_id` 替换为实际 ID，并按需修改 R2 bucket 名称。

### 2. 配置密钥与变量

```bash
npx wrangler secret put JWT_SECRET -c apps/api/wrangler.jsonc
```

在 `apps/api/wrangler.jsonc` 的 `vars` 中设置生产环境：

- `APP_ENV=production`
- `CORS_ORIGINS=https://你的前端域名`
- `COOKIE_DOMAIN` 可留空（同域部署）或填写父域

### 3. 应用远程数据库

```bash
npm run db:migrate -w @english-study/api -- --remote
# 或
cd apps/api && npx wrangler d1 migrations apply english-study --remote
```

正式环境不要执行 `seed.sql`。请通过管理端或 SQL 创建首个管理员账号。

### 4. 部署

```bash
npm run deploy:api
npm run deploy:web
```

Nuxt 使用 `cloudflare_module` preset，构建产物位于 `apps/web/.output/`。生产环境建议：

- 将 Web 与 API 放在同一域名下，或在前端配置 `NUXT_PUBLIC_API_BASE` 指向 API 域名。
- 若跨域部署，需同时配置 `CORS_ORIGINS` 与 Cookie 的 `SameSite`/`Secure` 策略。
- 为 R2 bucket 配置合适的访问策略；当前图片通过 Worker 代理读取，不要求公开 bucket。

## 数据与安全说明

- 密码使用 PBKDF2（SHA-256，120,000 次迭代）加盐哈希存储。
- JWT 默认 7 天有效，同时写入 HttpOnly Cookie，并返回给前端存入 `localStorage`。
- 学生只能访问自己的学习数据；家长只能访问已绑定且状态为 `active` 的学生；管理员接口统一要求 `admin` 角色。
- 练习判分在服务端完成，前端答案不参与最终判定。
- 删除课本、单词或规则时，如已有历史记录，系统通常改为归档/停用，避免破坏历史数据。
- 平台不预设奖励内容，不提供排行榜、签到或勋章。

## 已知边界

- 当前为 SPA + API 部署，未做 SSR/SEO。
- 出题以动态生成为主；同一单词存在已发布人工题时优先使用，答题记录保留题目 ID。
- 音频题与管理端音频上传尚未在 MVP 界面中开放。
- 图片种子使用 SVG emoji 插画，仅用于演示；正式内容请替换为授权图片。
- 本地 D1 与 R2 为 Wrangler 模拟环境，部署前需完成远程资源与密钥配置。
