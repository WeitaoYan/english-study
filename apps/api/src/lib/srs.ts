import type { Mastery } from '@english-study/shared'
import type { MasteryRow } from '../types'
import { clamp, safeJson } from './utils'

const INTERVAL_DAYS = [1, 1, 3, 7, 15, 30]

export interface MasteryUpdate {
  strength: number
  nextReviewTime: string
  lastReviewTime: string
  consecutiveCorrect: number
  consecutiveWrong: number
  accuracy: number
  isWeak: boolean
  recentResults: boolean[]
  totalAttempts: number
  correctAttempts: number
}

export function computeMastery(
  existing: MasteryRow | null,
  isCorrect: boolean,
  now = new Date(),
): MasteryUpdate {
  const recent = safeJson<boolean[]>(existing?.recent_results, []).map(Boolean)
  recent.push(isCorrect)
  const window = recent.slice(-7)
  const accuracy = window.length ? window.filter(Boolean).length / window.length : 0

  let strength = existing?.strength ?? 0
  let consecutiveCorrect = existing?.consecutive_correct ?? 0
  let consecutiveWrong = existing?.consecutive_wrong ?? 0

  if (isCorrect) {
    strength = clamp(strength + 1, 0, 5)
    consecutiveCorrect += 1
    consecutiveWrong = 0
    if (consecutiveCorrect > 0 && consecutiveCorrect % 3 === 0) {
      strength = clamp(strength + 1, 0, 5)
    }
  } else {
    strength = clamp(strength - 2, 0, 5)
    consecutiveCorrect = 0
    consecutiveWrong += 1
  }

  const isWeak = (window.length >= 3 && accuracy < 0.5) || consecutiveWrong >= 2
  const interval = INTERVAL_DAYS[strength] ?? 1
  const next = new Date(now.getTime() + interval * 86400000)

  return {
    strength,
    nextReviewTime: next.toISOString(),
    lastReviewTime: now.toISOString(),
    consecutiveCorrect,
    consecutiveWrong,
    accuracy,
    isWeak,
    recentResults: window,
    totalAttempts: (existing?.total_attempts ?? 0) + 1,
    correctAttempts: (existing?.correct_attempts ?? 0) + (isCorrect ? 1 : 0),
  }
}

export function masteryToApi(update: MasteryUpdate): Mastery {
  return {
    strength: update.strength,
    nextReviewTime: update.nextReviewTime,
    lastReviewTime: update.lastReviewTime,
    consecutiveCorrect: update.consecutiveCorrect,
    consecutiveWrong: update.consecutiveWrong,
    accuracy: update.accuracy,
    isWeak: update.isWeak,
    recentResults: update.recentResults,
    totalAttempts: update.totalAttempts,
  }
}

export function strengthLabel(strength: number): string {
  return ['初识', '熟悉', '掌握', '稳固', '熟练', '精通'][strength] || '初识'
}

export function intervalLabel(strength: number): string {
  const days = INTERVAL_DAYS[strength] ?? 1
  return days === 1 ? '明天' : `${days} 天后`
}
