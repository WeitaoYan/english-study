import { Hono } from 'hono'
import { z } from 'zod'
import { QUESTION_TYPE_LABELS, type QuestionPayload, type QuestionType, type ReviewWord } from '@english-study/shared'
import type { AppEnv, MasteryRow, WordRow } from '../types'
import { requireAuth, requireRole } from '../lib/auth'
import { parseBody } from '../lib/http'
import { computeMastery, masteryToApi } from '../lib/srs'
import { applyManualQuestion, buildQuestions, expectedAnswer, explanationForRow, maskWordInPhrase, type ManualQuestion } from '../lib/questions'
import { isQuestionType, mapWord } from '../lib/mappers'
import {
  currentStreak,
  getCalendar,
  getTextbookProgress,
  getUnitProgress,
  isTextbookAssigned,
  getWordById,
  getWordsForUnit,
  getWordsForUnits,
  mapJoinedWord,
  toUnit,
  WORD_COLUMNS,
  MASTERY_COLUMNS,
  type JoinedWordRow,
} from '../lib/queries'
import { checkIncentives } from '../lib/incentives'
import { dateKeyInCN, nowIso, safeJson, uuid } from '../lib/utils'

const student = new Hono<AppEnv>()
student.use('*', requireAuth, requireRole('student'))

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

const sessionSchema = z.object({
  mode: z.enum(['unit', 'review', 'word']).default('unit'),
  unitId: z.string().optional(),
  wordId: z.string().optional(),
  // 复习模式的题数不由这里定：后端按家长设的每日限额与当日已答题数算；
  // 单元模式不传时默认 10。
  limit: z.number().int().min(1).max(50).optional(),
})

// 家长给孩子设的每日复习题数（默认 10），存在 family_member 上。
async function getReviewDailyLimit(env: AppEnv['Bindings'], studentId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT fm.review_daily_limit AS review_daily_limit
     FROM family_member fm JOIN family f ON f.id = fm.family_id
     WHERE fm.student_user_id = ? AND fm.status = 'active' AND fm.enabled = 1
     ORDER BY fm.created_at LIMIT 1`,
  ).bind(studentId).first<{ review_daily_limit: number }>()
  const value = row?.review_daily_limit
  return typeof value === 'number' && value >= 1 && value <= 50 ? value : 10
}

// 孩子今天已答的复习题数（每道题一条 practice_record，按中国日期算）。
async function countReviewedToday(env: AppEnv['Bindings'], studentId: string, today: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM practice_record pr
     JOIN practice_session ps ON ps.id = pr.session_id
     WHERE ps.user_id = ? AND ps.mode = 'review' AND date(pr.answered_at, '+8 hours') = ?`,
  ).bind(studentId, today).first<{ total: number }>()
  return row?.total || 0
}

interface ManualQuestionRow {
  id: string
  type: string
  stem: string
  options: string
  correct_answer: string
  explanation: string | null
}

/** 优先取与自动题题型一致的已发布人工题，实现自动题与手动题混合出题。 */
async function findManualQuestion(
  env: AppEnv['Bindings'],
  wordId: string,
  preferredType: QuestionType,
): Promise<ManualQuestion | null> {
  const row = await env.DB.prepare(
    `SELECT id, type, stem, options, correct_answer, explanation
     FROM question
     WHERE word_id = ? AND status = 'published' AND type = ?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(wordId, preferredType).first<ManualQuestionRow>()
  if (!row || !isQuestionType(row.type)) return null
  return {
    id: row.id,
    type: row.type,
    stem: row.stem,
    options: safeJson<string[]>(row.options, []).map(String),
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
  }
}

student.get('/dashboard', async (c) => {
  const user = c.get('user')
  const today = dateKeyInCN()

  const todayStats = await c.env.DB.prepare(
    `SELECT COUNT(*) AS answered,
       COALESCE(SUM(pr.is_correct), 0) AS correct,
       COUNT(DISTINCT pr.word_id) AS words,
       COALESCE(SUM(pr.duration), 0) AS duration_ms
     FROM practice_record pr
     JOIN practice_session ps ON ps.id = pr.session_id
     WHERE ps.user_id = ? AND date(pr.answered_at, '+8 hours') = ?`,
  ).bind(user.id, today).first<{ answered: number; correct: number; words: number; duration_ms: number }>()

  const newWords = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM (
       SELECT pr.word_id, MIN(pr.answered_at) AS first_at
       FROM practice_record pr
       JOIN practice_session ps ON ps.id = pr.session_id
       WHERE ps.user_id = ?
       GROUP BY pr.word_id
       HAVING date(first_at, '+8 hours') = ?
     )`,
  ).bind(user.id, today).first<{ total: number }>()

  const reviewedWords = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT pr.word_id) AS total
     FROM practice_record pr
     JOIN practice_session ps ON ps.id = pr.session_id
     WHERE ps.user_id = ? AND ps.mode = 'review' AND date(pr.answered_at, '+8 hours') = ?`,
  ).bind(user.id, today).first<{ total: number }>()

  const totals = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS learned_words,
       COALESCE(SUM(CASE WHEN strength >= 3 THEN 1 ELSE 0 END), 0) AS mastered_words,
       COALESCE(SUM(CASE WHEN is_weak = 1 THEN 1 ELSE 0 END), 0) AS weak_words,
       COALESCE(SUM(CASE WHEN is_weak = 1 OR (next_review_time IS NOT NULL AND next_review_time <= ?) THEN 1 ELSE 0 END), 0) AS due_today
     FROM word_mastery wm WHERE wm.user_id = ?
       -- 首页统计只算指定课本里的词：未指定的课本即使以前学过，也不计入待复习数。
       AND EXISTS (
         SELECT 1 FROM unit_word uw
         JOIN unit u ON u.id = uw.unit_id AND uw.enabled = 1
         JOIN child_textbook ct ON ct.textbook_id = u.textbook_id AND ct.student_user_id = ?
         WHERE uw.word_id = wm.word_id
       )`,
  ).bind(nowIso(), user.id, user.id).first<{
    learned_words: number
    mastered_words: number
    weak_words: number
    due_today: number
  }>()

  const textbooks = await getTextbookProgress(c.env, user.id)
  const calendar = await getCalendar(c.env, user.id, 30)
  const { results: recent } = await c.env.DB.prepare(
    `SELECT ps.id, ps.mode, ps.end_time, ps.total_count, ps.correct_count,
       u.unit_name, t.name AS textbook_name
     FROM practice_session ps
     LEFT JOIN unit u ON u.id = ps.unit_id
     LEFT JOIN textbook t ON t.id = ps.textbook_id
     WHERE ps.user_id = ? AND ps.end_time IS NOT NULL
     ORDER BY ps.end_time DESC LIMIT 5`,
  ).bind(user.id).all<{
    id: string
    mode: string
    end_time: string | null
    total_count: number
    correct_count: number
    unit_name: string | null
    textbook_name: string | null
  }>()

  const answered = todayStats?.answered || 0
  const correct = todayStats?.correct || 0
  return c.json({
    today: {
      answered,
      correct,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      minutes: Math.round(((todayStats?.duration_ms || 0) / 60000) * 10) / 10,
      newWords: newWords?.total || 0,
      reviewedWords: reviewedWords?.total || 0,
    },
    totals: {
      learnedWords: totals?.learned_words || 0,
      masteredWords: totals?.mastered_words || 0,
      weakWords: totals?.weak_words || 0,
      dueToday: totals?.due_today || 0,
      streakDays: currentStreak(calendar),
    },
    textbooks,
    recentSessions: (recent || []).map((row) => ({
      id: row.id,
      mode: row.mode,
      unitName: row.unit_name,
      textbookName: row.textbook_name,
      finishedAt: row.end_time,
      totalCount: row.total_count,
      correctCount: row.correct_count,
    })),
    calendar,
  })
})

student.get('/textbooks', async (c) => {
  return c.json({ data: await getTextbookProgress(c.env, c.get('user').id) })
})

student.get('/textbooks/:id', async (c) => {
  const user = c.get('user')
  const textbook = await c.env.DB.prepare(
    `SELECT * FROM textbook WHERE id = ? AND status = 'published'`,
  ).bind(c.req.param('id')).first<{
    id: string
    name: string
    version: string
    grade: string
    semester: string
    status: 'published'
    cover_color: string
  }>()
  if (!textbook) return c.json({ error: '课本不存在' }, 404)
  // 未被家长指定的课本直接 404，孩子按 id 猜也打不开。
  if (!(await isTextbookAssigned(c.env, user.id, textbook.id))) return c.json({ error: '课本不存在' }, 404)
  const units = await getUnitProgress(c.env, user.id, textbook.id)
  const all = await getTextbookProgress(c.env, user.id)
  const summary = all.find((item) => item.id === textbook.id)
  return c.json({
    textbook: summary || {
      id: textbook.id,
      name: textbook.name,
      version: textbook.version,
      grade: textbook.grade,
      semester: textbook.semester,
      status: textbook.status,
      coverColor: textbook.cover_color,
      unitCount: units.length,
      wordCount: 0,
      learnedWords: 0,
      masteredWords: 0,
      dueCount: 0,
      progress: 0,
    },
    units: units.map(toUnit),
  })
})

student.get('/units/:id', async (c) => {
  const user = c.get('user')
  const unitId = c.req.param('id')
  const unit = await c.env.DB.prepare(
    `SELECT u.id, u.textbook_id, u.unit_no, u.unit_name, u.sort_order,
       t.name, t.version, t.grade, t.semester
     FROM unit u JOIN textbook t ON t.id = u.textbook_id
     WHERE u.id = ? AND t.status = 'published'`,
  ).bind(unitId).first<{
    id: string
    textbook_id: string
    unit_no: number
    unit_name: string
    sort_order: number
    name: string
    version: string
    grade: string
    semester: string
  }>()
  if (!unit) return c.json({ error: '单元不存在' }, 404)
  // 单元所属课本未被指定时，单元详情也打不开。
  if (!(await isTextbookAssigned(c.env, user.id, unit.textbook_id))) return c.json({ error: '单元不存在' }, 404)
  const progressRows = await getUnitProgress(c.env, user.id, unit.textbook_id)
  const progress = progressRows.find((row) => row.id === unitId)
  const words = (await getWordsForUnit(c.env, user.id, unitId)).map(mapJoinedWord)
  return c.json({
    unit: progress ? toUnit(progress) : {
      id: unit.id,
      textbookId: unit.textbook_id,
      unitNo: unit.unit_no,
      unitName: unit.unit_name,
      sortOrder: unit.sort_order,
      wordCount: words.length,
      learnedWords: 0,
      masteredWords: 0,
      dueCount: 0,
      progress: 0,
    },
    textbook: {
      id: unit.textbook_id,
      name: unit.name,
      version: unit.version,
      grade: unit.grade,
      semester: unit.semester,
    },
    words,
  })
})

student.get('/review', async (c) => {
  const user = c.get('user')
  const now = nowIso()
  const { results } = await c.env.DB.prepare(
    `SELECT ${WORD_COLUMNS}, ${MASTERY_COLUMNS}
     FROM word_mastery wm
     JOIN word w ON w.id = wm.word_id AND w.enabled = 1
     WHERE wm.user_id = ?
       AND (wm.is_weak = 1 OR (wm.next_review_time IS NOT NULL AND wm.next_review_time <= ?))
       -- 今日复习只出指定课本里的词。
       AND EXISTS (
         SELECT 1 FROM unit_word uw
         JOIN unit u ON u.id = uw.unit_id AND uw.enabled = 1
         JOIN child_textbook ct ON ct.textbook_id = u.textbook_id AND ct.student_user_id = ?
         WHERE uw.word_id = wm.word_id
       )
     ORDER BY wm.is_weak DESC, wm.next_review_time ASC
     LIMIT 100`,
  ).bind(user.id, now, user.id).all<JoinedWordRow>()

  const words: ReviewWord[] = (results || []).map((row) => {
    const word = mapJoinedWord(row)
    const isWeak = Boolean(row.wm_is_weak)
    const isDue = Boolean(row.wm_next_review_time && row.wm_next_review_time <= now)
    return {
      ...word,
      reason: isWeak && isDue ? 'both' : isWeak ? 'weak' : 'due',
    }
  })
  const dailyLimit = await getReviewDailyLimit(c.env, user.id)
  const reviewedToday = await countReviewedToday(c.env, user.id, dateKeyInCN())
  return c.json({
    date: dateKeyInCN(),
    words,
    weakCount: words.filter((word) => word.mastery?.isWeak).length,
    dueCount: words.length,
    dailyLimit,
    reviewedToday,
    remainingToday: Math.max(0, dailyLimit - reviewedToday),
  })
})

student.post('/practice/sessions', async (c) => {
  const user = c.get('user')
  const body = await parseBody(c, sessionSchema)
  const now = nowIso()
  let selected: JoinedWordRow[] = []
  let unitId: string | null = body.unitId || null
  let mode: 'unit' | 'review' | 'word' = body.mode
  let textbookId: string | null = null

  if (body.mode === 'word') {
    if (!body.wordId) return c.json({ error: '缺少单词参数' }, 400)
    const word = await getWordById(c.env, user.id, body.wordId)
    if (!word) return c.json({ error: '单词不存在' }, 404)
    // 单词练：该词须属于一本被指定的课本（词可能在多个单元里，任一单元的课本被指定即可）。
    const inAssigned = await c.env.DB.prepare(
      `SELECT 1 FROM unit_word uw
       JOIN unit u ON u.id = uw.unit_id
       JOIN child_textbook ct ON ct.textbook_id = u.textbook_id AND ct.student_user_id = ?
       WHERE uw.word_id = ? AND uw.enabled = 1`,
    ).bind(user.id, body.wordId).first()
    if (!inAssigned) return c.json({ error: '该单词所在的课本未指定给孩子' }, 403)
    selected = [word]
    unitId = word.unit_id || null
  } else if (body.mode === 'review') {
    // 每日复习题数是家长设的：今天已答的先扣掉，剩多少取多少；到量了直接
    // 返回“今日复习已完成”，不再开局。前端不传 limit，后端说了算。
    const dailyLimit = await getReviewDailyLimit(c.env, user.id)
    const reviewedToday = await countReviewedToday(c.env, user.id, dateKeyInCN())
    const remaining = dailyLimit - reviewedToday
    if (remaining <= 0) {
      return c.json({
        sessionId: '',
        mode,
        unitId,
        totalCount: 0,
        questions: [],
        empty: true,
        message: '今日复习已完成，明天再来',
      })
    }
    const limit = Math.min(body.limit ?? remaining, remaining)
    const { results } = await c.env.DB.prepare(
      `SELECT ${WORD_COLUMNS}, ${MASTERY_COLUMNS}
       FROM word_mastery wm
       JOIN word w ON w.id = wm.word_id AND w.enabled = 1
       WHERE wm.user_id = ?
         AND (wm.is_weak = 1 OR (wm.next_review_time IS NOT NULL AND wm.next_review_time <= ?))
         AND EXISTS (
           SELECT 1 FROM unit_word uw
           JOIN unit u ON u.id = uw.unit_id AND uw.enabled = 1
           JOIN child_textbook ct ON ct.textbook_id = u.textbook_id AND ct.student_user_id = ?
           WHERE uw.word_id = wm.word_id
         )
       ORDER BY wm.is_weak DESC, wm.next_review_time ASC
       LIMIT ?`,
    ).bind(user.id, now, user.id, limit).all<JoinedWordRow>()
    selected = results || []
  } else {
    if (!body.unitId) return c.json({ error: '请选择单元' }, 400)
    const unitRow = await c.env.DB.prepare(
      'SELECT textbook_id FROM unit WHERE id = ?',
    ).bind(body.unitId).first<{ textbook_id: string }>()
    if (!unitRow) return c.json({ error: '该单元不存在' }, 404)
    // 单元所属课本未被家长指定时，拒绝开局。
    if (!(await isTextbookAssigned(c.env, user.id, unitRow.textbook_id))) {
      return c.json({ error: '该单元的课本未指定给孩子' }, 403)
    }
    const all = await getWordsForUnit(c.env, user.id, body.unitId)
    // 轮换取词：同组内按“最久没练”排，熟练度都一样时每局取下一批，
    // 避免每次都取排在最前面的同一批词；并列时保持单元内原顺序。
    const orderIndex = new Map(all.map((row, index) => [row.id, index]))
    const byUnitOrder = (a: JoinedWordRow, b: JoinedWordRow) =>
      (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
    const due = all
      .filter((row) => row.wm_is_weak === 1 || (row.wm_next_review_time && row.wm_next_review_time <= now))
      .sort((a, b) => {
        const weak = (b.wm_is_weak === 1 ? 1 : 0) - (a.wm_is_weak === 1 ? 1 : 0)
        if (weak) return weak
        const next = (a.wm_next_review_time || '').localeCompare(b.wm_next_review_time || '')
        return next || byUnitOrder(a, b)
      })
    const fresh = all.filter((row) => !row.wm_id)
    const rest = all
      .filter((row) => !due.includes(row) && !fresh.includes(row))
      .sort((a, b) => {
        const last = (a.wm_last_review_time || '').localeCompare(b.wm_last_review_time || '')
        return last || byUnitOrder(a, b)
      })
    selected = [...due, ...fresh, ...rest].slice(0, body.limit ?? 10)
    if (!all.length) return c.json({ error: '该单元暂无启用单词' }, 404)
  }

  if (!selected.length) {
    return c.json({
      sessionId: '',
      mode,
      unitId,
      totalCount: 0,
      questions: [],
      empty: true,
      message: mode === 'review' ? '今天没有到期需要复习的单词' : '暂时没有可练习的单词',
    })
  }

  const unitIds = [...new Set(selected.map((row) => row.unit_id).filter(Boolean))] as string[]
  const context = await getWordsForUnits(c.env, user.id, unitIds)
  const questions: QuestionPayload[] = []
  for (const row of selected) {
    const pool = row.unit_id ? (context.get(row.unit_id) || [row]) : [row]
    const generated = buildQuestions([row], pool, questions.length)
    let question = generated[0]
    if (!question) continue
    const manual = await findManualQuestion(c.env, row.id, question.type)
    if (manual) {
      const merged = applyManualQuestion(question, mapWord(row), manual)
      if (merged) question = merged
    }
    questions.push(question)
  }

  const firstUnit = selected.find((row) => row.unit_id)?.unit_id
  if (firstUnit) {
    const unitRow = await c.env.DB.prepare(
      'SELECT textbook_id FROM unit WHERE id = ?',
    ).bind(firstUnit).first<{ textbook_id: string }>()
    textbookId = unitRow?.textbook_id || null
  }

  const sessionId = uuid('s')
  await c.env.DB.prepare(
    `INSERT INTO practice_session
      (id, user_id, textbook_id, unit_id, mode, questions_json, start_time, total_count, correct_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).bind(
    sessionId,
    user.id,
    textbookId,
    unitId,
    mode,
    JSON.stringify(questions),
    now,
    questions.length,
  ).run()

  return c.json({
    sessionId,
    mode,
    unitId,
    totalCount: questions.length,
    questions,
    empty: false,
  })
})

student.get('/practice/sessions/:id', async (c) => {
  const user = c.get('user')
  const session = await c.env.DB.prepare(
    `SELECT id, mode, unit_id, questions_json, start_time, end_time, total_count, correct_count
     FROM practice_session WHERE id = ? AND user_id = ?`,
  ).bind(c.req.param('id'), user.id).first<{
    id: string
    mode: string
    unit_id: string | null
    questions_json: string
    start_time: string
    end_time: string | null
    total_count: number
    correct_count: number
  }>()
  if (!session) return c.json({ error: '练习不存在' }, 404)
  const questions = safeJson<QuestionPayload[]>(session.questions_json, [])
  return c.json({
    sessionId: session.id,
    mode: session.mode,
    unitId: session.unit_id,
    totalCount: questions.length,
    questions,
    finished: Boolean(session.end_time),
  })
})

const answerSchema = z.object({
  sessionId: z.string().min(1),
  wordId: z.string().min(1),
  type: z.string().min(1),
  answer: z.string().max(300),
  prompt: z.string().max(500).optional(),
  durationMs: z.number().int().min(0).max(3600000).default(0),
})

student.post('/practice/answer', async (c) => {
  const user = c.get('user')
  const body = await parseBody(c, answerSchema)
  if (!isQuestionType(body.type)) return c.json({ error: '题型不正确' }, 400)
  const type = body.type as QuestionType

  const session = await c.env.DB.prepare(
    `SELECT id, end_time, questions_json, mode, unit_id
     FROM practice_session WHERE id = ? AND user_id = ?`,
  ).bind(body.sessionId, user.id).first<{
    id: string
    end_time: string | null
    questions_json: string
    mode: string
    unit_id: string | null
  }>()
  if (!session) return c.json({ error: '练习不存在' }, 404)
  if (session.end_time) return c.json({ error: '本次练习已结束' }, 409)

  const plan = safeJson<QuestionPayload[]>(session.questions_json, [])
  const planned = plan.find((item) => item.wordId === body.wordId && item.type === type)
  if (!planned) return c.json({ error: '题目不属于本次练习' }, 400)

  const word = await getWordById(c.env, user.id, body.wordId)
  if (!word) return c.json({ error: '单词不存在' }, 404)

  let correctAnswer = expectedAnswer(word as WordRow, type)
  let explanation = explanationForRow(word)
  if (planned.questionId) {
    const manual = await c.env.DB.prepare(
      'SELECT correct_answer, explanation FROM question WHERE id = ?',
    ).bind(planned.questionId).first<{ correct_answer: string; explanation: string | null }>()
    if (manual) {
      correctAnswer = manual.correct_answer
      explanation = manual.explanation || explanation
    }
  }
  // 搭配题判分兼容两种提交：完整短语（现行模板置换后的选项就是完整短语），
  // 以及挖空形式（上一版挖空方案产生的会话仍在有效期内，照样判对）。
  // 返回给前端的 correctAnswer 仍是完整短语，便于答错时学习。
  const isCorrect = normalizeAnswer(body.answer) === normalizeAnswer(correctAnswer)
    || (type === 'collocation_choice'
      && normalizeAnswer(body.answer) === normalizeAnswer(maskWordInPhrase(correctAnswer, planned.wordSpelling)))
  const now = new Date()
  const existing = await c.env.DB.prepare(
    'SELECT * FROM word_mastery WHERE user_id = ? AND word_id = ?',
  ).bind(user.id, word.id).first<MasteryRow>()
  const update = computeMastery(existing, isCorrect, now)

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE word_mastery SET strength = ?, next_review_time = ?, last_review_time = ?,
        consecutive_correct = ?, consecutive_wrong = ?, accuracy = ?, is_weak = ?,
        recent_results = ?, total_attempts = ?, correct_attempts = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      update.strength,
      update.nextReviewTime,
      update.lastReviewTime,
      update.consecutiveCorrect,
      update.consecutiveWrong,
      update.accuracy,
      update.isWeak ? 1 : 0,
      JSON.stringify(update.recentResults),
      update.totalAttempts,
      update.correctAttempts,
      nowIso(),
      existing.id,
    ).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO word_mastery
        (id, user_id, word_id, strength, next_review_time, last_review_time,
         consecutive_correct, consecutive_wrong, accuracy, is_weak, recent_results,
         total_attempts, correct_attempts, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid('wm'),
      user.id,
      word.id,
      update.strength,
      update.nextReviewTime,
      update.lastReviewTime,
      update.consecutiveCorrect,
      update.consecutiveWrong,
      update.accuracy,
      update.isWeak ? 1 : 0,
      JSON.stringify(update.recentResults),
      update.totalAttempts,
      update.correctAttempts,
      nowIso(),
    ).run()
  }

  await c.env.DB.prepare(
    `INSERT INTO practice_record
      (id, session_id, question_id, word_id, question_type, prompt, correct_answer,
       user_answer, is_correct, duration, answered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid('r'),
    body.sessionId,
    planned.questionId || null,
    word.id,
    type,
    body.prompt || planned.stem || planned.prompt,
    correctAnswer,
    body.answer,
    isCorrect ? 1 : 0,
    body.durationMs,
    now.toISOString(),
  ).run()

  await c.env.DB.prepare(
    `UPDATE practice_session SET correct_count = correct_count + ?,
       duration_ms = duration_ms + ?
     WHERE id = ?`,
  ).bind(isCorrect ? 1 : 0, body.durationMs, body.sessionId).run()

  return c.json({
    isCorrect,
    correctAnswer,
    explanation,
    mastery: masteryToApi(update),
  })
})

student.post('/practice/sessions/:id/finish', async (c) => {
  const user = c.get('user')
  const session = await c.env.DB.prepare(
    `SELECT id, unit_id, start_time, end_time, total_count, correct_count, duration_ms
     FROM practice_session WHERE id = ? AND user_id = ?`,
  ).bind(c.req.param('id'), user.id).first<{
    id: string
    unit_id: string | null
    start_time: string
    end_time: string | null
    total_count: number
    correct_count: number
    duration_ms: number
  }>()
  if (!session) return c.json({ error: '练习不存在' }, 404)

  let incentiveEvents = 0
  let totalCount = session.total_count
  let correctCount = session.correct_count
  let durationMs = session.duration_ms

  if (!session.end_time) {
    const stats = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct,
         COALESCE(SUM(duration), 0) AS duration
       FROM practice_record WHERE session_id = ?`,
    ).bind(session.id).first<{ total: number; correct: number; duration: number }>()
    totalCount = stats?.total || session.total_count
    correctCount = stats?.correct || session.correct_count
    durationMs = Date.now() - new Date(session.start_time).getTime()
    await c.env.DB.prepare(
      `UPDATE practice_session SET end_time = ?, total_count = ?, correct_count = ?,
         duration_ms = ? WHERE id = ?`,
    ).bind(nowIso(), totalCount, correctCount, durationMs, session.id).run()
    incentiveEvents = await checkIncentives(c.env, user.id, session.id, session.unit_id)
  }

  const { results: words } = await c.env.DB.prepare(
    `SELECT w.spelling, MAX(pr.is_correct) AS is_correct
     FROM practice_record pr JOIN word w ON w.id = pr.word_id
     WHERE pr.session_id = ? GROUP BY w.id`,
  ).bind(session.id).all<{ spelling: string; is_correct: number }>()

  return c.json({
    sessionId: session.id,
    totalCount,
    correctCount,
    accuracy: totalCount ? Math.round((correctCount / totalCount) * 100) : 0,
    durationMs,
    correctWords: (words || []).filter((word) => word.is_correct === 1).map((word) => word.spelling),
    wrongWords: (words || []).filter((word) => word.is_correct !== 1).map((word) => word.spelling),
    incentiveEvents,
  })
})

student.get('/progress', async (c) => {
  const user = c.get('user')
  let textbookId = c.req.query('textbookId')
  if (!textbookId) {
    const rows = await getTextbookProgress(c.env, user.id)
    textbookId = rows[0]?.id
  }
  if (!textbookId) return c.json({ error: '暂无可用课本' }, 404)
  const textbook = (await getTextbookProgress(c.env, user.id)).find((row) => row.id === textbookId)
  if (!textbook) return c.json({ error: '课本不存在' }, 404)

  const units = (await getUnitProgress(c.env, user.id, textbookId)).map((row) => ({
    ...toUnit(row),
    weakWords: row.weak_words,
    lastStudiedAt: row.last_studied_at,
  }))

  const { results: weakRows } = await c.env.DB.prepare(
    `SELECT ${WORD_COLUMNS}, ${MASTERY_COLUMNS}
     FROM word_mastery wm
     JOIN word w ON w.id = wm.word_id AND w.enabled = 1
     JOIN unit_word uw ON uw.word_id = w.id AND uw.enabled = 1
     JOIN unit u ON u.id = uw.unit_id
     WHERE wm.user_id = ? AND wm.is_weak = 1 AND u.textbook_id = ?
     GROUP BY w.id
     ORDER BY wm.accuracy ASC, wm.consecutive_wrong DESC
     LIMIT 50`,
  ).bind(user.id, textbookId).all<JoinedWordRow>()

  return c.json({
    textbook,
    units,
    weakWords: (weakRows || []).map(mapJoinedWord),
    calendar: await getCalendar(c.env, user.id, 30),
  })
})

student.get('/rewards', async (c) => {
  const user = c.get('user')
  const { results: families } = await c.env.DB.prepare(
    `SELECT fm.family_id, f.parent_user_id, u.nickname AS parent_name
     FROM family_member fm
     JOIN family f ON f.id = fm.family_id
     JOIN user u ON u.id = f.parent_user_id
     WHERE fm.student_user_id = ? AND fm.status = 'active' AND fm.enabled = 1`,
  ).bind(user.id).all<{ family_id: string; parent_user_id: string; parent_name: string }>()

  const familyIds = (families || []).map((row) => row.family_id)
  let rules: Array<Record<string, unknown>> = []
  let events: Array<Record<string, unknown>> = []
  if (familyIds.length) {
    const placeholders = familyIds.map(() => '?').join(',')
    const { results: ruleRows } = await c.env.DB.prepare(
      `SELECT * FROM incentive_rule WHERE family_id IN (${placeholders}) AND enabled = 1
       ORDER BY created_at DESC`,
    ).bind(...familyIds).all<Record<string, unknown>>()
    const { results: eventRows } = await c.env.DB.prepare(
      `SELECT * FROM incentive_event WHERE student_user_id = ?
       ORDER BY triggered_at DESC LIMIT 100`,
    ).bind(user.id).all<Record<string, unknown>>()
    rules = ruleRows || []
    events = eventRows || []
  }

  const { results: invites } = await c.env.DB.prepare(
    `SELECT fm.id, fm.family_id, u.nickname AS parent_name, fm.relation, fm.created_at
     FROM family_member fm
     JOIN family f ON f.id = fm.family_id
     JOIN user u ON u.id = f.parent_user_id
     WHERE fm.student_user_id = ? AND fm.status = 'pending'
     ORDER BY fm.created_at DESC`,
  ).bind(user.id).all<{
    id: string
    family_id: string
    parent_name: string
    relation: string
    created_at: string
  }>()

  const normalizedEvents = events.map((row) => ({
    id: row.id as string,
    familyId: row.family_id as string,
    studentUserId: row.student_user_id as string,
    ruleId: row.rule_id as string,
    triggerType: row.trigger_type as string,
    triggerParams: safeJson(row.trigger_params as string, {}),
    rewardDescription: row.reward_description as string,
    triggeredAt: row.triggered_at as string,
    status: row.status as string,
    confirmedAt: (row.confirmed_at as string) || null,
    redeemedAt: (row.redeemed_at as string) || null,
    note: (row.note as string) || null,
  }))

  const counts = {
    pending_confirm: normalizedEvents.filter((ev) => ev.status === 'pending_confirm').length,
    pending_redeem: normalizedEvents.filter((ev) => ev.status === 'pending_redeem').length,
    redeemed: normalizedEvents.filter((ev) => ev.status === 'redeemed').length,
    revoked: normalizedEvents.filter((ev) => ev.status === 'revoked').length,
  }

  return c.json({
    rules: rules.map((row) => ({
      id: row.id,
      familyId: row.family_id,
      triggerType: row.trigger_type,
      triggerParams: safeJson(row.trigger_params as string, {}),
      rewardDescription: row.reward_description,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
    })),
    events: normalizedEvents,
    invites: (invites || []).map((row) => ({
      id: row.id,
      familyId: row.family_id,
      parentName: row.parent_name,
      relation: row.relation,
      createdAt: row.created_at,
    })),
    counts,
  })
})

export default student
