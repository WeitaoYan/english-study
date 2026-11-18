import type { QuestionAbility, QuestionType } from '@english-study/shared'
import { QUESTION_TYPE_ABILITY } from '@english-study/shared'
import type { AppEnv } from '../types'

export interface MistakeWordRow {
  wordId: string
  spelling: string
  chineseDef: string
  type: QuestionType
  ability: QuestionAbility
  wrong: number
}

/**
 * 家长报告“错在哪里”里每种题型错得最多的 3 个词。
 * 与 parent.ts 的 typeErrorRows 用同一条查询、同一窗口、同一排序
 * （错次倒序、同错次按拼写正序，每题型取前 3），保证重练词单与报告一致。
 * 搭配题不归入任何能力维度，报告里也不展示，这里同样排除。
 */
export async function getTopErrorWords(
  env: AppEnv['Bindings'],
  studentId: string,
  days = 7,
): Promise<MistakeWordRow[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { results } = await env.DB.prepare(
    `SELECT pr.word_id AS word_id, pr.question_type, w.spelling, w.chinese_def, COUNT(*) AS wrong
     FROM practice_record pr
     JOIN practice_session ps ON ps.id = pr.session_id
     JOIN word w ON w.id = pr.word_id
     WHERE ps.user_id = ? AND pr.is_correct = 0 AND pr.answered_at >= ?
     GROUP BY pr.question_type, pr.word_id
     ORDER BY wrong DESC, w.spelling ASC
     LIMIT 60`,
  ).bind(studentId, since).all<{
    word_id: string
    question_type: QuestionType
    spelling: string
    chinese_def: string
    wrong: number
  }>()

  // 每种题型只留前 3（查询已按错次排好序，顺序遍历即是名次）。
  const topByType = new Map<string, MistakeWordRow[]>()
  for (const row of results || []) {
    const ability = QUESTION_TYPE_ABILITY[row.question_type]
    if (!ability) continue
    const list = topByType.get(row.question_type) || []
    if (list.length >= 3) continue
    list.push({
      wordId: row.word_id,
      spelling: row.spelling,
      chineseDef: row.chinese_def,
      type: row.question_type,
      ability,
      wrong: row.wrong,
    })
    topByType.set(row.question_type, list)
  }

  // 能力维度顺序：听力 → 拼写 → 词义；维度内按错次倒序。
  const abilityOrder: QuestionAbility[] = ['listening', 'spelling', 'meaning']
  return [...topByType.values()]
    .flat()
    .sort(
      (a, b) =>
        abilityOrder.indexOf(a.ability) - abilityOrder.indexOf(b.ability) ||
        b.wrong - a.wrong ||
        a.spelling.localeCompare(b.spelling),
    )
}
