import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv, UserRow } from '../types'
import { parseBody } from '../lib/http'
import { clearAuthCookie, createToken, requireAuth, setAuthCookie, verifyPassword } from '../lib/auth'

const auth = new Hono<AppEnv>()

const loginSchema = z.object({
  phone: z.string().trim().regex(/^1\d{10}$/, '请输入正确的手机号'),
  password: z.string().min(6, '密码至少 6 位'),
})

auth.post('/login', async (c) => {
  const body = await parseBody(c, loginSchema)
  const user = await c.env.DB.prepare(
    'SELECT * FROM user WHERE phone = ?',
  ).bind(body.phone).first<UserRow>()
  if (!user) {
    return c.json({ error: '手机号或密码不正确' }, 401)
  }
  if (!user.enabled) {
    return c.json({ error: '账号已被停用，请联系管理员' }, 403)
  }
  const valid = await verifyPassword(body.password, user.password_hash)
  if (!valid) {
    return c.json({ error: '手机号或密码不正确' }, 401)
  }
  const token = await createToken(c.env, user)
  setAuthCookie(c, c.env, token)
  return c.json({
    user: {
      id: user.id,
      role: user.role,
      nickname: user.nickname,
      phone: user.phone,
      enabled: Boolean(user.enabled),
    },
    token,
  })
})

auth.post('/logout', (c) => {
  clearAuthCookie(c, c.env)
  return c.json({ ok: true })
})

auth.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') })
})

export default auth
