import { Hono } from 'hono'
import { z } from 'zod'
import {
  INCENTIVE_STATUS_LABELS,
  QUESTION_TYPE_LABELS,
  type IncentiveTrigger,
  type QuestionType,
} from '@english-study/shared'
import type { AppEnv } from '../types'
import { requireAuth, requireRole } from '../lib/auth'
import { parseBody, queryInt } from '../lib/http'
import { getCalendar, WORD_COLUMNS, MASTERY_COLUMNS, mapJoinedWord, type JoinedWordRow } from '../lib/queries'
import { dateKeyInCN, nowIso, safeJson, startOfCNWeek, uuid } from '../lib/utils'

const parent = new Hono<AppEnv>()
parent.use('*', requireAuth, requireRole('parent'))

interface ChildRow {
  member_id: string
  family_id: string
  student_user_id: string
  relation: string
  status: 'pending' | 'active' | 'rejected'
  nickname: string
  phone: string
}

async function getFamilyId(env: AppEnv['Bindings'], parentId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT id FROM family WHERE parent_user_id = ? ORDER BY created_at LIMIT 1',
  ).bind(parentId).first<{ id: string }>()
  return row?.id || null
}

async function ensureFamily(env: AppEnv['Bindings'], parentId: string): Promise<string> {
  const existing = await getFamilyId(env, parentId)
  if (existing) return existing
  const id = uuid('f')
  await env.DB.prepare('INSERT INTO family (id, parent_user_id) VALUES (?, ?)').bind(id, parentId).run()
  return id
}

async function getChildren(env: AppEnv['Bindings'], parentId: string): Promise<ChildRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT fm.id AS member_id, fm.family_id, fm.student_user_id, fm.relation, fm.status,
       u.nickname, u.phone
     FROM family_member fm
     JOIN family f ON f.id = fm.family_id
     JOIN user u ON u.id = fm.student_user_id
     WHERE f.parent_user_id = ? AND fm.status IN ('active', 'pending')
     ORDER BY fm.status = 'active' DESC, fm.created_at`,
  ).bind(parentId).all<ChildRow>()
  return results || []
}

async function getChild(env: AppEnv['Bindings'], parentId: string, studentId: string): Promise<ChildRow | null> {
  const children = await getChildren(env, parentId)
  return children.find((child) => child.student_user_id === studentId && child.status === 'active') || null
}

async function periodStats(
  env: AppEnv['Bindings'],
  studentId: string,
  range: { today?: string; since?: string },
) {
  const where = range.today
    ? `date(pr.answered_at, '+8 hours') = ?`
    : `pr.answered_at >= ?`
  const value = range.today || range.since || nowIso()
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS answered,
       COALESCE(SUM(pr.is_correct), 0) AS correct,
       COUNT(DISTINCT pr.word_id) AS words,
       COALESCE(SUM(pr.duration), 0) AS duration_ms,
       COUNT(DISTINCT date(pr.answered_at, '+8 hours')) AS active_days
     FROM practice_record pr
     JOIN practice_session ps ON ps.id = pr.session_id
     WHERE ps.user_id = ? AND ${where}`,
  ).bind(studentId, value).first<{
    answered: number
    correct: number
    words: number
    duration_ms: number
    active_days: number
  }>()
  return {
    answered: row?.answered || 0,
    correct: row?.correct || 0,
    accuracy: row?.answered ? Math.round(((row.correct || 0) / row.answered) * 100) : 0,
    minutes: Math.round(((row?.duration_ms || 0) / 60000) * 10) / 10,
    activeDays: row?.active_days || 0,
  }
}

async function newWordsSince(env: AppEnv['Bindings'], studentId: string, since: string) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM (
       SELECT pr.word_id, MIN(pr.answered_at) AS first_at
       FROM practice_record pr
       JOIN practice_session ps ON ps.id = pr.session_id
       WHERE ps.user_id = ?
       GROUP BY pr.word_id
       HAVING first_at >= ?
     )`,
  ).bind(studentId, since).first<{ total: number }>()
  return row?.total || 0
}

parent.get('/units', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.unit_no, u.unit_name, t.name AS textbook_name, t.grade
     FROM unit u JOIN textbook t ON t.id = u.textbook_id
     WHERE t.status = 'published'
     ORDER BY t.grade, t.semester, u.sort_order, u.unit_no`,
  ).all<{
    id: string
    unit_no: number
    unit_name: string
    textbook_name: string
    grade: string
  }>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      unitNo: row.unit_no,
      unitName: row.unit_name,
      textbookName: row.textbook_name,
      grade: row.grade,
    })),
  })
})

parent.get('/children', async (c) => {
  const user = c.get('user')
  const today = dateKeyInCN()
  const weekStart = startOfCNWeek().toISOString()
  const children = await getChildren(c.env, user.id)
  const data = []

  for (const child of children) {
    const todayStats = child.status === 'active'
      ? await periodStats(c.env, child.student_user_id, { today })
      : { answered: 0, correct: 0, accuracy: 0, minutes: 0, activeDays: 0 }
    const weekStats = child.status === 'active'
      ? await periodStats(c.env, child.student_user_id, { since: weekStart })
      : { answered: 0, correct: 0, accuracy: 0, minutes: 0, activeDays: 0 }
    const newWords = child.status === 'active'
      ? await newWordsSince(c.env, child.student_user_id, weekStart)
      : 0
    const pending = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM incentive_event
       WHERE family_id = ? AND student_user_id = ? AND status = 'pending_confirm'`,
    ).bind(child.family_id, child.student_user_id).first<{ total: number }>()
    const weak = await c.env.DB.prepare(
      'SELECT COUNT(*) AS total FROM word_mastery WHERE user_id = ? AND is_weak = 1',
    ).bind(child.student_user_id).first<{ total: number }>()

    data.push({
      id: child.student_user_id,
      nickname: child.nickname,
      phone: child.phone,
      relation: child.relation,
      status: child.status,
      today: {
        answered: todayStats.answered,
        accuracy: todayStats.accuracy,
        minutes: todayStats.minutes,
      },
      week: {
        answered: weekStats.answered,
        newWords,
        accuracy: weekStats.accuracy,
        activeDays: weekStats.activeDays,
      },
      pendingRewards: pending?.total || 0,
      weakWords: weak?.total || 0,
    })
  }

  return c.json({ data })
})

parent.post('/bind', async (c) => {
  const user = c.get('user')
  const body = await parseBody(c, z.object({
    phone: z.string().trim().regex(/^1\d{10}$/, '请输入正确的学生手机号'),
    relation: z.string().trim().min(1).max(20).default('孩子'),
  }))
  const student = await c.env.DB.prepare(
    `SELECT id, nickname, phone FROM user WHERE phone = ? AND role = 'student' AND enabled = 1`,
  ).bind(body.phone).first<{ id: string; nickname: string; phone: string }>()
  if (!student) return c.json({ error: '未找到该手机号对应的学生账号' }, 404)
  if (student.id === user.id) return c.json({ error: '不能绑定自己' }, 400)

  const familyId = await ensureFamily(c.env, user.id)
  const existing = await c.env.DB.prepare(
    'SELECT id, status FROM family_member WHERE family_id = ? AND student_user_id = ?',
  ).bind(familyId, student.id).first<{ id: string; status: string }>()
  if (existing?.status === 'active') return c.json({ error: '该学生已绑定' }, 409)
  if (existing?.status === 'pending') return c.json({ error: '已发送绑定邀请，等待学生确认' }, 409)

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE family_member SET status = 'pending', enabled = 0, relation = ? WHERE id = ?`,
    ).bind(body.relation, existing.id).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO family_member (id, family_id, student_user_id, relation, status, enabled)
       VALUES (?, ?, ?, ?, 'pending', 0)`,
    ).bind(uuid('fm'), familyId, student.id, body.relation).run()
  }

  return c.json({
    ok: true,
    pending: true,
    student: { id: student.id, nickname: student.nickname },
  })
})

parent.get('/children/:id/report', async (c) => {
  const user = c.get('user')
  const child = await getChild(c.env, user.id, c.req.param('id'))
  if (!child) return c.json({ error: '未找到已绑定的孩子' }, 404)
  const days = queryInt(c.req.query('days'), 7, 7, 30)
  const today = dateKeyInCN()
  const weekStart = startOfCNWeek().toISOString()

  const todayStats = await periodStats(c.env, child.student_user_id, { today })
  const weekBase = await periodStats(c.env, child.student_user_id, { since: weekStart })
  const newWords = await newWordsSince(c.env, child.student_user_id, weekStart)

  const { results: units } = await c.env.DB.prepare(
    `SELECT u.id, u.unit_name, t.name AS textbook_name,
       COUNT(DISTINCT uw.word_id) AS word_count,
       COUNT(DISTINCT CASE WHEN wm.id IS NOT NULL THEN uw.word_id END) AS learned_words,
       COUNT(DISTINCT CASE WHEN wm.strength >= 3 THEN uw.word_id END) AS mastered_words
     FROM unit u
     JOIN textbook t ON t.id = u.textbook_id AND t.status = 'published'
     JOIN unit_word uw ON uw.unit_id = u.id AND uw.enabled = 1
     JOIN word w ON w.id = uw.word_id AND w.enabled = 1
     LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
     GROUP BY u.id
     HAVING word_count > 0
     ORDER BY t.grade, t.semester, u.sort_order
     LIMIT 40`,
  ).bind(child.student_user_id).all<{
    id: string
    unit_name: string
    textbook_name: string
    word_count: number
    learned_words: number
    mastered_words: number
  }>()

  const { results: weakRows } = await c.env.DB.prepare(
    `SELECT w.id, w.spelling, w.chinese_def, w.phonetic,
       wm.accuracy, wm.total_attempts, wm.consecutive_wrong
     FROM word_mastery wm JOIN word w ON w.id = wm.word_id
     WHERE wm.user_id = ? AND wm.is_weak = 1
     ORDER BY wm.accuracy ASC, wm.consecutive_wrong DESC
     LIMIT 12`,
  ).bind(child.student_user_id).all<{
    id: string
    spelling: string
    chinese_def: string
    phonetic: string | null
    accuracy: number
    total_attempts: number
    consecutive_wrong: number
  }>()

  const weakIds = (weakRows || []).map((row) => row.id)
  const errorTypes = new Map<string, string[]>()
  if (weakIds.length) {
    const placeholders = weakIds.map(() => '?').join(',')
    const { results: errors } = await c.env.DB.prepare(
      `SELECT pr.word_id, pr.question_type, COUNT(*) AS wrong
       FROM practice_record pr
       JOIN practice_session ps ON ps.id = pr.session_id
       WHERE ps.user_id = ? AND pr.is_correct = 0 AND pr.word_id IN (${placeholders})
       GROUP BY pr.word_id, pr.question_type
       ORDER BY wrong DESC`,
    ).bind(child.student_user_id, ...weakIds).all<{
      word_id: string
      question_type: QuestionType
      wrong: number
    }>()
    for (const row of errors || []) {
      const list = errorTypes.get(row.word_id) || []
      if (list.length < 3) list.push(QUESTION_TYPE_LABELS[row.question_type] || row.question_type)
      errorTypes.set(row.word_id, list)
    }
  }

  const { results: reviewRows } = await c.env.DB.prepare(
    `SELECT w.id, w.spelling, wm.is_weak, wm.next_review_time, wm.strength, wm.accuracy
     FROM word_mastery wm JOIN word w ON w.id = wm.word_id
     WHERE wm.user_id = ? AND (wm.is_weak = 1 OR wm.next_review_time <= ?)
     ORDER BY wm.is_weak DESC, wm.next_review_time ASC
     LIMIT 10`,
  ).bind(child.student_user_id, nowIso()).all<{
    id: string
    spelling: string
    is_weak: number
    next_review_time: string | null
    strength: number
    accuracy: number
  }>()

  const calendar = await getCalendar(c.env, child.student_user_id, days)
  const todayStart = new Date(`${today}T00:00:00+08:00`).toISOString()
  const todayNewWords = await newWordsSince(c.env, child.student_user_id, todayStart)
  const reviewedToday = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT pr.word_id) AS total
     FROM practice_record pr JOIN practice_session ps ON ps.id = pr.session_id
     WHERE ps.user_id = ? AND ps.mode = 'review' AND date(pr.answered_at, '+8 hours') = ?`,
  ).bind(child.student_user_id, today).first<{ total: number }>()
  const pending = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM incentive_event
     WHERE family_id = ? AND student_user_id = ? AND status = 'pending_confirm'`,
  ).bind(child.family_id, child.student_user_id).first<{ total: number }>()

  return c.json({
    child: { id: child.student_user_id, nickname: child.nickname, phone: child.phone },
    today: {
      answered: todayStats.answered,
      correct: todayStats.correct,
      accuracy: todayStats.accuracy,
      minutes: todayStats.minutes,
      newWords: todayNewWords,
      reviewedWords: reviewedToday?.total || 0,
    },
    week: {
      answered: weekBase.answered,
      correct: weekBase.correct,
      accuracy: weekBase.accuracy,
      minutes: weekBase.minutes,
      newWords,
      activeDays: weekBase.activeDays,
    },
    units: (units || []).map((row) => ({
      id: row.id,
      unitName: row.unit_name,
      textbookName: row.textbook_name,
      wordCount: row.word_count,
      learnedWords: row.learned_words,
      masteredWords: row.mastered_words,
      progress: row.word_count ? Math.round((row.learned_words / row.word_count) * 100) : 0,
    })),
    weakWords: (weakRows || []).map((row) => ({
      id: row.id,
      spelling: row.spelling,
      chineseDef: row.chinese_def,
      phonetic: row.phonetic,
      accuracy: row.accuracy,
      totalAttempts: row.total_attempts,
      consecutiveWrong: row.consecutive_wrong,
      errorTypes: errorTypes.get(row.id) || [],
    })),
    reviewExplanations: (reviewRows || []).map((row) => {
      const weak = Boolean(row.is_weak)
      const due = Boolean(row.next_review_time && row.next_review_time <= nowIso())
      const parts: string[] = []
      if (weak) {
        parts.push(`近 7 次正确率 ${Math.round((row.accuracy || 0) * 100)}%`)
      }
      if (due) parts.push(`间隔复习到期（记忆强度 ${row.strength} 级）`)
      return {
        wordId: row.id,
        spelling: row.spelling,
        reason: parts.join('，') || '进入今日复习队列',
        nextReviewTime: row.next_review_time,
      }
    }),
    trend: calendar.map((day) => ({
      date: day.date,
      label: day.date.slice(5).replace('-', '/'),
      answered: day.answered,
      correct: day.correct,
      accuracy: day.answered ? Math.round((day.correct / day.answered) * 100) : 0,
      minutes: day.minutes,
    })),
    pendingRewards: pending?.total || 0,
  })
})

const incentiveSchema = z.object({
  triggerType: z.enum(['unit_complete', 'streak_days', 'daily_accuracy', 'weekly_wrong_lt', 'review_count']),
  triggerParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  rewardDescription: z.string().trim().min(1, '请填写奖励说明').max(200),
  enabled: z.boolean().default(true),
})

parent.get('/incentives', async (c) => {
  const user = c.get('user')
  const familyId = await getFamilyId(c.env, user.id)
  if (!familyId) return c.json({ familyId: null, data: [] })
  const { results } = await c.env.DB.prepare(
    `SELECT r.*,
       (SELECT COUNT(*) FROM incentive_event e WHERE e.rule_id = r.id) AS event_count
     FROM incentive_rule r WHERE r.family_id = ?
     ORDER BY r.created_at DESC`,
  ).bind(familyId).all<{
    id: string
    family_id: string
    trigger_type: IncentiveTrigger
    trigger_params: string
    reward_description: string
    enabled: number
    created_at: string
    event_count: number
  }>()
  return c.json({
    familyId,
    data: (results || []).map((row) => ({
      id: row.id,
      familyId: row.family_id,
      triggerType: row.trigger_type,
      triggerParams: safeJson(row.trigger_params, {}),
      rewardDescription: row.reward_description,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      eventCount: row.event_count,
    })),
  })
})

parent.post('/incentives', async (c) => {
  const user = c.get('user')
  const body = await parseBody(c, incentiveSchema)
  const familyId = await ensureFamily(c.env, user.id)
  const id = uuid('rule')
  await c.env.DB.prepare(
    `INSERT INTO incentive_rule
      (id, family_id, trigger_type, trigger_params, reward_description, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    familyId,
    body.triggerType,
    JSON.stringify(body.triggerParams),
    body.rewardDescription,
    body.enabled ? 1 : 0,
  ).run()
  return c.json({ id }, 201)
})

parent.patch('/incentives/:id', async (c) => {
  const user = c.get('user')
  const familyId = await getFamilyId(c.env, user.id)
  if (!familyId) return c.json({ error: '家庭不存在' }, 404)
  const body = await parseBody(c, incentiveSchema.partial())
  const existing = await c.env.DB.prepare(
    'SELECT id FROM incentive_rule WHERE id = ? AND family_id = ?',
  ).bind(c.req.param('id'), familyId).first<{ id: string }>()
  if (!existing) return c.json({ error: '规则不存在' }, 404)

  const updates: string[] = []
  const values: unknown[] = []
  if (body.triggerType !== undefined) {
    updates.push('trigger_type = ?')
    values.push(body.triggerType)
  }
  if (body.triggerParams !== undefined) {
    updates.push('trigger_params = ?')
    values.push(JSON.stringify(body.triggerParams))
  }
  if (body.rewardDescription !== undefined) {
    updates.push('reward_description = ?')
    values.push(body.rewardDescription)
  }
  if (body.enabled !== undefined) {
    updates.push('enabled = ?')
    values.push(body.enabled ? 1 : 0)
  }
  if (!updates.length) return c.json({ ok: true })
  values.push(existing.id)
  await c.env.DB.prepare(
    `UPDATE incentive_rule SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...values).run()
  return c.json({ ok: true })
})

parent.delete('/incentives/:id', async (c) => {
  const user = c.get('user')
  const familyId = await getFamilyId(c.env, user.id)
  if (!familyId) return c.json({ error: '家庭不存在' }, 404)
  const rule = await c.env.DB.prepare(
    `SELECT r.id, (SELECT COUNT(*) FROM incentive_event e WHERE e.rule_id = r.id) AS events
     FROM incentive_rule r WHERE r.id = ? AND r.family_id = ?`,
  ).bind(c.req.param('id'), familyId).first<{ id: string; events: number }>()
  if (!rule) return c.json({ error: '规则不存在' }, 404)
  if (rule.events > 0) {
    await c.env.DB.prepare('UPDATE incentive_rule SET enabled = 0 WHERE id = ?').bind(rule.id).run()
    return c.json({ ok: true, disabled: true })
  }
  await c.env.DB.prepare('DELETE FROM incentive_rule WHERE id = ?').bind(rule.id).run()
  return c.json({ ok: true })
})

parent.get('/ledger', async (c) => {
  const user = c.get('user')
  const familyId = await getFamilyId(c.env, user.id)
  if (!familyId) return c.json({ data: [] })
  const status = c.req.query('status')
  const validStatuses = ['pending_confirm', 'pending_redeem', 'redeemed', 'revoked']
  const filter = status && validStatuses.includes(status) ? 'AND e.status = ?' : ''
  const statement = c.env.DB.prepare(
    `SELECT e.*, u.nickname AS student_name
     FROM incentive_event e
     JOIN user u ON u.id = e.student_user_id
     WHERE e.family_id = ? ${filter}
     ORDER BY e.triggered_at DESC
     LIMIT 200`,
  )
  const { results } = await (filter
    ? statement.bind(familyId, status)
    : statement.bind(familyId)).all<Record<string, unknown>>()

  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      familyId: row.family_id,
      studentUserId: row.student_user_id,
      studentName: row.student_name,
      ruleId: row.rule_id,
      triggerType: row.trigger_type,
      triggerParams: safeJson(row.trigger_params as string, {}),
      rewardDescription: row.reward_description,
      triggeredAt: row.triggered_at,
      status: row.status,
      statusLabel: INCENTIVE_STATUS_LABELS[row.status as keyof typeof INCENTIVE_STATUS_LABELS],
      confirmedAt: row.confirmed_at,
      redeemedAt: row.redeemed_at,
      note: row.note,
    })),
  })
})

parent.patch('/ledger/:id', async (c) => {
  const user = c.get('user')
  const familyId = await getFamilyId(c.env, user.id)
  if (!familyId) return c.json({ error: '家庭不存在' }, 404)
  const body = await parseBody(c, z.object({
    action: z.enum(['confirm', 'revoke', 'redeem', 'note']),
    note: z.string().max(300).optional(),
  }))
  const event = await c.env.DB.prepare(
    'SELECT * FROM incentive_event WHERE id = ? AND family_id = ?',
  ).bind(c.req.param('id'), familyId).first<{
    id: string
    status: string
    note: string | null
  }>()
  if (!event) return c.json({ error: '记录不存在' }, 404)

  if (body.action === 'confirm') {
    if (event.status !== 'pending_confirm') return c.json({ error: '当前状态不能确认' }, 409)
    await c.env.DB.prepare(
      `UPDATE incentive_event SET status = 'pending_redeem', confirmed_at = ?, note = COALESCE(?, note)
       WHERE id = ?`,
    ).bind(nowIso(), body.note || null, event.id).run()
  } else if (body.action === 'revoke') {
    if (!['pending_confirm', 'pending_redeem'].includes(event.status)) {
      return c.json({ error: '当前状态不能撤销' }, 409)
    }
    await c.env.DB.prepare(
      `UPDATE incentive_event SET status = 'revoked', note = COALESCE(?, note) WHERE id = ?`,
    ).bind(body.note || null, event.id).run()
  } else if (body.action === 'redeem') {
    if (event.status !== 'pending_redeem') return c.json({ error: '当前状态不能标记兑换' }, 409)
    await c.env.DB.prepare(
      `UPDATE incentive_event SET status = 'redeemed', redeemed_at = ?, note = COALESCE(?, note)
       WHERE id = ?`,
    ).bind(nowIso(), body.note || null, event.id).run()
  } else if (body.note !== undefined) {
    await c.env.DB.prepare('UPDATE incentive_event SET note = ? WHERE id = ?')
      .bind(body.note, event.id).run()
  }
  return c.json({ ok: true })
})

parent.get('/children/:id/words', async (c) => {
  const user = c.get('user')
  const child = await getChild(c.env, user.id, c.req.param('id'))
  if (!child) return c.json({ error: '未找到已绑定的孩子' }, 404)
  let textbookId = c.req.query('textbookId')
  if (!textbookId) {
    const first = await c.env.DB.prepare(
      `SELECT id FROM textbook WHERE status = 'published' ORDER BY name LIMIT 1`,
    ).first<{ id: string }>()
    textbookId = first?.id
  }
  if (!textbookId) return c.json({ textbooks: [], words: [] })

  const { results: textbooks } = await c.env.DB.prepare(
    `SELECT id, name, version, grade, semester FROM textbook
     WHERE status = 'published' ORDER BY grade, semester, name`,
  ).all<{ id: string; name: string; version: string; grade: string; semester: string }>()

  const { results } = await c.env.DB.prepare(
    `SELECT ${WORD_COLUMNS}, ${MASTERY_COLUMNS},
       CASE WHEN pwf.id IS NULL THEN 0 ELSE 1 END AS focused
     FROM unit u
     JOIN unit_word uw ON uw.unit_id = u.id AND uw.enabled = 1
     JOIN word w ON w.id = uw.word_id AND w.enabled = 1
     LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
     LEFT JOIN parent_word_focus pwf
       ON pwf.word_id = w.id AND pwf.parent_user_id = ? AND pwf.student_user_id = ?
     WHERE u.textbook_id = ?
     GROUP BY w.id
     ORDER BY u.sort_order, uw.sort_order`,
  ).bind(child.student_user_id, user.id, child.student_user_id, textbookId)
    .all<JoinedWordRow & { focused: number }>()

  return c.json({
    textbooks,
    textbookId,
    words: (results || []).map((row) => ({
      ...mapJoinedWord(row),
      focused: Boolean(row.focused),
    })),
  })
})

parent.post('/children/:id/words/:wordId/focus', async (c) => {
  const user = c.get('user')
  const child = await getChild(c.env, user.id, c.req.param('id'))
  if (!child) return c.json({ error: '未找到已绑定的孩子' }, 404)
  const body = await parseBody(c, z.object({
    focused: z.boolean(),
    note: z.string().max(200).optional(),
  }))
  const wordId = c.req.param('wordId')
  if (body.focused) {
    await c.env.DB.prepare(
      `INSERT INTO parent_word_focus (id, parent_user_id, student_user_id, word_id, note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(parent_user_id, student_user_id, word_id)
       DO UPDATE SET note = excluded.note`,
    ).bind(uuid('pwf'), user.id, child.student_user_id, wordId, body.note || null).run()
  } else {
    await c.env.DB.prepare(
      `DELETE FROM parent_word_focus
       WHERE parent_user_id = ? AND student_user_id = ? AND word_id = ?`,
    ).bind(user.id, child.student_user_id, wordId).run()
  }
  return c.json({ ok: true })
})

export default parent
