import type { Unit } from '@english-study/shared'
import type { Env, MasteryRow, WordRow } from '../types'
import { mapWord, mapMastery } from './mappers'
import { bool, safeJson } from './utils'

export interface JoinedWordRow extends WordRow {
  unit_id: string | null
  wm_id: string | null
  wm_strength: number | null
  wm_next_review_time: string | null
  wm_last_review_time: string | null
  wm_consecutive_correct: number | null
  wm_consecutive_wrong: number | null
  wm_accuracy: number | null
  wm_is_weak: number | null
  wm_recent_results: string | null
  wm_total_attempts: number | null
  wm_correct_attempts: number | null
  wm_updated_at: string | null
}

export const WORD_COLUMNS = `
  w.*,
  (SELECT uw2.unit_id FROM unit_word uw2
    WHERE uw2.word_id = w.id AND uw2.enabled = 1
    ORDER BY uw2.sort_order LIMIT 1) AS unit_id,
  (SELECT wi.image_url FROM word_image wi
    WHERE wi.word_id = w.id AND wi.status = 'approved'
    ORDER BY wi.created_at DESC LIMIT 1) AS image_url,
  CASE WHEN EXISTS (
    SELECT 1 FROM word_image wi2 WHERE wi2.word_id = w.id AND wi2.status = 'approved'
  ) THEN 'approved' ELSE NULL END AS image_status,
  (SELECT wa.audio_url FROM word_audio wa
    WHERE wa.word_id = w.id ORDER BY wa.created_at DESC LIMIT 1) AS audio_url
`

export const MASTERY_COLUMNS = `
  wm.id AS wm_id,
  wm.strength AS wm_strength,
  wm.next_review_time AS wm_next_review_time,
  wm.last_review_time AS wm_last_review_time,
  wm.consecutive_correct AS wm_consecutive_correct,
  wm.consecutive_wrong AS wm_consecutive_wrong,
  wm.accuracy AS wm_accuracy,
  wm.is_weak AS wm_is_weak,
  wm.recent_results AS wm_recent_results,
  wm.total_attempts AS wm_total_attempts,
  wm.correct_attempts AS wm_correct_attempts,
  wm.updated_at AS wm_updated_at
`

export function masteryFromJoined(row: JoinedWordRow): MasteryRow | null {
  if (!row.wm_id) return null
  return {
    id: row.wm_id,
    user_id: '',
    word_id: row.id,
    strength: row.wm_strength ?? 0,
    next_review_time: row.wm_next_review_time,
    last_review_time: row.wm_last_review_time,
    consecutive_correct: row.wm_consecutive_correct ?? 0,
    consecutive_wrong: row.wm_consecutive_wrong ?? 0,
    accuracy: row.wm_accuracy ?? 0,
    is_weak: row.wm_is_weak ?? 0,
    recent_results: row.wm_recent_results || '[]',
    total_attempts: row.wm_total_attempts ?? 0,
    correct_attempts: row.wm_correct_attempts ?? 0,
    updated_at: row.wm_updated_at || '',
  }
}

export function mapJoinedWord(row: JoinedWordRow) {
  return {
    ...mapWord(row),
    mastery: mapMastery(masteryFromJoined(row)),
  }
}

export async function getWordsForUnit(
  env: Env,
  userId: string,
  unitId: string,
): Promise<JoinedWordRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${WORD_COLUMNS}, ${MASTERY_COLUMNS}
     FROM unit_word uw
     JOIN word w ON w.id = uw.word_id AND w.enabled = 1
     LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
     WHERE uw.unit_id = ? AND uw.enabled = 1
     ORDER BY uw.sort_order, w.spelling`,
  ).bind(userId, unitId).all<JoinedWordRow>()
  return results || []
}

export async function getWordsForUnits(
  env: Env,
  userId: string,
  unitIds: string[],
): Promise<Map<string, JoinedWordRow[]>> {
  const map = new Map<string, JoinedWordRow[]>()
  if (!unitIds.length) return map
  const placeholders = unitIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT ${WORD_COLUMNS}, ${MASTERY_COLUMNS}
     FROM unit_word uw
     JOIN word w ON w.id = uw.word_id AND w.enabled = 1
     LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
     WHERE uw.unit_id IN (${placeholders}) AND uw.enabled = 1
     ORDER BY uw.unit_id, uw.sort_order, w.spelling`,
  ).bind(userId, ...unitIds).all<JoinedWordRow & { unit_id: string }>()
  for (const row of results || []) {
    const list = map.get(row.unit_id) || []
    list.push(row)
    map.set(row.unit_id, list)
  }
  return map
}

export async function getWordById(
  env: Env,
  userId: string,
  wordId: string,
): Promise<JoinedWordRow | null> {
  return env.DB.prepare(
    `SELECT ${WORD_COLUMNS}, ${MASTERY_COLUMNS}
     FROM word w
     LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
     WHERE w.id = ?`,
  ).bind(userId, wordId).first<JoinedWordRow>()
}

export interface TextbookRow {
  id: string
  name: string
  version: string
  grade: string
  semester: string
  status: 'draft' | 'published' | 'archived'
  cover_color: string
  created_at: string
  updated_at: string
}

export interface UnitProgressRow {
  id: string
  textbook_id: string
  unit_no: number
  unit_name: string
  sort_order: number
  word_count: number
  learned_words: number
  mastered_words: number
  due_count: number
  weak_words: number
  last_studied_at: string | null
}

export async function getTextbookProgress(env: Env, userId: string) {
  const now = new Date().toISOString()
  const { results: textbooks } = await env.DB.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM unit u WHERE u.textbook_id = t.id) AS unit_count
     FROM textbook t
     WHERE t.status = 'published'
     ORDER BY
       CASE t.grade
         WHEN '一年级' THEN 1 WHEN '二年级' THEN 2 WHEN '三年级' THEN 3
         WHEN '四年级' THEN 4 WHEN '五年级' THEN 5 WHEN '六年级' THEN 6
         WHEN '七年级' THEN 7 WHEN '八年级' THEN 8 WHEN '九年级' THEN 9
         ELSE 10 END,
       CASE t.semester WHEN '上册' THEN 1 ELSE 2 END,
       t.name`,
  ).all<TextbookRow & { unit_count: number }>()

  const { results: progress } = await env.DB.prepare(
    `SELECT u.textbook_id,
       COUNT(DISTINCT uw.word_id) AS word_count,
       COUNT(DISTINCT CASE WHEN wm.id IS NOT NULL THEN uw.word_id END) AS learned_words,
       COUNT(DISTINCT CASE WHEN wm.strength >= 3 THEN uw.word_id END) AS mastered_words,
       COUNT(DISTINCT CASE WHEN wm.is_weak = 1 OR (wm.next_review_time IS NOT NULL AND wm.next_review_time <= ?)
         THEN uw.word_id END) AS due_count
     FROM unit u
     JOIN unit_word uw ON uw.unit_id = u.id AND uw.enabled = 1
     JOIN word w ON w.id = uw.word_id AND w.enabled = 1
     LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
     GROUP BY u.textbook_id`,
  ).bind(now, userId).all<{
    textbook_id: string
    word_count: number
    learned_words: number
    mastered_words: number
    due_count: number
  }>()

  const byId = new Map((progress || []).map((row) => [row.textbook_id, row]))
  return (textbooks || []).map((row) => {
    const stats = byId.get(row.id)
    const wordCount = stats?.word_count || 0
    const learned = stats?.learned_words || 0
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      grade: row.grade,
      semester: row.semester,
      status: row.status,
      coverColor: row.cover_color,
      unitCount: row.unit_count,
      wordCount,
      learnedWords: learned,
      masteredWords: stats?.mastered_words || 0,
      dueCount: stats?.due_count || 0,
      progress: wordCount ? Math.round((learned / wordCount) * 100) : 0,
    }
  })
}

export async function getUnitProgress(
  env: Env,
  userId: string,
  textbookId: string,
): Promise<UnitProgressRow[]> {
  const now = new Date().toISOString()
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.textbook_id, u.unit_no, u.unit_name, u.sort_order,
       COUNT(DISTINCT uw.word_id) AS word_count,
       COUNT(DISTINCT CASE WHEN wm.id IS NOT NULL THEN uw.word_id END) AS learned_words,
       COUNT(DISTINCT CASE WHEN wm.strength >= 3 THEN uw.word_id END) AS mastered_words,
       COUNT(DISTINCT CASE WHEN wm.is_weak = 1 OR (wm.next_review_time IS NOT NULL AND wm.next_review_time <= ?)
         THEN uw.word_id END) AS due_count,
       COUNT(DISTINCT CASE WHEN wm.is_weak = 1 THEN uw.word_id END) AS weak_words,
       MAX(wm.updated_at) AS last_studied_at
     FROM unit u
     LEFT JOIN unit_word uw ON uw.unit_id = u.id AND uw.enabled = 1
     LEFT JOIN word w ON w.id = uw.word_id AND w.enabled = 1
     LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
     WHERE u.textbook_id = ?
     GROUP BY u.id
     ORDER BY u.sort_order, u.unit_no`,
  ).bind(now, userId, textbookId).all<UnitProgressRow>()
  return results || []
}

export function toUnit(row: UnitProgressRow): Unit {
  return {
    id: row.id,
    textbookId: row.textbook_id,
    unitNo: row.unit_no,
    unitName: row.unit_name,
    sortOrder: row.sort_order,
    wordCount: row.word_count,
    learnedWords: row.learned_words,
    masteredWords: row.mastered_words,
    dueCount: row.due_count,
    progress: row.word_count ? Math.round((row.learned_words / row.word_count) * 100) : 0,
  }
}

export async function getCalendar(env: Env, userId: string, days = 30) {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const startKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start)
  const { results } = await env.DB.prepare(
    `SELECT date(pr.answered_at, '+8 hours') AS day,
       COUNT(*) AS answered,
       COALESCE(SUM(pr.is_correct), 0) AS correct,
       COALESCE(SUM(pr.duration), 0) AS duration_ms
     FROM practice_record pr
     JOIN practice_session ps ON ps.id = pr.session_id
     WHERE ps.user_id = ? AND date(pr.answered_at, '+8 hours') >= ?
     GROUP BY day
     ORDER BY day`,
  ).bind(userId, startKey).all<{
    day: string
    answered: number
    correct: number
    duration_ms: number
  }>()
  const byDay = new Map((results || []).map((row) => [row.day, row]))
  const calendar = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - i)
    const key = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
    const row = byDay.get(key)
    calendar.push({
      date: key,
      answered: row?.answered || 0,
      correct: row?.correct || 0,
      minutes: row ? Math.round((row.duration_ms / 60000) * 10) / 10 : 0,
    })
  }
  return calendar
}

export function currentStreak(calendar: Array<{ date: string; answered: number }>): number {
  let streak = 0
  for (let i = calendar.length - 1; i >= 0; i--) {
    if ((calendar[i]?.answered || 0) > 0) streak += 1
    else break
  }
  return streak
}

export function joinedRecentResults(row: JoinedWordRow): boolean[] {
  return safeJson<boolean[]>(row.wm_recent_results, []).map(Boolean)
}

export function joinedHasImage(row: JoinedWordRow): boolean {
  return bool(row.has_image) && Boolean(row.image_url)
}
