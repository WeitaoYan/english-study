import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv, Env, UserRow } from '../types'
import { parseBody } from '../lib/http'
import {
  clearAuthCookie,
  createToken,
  hashPassword,
  requireAuth,
  requireRole,
  setAuthCookie,
  verifyPassword,
} from '../lib/auth'
import { uuid } from '../lib/utils'

const auth = new Hono<AppEnv>()

function publicUser(user: UserRow, switchedFromParent: { id: string; nickname: string } | null = null) {
  return {
    id: user.id,
    role: user.role,
    nickname: user.nickname,
    phone: user.phone,
    email: user.email,
    enabled: Boolean(user.enabled),
    switchedFromParent,
  }
}

function issueToken(env: Env, user: UserRow, options: { parentId?: string; parentName?: string } = {}) {
  return createToken(env, user, options)
}

// 登录标识：手机号或邮箱。兼容旧客户端仍传 phone 字段的情况。
const loginSchema = z.object({
  identifier: z.string().trim().min(1, '请输入手机号或邮箱').optional(),
  phone: z.string().trim().optional(),
  password: z.string().min(6, '密码至少 6 位'),
})

auth.post('/login', async (c) => {
  const body = await parseBody(c, loginSchema)
  const identifier = (body.identifier || body.phone || '').trim()
  if (!identifier) return c.json({ error: '请输入手机号或邮箱' }, 400)
  const isEmail = identifier.includes('@')
  const user = await c.env.DB.prepare(
    isEmail
      ? 'SELECT * FROM user WHERE lower(email) = lower(?)'
      : 'SELECT * FROM user WHERE phone = ?',
  ).bind(identifier).first<UserRow>()
  if (!user) {
    return c.json({ error: '账号或密码不正确' }, 401)
  }
  if (!user.enabled) {
    return c.json({ error: '账号已被停用，请联系管理员' }, 403)
  }
  const valid = await verifyPassword(body.password, user.password_hash)
  if (!valid) {
    return c.json({ error: '账号或密码不正确' }, 401)
  }
  const token = await issueToken(c.env, user)
  setAuthCookie(c, c.env, token)
  return c.json({ user: publicUser(user), token })
})

// 家长用邮箱注册：只注册家长角色。孩子账号不走注册，由家长在自己账号内创建。
const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('请输入正确的邮箱'),
  nickname: z.string().trim().min(1, '请填写昵称').max(50),
  password: z.string().min(6, '密码至少 6 位').max(100),
})

auth.post('/register', async (c) => {
  const body = await parseBody(c, registerSchema)
  const existing = await c.env.DB.prepare(
    'SELECT id FROM user WHERE lower(email) = lower(?)',
  ).bind(body.email).first<{ id: string }>()
  if (existing) return c.json({ error: '该邮箱已注册，请直接登录' }, 409)
  const id = uuid('u')
  const familyId = uuid('f')
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO user (id, role, nickname, phone, email, password_hash, enabled) VALUES (?, ?, ?, NULL, ?, ?, 1)',
    ).bind(id, 'parent', body.nickname, body.email, await hashPassword(body.password)),
    c.env.DB.prepare('INSERT INTO family (id, parent_user_id) VALUES (?, ?)').bind(familyId, id),
  ])
  const user = await c.env.DB.prepare('SELECT * FROM user WHERE id = ?').bind(id).first<UserRow>()
  if (!user) return c.json({ error: '注册失败，请稍后再试' }, 500)
  const token = await issueToken(c.env, user)
  setAuthCookie(c, c.env, token)
  return c.json({ user: publicUser(user), token }, 201)
})

// 家长切换到孩子视角：只能切自己家庭里当前启用的孩子。切过去后令牌角色就是学生，
// 家长端、管理端接口一律进不去；想切回家长必须走 /switch-back 并验证家长密码。
auth.post('/switch-to-child', requireAuth, requireRole('parent'), async (c) => {
  const parent = c.get('user')
  if (parent.switchedFromParent) return c.json({ error: '请先切回家长身份' }, 403)
  const body = await parseBody(c, z.object({ childId: z.string().min(1) }))
  const member = await c.env.DB.prepare(
    `SELECT fm.student_user_id AS student_id FROM family_member fm
     JOIN family f ON f.id = fm.family_id
     WHERE f.parent_user_id = ? AND fm.student_user_id = ? AND fm.status = 'active' AND fm.enabled = 1`,
  ).bind(parent.id, body.childId).first<{ student_id: string }>()
  if (!member) return c.json({ error: '未找到该孩子，或该孩子已不在你的家庭中' }, 404)
  const child = await c.env.DB.prepare('SELECT * FROM user WHERE id = ? AND role = ? AND enabled = 1')
    .bind(body.childId, 'student').first<UserRow>()
  if (!child) return c.json({ error: '孩子账号不可用' }, 403)
  const token = await issueToken(c.env, child, { parentId: parent.id, parentName: parent.nickname })
  setAuthCookie(c, c.env, token)
  return c.json({
    user: publicUser(child, { id: parent.id, nickname: parent.nickname }),
    token,
  })
})

// 从孩子视角切回家长：必须验证来源家长的密码。孩子拿着设备也切不回去，
// 因为切过去时家长令牌已被孩子视角令牌替换，家长密码是唯一能恢复家长身份的凭证。
auth.post('/switch-back', requireAuth, async (c) => {
  const current = c.get('user')
  const parentId = current.switchedFromParent?.id
  if (!parentId) return c.json({ error: '当前不是孩子视角，无需切回' }, 400)
  const body = await parseBody(c, z.object({ password: z.string().min(1, '请输入家长密码') }))
  const parent = await c.env.DB.prepare('SELECT * FROM user WHERE id = ? AND role = ? AND enabled = 1')
    .bind(parentId, 'parent').first<UserRow>()
  if (!parent) return c.json({ error: '家长账号不可用' }, 403)
  const valid = await verifyPassword(body.password, parent.password_hash)
  if (!valid) return c.json({ error: '家长密码不正确' }, 401)
  const token = await issueToken(c.env, parent)
  setAuthCookie(c, c.env, token)
  return c.json({ user: publicUser(parent), token })
})

auth.post('/logout', (c) => {
  clearAuthCookie(c, c.env)
  return c.json({ ok: true })
})

auth.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') })
})

export default auth
