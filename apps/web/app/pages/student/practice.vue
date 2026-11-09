<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Volume2,
  X,
  XCircle,
} from 'lucide-vue-next'
import type {
  AnswerResult,
  PracticeSessionPayload,
  PracticeSummary,
  QuestionPayload,
} from '@english-study/shared'
import { formatDuration } from '@english-study/shared'

const route = useRoute()
const api = useApi()
const toast = useToast()

const session = ref<PracticeSessionPayload | null>(null)
const loading = ref(true)
const starting = ref(false)
const error = ref('')
const emptyMessage = ref('')

const index = ref(0)
const inputAnswer = ref('')
const selected = ref('')
// 后台确认中的题目 key（用于显示“正在同步”）；pendingConfirms 里的请求结算前必须等完，
// 否则 finish 从库里算成绩会漏掉还在路上的那一题。
const confirmingKey = ref<string | null>(null)
const pendingConfirms = new Set<Promise<void>>()
const fillLetters = ref<string[]>([])
const fillBox = ref<HTMLElement | null>(null)

// 注意：current 必须在 letterSlots 与下方 watch 之前声明——
// watch 创建时会立即求一次值，computed 回调里也随时可能求值，
// 放在后面会撞上暂时性死区（Cannot access before initialization），
// 练习页一打开就 500（2026-11-06 实测）。
const current = computed<QuestionPayload | null>(() => session.value?.questions[index.value] || null)
const progress = computed(() => {
  if (!session.value?.totalCount) return 0
  return Math.round((index.value / session.value.totalCount) * 100)
})
const isLast = computed(() => Boolean(session.value && index.value >= session.value.totalCount - 1))
const backTo = computed(() => {
  if (session.value?.unitId) return `/student/units/${session.value.unitId}`
  return '/student'
})
const modeTitle = computed(() => {
  if (session.value?.mode === 'review') return '今日复习'
  if (session.value?.mode === 'word') return '单词练习'
  return '单元练习'
})

interface LetterSlot { char: string; blank: boolean; blankIndex: number }

// 补全题：把后端 stem（形如 a _ _ l e）解析成“单词内填空”；
// 解析失败（人工题 stem 不是打码格式）时返回 null，走回原来的整词输入框。
const letterSlots = computed<LetterSlot[] | null>(() => {
  if (current.value?.type !== 'letter_fill' || !current.value.stem) return null
  const tokens = current.value.stem.split(' ')
  if (!tokens.length) return null
  let blankIndex = 0
  const slots: LetterSlot[] = []
  for (const token of tokens) {
    if (token === '_') {
      slots.push({ char: '', blank: true, blankIndex })
      blankIndex += 1
    } else if (token.length === 1) {
      slots.push({ char: token, blank: false, blankIndex: -1 })
    } else {
      return null
    }
  }
  return slots.some((slot) => slot.blank) ? slots : null
})
const blankCount = computed(() => letterSlots.value?.filter((slot) => slot.blank).length ?? 0)
const fillComplete = computed(() => {
  if (!blankCount.value) return false
  return Array.from({ length: blankCount.value }, (_, i) => fillLetters.value[i]).every(Boolean)
})
function assembledFill() {
  if (!letterSlots.value) return ''
  return letterSlots.value.map((slot) => (slot.blank ? (fillLetters.value[slot.blankIndex] || '') : slot.char)).join('')
}
function focusBlank(i: number) {
  const inputs = fillBox.value?.querySelectorAll('input')
  const el = inputs?.[i] as HTMLInputElement | undefined
  if (el) {
    el.focus()
    el.select()
  }
}
function onFillInput(blankIndex: number, event: Event) {
  const el = event.target as HTMLInputElement
  const letter = el.value.replace(/[^a-zA-Z]/g, '').slice(-1).toLowerCase()
  fillLetters.value[blankIndex] = letter
  el.value = letter
  if (letter) focusBlank(blankIndex + 1)
}
function onFillKeydown(blankIndex: number, event: KeyboardEvent) {
  if (event.key === 'Backspace' && !fillLetters.value[blankIndex]) {
    event.preventDefault()
    if (blankIndex > 0) {
      fillLetters.value[blankIndex - 1] = ''
      focusBlank(blankIndex - 1)
    }
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    focusBlank(blankIndex - 1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    focusBlank(blankIndex + 1)
  } else if (event.key === 'Enter' && fillComplete.value) {
    event.preventDefault()
    submitAnswer(assembledFill())
  }
}
function onFillPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text').replace(/[^a-zA-Z]/g, '').toLowerCase()
  if (!text) return
  event.preventDefault()
  const target = event.target as HTMLInputElement
  const start = Number(target.dataset.blankIndex || 0)
  text.split('').forEach((ch, offset) => {
    if (start + offset < blankCount.value) fillLetters.value[start + offset] = ch
  })
  focusBlank(Math.min(start + text.length, blankCount.value - 1))
}
watch(() => current.value?.key, () => {
  fillLetters.value = []
  // 切题时停掉上一题还在放的录音。
  audioEl?.pause()
  audioEl = null
  playingAudio.value = false
  playingOptionUrl.value = null
})
const result = ref<AnswerResult | null>(null)
const submitting = ref(false)
const answeredCount = ref(0)
const correctCount = ref(0)
const summary = ref<PracticeSummary | null>(null)
const finishing = ref(false)
const questionStart = ref(Date.now())

const playingAudio = ref(false)
const playingOptionUrl = ref<string | null>(null)
let audioEl: HTMLAudioElement | null = null
// 听音题只放真人录音文件（TTS 已移除）；没有录音的词不出听音题。
async function playAudio() {
  const question = current.value
  if (!question?.audioUrl) return
  try {
    playingAudio.value = true
    const audio = new Audio(question.audioUrl)
    audioEl = audio
    audio.onended = () => { playingAudio.value = false }
    audio.onerror = () => { playingAudio.value = false }
    await audio.play()
  } catch {
    playingAudio.value = false
  }
}

// 听词选音：播放某一个选项的录音（与单段录音共用同一个 audioEl，切题时一起停掉）。
async function playOptionAudio(url: string) {
  if (!url) return
  try {
    audioEl?.pause()
    playingOptionUrl.value = url
    playingAudio.value = true
    const audio = new Audio(url)
    audioEl = audio
    audio.onended = () => { playingOptionUrl.value = null; playingAudio.value = false }
    audio.onerror = () => { playingOptionUrl.value = null; playingAudio.value = false }
    await audio.play()
  } catch {
    playingOptionUrl.value = null
    playingAudio.value = false
  }
}

// 听词选音：点选项先听、同时选中，不直接提交，等孩子听完四个再点提交。
function selectPronunciation(option: string) {
  if (result.value || submitting.value) return
  selected.value = option
  void playOptionAudio(option)
}

function pronunciationOptionClass(option: string) {
  if (result.value) return optionClass(option)
  if (selected.value && normalize(option) === normalize(selected.value)) {
    return 'border-forest/40 bg-forest-soft/60 text-forest-deep'
  }
  return 'border-line-strong bg-white hover:border-forest/35 hover:bg-forest-soft/40'
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function optionClass(option: string) {
  if (!result.value) {
    return 'border-line-strong bg-white hover:border-forest/35 hover:bg-forest-soft/40'
  }
  const correct = normalize(option) === normalize(result.value.correctAnswer)
  const picked = normalize(option) === normalize(selected.value)
  if (correct) return 'border-forest/40 bg-forest-soft text-forest-deep'
  if (picked) return 'border-danger/30 bg-danger-soft text-danger'
  return 'border-line bg-white/50 text-muted opacity-70'
}

function optionLetter(i: number) {
  return String.fromCharCode(65 + i)
}

async function start() {
  starting.value = true
  error.value = ''
  try {
    const mode = route.query.mode === 'review'
      ? 'review'
      : route.query.wordId
        ? 'word'
        : 'unit'
    // 复习题数由后端按家长设的每日限额算，前端不传；单元练习默认 10 题。
    const body: Record<string, unknown> = { mode }
    if (mode === 'unit') body.limit = 10
    if (route.query.unitId) body.unitId = String(route.query.unitId)
    if (route.query.wordId) body.wordId = String(route.query.wordId)
    if (mode === 'unit' && !body.unitId) {
      error.value = '缺少单元参数，请从单元列表进入练习'
      return
    }
    const response = await api.post<PracticeSessionPayload & { empty?: boolean; message?: string }>(
      '/student/practice/sessions',
      body,
    )
    if (response.empty || !response.totalCount) {
      emptyMessage.value = response.message || '暂时没有可练习的单词'
      return
    }
    session.value = response
    index.value = 0
    questionStart.value = Date.now()
  } catch (err) {
    error.value = errorMessage(err, '练习创建失败')
  } finally {
    starting.value = false
    loading.value = false
  }
}

// 本地先判：只有答案就是拼写本身的题型才能判，且人工题除外
// （人工题的正确答案只在服务端，搭配题的正确短语也不在下发字段里）。
// 这 5 种题的答案本来就随题目下发（wordSpelling），本地判不新增泄题面。
function localVerdict(value: string): { isCorrect: boolean; correctAnswer: string } | null {
  const question = current.value
  if (!question || question.questionId) return null
  if (!['definition_choice', 'letter_fill', 'sentence_fill', 'image_choice', 'audio_choice'].includes(question.type)) return null
  if (!question.wordSpelling) return null
  return { isCorrect: normalize(value) === normalize(question.wordSpelling), correctAnswer: question.wordSpelling }
}

async function submitAnswer(value: string) {
  if (!current.value || !session.value || result.value || submitting.value) return
  const trimmed = value.trim()
  if (!trimmed) {
    toast.error('请先填写或选择答案')
    return
  }
  const question = current.value
  const sessionId = session.value.sessionId
  const questionKey = question.key
  const duration = Math.min(3600000, Date.now() - questionStart.value)
  const verdict = localVerdict(trimmed)
  if (verdict) {
    // 即时反馈：先判先显示，不等服务端；服务端在后台确认，补齐解析与记忆强度。
    // 服务端仍是最终裁决：若它判得不一样（正常情况下不会发生），修正正确数。
    result.value = { isCorrect: verdict.isCorrect, correctAnswer: verdict.correctAnswer, explanation: '', mastery: null }
    answeredCount.value += 1
    if (verdict.isCorrect) correctCount.value += 1
    confirmingKey.value = questionKey
    const confirm = (async () => {
      let lastError: unknown = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await api.post<AnswerResult>('/student/practice/answer', {
            sessionId,
            wordId: question.wordId,
            type: question.type,
            answer: trimmed,
            prompt: question.stem || question.prompt,
            durationMs: duration,
          })
          if (current.value?.key === questionKey) {
            if (response.isCorrect !== verdict.isCorrect) {
              correctCount.value += response.isCorrect ? 1 : -1
            }
            result.value = response
          } else if (response.isCorrect !== verdict.isCorrect) {
            correctCount.value += response.isCorrect ? 1 : -1
          }
          return
        } catch (err) {
          lastError = err
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800))
        }
      }
      // 两次都失败：本地 verdict 已显示，但这题成绩未落库，明确告诉用户，别静默丢分。
      toast.error(errorMessage(lastError, '成绩同步失败，这题可能没记上分，请检查网络'))
    })()
    pendingConfirms.add(confirm)
    void confirm.then(
      () => {
        pendingConfirms.delete(confirm)
        if (confirmingKey.value === questionKey) confirmingKey.value = null
      },
      () => {
        pendingConfirms.delete(confirm)
        if (confirmingKey.value === questionKey) confirmingKey.value = null
      },
    )
    return
  }
  // 搭配题 / 人工题：前端判不了，等服务端返回（原逻辑）。
  submitting.value = true
  try {
    const response = await api.post<AnswerResult>('/student/practice/answer', {
      sessionId,
      wordId: question.wordId,
      type: question.type,
      answer: trimmed,
      prompt: question.stem || question.prompt,
      durationMs: duration,
    })
    result.value = response
    answeredCount.value += 1
    if (response.isCorrect) correctCount.value += 1
  } catch (err) {
    toast.error(errorMessage(err, '答案提交失败'))
  } finally {
    submitting.value = false
  }
}

function choose(option: string) {
  if (result.value || submitting.value) return
  selected.value = option
  submitAnswer(option)
}

function next() {
  if (!session.value) return
  if (isLast.value) {
    finish()
    return
  }
  index.value += 1
  inputAnswer.value = ''
  selected.value = ''
  fillLetters.value = []
  result.value = null
  questionStart.value = Date.now()
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function finish() {
  if (!session.value || finishing.value) return
  finishing.value = true
  try {
    // 结算按库里记录算：先等完还在路上的后台确认，否则最后一题可能没记上就结算了。
    if (pendingConfirms.size) await Promise.allSettled([...pendingConfirms])
    const response = await api.post<PracticeSummary>(
      `/student/practice/sessions/${session.value.sessionId}/finish`,
    )
    summary.value = response
    if (response.incentiveEvents > 0) {
      toast.success(`达成 ${response.incentiveEvents} 条激励条件，已进入家长待确认`)
    }
  } catch (err) {
    toast.error(errorMessage(err, '成绩保存失败'))
  } finally {
    finishing.value = false
  }
}

async function leave() {
  if (!session.value || summary.value) {
    await navigateTo(backTo.value)
    return
  }
  const confirmed = window.confirm('退出后已作答的题目会保存，未作答题目不会计入本次练习。')
  if (!confirmed) return
  await finish()
  await navigateTo(backTo.value)
}

onMounted(start)
</script>

<template>
  <div>
    <div v-if="!summary" class="mb-5 flex items-center justify-between gap-3">
      <button class="btn-ghost -ml-2" @click="leave">
        <ArrowLeft :size="15" />
        退出练习
      </button>
      <div v-if="session" class="flex items-center gap-2 text-[11px] text-muted">
        <span class="chip-forest">{{ modeTitle }}</span>
        <span>{{ index + 1 }} / {{ session.totalCount }}</span>
      </div>
    </div>

    <div v-if="summary" class="mx-auto max-w-2xl">
      <div class="card overflow-hidden">
        <div class="border-b border-line bg-forest-soft/60 px-6 py-8 text-center">
          <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-forest text-white">
            <CheckCircle2 :size="22" />
          </span>
          <p class="mt-4 eyebrow">练习完成</p>
          <h1 class="mt-2 font-display text-4xl tracking-tight text-ink">{{ summary.accuracy }}%</h1>
          <p class="mt-2 text-sm text-ink-soft">本次正确率</p>
        </div>
        <div class="grid grid-cols-3 divide-x divide-line/70 border-b border-line/70">
          <div class="px-4 py-5 text-center">
            <p class="text-[10px] text-muted">总题数</p>
            <p class="mt-1 font-display text-2xl text-ink">{{ summary.totalCount }}</p>
          </div>
          <div class="px-4 py-5 text-center">
            <p class="text-[10px] text-muted">正确</p>
            <p class="mt-1 font-display text-2xl text-forest">{{ summary.correctCount }}</p>
          </div>
          <div class="px-4 py-5 text-center">
            <p class="text-[10px] text-muted">用时</p>
            <p class="mt-1 text-sm font-medium text-ink">{{ formatDuration(summary.durationMs) }}</p>
          </div>
        </div>
        <div class="space-y-5 px-6 py-6">
          <div v-if="summary.wrongWords.length">
            <p class="text-[11px] font-medium text-muted">需要再看的单词</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="word in summary.wrongWords" :key="word" class="chip-danger">{{ word }}</span>
            </div>
          </div>
          <div v-if="summary.correctWords.length">
            <p class="text-[11px] font-medium text-muted">本次答对的单词</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="word in summary.correctWords" :key="word" class="chip-forest">{{ word }}</span>
            </div>
          </div>
          <div v-if="summary.incentiveEvents" class="rounded-xl border border-gold/25 bg-gold-soft px-4 py-3 text-xs leading-relaxed text-ink-soft">
            本次达成 {{ summary.incentiveEvents }} 条家庭激励条件，记录已送到家长端，等待确认。平台不会自动兑现奖励。
          </div>
          <p class="text-[10px] leading-relaxed text-muted">
            答题记录已按原始结果保存。记忆强度与下次复习时间已更新。
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-cream/60 px-6 py-4">
          <NuxtLink :to="backTo" class="btn-secondary">
            <ArrowLeft :size="15" />
            返回单元
          </NuxtLink>
          <NuxtLink to="/student/progress" class="btn-primary">
            查看进度
            <ArrowRight :size="15" />
          </NuxtLink>
        </div>
      </div>
    </div>

    <LoadingBlock v-else-if="loading || starting" :lines="6" label="正在生成练习题目" />

    <div v-else-if="error" class="mx-auto max-w-xl">
      <EmptyState title="练习没有开始" :description="error">
        <template #icon><XCircle :size="18" /></template>
        <template #action>
          <NuxtLink :to="backTo" class="btn-secondary">返回单元</NuxtLink>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="emptyMessage" class="mx-auto max-w-xl">
      <EmptyState title="今天没有需要复习的单词" :description="emptyMessage">
        <template #icon><RotateCcw :size="18" /></template>
        <template #action>
          <NuxtLink to="/student" class="btn-primary">去选课本</NuxtLink>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="current && session" class="mx-auto max-w-3xl">
      <div class="mb-4">
        <div class="mb-2 flex items-center justify-between text-[10px] text-muted">
          <span>本组进度</span>
          <span>{{ index + 1 }} / {{ session.totalCount }}</span>
        </div>
        <ProgressBar :value="progress" />
      </div>

      <div class="card overflow-hidden">
        <div class="border-b border-line/70 bg-paper/50 px-5 py-3.5 sm:px-7">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="chip-forest">{{ current.typeLabel }}</span>
            <span class="text-[10px] text-muted">答完后立即显示结果</span>
          </div>
        </div>

        <div class="px-5 py-7 sm:px-8 sm:py-9">
          <p class="text-sm font-medium text-ink">{{ current.prompt }}</p>

          <div v-if="current.imageUrl" class="mt-5 overflow-hidden rounded-2xl border border-line bg-white">
            <img
              :src="current.imageUrl"
              :alt="current.wordSpelling"
              class="mx-auto max-h-64 w-full object-contain p-4"
            >
          </div>

          <div v-if="current.type === 'audio_choice'" class="mt-5">
            <button
              class="btn-secondary !rounded-2xl !px-5 !py-3"
              :disabled="playingAudio"
              @click="playAudio"
            >
              <Loader2 v-if="playingAudio" :size="18" class="animate-spin" />
              <Volume2 v-else :size="18" />
              播放发音
            </button>
            <p class="mt-2 text-[10px] text-muted">可重复播放，不记录播放次数</p>
          </div>

          <div v-if="current.stem && !(current.type === 'letter_fill' && letterSlots)" class="mt-5 rounded-2xl border border-line bg-white px-5 py-6 text-center">
            <p
              class="font-display text-xl leading-relaxed tracking-wide text-ink sm:text-2xl"
              :class="current.type === 'letter_fill' ? 'font-mono !text-2xl !tracking-[0.28em]' : ''"
            >
              {{ current.stem }}
            </p>
          </div>

          <div v-if="current.hint" class="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted">
            <span class="rounded-full bg-paper-deep px-2.5 py-1">提示：{{ current.hint }}</span>
            <!-- 听词选音不显示音标：音标就是正确读音的文字版，显示了等于直接给答案。 -->
            <span v-if="current.phonetic && current.type !== 'pronunciation_choice'" class="rounded-full bg-paper-deep px-2.5 py-1">{{ current.phonetic }}</span>
          </div>

          <!-- 听词选音：选项是 4 段录音，不能当文字显示、也不能点一下就提交；
               点选项先听、同时选中，听完再点下面的提交。 -->
          <div v-if="current.type === 'pronunciation_choice' && current.options?.length" class="mt-6">
            <div class="grid gap-2.5 sm:grid-cols-2">
              <div
                v-for="(option, optionIndex) in current.options"
                :key="option"
                class="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm transition"
                :class="pronunciationOptionClass(option)"
                @click="selectPronunciation(option)"
              >
                <span class="grid size-6 shrink-0 place-items-center rounded-lg border border-current/15 text-[10px] font-semibold">
                  {{ optionLetter(optionIndex) }}
                </span>
                <span class="flex flex-1 items-center gap-2">
                  <Volume2 :size="16" />
                  发音 {{ optionLetter(optionIndex) }}
                  <Loader2 v-if="playingOptionUrl === option" :size="14" class="animate-spin" />
                </span>
                <Check v-if="result && normalize(option) === normalize(result.correctAnswer)" :size="15" />
                <X v-else-if="result && normalize(option) === normalize(selected) && !result.isCorrect" :size="15" />
              </div>
            </div>
            <div v-if="!result" class="mt-4 flex justify-center">
              <button
                class="btn-primary !px-6"
                :disabled="submitting || !selected"
                @click="submitAnswer(selected)"
              >
                <Loader2 v-if="submitting" :size="16" class="animate-spin" />
                <template v-else>提交答案</template>
              </button>
            </div>
            <p v-if="!result && !selected" class="mt-2 text-center text-[11px] text-muted">点一个发音听一听，选出正确读音后再提交</p>
          </div>

          <div v-else-if="current.options?.length" class="mt-6 grid gap-2.5 sm:grid-cols-2">
            <button
              v-for="(option, optionIndex) in current.options"
              :key="option"
              class="flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm transition disabled:cursor-default"
              :class="optionClass(option)"
              :disabled="Boolean(result) || submitting"
              @click="choose(option)"
            >
              <span class="grid size-6 shrink-0 place-items-center rounded-lg border border-current/15 text-[10px] font-semibold">
                {{ optionLetter(optionIndex) }}
              </span>
              <span class="flex-1">{{ option }}</span>
              <Check v-if="result && normalize(option) === normalize(result.correctAnswer)" :size="15" />
              <X v-else-if="result && normalize(option) === normalize(selected) && !result.isCorrect" :size="15" />
            </button>
          </div>

          <div v-else-if="letterSlots" class="mt-6">
            <p class="label text-center">在空里填字母</p>
            <div ref="fillBox" class="flex flex-wrap items-start justify-center gap-1.5 sm:gap-2">
              <template v-for="(slot, slotIndex) in letterSlots" :key="slotIndex">
                <span
                  v-if="!slot.blank"
                  class="grid size-11 place-items-center font-mono text-2xl font-medium text-ink sm:size-12"
                >{{ slot.char }}</span>
                <input
                  v-else
                  :value="fillLetters[slot.blankIndex] || ''"
                  :data-blank-index="slot.blankIndex"
                  :disabled="Boolean(result) || submitting"
                  :autofocus="slot.blankIndex === 0"
                  class="size-11 rounded-xl border text-center font-mono text-2xl outline-none transition sm:size-12"
                  :class="result
                    ? (result.isCorrect ? 'border-forest/40 bg-forest-soft text-forest-deep' : 'border-danger/30 bg-danger-soft text-danger')
                    : 'border-line-strong bg-white focus:border-forest/50 focus:ring-2 focus:ring-forest/20'"
                  maxlength="1"
                  autocapitalize="none"
                  autocomplete="off"
                  autocorrect="off"
                  spellcheck="false"
                  @input="onFillInput(slot.blankIndex, $event)"
                  @keydown="onFillKeydown(slot.blankIndex, $event)"
                  @paste="onFillPaste"
                >
              </template>
            </div>
            <div v-if="!result" class="mt-4 flex justify-center">
              <button
                class="btn-primary !px-6"
                :disabled="submitting || !fillComplete"
                @click="submitAnswer(assembledFill())"
              >
                <Loader2 v-if="submitting" :size="16" class="animate-spin" />
                <template v-else>提交</template>
              </button>
            </div>
            <p v-if="!result && !fillComplete" class="mt-2 text-center text-[11px] text-muted">把每个空都填上才能提交</p>
          </div>

          <form v-else class="mt-6" @submit.prevent="submitAnswer(inputAnswer)">
            <label class="label" for="answer">填写答案</label>
            <div class="flex gap-2">
              <input
                id="answer"
                v-model="inputAnswer"
                class="input !py-3 text-center font-mono text-lg tracking-wide"
                :disabled="Boolean(result)"
                placeholder="输入英文单词"
                autocapitalize="none"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                autofocus
              >
              <button
                v-if="!result"
                class="btn-primary shrink-0 !px-5"
                type="submit"
                :disabled="submitting || !inputAnswer.trim()"
              >
                <Loader2 v-if="submitting" :size="16" class="animate-spin" />
                <template v-else>提交</template>
              </button>
            </div>
          </form>

          <div
            v-if="result"
            class="mt-6 rounded-2xl border px-4 py-4 sm:px-5"
            :class="result.isCorrect ? 'border-forest/20 bg-forest-soft/60' : 'border-danger/15 bg-danger-soft/60'"
          >
            <div class="flex items-start gap-3">
              <span
                class="grid size-8 shrink-0 place-items-center rounded-full"
                :class="result.isCorrect ? 'bg-forest text-white' : 'bg-danger text-white'"
              >
                <Check v-if="result.isCorrect" :size="15" />
                <X v-else :size="15" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium" :class="result.isCorrect ? 'text-forest-deep' : 'text-danger'">
                  {{ result.isCorrect ? '答对了' : '这次没有答对' }}
                </p>
                <p v-if="!result.isCorrect" class="mt-1 text-xs text-ink-soft">
                  <template v-if="current.type === 'pronunciation_choice'">
                    <!-- 正确答案是录音地址，不能直接显示：显示单词并给重听按钮。 -->
                    正确答案是 “{{ current.wordSpelling }}” 的发音：
                    <button class="inline-flex items-center gap-1 font-medium text-forest-deep underline underline-offset-2" @click="playOptionAudio(result.correctAnswer)">
                      <Volume2 :size="13" />
                      再听一遍
                    </button>
                  </template>
                  <template v-else>
                    正确答案：<span class="font-mono font-semibold">{{ result.correctAnswer }}</span>
                  </template>
                </p>
                <p v-if="result.explanation" class="mt-2 text-xs leading-relaxed text-ink-soft">{{ result.explanation }}</p>
                <p v-if="confirmingKey === current.key" class="mt-2 text-[10px] text-muted">成绩正在同步…</p>
                <div v-if="result.mastery" class="mt-3 flex items-center gap-2 text-[10px] text-muted">
                  <span>记忆强度</span>
                  <MasteryMeter :strength="result.mastery.strength" compact />
                  <span>{{ result.mastery.strength }} / 5</span>
                  <span class="size-1 rounded-full bg-line-strong" />
                  <span>{{ result.mastery.isWeak ? '已进入薄弱词队列' : '已安排下次复习' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-line bg-cream/60 px-5 py-4 sm:px-8">
          <div class="flex items-center gap-1.5 text-[10px] text-muted">
            <Clock3 :size="12" />
            已答 {{ answeredCount }} 题
            <span v-if="answeredCount" class="size-1 rounded-full bg-line-strong" />
            <span v-if="answeredCount">正确 {{ correctCount }}</span>
          </div>
          <button
            v-if="result"
            class="btn-primary"
            :disabled="finishing"
            @click="next"
          >
            <Loader2 v-if="finishing" :size="15" class="animate-spin" />
            <template v-else>
              {{ isLast ? '查看成绩' : '下一题' }}
              <ArrowRight :size="15" />
            </template>
          </button>
          <span v-else class="inline-flex items-center gap-1.5 text-[10px] text-muted">
            <ImageIcon v-if="current.type === 'image_choice'" :size="12" />
            作答后立即反馈
          </span>
        </div>
      </div>

      <p class="mt-4 text-center text-[10px] text-muted">
        正确答案与解析会在作答后显示；每题结果都会保存到本次练习记录。
      </p>
    </div>
  </div>
</template>
