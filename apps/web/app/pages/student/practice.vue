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
const result = ref<AnswerResult | null>(null)
const submitting = ref(false)
const answeredCount = ref(0)
const correctCount = ref(0)
const summary = ref<PracticeSummary | null>(null)
const finishing = ref(false)
const questionStart = ref(Date.now())

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

function speak(word: string) {
  if (!import.meta.client || !('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  utterance.rate = 0.82
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
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
    const body: Record<string, unknown> = { mode, limit: mode === 'review' ? 20 : 10 }
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

async function submitAnswer(value: string) {
  if (!current.value || !session.value || result.value || submitting.value) return
  const trimmed = value.trim()
  if (!trimmed) {
    toast.error('请先填写或选择答案')
    return
  }
  submitting.value = true
  try {
    const response = await api.post<AnswerResult>('/student/practice/answer', {
      sessionId: session.value.sessionId,
      wordId: current.value.wordId,
      type: current.value.type,
      answer: trimmed,
      prompt: current.value.stem || current.value.prompt,
      durationMs: Math.min(3600000, Date.now() - questionStart.value),
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
  result.value = null
  questionStart.value = Date.now()
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function finish() {
  if (!session.value || finishing.value) return
  finishing.value = true
  try {
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
              @click="speak(current.wordSpelling)"
            >
              <Volume2 :size="18" />
              播放发音
            </button>
            <p class="mt-2 text-[10px] text-muted">可重复播放，不记录播放次数</p>
          </div>

          <div v-if="current.stem" class="mt-5 rounded-2xl border border-line bg-white px-5 py-6 text-center">
            <p
              class="font-display text-xl leading-relaxed tracking-wide text-ink sm:text-2xl"
              :class="current.type === 'letter_fill' ? 'font-mono !text-2xl !tracking-[0.28em]' : ''"
            >
              {{ current.stem }}
            </p>
          </div>

          <div v-if="current.hint" class="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted">
            <span class="rounded-full bg-paper-deep px-2.5 py-1">提示：{{ current.hint }}</span>
            <span v-if="current.phonetic" class="rounded-full bg-paper-deep px-2.5 py-1">{{ current.phonetic }}</span>
          </div>

          <div v-if="current.options?.length" class="mt-6 grid gap-2.5 sm:grid-cols-2">
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
                  正确答案：<span class="font-mono font-semibold">{{ result.correctAnswer }}</span>
                </p>
                <p class="mt-2 text-xs leading-relaxed text-ink-soft">{{ result.explanation }}</p>
                <div class="mt-3 flex items-center gap-2 text-[10px] text-muted">
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
