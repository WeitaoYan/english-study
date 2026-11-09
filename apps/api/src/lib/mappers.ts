import type {
  Collocation,
  ExampleSentence,
  Mastery,
  QuestionType,
  Word,
  WordWithMastery,
} from '@english-study/shared'
import type { MasteryRow, WordRow } from '../types'
import { bool, safeJson } from './utils'

export function mapWord(row: WordRow): Word {
  return {
    id: row.id,
    spelling: row.spelling,
    phonetic: row.phonetic,
    pos: row.pos,
    chineseDef: row.chinese_def,
    englishDef: row.english_def,
    difficulty: row.difficulty,
    hasImage: bool(row.has_image),
    imageId: row.image_id,
    imageUrl: row.image_url || null,
    imageStatus: (row.image_status as Word['imageStatus']) || null,
    enabled: bool(row.enabled),
    examples: safeJson<ExampleSentence[]>(row.examples, []),
    collocations: safeJson<Collocation[]>(row.collocations, []),
    audioUrl: row.audio_url || null,
  }
}

export function mapMastery(row: MasteryRow | null | undefined): Mastery | null {
  if (!row) return null
  return {
    strength: row.strength,
    nextReviewTime: row.next_review_time,
    lastReviewTime: row.last_review_time,
    consecutiveCorrect: row.consecutive_correct,
    consecutiveWrong: row.consecutive_wrong,
    accuracy: row.accuracy,
    isWeak: bool(row.is_weak),
    recentResults: safeJson<boolean[]>(row.recent_results, []).map(Boolean),
    totalAttempts: row.total_attempts,
  }
}

export function mapWordWithMastery(word: WordRow, mastery: MasteryRow | null): WordWithMastery {
  return {
    ...mapWord(word),
    mastery: mapMastery(mastery),
  }
}

export function isQuestionType(value: string): value is QuestionType {
  return [
    'definition_choice',
    'letter_fill',
    'sentence_fill',
    'image_choice',
    'audio_choice',
    'pronunciation_choice',
    'collocation_choice',
  ].includes(value)
}
