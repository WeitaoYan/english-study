import type { Role } from '@english-study/shared'

export interface Env {
  DB: D1Database
  IMAGES?: R2Bucket
  JWT_SECRET: string
  APP_ENV?: string
  COOKIE_DOMAIN?: string
  CORS_ORIGINS?: string
}

export interface AuthUser {
  id: string
  role: Role
  nickname: string
  phone: string | null
  email: string | null
  enabled: boolean
  switchedFromParent?: { id: string; nickname: string } | null
}

export type AppEnv = {
  Bindings: Env
  Variables: {
    user: AuthUser
  }
}

export interface UserRow {
  id: string
  role: Role
  nickname: string
  phone: string | null
  email: string | null
  password_hash: string
  parent_id: string | null
  enabled: number
  created_at: string
}

export interface WordRow {
  id: string
  spelling: string
  phonetic: string | null
  pos: string | null
  chinese_def: string
  english_def: string | null
  difficulty: number
  data_source: string | null
  has_image: number
  image_id: string | null
  enabled: number
  examples: string
  collocations: string
  image_url?: string | null
  image_status?: string | null
  audio_url?: string | null
  tts_status?: string | null
  tts_review_note?: string | null
  tts_reviewed_at?: string | null
  unit_id?: string | null
}

export interface MasteryRow {
  id: string
  user_id: string
  word_id: string
  strength: number
  next_review_time: string | null
  last_review_time: string | null
  consecutive_correct: number
  consecutive_wrong: number
  accuracy: number
  is_weak: number
  recent_results: string
  total_attempts: number
  correct_attempts: number
  updated_at: string
}
