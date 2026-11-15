import type { AppEnv } from '../types'
import { safeJson } from './utils'

// 把套题的 unit_ids 解析成单元信息（带课本名与每单元词数），一次查完所有套题的单元。
// 家长列表与学生列表共用。
export async function enrichSpecialPractices(
  env: AppEnv['Bindings'],
  rows: { id: string; title: string; question_type: string; unit_ids: string; question_count: number; created_at: string }[],
) {
  const allUnitIds = [...new Set(rows.flatMap((row) => safeJson<string[]>(row.unit_ids, [])))]
  const unitMap = new Map<string, { id: string; unitNo: number; unitName: string; textbookName: string; wordCount: number }>()
  for (let i = 0; i < allUnitIds.length; i += 100) {
    const chunk = allUnitIds.slice(i, i + 100)
    const placeholders = chunk.map(() => '?').join(',')
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.unit_no, u.unit_name, t.name AS textbook_name,
         COUNT(uw.word_id) AS word_count
       FROM unit u JOIN textbook t ON t.id = u.textbook_id
       LEFT JOIN unit_word uw ON uw.unit_id = u.id AND uw.enabled = 1
       WHERE u.id IN (${placeholders})
       GROUP BY u.id, u.unit_no, u.unit_name, t.name`,
    ).bind(...chunk).all<{ id: string; unit_no: number; unit_name: string; textbook_name: string; word_count: number }>()
    for (const row of results || []) {
      unitMap.set(row.id, { id: row.id, unitNo: row.unit_no, unitName: row.unit_name, textbookName: row.textbook_name, wordCount: row.word_count })
    }
  }
  return rows.map((row) => {
    const unitIds = safeJson<string[]>(row.unit_ids, [])
    const units = unitIds.map((id) => unitMap.get(id)).filter((u): u is NonNullable<typeof u> => !!u)
    return {
      id: row.id,
      title: row.title,
      questionType: row.question_type,
      questionCount: row.question_count,
      createdAt: row.created_at,
      units: units.map((u) => ({ id: u.id, unitNo: u.unitNo, unitName: u.unitName, textbookName: u.textbookName })),
      wordCount: units.reduce((sum, u) => sum + u.wordCount, 0),
    }
  })
}

export interface SpecialPracticeRow {
  id: string
  parent_user_id: string
  student_user_id: string
  title: string
  question_type: string
  unit_ids: string
  question_count: number
  created_at: string
  updated_at: string
}

// 取一套专项练习（学生开局用）：须属于该学生，否则当不存在。
export async function getSpecialPracticeForStudent(
  env: AppEnv['Bindings'],
  studentId: string,
  setId: string,
): Promise<SpecialPracticeRow | null> {
  return env.DB.prepare(
    `SELECT * FROM special_practice WHERE id = ? AND student_user_id = ?`,
  ).bind(setId, studentId).first<SpecialPracticeRow>()
}
