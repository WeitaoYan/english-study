import type { IncentiveTrigger } from '@english-study/shared'
import type { Env } from '../types'
import { dateKeyInCN, nowIso, safeJson, startOfCNWeek, uuid, weekKeyInCN } from './utils'

interface RuleRow {
  id: string
  family_id: string
  trigger_type: IncentiveTrigger
  trigger_params: string
  reward_description: string
}

interface Evaluation {
  met: boolean
  periodKey: string
}

async function evaluateRule(
  env: Env,
  rule: RuleRow,
  studentId: string,
  sessionId: string,
  unitId: string | null,
): Promise<Evaluation | null> {
  const params = safeJson<Record<string, string | number | boolean>>(rule.trigger_params, {})
  const today = dateKeyInCN()
  const weekKey = weekKeyInCN()

  if (rule.trigger_type === 'unit_complete') {
    const targetUnit = String(params.unitId || unitId || '')
    if (!targetUnit) return null
    const minStrength = Number(params.minStrength ?? 1)
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN wm.strength >= ? THEN 1 ELSE 0 END) AS done
       FROM unit_word uw
       JOIN word w ON w.id = uw.word_id AND w.enabled = 1
       LEFT JOIN word_mastery wm ON wm.word_id = w.id AND wm.user_id = ?
       WHERE uw.unit_id = ? AND uw.enabled = 1`,
    ).bind(minStrength, studentId, targetUnit).first<{ total: number; done: number | null }>()
    return {
      met: Boolean(row && row.total > 0 && (row.done || 0) >= row.total),
      periodKey: `unit:${targetUnit}`,
    }
  }

  if (rule.trigger_type === 'streak_days') {
    const targetDays = Number(params.days ?? 7)
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT date(pr.answered_at, '+8 hours') AS day
       FROM practice_record pr
       JOIN practice_session ps ON ps.id = pr.session_id
       WHERE ps.user_id = ?
       ORDER BY day DESC
       LIMIT 120`,
    ).bind(studentId).all<{ day: string }>()
    const days = new Set((results || []).map((row) => row.day))
    let streak = 0
    const cursor = new Date(`${today}T00:00:00Z`)
    const previous = () => {
      cursor.setUTCDate(cursor.getUTCDate() - 1)
      return cursor.toISOString().slice(0, 10)
    }
    while (days.has(cursor.toISOString().slice(0, 10))) {
      streak += 1
      previous()
    }
    if (streak === 0) {
      previous()
      while (days.has(cursor.toISOString().slice(0, 10))) {
        streak += 1
        previous()
      }
    }
    return { met: streak >= targetDays, periodKey: `streak:${targetDays}` }
  }

  if (rule.trigger_type === 'daily_accuracy') {
    const minAnswers = Number(params.minAnswers ?? 10)
    const target = Number(params.accuracy ?? 80)
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(pr.is_correct), 0) AS correct
       FROM practice_record pr
       JOIN practice_session ps ON ps.id = pr.session_id
       WHERE ps.user_id = ? AND date(pr.answered_at, '+8 hours') = ?`,
    ).bind(studentId, today).first<{ total: number; correct: number }>()
    const accuracy = row && row.total ? (row.correct / row.total) * 100 : 0
    return {
      met: Boolean(row && row.total >= minAnswers && accuracy >= target),
      periodKey: `day:${today}`,
    }
  }

  if (rule.trigger_type === 'weekly_wrong_lt') {
    const minAnswers = Number(params.minAnswers ?? 20)
    const wrongLimit = Number(params.wrongLimit ?? 5)
    const weekStart = startOfCNWeek().toISOString()
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT CASE WHEN pr.is_correct = 0 THEN pr.word_id END) AS wrong_words
       FROM practice_record pr
       JOIN practice_session ps ON ps.id = pr.session_id
       WHERE ps.user_id = ? AND pr.answered_at >= ?`,
    ).bind(studentId, weekStart).first<{ total: number; wrong_words: number }>()
    return {
      met: Boolean(row && row.total >= minAnswers && row.wrong_words < wrongLimit),
      periodKey: `week:${weekKey}`,
    }
  }

  if (rule.trigger_type === 'review_count') {
    const target = Number(params.count ?? 20)
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM practice_record pr
       JOIN practice_session ps ON ps.id = pr.session_id
       WHERE ps.user_id = ? AND ps.mode = 'review'
         AND date(pr.answered_at, '+8 hours') = ?`,
    ).bind(studentId, today).first<{ total: number }>()
    return {
      met: Boolean(row && row.total >= target),
      periodKey: `day:${today}`,
    }
  }

  return null
}

export async function checkIncentives(
  env: Env,
  studentId: string,
  sessionId: string,
  unitId: string | null,
): Promise<number> {
  const { results: memberships } = await env.DB.prepare(
    `SELECT family_id FROM family_member
     WHERE student_user_id = ? AND status = 'active' AND enabled = 1`,
  ).bind(studentId).all<{ family_id: string }>()
  if (!memberships?.length) return 0

  let created = 0
  for (const membership of memberships) {
    const { results: rules } = await env.DB.prepare(
      `SELECT id, family_id, trigger_type, trigger_params, reward_description
       FROM incentive_rule WHERE family_id = ? AND enabled = 1`,
    ).bind(membership.family_id).all<RuleRow>()

    for (const rule of rules || []) {
      const evaluation = await evaluateRule(env, rule, studentId, sessionId, unitId)
      if (!evaluation?.met) continue
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO incentive_event
          (id, family_id, student_user_id, rule_id, trigger_type, trigger_params,
           reward_description, period_key, triggered_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirm')`,
      ).bind(
        uuid('ev'),
        rule.family_id,
        studentId,
        rule.id,
        rule.trigger_type,
        rule.trigger_params,
        rule.reward_description,
        evaluation.periodKey,
        nowIso(),
      ).run()
      if (result.meta.changes > 0) created += 1
    }
  }
  return created
}
