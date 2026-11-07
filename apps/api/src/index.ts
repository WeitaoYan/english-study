import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './types'
import auth from './routes/auth'
import student from './routes/student'
import parent from './routes/parent'
import admin from './routes/admin'
import family from './routes/family'
import images from './routes/images'
import audio from './routes/audio'

const app = new Hono<AppEnv>().basePath('/api')

app.use('*', cors({
  origin: (origin, c) => {
    if (!origin) return origin
    const allowed = (c.env.CORS_ORIGINS || '')
      .split(',')
      .map((item: string) => item.trim())
      .filter(Boolean)
    return allowed.includes(origin) ? origin : ''
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('X-Frame-Options', 'DENY')
})

app.get('/health', (c) => c.json({ ok: true, service: 'english-study-api' }))

app.route('/auth', auth)
app.route('/student', student)
app.route('/parent', parent)
app.route('/admin', admin)
app.route('/family', family)
app.route('/images', images)
app.route('/audio', audio)

app.notFound((c) => c.json({ error: '接口不存在' }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status)
  }
  console.error('[api] unhandled error', error)
  return c.json({ error: '服务暂时不可用，请稍后再试' }, 500)
})

async function scheduled(_event: ScheduledEvent, env: AppEnv['Bindings'], _ctx: ExecutionContext) {
  // 每日维护：按最近 7 次正确率与连续错误数刷新薄弱词标记。
  await env.DB.prepare(
    `UPDATE word_mastery
     SET is_weak = CASE
       WHEN consecutive_wrong >= 2 THEN 1
       WHEN json_array_length(recent_results) >= 3 AND accuracy < 0.5 THEN 1
       ELSE 0
     END,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`,
  ).run()
}

export default {
  fetch: app.fetch,
  scheduled,
}
