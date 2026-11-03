import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAuth, requireRole } from '../lib/auth'
import { nowIso } from '../lib/utils'

const family = new Hono<AppEnv>()
family.use('*', requireAuth, requireRole('student'))

family.get('/invites', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT fm.id, fm.family_id, fm.relation, fm.created_at,
       u.nickname AS parent_name
     FROM family_member fm
     JOIN family f ON f.id = fm.family_id
     JOIN user u ON u.id = f.parent_user_id
     WHERE fm.student_user_id = ? AND fm.status = 'pending'
     ORDER BY fm.created_at DESC`,
  ).bind(user.id).all<{
    id: string
    family_id: string
    relation: string
    created_at: string
    parent_name: string
  }>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      familyId: row.family_id,
      parentName: row.parent_name,
      relation: row.relation,
      createdAt: row.created_at,
    })),
  })
})

family.post('/invites/:id/accept', async (c) => {
  const user = c.get('user')
  const invite = await c.env.DB.prepare(
    `SELECT fm.id, fm.family_id, f.parent_user_id
     FROM family_member fm JOIN family f ON f.id = fm.family_id
     WHERE fm.id = ? AND fm.student_user_id = ? AND fm.status = 'pending'`,
  ).bind(c.req.param('id'), user.id).first<{
    id: string
    family_id: string
    parent_user_id: string
  }>()
  if (!invite) return c.json({ error: '邀请不存在或已处理' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE family_member SET status = 'active', enabled = 1 WHERE id = ?`,
    ).bind(invite.id),
    c.env.DB.prepare(
      `UPDATE user SET parent_id = ?, updated_at = ? WHERE id = ?`,
    ).bind(invite.parent_user_id, nowIso(), user.id),
  ])
  return c.json({ ok: true })
})

family.post('/invites/:id/reject', async (c) => {
  const user = c.get('user')
  const result = await c.env.DB.prepare(
    `UPDATE family_member SET status = 'rejected', enabled = 0
     WHERE id = ? AND student_user_id = ? AND status = 'pending'`,
  ).bind(c.req.param('id'), user.id).run()
  if (!result.meta.changes) return c.json({ error: '邀请不存在或已处理' }, 404)
  return c.json({ ok: true })
})

export default family
