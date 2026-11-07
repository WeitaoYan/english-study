import { Hono } from 'hono'
import { z } from 'zod'
import type { QuestionType } from '@english-study/shared'
import type { AppEnv } from '../types'
import { hashPassword, requireAuth, requireRole } from '../lib/auth'
import { parseBody, queryInt } from '../lib/http'
import { mapWord } from '../lib/mappers'
import { parseCsv, parseListCell } from '../lib/csv'
import { safeJson, uuid, nowIso } from '../lib/utils'
import { enrichWordWithAI } from '../lib/ai'
import type { WordRow } from '../types'

const admin = new Hono<AppEnv>()
admin.use('*', requireAuth, requireRole('admin'))

const ADMIN_WORD_COLUMNS = `
  w.*,
  (SELECT uw2.unit_id FROM unit_word uw2
    WHERE uw2.word_id = w.id AND uw2.enabled = 1
    ORDER BY uw2.sort_order LIMIT 1) AS unit_id,
  (SELECT wi.image_url FROM word_image wi
    WHERE wi.word_id = w.id ORDER BY wi.created_at DESC LIMIT 1) AS image_url,
  (SELECT wi.status FROM word_image wi
    WHERE wi.word_id = w.id ORDER BY wi.created_at DESC LIMIT 1) AS image_status,
  (SELECT wa.audio_url FROM word_audio wa
    WHERE wa.word_id = w.id ORDER BY wa.created_at DESC LIMIT 1) AS audio_url,
  (SELECT GROUP_CONCAT(u.unit_name, '｜') FROM unit_word uw
    JOIN unit u ON u.id = uw.unit_id WHERE uw.word_id = w.id) AS unit_names
`

interface AdminWordRow extends WordRow {
  unit_names: string | null
}

function mapAdminWord(row: AdminWordRow) {
  return {
    ...mapWord(row),
    units: row.unit_names ? row.unit_names.split('｜') : [],
  }
}

admin.get('/stats', async (c) => {
  const users = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
       SUM(CASE WHEN role = 'parent' THEN 1 ELSE 0 END) AS parents,
       SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins
     FROM user`,
  ).first<{ students: number; parents: number; admins: number }>()

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 86400000).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
  const active = await c.env.DB.prepare(
    `SELECT
       COUNT(DISTINCT CASE WHEN ps.start_time >= ? THEN ps.user_id END) AS dau,
       COUNT(DISTINCT CASE WHEN ps.start_time >= ? THEN ps.user_id END) AS wau,
       COUNT(DISTINCT CASE WHEN ps.start_time >= ? THEN ps.user_id END) AS mau
     FROM practice_session ps`,
  ).bind(dayAgo, weekAgo, monthAgo).first<{ dau: number; wau: number; mau: number }>()

  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  // 当日统计不用 date(列, '+8 hours')：函数包住列会让索引失效、每次全表扫；
  // 改成 UTC 区间比较后 idx_record_time / idx_session_user 能直接走范围查找。
  // 中国日 00:00 = UTC 前一日 16:00，区间左闭右开，与 date() 语义等价。
  const dayStartUtc = new Date(`${today}T00:00:00+08:00`).toISOString()
  const dayEndUtc = new Date(new Date(`${today}T00:00:00+08:00`).getTime() + 86400000).toISOString()
  const practice = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM practice_session ps WHERE ps.start_time >= ? AND ps.start_time < ?) AS today_sessions,
       (SELECT COUNT(*) FROM practice_record pr WHERE pr.answered_at >= ? AND pr.answered_at < ?) AS today_answers,
       (SELECT COUNT(*) FROM practice_record pr WHERE pr.answered_at >= ?) AS week_answers,
       (SELECT COUNT(*) FROM practice_record pr JOIN practice_session ps ON ps.id = pr.session_id
         WHERE ps.mode = 'review' AND pr.answered_at >= ? AND pr.answered_at < ?) AS review_answers`,
  ).bind(dayStartUtc, dayEndUtc, dayStartUtc, dayEndUtc, weekAgo, dayStartUtc, dayEndUtc).first<{
    today_sessions: number
    today_answers: number
    week_answers: number
    review_answers: number
  }>()

  const coverage = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM word) AS total_words,
       (SELECT COUNT(*) FROM word WHERE has_image = 1) AS with_image,
       (SELECT COUNT(*) FROM word_image WHERE status = 'approved') AS approved_images,
       (SELECT COUNT(*) FROM word_image WHERE status = 'pending') AS pending_images,
       (SELECT COUNT(*) FROM family) AS families,
       (SELECT COUNT(*) FROM family WHERE id IN (SELECT DISTINCT family_id FROM incentive_rule)) AS families_with_rules,
       (SELECT COUNT(*) FROM incentive_rule) AS rules,
       (SELECT COUNT(*) FROM incentive_event WHERE status = 'pending_confirm') AS pending_events`,
  ).first<{
    total_words: number
    with_image: number
    approved_images: number
    pending_images: number
    families: number
    families_with_rules: number
    rules: number
    pending_events: number
  }>()

  const { results: recent } = await c.env.DB.prepare(
    `SELECT e.*, u.nickname AS student_name
     FROM incentive_event e JOIN user u ON u.id = e.student_user_id
     ORDER BY e.triggered_at DESC LIMIT 6`,
  ).all<Record<string, unknown>>()

  return c.json({
    users: {
      students: users?.students || 0,
      parents: users?.parents || 0,
      admins: users?.admins || 0,
    },
    active: {
      dau: active?.dau || 0,
      wau: active?.wau || 0,
      mau: active?.mau || 0,
    },
    practice: {
      todaySessions: practice?.today_sessions || 0,
      todayAnswers: practice?.today_answers || 0,
      weekAnswers: practice?.week_answers || 0,
      reviewAnswers: practice?.review_answers || 0,
    },
    coverage: {
      totalWords: coverage?.total_words || 0,
      withImage: coverage?.with_image || 0,
      approvedImages: coverage?.approved_images || 0,
      pendingImages: coverage?.pending_images || 0,
      imageRate: coverage?.total_words
        ? Math.round(((coverage.with_image || 0) / coverage.total_words) * 100)
        : 0,
    },
    incentives: {
      rules: coverage?.rules || 0,
      familiesWithRules: coverage?.families_with_rules || 0,
      usageRate: coverage?.families
        ? Math.round(((coverage.families_with_rules || 0) / coverage.families) * 100)
        : 0,
      pendingEvents: coverage?.pending_events || 0,
    },
    recentEvents: (recent || []).map((row) => ({
      id: row.id,
      studentName: row.student_name,
      triggerType: row.trigger_type,
      rewardDescription: row.reward_description,
      triggeredAt: row.triggered_at,
      status: row.status,
    })),
  })
})

const textbookSchema = z.object({
  name: z.string().trim().min(1, '请填写课本名称').max(100),
  version: z.string().trim().min(1, '请填写教材版本').max(50),
  grade: z.string().trim().min(1, '请选择年级').max(20),
  semester: z.string().trim().min(1, '请选择学期').max(20),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  coverColor: z.enum(['forest', 'ocean', 'clay', 'plum', 'sand']).default('forest'),
})

admin.get('/textbooks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM unit u WHERE u.textbook_id = t.id) AS unit_count,
       (SELECT COUNT(DISTINCT uw.word_id) FROM unit u
         JOIN unit_word uw ON uw.unit_id = u.id WHERE u.textbook_id = t.id) AS word_count
     FROM textbook t ORDER BY t.grade, t.semester, t.name`,
  ).all<Record<string, unknown>>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      grade: row.grade,
      semester: row.semester,
      status: row.status,
      coverColor: row.cover_color,
      unitCount: row.unit_count,
      wordCount: row.word_count,
      createdAt: row.created_at,
    })),
  })
})

admin.post('/textbooks', async (c) => {
  const body = await parseBody(c, textbookSchema)
  const id = uuid('tb')
  await c.env.DB.prepare(
    `INSERT INTO textbook (id, name, version, grade, semester, status, cover_color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.name, body.version, body.grade, body.semester, body.status, body.coverColor).run()
  return c.json({ id }, 201)
})

admin.patch('/textbooks/:id', async (c) => {
  const body = await parseBody(c, textbookSchema.partial())
  const updates: string[] = []
  const values: unknown[] = []
  const map: Record<string, string> = {
    name: 'name', version: 'version', grade: 'grade', semester: 'semester',
    status: 'status', coverColor: 'cover_color',
  }
  for (const [key, column] of Object.entries(map)) {
    const value = (body as Record<string, unknown>)[key]
    if (value !== undefined) {
      updates.push(`${column} = ?`)
      values.push(value)
    }
  }
  if (!updates.length) return c.json({ ok: true })
  updates.push('updated_at = ?')
  values.push(nowIso(), c.req.param('id'))
  await c.env.DB.prepare(`UPDATE textbook SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ ok: true })
})

admin.delete('/textbooks/:id', async (c) => {
  const usage = await c.env.DB.prepare(
    'SELECT COUNT(*) AS total FROM practice_session WHERE textbook_id = ?',
  ).bind(c.req.param('id')).first<{ total: number }>()
  if (usage?.total) {
    await c.env.DB.prepare(
      `UPDATE textbook SET status = 'archived', updated_at = ? WHERE id = ?`,
    ).bind(nowIso(), c.req.param('id')).run()
    return c.json({ ok: true, archived: true })
  }
  await c.env.DB.prepare('DELETE FROM textbook WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

admin.get('/textbooks/:id/units', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.*,
       (SELECT COUNT(*) FROM unit_word uw WHERE uw.unit_id = u.id AND uw.enabled = 1) AS word_count
     FROM unit u WHERE u.textbook_id = ?
     ORDER BY u.sort_order, u.unit_no`,
  ).bind(c.req.param('id')).all<Record<string, unknown>>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      textbookId: row.textbook_id,
      unitNo: row.unit_no,
      unitName: row.unit_name,
      sortOrder: row.sort_order,
      wordCount: row.word_count,
    })),
  })
})

const unitSchema = z.object({
  textbookId: z.string().min(1),
  unitNo: z.number().int().min(1).max(999),
  unitName: z.string().trim().min(1, '请填写单元名称').max(100),
  sortOrder: z.number().int().min(0).default(0),
})

admin.post('/units', async (c) => {
  const body = await parseBody(c, unitSchema)
  const id = uuid('un')
  await c.env.DB.prepare(
    `INSERT INTO unit (id, textbook_id, unit_no, unit_name, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, body.textbookId, body.unitNo, body.unitName, body.sortOrder).run()
  return c.json({ id }, 201)
})

admin.patch('/units/:id', async (c) => {
  const body = await parseBody(c, unitSchema.partial())
  const updates: string[] = []
  const values: unknown[] = []
  for (const [key, column] of Object.entries({
    textbookId: 'textbook_id', unitNo: 'unit_no', unitName: 'unit_name', sortOrder: 'sort_order',
  })) {
    const value = (body as Record<string, unknown>)[key]
    if (value !== undefined) {
      updates.push(`${column} = ?`)
      values.push(value)
    }
  }
  if (!updates.length) return c.json({ ok: true })
  values.push(c.req.param('id'))
  await c.env.DB.prepare(`UPDATE unit SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ ok: true })
})

admin.delete('/units/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM unit WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

admin.get('/units', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.textbook_id, u.unit_no, u.unit_name, u.sort_order,
       t.name AS textbook_name, t.grade, t.semester
     FROM unit u JOIN textbook t ON t.id = u.textbook_id
     ORDER BY t.grade, t.semester, u.sort_order, u.unit_no`,
  ).all<{
    id: string
    textbook_id: string
    unit_no: number
    unit_name: string
    sort_order: number
    textbook_name: string
    grade: string
    semester: string
  }>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      textbookId: row.textbook_id,
      unitNo: row.unit_no,
      unitName: row.unit_name,
      sortOrder: row.sort_order,
      textbookName: row.textbook_name,
      grade: row.grade,
      semester: row.semester,
    })),
  })
})

admin.get('/units/:id/words', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${ADMIN_WORD_COLUMNS}, uw.sort_order AS unit_sort
     FROM unit_word uw JOIN word w ON w.id = uw.word_id
     WHERE uw.unit_id = ? ORDER BY uw.sort_order, w.spelling`,
  ).bind(c.req.param('id')).all<AdminWordRow & { unit_sort: number }>()
  return c.json({
    data: (results || []).map((row) => ({ ...mapAdminWord(row), sortOrder: row.unit_sort })),
  })
})

// 单词拼写只支持英文字母、空格、连字符与撇号；匹配时不区分大小写，
// 但新词按用户输入的大小写原样入库（I、Ms、April 这类词首字母大写是有意义的，
// 库里本来就是这么存的；全小写会把 Christmas 这类专有名词写错）。
const SPELLING_PATTERN = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/

type ResolveWordResult =
  | { ok: true; wordId: string; created: boolean; spelling: string }
  | { ok: false; status: 400 | 502 | 503; message: string }

// 按拼写找词：库中有则直接用（大小写不敏感匹配，保留库里原有拼写）；
// 库中没有则调 AI 建词（按输入大小写原样入库）后再用。
async function resolveWordForUnit(
  env: AppEnv['Bindings'],
  input: string,
): Promise<ResolveWordResult> {
  const spelling = input.trim()
  if (!spelling || !SPELLING_PATTERN.test(spelling)) {
    return { ok: false, status: 400, message: '拼写只支持英文字母、空格、连字符与撇号' }
  }
  // 先精确匹配（走 idx_word_spelling 索引，1 行）；大小写不一致时再回落到
  // LOWER() 全表扫——直接 LOWER() 查每次都要扫整个单词表（1667 行）。
  let found = await env.DB.prepare(
    'SELECT id, spelling, enabled FROM word WHERE spelling = ?',
  ).bind(spelling).first<{ id: string; spelling: string; enabled: number }>()
  if (!found) {
    found = await env.DB.prepare(
      'SELECT id, spelling, enabled FROM word WHERE LOWER(spelling) = LOWER(?)',
    ).bind(spelling).first<{ id: string; spelling: string; enabled: number }>()
  }
  if (found) {
    if (!found.enabled) return { ok: false, status: 400, message: '该单词已在库中但已停用，请先在单词库启用' }
    return { ok: true, wordId: found.id, created: false, spelling: found.spelling }
  }
  if (!env.AI) return { ok: false, status: 503, message: 'AI 自动补充未启用，请先在 wrangler.jsonc 配置 AI 绑定' }
  try {
    const enrichment = await enrichWordWithAI(env, spelling)
    const wordId = uuid('w')
    // 与 POST /admin/words 的建词字段一致。
    await env.DB.prepare(
      `INSERT INTO word (id, spelling, phonetic, pos, chinese_def, english_def, difficulty,
        has_image, enabled, examples, collocations)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    ).bind(
      wordId,
      spelling,
      enrichment.phonetic,
      enrichment.pos,
      enrichment.chineseDef,
      enrichment.englishDef,
      enrichment.difficulty,
      JSON.stringify(enrichment.examples),
      JSON.stringify(enrichment.collocations),
    ).run()
    return { ok: true, wordId, created: true, spelling }
  } catch (error) {
    return { ok: false, status: 502, message: error instanceof Error ? error.message : 'AI 补充失败，请稍后重试' }
  }
}

admin.post('/units/:id/words', async (c) => {
  const body = await parseBody(c, z.object({
    wordId: z.string().min(1).optional(),
    // 传 spelling 时：先按拼写（不区分大小写）查库，有则直接挂入；
    // 库中没有则调用 AI 加词（与 POST /admin/words 的 autoFill 同款补充）建词后再挂入。
    spelling: z.string().trim().min(1).max(80).optional(),
    sortOrder: z.number().int().min(0).optional(),
  }))
  let wordId = body.wordId
  let created = false
  if (!wordId) {
    if (!body.spelling?.trim()) return c.json({ error: '请指定单词' }, 400)
    const resolved = await resolveWordForUnit(c.env, body.spelling)
    if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status)
    wordId = resolved.wordId
    created = resolved.created
  }
  const max = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM unit_word WHERE unit_id = ?',
  ).bind(c.req.param('id')).first<{ max: number }>()
  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO unit_word (id, unit_id, word_id, sort_order, enabled)
     VALUES (?, ?, ?, ?, 1)`,
  ).bind(uuid('uw'), c.req.param('id'), wordId, body.sortOrder ?? (max?.max || 0) + 1).run()
  if (!result.meta.changes) return c.json({ error: '该单词已在单元中' }, 409)
  return c.json({ ok: true, wordId, created, aiFilled: created }, 201)
})

// 批量加词：每行一个单词。逐行处理、逐词返回结果，失败的行不影响其他行；
// 已在单元的词、批次内重复的词都只报告不报错，重新粘贴剩余部分可断点续加。
admin.post('/units/:id/words/batch', async (c) => {
  const body = await parseBody(c, z.object({
    spellings: z.array(z.string()).min(1).max(100),
  }))
  const max = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS max FROM unit_word WHERE unit_id = ?',
  ).bind(c.req.param('id')).first<{ max: number }>()
  let nextOrder = (max?.max || 0) + 1
  const seen = new Set<string>()
  type BatchWordResult = {
    spelling: string
    status: 'added' | 'ai_created' | 'exists' | 'duplicate' | 'skipped' | 'failed'
    message?: string
  }
  const results: BatchWordResult[] = []
  for (const raw of body.spellings) {
    const spelling = raw.trim()
    if (!spelling) {
      results.push({ spelling: raw, status: 'skipped', message: '空行' })
      continue
    }
    const key = spelling.toLowerCase()
    if (seen.has(key)) {
      results.push({ spelling, status: 'duplicate', message: '本批次重复' })
      continue
    }
    seen.add(key)
    const resolved = await resolveWordForUnit(c.env, spelling)
    if (!resolved.ok) {
      results.push({ spelling, status: 'failed', message: resolved.message })
      continue
    }
    const result = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO unit_word (id, unit_id, word_id, sort_order, enabled)
       VALUES (?, ?, ?, ?, 1)`,
    ).bind(uuid('uw'), c.req.param('id'), resolved.wordId, nextOrder).run()
    if (!result.meta.changes) {
      results.push({ spelling: resolved.spelling, status: 'exists', message: '已在单元中' })
    } else {
      nextOrder += 1
      results.push({ spelling: resolved.spelling, status: resolved.created ? 'ai_created' : 'added' })
    }
  }
  const count = (status: BatchWordResult['status']) => results.filter((r) => r.status === status).length
  return c.json({
    ok: true,
    results,
    summary: {
      added: count('added'),
      aiCreated: count('ai_created'),
      exists: count('exists'),
      duplicate: count('duplicate'),
      skipped: count('skipped'),
      failed: count('failed'),
    },
  }, 201)
})

admin.delete('/units/:id/words/:wordId', async (c) => {
  await c.env.DB.prepare(
    'DELETE FROM unit_word WHERE unit_id = ? AND word_id = ?',
  ).bind(c.req.param('id'), c.req.param('wordId')).run()
  return c.json({ ok: true })
})

admin.get('/words', async (c) => {
  const search = c.req.query('search')?.trim()
  const hasImage = c.req.query('hasImage')
  const enabled = c.req.query('enabled')
  const page = queryInt(c.req.query('page'), 1, 1, 10000)
  const limit = queryInt(c.req.query('limit'), 20, 1, 100)
  const conditions: string[] = ['1 = 1']
  const values: unknown[] = []
  if (search) {
    conditions.push('(w.spelling LIKE ? OR w.chinese_def LIKE ?)')
    values.push(`%${search}%`, `%${search}%`)
  }
  if (hasImage === 'true' || hasImage === 'false') {
    conditions.push('w.has_image = ?')
    values.push(hasImage === 'true' ? 1 : 0)
  }
  if (enabled === 'true' || enabled === 'false') {
    conditions.push('w.enabled = ?')
    values.push(enabled === 'true' ? 1 : 0)
  }
  const where = conditions.join(' AND ')
  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM word w WHERE ${where}`,
  ).bind(...values).first<{ total: number }>()
  // 搜索时完全匹配拼写的排第一位：避免匹配太多时精确词被挤出当页。
  const orderBy = search
    ? 'CASE WHEN lower(w.spelling) = ? THEN 0 ELSE 1 END, w.updated_at DESC, w.spelling'
    : 'w.updated_at DESC, w.spelling'
  const { results } = await c.env.DB.prepare(
    `SELECT ${ADMIN_WORD_COLUMNS} FROM word w WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
  ).bind(...values, ...(search ? [search.toLowerCase()] : []), limit, (page - 1) * limit).all<AdminWordRow>()
  return c.json({
    data: (results || []).map(mapAdminWord),
    total: total?.total || 0,
    page,
    limit,
  })
})

const exampleSchema = z.object({
  en: z.string().trim().min(1).max(300),
  zh: z.string().trim().max(300).optional(),
})
const collocationSchema = z.object({
  phrase: z.string().trim().min(1).max(100),
  zh: z.string().trim().max(100).optional(),
})

const wordSchema = z.object({
  spelling: z.string().trim().min(1, '请填写单词拼写').max(80),
  phonetic: z.string().trim().max(80).nullable().optional(),
  pos: z.string().trim().max(30).nullable().optional(),
  chineseDef: z.string().trim().min(1, '请填写中文释义').max(300),
  englishDef: z.string().trim().max(500).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).default(1),
  enabled: z.boolean().default(true),
  examples: z.array(exampleSchema).max(10).default([]),
  collocations: z.array(collocationSchema).max(10).default([]),
})

/** 新增单词：允许只填拼写，其余留空字段由 Workers AI 补充。 */
const wordCreateSchema = wordSchema.extend({
  chineseDef: z.string().trim().max(300).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  autoFill: z.boolean().default(false),
})

admin.get('/words/:id', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT ${ADMIN_WORD_COLUMNS} FROM word w WHERE w.id = ?`,
  ).bind(c.req.param('id')).first<AdminWordRow>()
  if (!row) return c.json({ error: '单词不存在' }, 404)
  return c.json({ data: mapAdminWord(row) })
})

admin.post('/words', async (c) => {
  const body = await parseBody(c, wordCreateSchema)
  let { phonetic, pos, chineseDef, englishDef, difficulty, examples, collocations } = body

  if (body.autoFill) {
    if (!c.env.AI) return c.json({ error: 'AI 自动补充未启用，请先在 wrangler.jsonc 配置 AI 绑定' }, 503)
    try {
      const enrichment = await enrichWordWithAI(c.env, body.spelling)
      phonetic = phonetic || enrichment.phonetic
      pos = pos || enrichment.pos
      chineseDef = chineseDef || enrichment.chineseDef
      englishDef = englishDef || enrichment.englishDef
      difficulty = difficulty ?? enrichment.difficulty
      if (!examples.length) examples = enrichment.examples
      if (!collocations.length) collocations = enrichment.collocations
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'AI 补充失败，请稍后重试' }, 502)
    }
  }
  if (!chineseDef) return c.json({ error: '请填写中文释义，或开启 AI 自动补充' }, 400)

  const id = uuid('w')
  await c.env.DB.prepare(
    `INSERT INTO word (id, spelling, phonetic, pos, chinese_def, english_def, difficulty,
      has_image, enabled, examples, collocations)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).bind(
    id,
    body.spelling,
    phonetic || null,
    pos || null,
    chineseDef,
    englishDef || null,
    difficulty ?? 1,
    body.enabled ? 1 : 0,
    JSON.stringify(examples),
    JSON.stringify(collocations),
  ).run()
  return c.json({ id, aiFilled: body.autoFill }, 201)
})

admin.patch('/words/:id', async (c) => {
  const body = await parseBody(c, wordSchema.partial())
  const map: Record<string, string> = {
    spelling: 'spelling', phonetic: 'phonetic', pos: 'pos', chineseDef: 'chinese_def',
    englishDef: 'english_def', difficulty: 'difficulty',
    enabled: 'enabled',
  }
  const updates: string[] = []
  const values: unknown[] = []
  for (const [key, column] of Object.entries(map)) {
    const value = (body as Record<string, unknown>)[key]
    if (value !== undefined) {
      updates.push(`${column} = ?`)
      values.push(key === 'enabled' ? (value ? 1 : 0) : value)
    }
  }
  if (body.examples !== undefined) {
    updates.push('examples = ?')
    values.push(JSON.stringify(body.examples))
  }
  if (body.collocations !== undefined) {
    updates.push('collocations = ?')
    values.push(JSON.stringify(body.collocations))
  }
  if (!updates.length) return c.json({ ok: true })
  updates.push('updated_at = ?')
  values.push(nowIso(), c.req.param('id'))
  await c.env.DB.prepare(`UPDATE word SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ ok: true })
})

admin.delete('/words/:id', async (c) => {
  const usage = await c.env.DB.prepare(
    'SELECT COUNT(*) AS total FROM practice_record WHERE word_id = ?',
  ).bind(c.req.param('id')).first<{ total: number }>()
  if (usage?.total) {
    await c.env.DB.prepare(
      'UPDATE word SET enabled = 0, updated_at = ? WHERE id = ?',
    ).bind(nowIso(), c.req.param('id')).run()
    return c.json({ ok: true, disabled: true })
  }
  await c.env.DB.prepare('DELETE FROM word WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

admin.post('/words/import', async (c) => {
  const body = await parseBody(c, z.object({
    csv: z.string().optional(),
    rows: z.array(z.record(z.string(), z.string())).optional(),
    unitId: z.string().optional(),
  }))
  let rows = body.rows || []
  if (body.csv) rows = parseCsv(body.csv)
  if (!rows.length) return c.json({ error: '没有可导入的数据' }, 400)
  if (rows.length > 500) return c.json({ error: '单次最多导入 500 条' }, 400)

  let imported = 0
  let linked = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!
    const spelling = row.spelling || row['单词'] || row['拼写'] || ''
    const chineseDef = row.chinese_def || row['中文释义'] || row['释义'] || ''
    if (!spelling || !chineseDef) {
      errors.push({ row: index + 2, message: '缺少 spelling 或 chinese_def' })
      continue
    }
    const examplesCell = row.examples || row['例句'] || ''
    const collocationsCell = row.collocations || row['搭配'] || ''
    const examples = examplesCell.trim().startsWith('[')
      ? safeJson<Array<{ en: string; zh?: string }>>(examplesCell, [])
      : parseListCell(examplesCell).map((en) => ({ en }))
    const collocations = collocationsCell.trim().startsWith('[')
      ? safeJson<Array<{ phrase: string; zh?: string }>>(collocationsCell, [])
      : parseListCell(collocationsCell).map((phrase) => ({ phrase }))
    const difficulty = Math.min(5, Math.max(1, Number(row.difficulty || row['难度'] || 1) || 1))

    try {
      const id = uuid('w')
      await c.env.DB.prepare(
        `INSERT INTO word (id, spelling, phonetic, pos, chinese_def, english_def,
          difficulty, has_image, enabled, examples, collocations)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      ).bind(
        id,
        spelling,
        row.phonetic || row['音标'] || null,
        row.pos || row['词性'] || null,
        chineseDef,
        row.english_def || row['英文释义'] || null,
        difficulty,
        JSON.stringify(examples),
        JSON.stringify(collocations),
      ).run()
      imported += 1
      const unitId = row.unit_id || row.unitId || body.unitId
      if (unitId) {
        const max = await c.env.DB.prepare(
          'SELECT COALESCE(MAX(sort_order), 0) AS max FROM unit_word WHERE unit_id = ?',
        ).bind(unitId).first<{ max: number }>()
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO unit_word (id, unit_id, word_id, sort_order, enabled)
           VALUES (?, ?, ?, ?, 1)`,
        ).bind(uuid('uw'), unitId, id, (max?.max || 0) + 1).run()
        linked += 1
      }
    } catch (error) {
      errors.push({ row: index + 2, message: error instanceof Error ? error.message : '导入失败' })
    }
  }

  return c.json({ imported, linked, errors })
})

admin.get('/images', async (c) => {
  const status = c.req.query('status') || 'pending'
  const { results } = await c.env.DB.prepare(
    `SELECT wi.*, w.spelling, w.chinese_def
     FROM word_image wi JOIN word w ON w.id = wi.word_id
     WHERE wi.status = ? ORDER BY wi.created_at DESC LIMIT 200`,
  ).bind(status).all<Record<string, unknown>>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      wordId: row.word_id,
      spelling: row.spelling,
      chineseDef: row.chinese_def,
      imageUrl: row.image_url,
      r2Key: row.r2_key,
      uploadMethod: row.upload_method,
      status: row.status,
      reviewNote: row.review_note,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    })),
  })
})

admin.get('/images/missing', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.spelling, w.chinese_def, w.phonetic,
       (SELECT wi.status FROM word_image wi WHERE wi.word_id = w.id
         ORDER BY wi.created_at DESC LIMIT 1) AS latest_status,
       (SELECT COUNT(*) FROM word_image wi WHERE wi.word_id = w.id) AS image_count
     FROM word w
     WHERE w.enabled = 1 AND NOT EXISTS (
       SELECT 1 FROM word_image wi WHERE wi.word_id = w.id AND wi.status = 'approved'
     )
     ORDER BY w.has_image ASC, w.spelling LIMIT 200`,
  ).all<Record<string, unknown>>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      spelling: row.spelling,
      chineseDef: row.chinese_def,
      phonetic: row.phonetic,
      latestStatus: row.latest_status,
      imageCount: row.image_count,
    })),
  })
})

admin.get('/words/:id/images', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM word_image WHERE word_id = ? ORDER BY created_at DESC',
  ).bind(c.req.param('id')).all<Record<string, unknown>>()
  return c.json({ data: results || [] })
})

admin.post('/words/:id/images', async (c) => {
  const bucket = c.env.IMAGES
  if (!bucket) return c.json({ error: '图片存储未配置' }, 503)
  const wordId = c.req.param('id')
  const word = await c.env.DB.prepare('SELECT id FROM word WHERE id = ?').bind(wordId).first<{ id: string }>()
  if (!word) return c.json({ error: '单词不存在' }, 404)

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.json({ error: '请使用 multipart/form-data 上传' }, 400)
  }
  const files = [...form.getAll('files'), ...form.getAll('file')]
    .filter((item): item is File => item instanceof File)
  if (!files.length) return c.json({ error: '请选择图片文件' }, 400)
  if (files.length > 20) return c.json({ error: '单次最多上传 20 张图片' }, 400)

  const allowed: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  }
  const prepared: Array<{ imageId: string; key: string; file: File }> = []
  for (const file of files) {
    const ext = allowed[file.type]
    if (!ext) return c.json({ error: `仅支持 JPG、PNG、WebP、GIF、SVG 图片：${file.name}` }, 400)
    if (file.size > 5 * 1024 * 1024) return c.json({ error: `图片 ${file.name} 超过 5MB` }, 400)
    const imageId = uuid('img')
    prepared.push({ imageId, key: `word-images/${wordId}/${imageId}.${ext}`, file })
  }

  await Promise.all(prepared.map(async (item) => {
    await bucket.put(item.key, await item.file.arrayBuffer(), {
      httpMetadata: {
        contentType: item.file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })
  }))

  const statements = prepared.map((item) => c.env.DB.prepare(
    `INSERT INTO word_image (id, word_id, image_url, r2_key, upload_method, status)
     VALUES (?, ?, ?, ?, 'upload', 'pending')`,
  ).bind(item.imageId, wordId, `/api/images/${item.imageId}`, item.key))
  statements.push(
    c.env.DB.prepare('UPDATE word SET has_image = 1, updated_at = ? WHERE id = ?')
      .bind(nowIso(), wordId),
  )
  await c.env.DB.batch(statements)

  const items = prepared.map((item) => ({
    id: item.imageId,
    imageUrl: `/api/images/${item.imageId}`,
    status: 'pending',
  }))
  return c.json({
    items,
    count: items.length,
    id: items[0]!.id,
    imageUrl: items[0]!.imageUrl,
    status: 'pending',
  }, 201)
})

admin.patch('/images/:id', async (c) => {
  const body = await parseBody(c, z.object({
    status: z.enum(['approved', 'rejected']),
    note: z.string().max(300).optional(),
  }))
  const image = await c.env.DB.prepare(
    'SELECT id, word_id FROM word_image WHERE id = ?',
  ).bind(c.req.param('id')).first<{ id: string; word_id: string }>()
  if (!image) return c.json({ error: '图片不存在' }, 404)

  if (body.status === 'approved') {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE word_image SET status = 'replaced'
         WHERE word_id = ? AND id <> ? AND status = 'approved'`,
      ).bind(image.word_id, image.id),
      c.env.DB.prepare(
        `UPDATE word_image SET status = 'approved', review_note = ?, reviewed_at = ?
         WHERE id = ?`,
      ).bind(body.note || null, nowIso(), image.id),
      c.env.DB.prepare(
        'UPDATE word SET has_image = 1, image_id = ?, updated_at = ? WHERE id = ?',
      ).bind(image.id, nowIso(), image.word_id),
    ])
  } else {
    await c.env.DB.prepare(
      `UPDATE word_image SET status = 'rejected', review_note = ?, reviewed_at = ?
       WHERE id = ?`,
    ).bind(body.note || null, nowIso(), image.id).run()
    const approved = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM word_image WHERE word_id = ? AND status = 'approved'`,
    ).bind(image.word_id).first<{ total: number }>()
    const pending = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM word_image WHERE word_id = ? AND status = 'pending'`,
    ).bind(image.word_id).first<{ total: number }>()
    if (!approved?.total) {
      await c.env.DB.prepare(
        'UPDATE word SET has_image = ?, image_id = NULL, updated_at = ? WHERE id = ?',
      ).bind(pending?.total ? 1 : 0, nowIso(), image.word_id).run()
    }
  }
  return c.json({ ok: true })
})

const questionSchema = z.object({
  wordId: z.string().min(1),
  unitId: z.string().nullable().optional(),
  // 搭配题已暂停：人工题也不再接受该题型。
  type: z.enum(['definition_choice', 'letter_fill', 'sentence_fill', 'image_choice', 'audio_choice']),
  stem: z.string().trim().min(1, '请填写题干').max(1000),
  options: z.array(z.string().max(200)).max(10).default([]),
  correctAnswer: z.string().trim().min(1, '请填写正确答案').max(200),
  explanation: z.string().max(1000).optional(),
  difficulty: z.number().int().min(1).max(5).default(1),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
})

admin.get('/questions', async (c) => {
  const type = c.req.query('type')
  const status = c.req.query('status')
  const wordId = c.req.query('wordId')
  const page = queryInt(c.req.query('page'), 1, 1, 10000)
  const limit = queryInt(c.req.query('limit'), 20, 1, 100)
  const conditions: string[] = ['1 = 1']
  const values: unknown[] = []
  if (type) { conditions.push('q.type = ?'); values.push(type) }
  if (status) { conditions.push('q.status = ?'); values.push(status) }
  if (wordId) { conditions.push('q.word_id = ?'); values.push(wordId) }
  const where = conditions.join(' AND ')
  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM question q WHERE ${where}`,
  ).bind(...values).first<{ total: number }>()
  const { results } = await c.env.DB.prepare(
    `SELECT q.*, w.spelling, w.chinese_def
     FROM question q JOIN word w ON w.id = q.word_id
     WHERE ${where} ORDER BY q.created_at DESC LIMIT ? OFFSET ?`,
  ).bind(...values, limit, (page - 1) * limit).all<Record<string, unknown>>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      wordId: row.word_id,
      spelling: row.spelling,
      chineseDef: row.chinese_def,
      type: row.type,
      stem: row.stem,
      options: safeJson(row.options as string, []),
      correctAnswer: row.correct_answer,
      explanation: row.explanation,
      difficulty: row.difficulty,
      status: row.status,
      createdAt: row.created_at,
    })),
    total: total?.total || 0,
    page,
    limit,
  })
})

admin.post('/questions', async (c) => {
  const body = await parseBody(c, questionSchema)
  const id = uuid('q')
  await c.env.DB.prepare(
    `INSERT INTO question (id, word_id, unit_id, type, stem, options, correct_answer,
      explanation, difficulty, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    body.wordId,
    body.unitId || null,
    body.type,
    body.stem,
    JSON.stringify(body.options),
    body.correctAnswer,
    body.explanation || null,
    body.difficulty,
    body.status,
  ).run()
  return c.json({ id }, 201)
})

admin.patch('/questions/:id', async (c) => {
  const body = await parseBody(c, questionSchema.partial())
  const map: Record<string, string> = {
    wordId: 'word_id', unitId: 'unit_id', type: 'type', stem: 'stem',
    correctAnswer: 'correct_answer', explanation: 'explanation',
    difficulty: 'difficulty', status: 'status',
  }
  const updates: string[] = []
  const values: unknown[] = []
  for (const [key, column] of Object.entries(map)) {
    const value = (body as Record<string, unknown>)[key]
    if (value !== undefined) {
      updates.push(`${column} = ?`)
      values.push(value)
    }
  }
  if (body.options !== undefined) {
    updates.push('options = ?')
    values.push(JSON.stringify(body.options))
  }
  if (!updates.length) return c.json({ ok: true })
  values.push(c.req.param('id'))
  await c.env.DB.prepare(`UPDATE question SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ ok: true })
})

admin.delete('/questions/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM question WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

admin.get('/users', async (c) => {
  const role = c.req.query('role')
  const search = c.req.query('search')?.trim()
  const conditions: string[] = ['1 = 1']
  const values: unknown[] = []
  if (role) { conditions.push('u.role = ?'); values.push(role) }
  if (search) {
    conditions.push('(u.nickname LIKE ? OR u.email LIKE ?)')
    values.push(`%${search}%`, `%${search}%`)
  }
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.role, u.nickname, u.email, u.enabled, u.created_at,
       p.nickname AS parent_name, p.email AS parent_email
     FROM user u
     LEFT JOIN user p ON p.id = u.parent_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.role, u.created_at DESC LIMIT 500`,
  ).bind(...values).all<Record<string, unknown>>()
  return c.json({
    data: (results || []).map((row) => ({
      id: row.id,
      role: row.role,
      nickname: row.nickname,
      email: row.email,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      parentName: row.parent_name,
      parentEmail: row.parent_email,
    })),
  })
})

// 管理员创建账号只走邮箱且只建家长/管理员（手机号逻辑已删除）。
// 学生账号不走这条：学生是家长账号内的虚拟子账号，只能由家长在自己账号内创建。
const userSchema = z.object({
  role: z.enum(['parent', 'admin']),
  nickname: z.string().trim().min(1, '请填写昵称').max(50),
  email: z.string().trim().toLowerCase().email('请输入正确的邮箱'),
  password: z.string().min(6, '密码至少 6 位').max(100),
})

admin.post('/users', async (c) => {
  const body = await parseBody(c, userSchema)
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE lower(email) = lower(?)').bind(body.email).first()
  if (existing) return c.json({ error: '该邮箱已存在' }, 409)
  const id = uuid('u')
  await c.env.DB.prepare(
    'INSERT INTO user (id, role, nickname, email, password_hash, enabled) VALUES (?, ?, ?, ?, ?, 1)',
  ).bind(id, body.role, body.nickname, body.email, await hashPassword(body.password)).run()
  return c.json({ id }, 201)
})

admin.patch('/users/:id', async (c) => {
  const body = await parseBody(c, z.object({
    nickname: z.string().trim().min(1).max(50).optional(),
    email: z.string().trim().toLowerCase().email('请输入正确的邮箱').optional(),
    password: z.string().min(6).max(100).optional(),
    enabled: z.boolean().optional(),
  }))
  // 学生是虚拟子账号，不能通过改邮箱获得独立登录入口。
  if (body.email !== undefined) {
    const target = await c.env.DB.prepare('SELECT role FROM user WHERE id = ?').bind(c.req.param('id')).first<{ role: string }>()
    if (target?.role === 'student') {
      return c.json({ error: '学生是虚拟子账号，不能设置邮箱登录' }, 400)
    }
  }
  const updates: string[] = []
  const values: unknown[] = []
  if (body.nickname !== undefined) { updates.push('nickname = ?'); values.push(body.nickname) }
  if (body.email !== undefined) {
    const existing = await c.env.DB.prepare('SELECT id FROM user WHERE lower(email) = lower(?) AND id <> ?').bind(body.email, c.req.param('id')).first()
    if (existing) return c.json({ error: '该邮箱已存在' }, 409)
    updates.push('email = ?'); values.push(body.email)
  }
  if (body.enabled !== undefined) { updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0) }
  if (body.password !== undefined) {
    updates.push('password_hash = ?')
    values.push(await hashPassword(body.password))
  }
  if (!updates.length) return c.json({ ok: true })
  updates.push('updated_at = ?')
  values.push(nowIso(), c.req.param('id'))
  await c.env.DB.prepare(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ ok: true })
})

admin.get('/families', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT f.id AS family_id, f.parent_user_id,
       p.nickname AS parent_name, p.email AS parent_email,
       fm.id AS member_id, fm.student_user_id, fm.relation, fm.status,
       s.nickname AS student_name, s.email AS student_email
     FROM family f
     JOIN user p ON p.id = f.parent_user_id
     LEFT JOIN family_member fm ON fm.family_id = f.id
     LEFT JOIN user s ON s.id = fm.student_user_id
     ORDER BY p.nickname, s.nickname`,
  ).all<Record<string, unknown>>()

  const map = new Map<string, {
    id: string
    parentUserId: string
    parentName: string
    parentEmail: string | null
    members: Array<Record<string, unknown>>
  }>()
  for (const row of results || []) {
    let family = map.get(row.family_id as string)
    if (!family) {
      family = {
        id: row.family_id as string,
        parentUserId: row.parent_user_id as string,
        parentName: row.parent_name as string,
        parentEmail: row.parent_email as string | null,
        members: [],
      }
      map.set(row.family_id as string, family)
    }
    if (row.member_id) {
      family.members.push({
        id: row.member_id,
        studentUserId: row.student_user_id,
        studentName: row.student_name,
        studentEmail: row.student_email,
        relation: row.relation,
        status: row.status,
      })
    }
  }
  return c.json({ data: [...map.values()] })
})

admin.post('/families/bind', async (c) => {
  const body = await parseBody(c, z.object({
    parentId: z.string().min(1),
    studentId: z.string().min(1),
    relation: z.string().trim().max(20).default('孩子'),
  }))
  const parentUser = await c.env.DB.prepare(
    `SELECT id FROM user WHERE id = ? AND role = 'parent'`,
  ).bind(body.parentId).first<{ id: string }>()
  const studentUser = await c.env.DB.prepare(
    `SELECT id FROM user WHERE id = ? AND role = 'student'`,
  ).bind(body.studentId).first<{ id: string }>()
  if (!parentUser || !studentUser) return c.json({ error: '家长或学生账号不存在' }, 404)

  let family = await c.env.DB.prepare(
    'SELECT id FROM family WHERE parent_user_id = ?',
  ).bind(body.parentId).first<{ id: string }>()
  if (!family) {
    const familyId = uuid('f')
    await c.env.DB.prepare('INSERT INTO family (id, parent_user_id) VALUES (?, ?)')
      .bind(familyId, body.parentId).run()
    family = { id: familyId }
  }
  await c.env.DB.prepare(
    `INSERT INTO family_member (id, family_id, student_user_id, relation, status, enabled)
     VALUES (?, ?, ?, ?, 'active', 1)
     ON CONFLICT(family_id, student_user_id)
     DO UPDATE SET status = 'active', enabled = 1, relation = excluded.relation`,
  ).bind(uuid('fm'), family.id, body.studentId, body.relation).run()
  await c.env.DB.prepare(
    'UPDATE user SET parent_id = ?, updated_at = ? WHERE id = ?',
  ).bind(body.parentId, nowIso(), body.studentId).run()
  return c.json({ ok: true, familyId: family.id })
})

admin.patch('/families/:familyId/members/:memberId', async (c) => {
  const body = await parseBody(c, z.object({
    status: z.enum(['active', 'pending', 'rejected']),
  }))
  await c.env.DB.prepare(
    'UPDATE family_member SET status = ?, enabled = ? WHERE id = ? AND family_id = ?',
  ).bind(body.status, body.status === 'active' ? 1 : 0, c.req.param('memberId'), c.req.param('familyId')).run()
  return c.json({ ok: true })
})

admin.delete('/families/:familyId/members/:memberId', async (c) => {
  await c.env.DB.prepare(
    'DELETE FROM family_member WHERE id = ? AND family_id = ?',
  ).bind(c.req.param('memberId'), c.req.param('familyId')).run()
  return c.json({ ok: true })
})

export default admin
