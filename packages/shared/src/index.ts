export type Role = 'student' | 'parent' | 'admin'

export type QuestionType =
  | 'definition_choice'
  | 'letter_fill'
  | 'sentence_fill'
  | 'image_choice'
  | 'audio_choice'
  | 'collocation_choice'

export type IncentiveTrigger =
  | 'unit_complete'
  | 'streak_days'
  | 'daily_accuracy'
  | 'weekly_wrong_lt'
  | 'review_count'

export type IncentiveStatus =
  | 'pending_confirm'
  | 'pending_redeem'
  | 'redeemed'
  | 'revoked'

export interface UserSummary {
  id: string
  role: Role
  nickname: string
  /** 家长创建的孩子账号没有邮箱，email 为 null，且没有直接登录方式。 */
  email: string | null
  enabled: boolean
  /** 家长切换到孩子视角时才有值：切回家长身份必须验证该家长的密码。 */
  switchedFromParent?: { id: string; nickname: string } | null
}

export interface AuthResponse {
  user: UserSummary
}

export interface ExampleSentence {
  en: string
  zh?: string
}

export interface Collocation {
  phrase: string
  zh?: string
}

/** TTS 发音审核状态，与图片审核对齐：默认待审核，只有已通过才可出听音题。 */
export type TtsStatus = 'pending' | 'approved' | 'rejected'

export interface Word {
  id: string
  spelling: string
  phonetic: string | null
  pos: string | null
  chineseDef: string
  englishDef: string | null
  difficulty: number
  hasImage: boolean
  imageId: string | null
  imageUrl: string | null
  imageStatus: 'pending' | 'approved' | 'rejected' | null
  enabled: boolean
  examples: ExampleSentence[]
  collocations: Collocation[]
  audioUrl: string | null
  ttsStatus: TtsStatus
  ttsReviewNote: string | null
  ttsReviewedAt: string | null
}

export interface Mastery {
  strength: number
  nextReviewTime: string | null
  lastReviewTime: string | null
  consecutiveCorrect: number
  consecutiveWrong: number
  accuracy: number
  isWeak: boolean
  recentResults: boolean[]
  totalAttempts: number
}

export interface WordWithMastery extends Word {
  mastery: Mastery | null
  unitId?: string
}

export interface Textbook {
  id: string
  name: string
  version: string
  grade: string
  semester: string
  status: 'draft' | 'published' | 'archived'
  coverColor: string
  unitCount: number
  wordCount: number
  learnedWords: number
  masteredWords: number
  dueCount: number
  progress: number
}

export interface Unit {
  id: string
  textbookId: string
  unitNo: number
  unitName: string
  sortOrder: number
  wordCount: number
  learnedWords: number
  masteredWords: number
  dueCount: number
  progress: number
}

export interface TextbookDetail {
  textbook: Textbook
  units: Unit[]
}

export interface UnitDetail {
  unit: Unit
  textbook: Pick<Textbook, 'id' | 'name' | 'version' | 'grade' | 'semester'>
  words: WordWithMastery[]
}

export interface QuestionPayload {
  key: string
  wordId: string
  type: QuestionType
  typeLabel: string
  prompt: string
  wordSpelling: string
  phonetic: string | null
  pos: string | null
  stem: string | null
  options: string[] | null
  imageUrl: string | null
  audioUrl: string | null
  hint: string | null
  /** 人工题库题目 ID；动态生成的题目为 null，用于答题记录追溯。 */
  questionId?: string | null
}

export interface PracticeSessionPayload {
  sessionId: string
  mode: 'unit' | 'review' | 'word'
  unitId: string | null
  totalCount: number
  questions: QuestionPayload[]
  resumed?: boolean
}

export interface AnswerResult {
  isCorrect: boolean
  correctAnswer: string
  explanation: string
  mastery: Mastery
}

export interface PracticeSummary {
  sessionId: string
  totalCount: number
  correctCount: number
  accuracy: number
  durationMs: number
  correctWords: string[]
  wrongWords: string[]
  incentiveEvents: number
}

export interface ReviewWord extends WordWithMastery {
  reason: 'due' | 'weak' | 'both'
}

export interface ReviewQueue {
  date: string
  words: ReviewWord[]
  weakCount: number
  dueCount: number
}

export interface CalendarDay {
  date: string
  answered: number
  correct: number
  minutes: number
}

export interface StudentDashboard {
  today: {
    answered: number
    correct: number
    accuracy: number
    minutes: number
    newWords: number
    reviewedWords: number
  }
  totals: {
    learnedWords: number
    masteredWords: number
    weakWords: number
    dueToday: number
    streakDays: number
  }
  textbooks: Textbook[]
  recentSessions: Array<{
    id: string
    mode: string
    unitName: string | null
    textbookName: string | null
    finishedAt: string | null
    totalCount: number
    correctCount: number
  }>
  calendar: CalendarDay[]
}

export interface ProgressUnit extends Unit {
  weakWords: number
  lastStudiedAt: string | null
}

export interface ProgressOverview {
  textbook: Textbook
  units: ProgressUnit[]
  weakWords: WordWithMastery[]
  calendar: CalendarDay[]
}

export interface ChildSummary {
  id: string
  nickname: string
  relation: string
  status: 'pending' | 'active' | 'rejected'
  today: {
    answered: number
    accuracy: number
    minutes: number
  }
  week: {
    answered: number
    newWords: number
    accuracy: number
    activeDays: number
  }
  pendingRewards: number
  weakWords: number
}

export interface TrendPoint {
  date: string
  label: string
  answered: number
  correct: number
  accuracy: number
  minutes: number
}

export interface WeakWordReport {
  id: string
  spelling: string
  chineseDef: string
  phonetic: string | null
  accuracy: number
  totalAttempts: number
  consecutiveWrong: number
  errorTypes: string[]
}

export interface ReviewExplanation {
  wordId: string
  spelling: string
  reason: string
  nextReviewTime: string | null
}

export interface ParentReport {
  child: {
    id: string
    nickname: string
  }
  today: StudentDashboard['today']
  week: {
    answered: number
    correct: number
    accuracy: number
    minutes: number
    newWords: number
    activeDays: number
  }
  units: Array<{
    id: string
    unitName: string
    textbookName: string
    wordCount: number
    learnedWords: number
    masteredWords: number
    progress: number
  }>
  weakWords: WeakWordReport[]
  reviewExplanations: ReviewExplanation[]
  trend: TrendPoint[]
  pendingRewards: number
}

export interface IncentiveRule {
  id: string
  familyId: string
  triggerType: IncentiveTrigger
  triggerParams: Record<string, string | number | boolean>
  rewardDescription: string
  enabled: boolean
  createdAt: string
  eventCount?: number
}

export interface IncentiveEvent {
  id: string
  familyId: string
  studentUserId: string
  studentName?: string
  ruleId: string
  triggerType: IncentiveTrigger
  triggerParams: Record<string, string | number | boolean>
  rewardDescription: string
  triggeredAt: string
  status: IncentiveStatus
  confirmedAt: string | null
  redeemedAt: string | null
  note: string | null
}

export interface FamilyInvite {
  id: string
  familyId: string
  parentName: string
  relation: string
  createdAt: string
}

export interface StudentRewards {
  rules: IncentiveRule[]
  events: IncentiveEvent[]
  invites: FamilyInvite[]
  counts: Record<IncentiveStatus, number>
}

export interface AdminStats {
  users: { students: number; parents: number; admins: number }
  active: { dau: number; wau: number; mau: number }
  practice: {
    todaySessions: number
    todayAnswers: number
    weekAnswers: number
    reviewAnswers: number
  }
  coverage: {
    totalWords: number
    withImage: number
    approvedImages: number
    pendingImages: number
    imageRate: number
  }
  pronunciation: {
    pending: number
    approved: number
    rejected: number
  }
  incentives: {
    rules: number
    familiesWithRules: number
    usageRate: number
    pendingEvents: number
  }
  recentEvents: IncentiveEvent[]
}

export interface FilterOption {
  label: string
  value: string
}

export const TTS_STATUS_LABELS: Record<TtsStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  definition_choice: '释义选词',
  letter_fill: '补全字母',
  sentence_fill: '句子填空',
  image_choice: '看图选词',
  audio_choice: '听音选词',
  collocation_choice: '搭配选择',
}

export const MVPS_QUESTION_TYPES: QuestionType[] = [
  'definition_choice',
  'letter_fill',
  'sentence_fill',
  'image_choice',
]

export const INCENTIVE_TRIGGER_LABELS: Record<IncentiveTrigger, string> = {
  unit_complete: '完成指定单元学习',
  streak_days: '连续学习 N 天',
  daily_accuracy: '今日正确率达到 X%',
  weekly_wrong_lt: '本周错词少于 N 个',
  review_count: '完成指定数量复习',
}

export const INCENTIVE_STATUS_LABELS: Record<IncentiveStatus, string> = {
  pending_confirm: '待确认',
  pending_redeem: '待兑现',
  redeemed: '已兑换',
  revoked: '已撤销',
}

export const GRADE_OPTIONS = [
  '一年级',
  '二年级',
  '三年级',
  '四年级',
  '五年级',
  '六年级',
  '七年级',
  '八年级',
  '九年级',
]

export function formatIncentiveCondition(
  triggerType: IncentiveTrigger,
  params: Record<string, string | number | boolean>,
): string {
  switch (triggerType) {
    case 'unit_complete':
      return `完成指定单元学习${params.unitName ? `（${params.unitName}）` : ''}，掌握度达到 ${params.minStrength ?? 1} 级`
    case 'streak_days':
      return `连续学习 ${params.days ?? 7} 天`
    case 'daily_accuracy':
      return `单日完成 ${params.minAnswers ?? 10} 题，正确率达到 ${params.accuracy ?? 80}%`
    case 'weekly_wrong_lt':
      return `本周完成 ${params.minAnswers ?? 20} 题，错词少于 ${params.wrongLimit ?? 5} 个`
    case 'review_count':
      return `单日完成复习 ${params.count ?? 20} 题`
    default:
      return '自定义条件'
  }
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0 分钟'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '不足 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function formatDateCN(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTimeCN(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
