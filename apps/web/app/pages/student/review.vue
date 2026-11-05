<script setup lang="ts">
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Info,
  RefreshCw,
  RotateCcw,
  Volume2,
} from 'lucide-vue-next'
import type { ReviewQueue } from '@english-study/shared'
import { formatDateTimeCN } from '@english-study/shared'

const api = useApi()
const toast = useToast()
const data = ref<ReviewQueue | null>(null)
const loading = ref(true)

const weakCount = computed(() => data.value?.words.filter((word) => word.mastery?.isWeak).length || 0)

function reasonLabel(reason: string) {
  if (reason === 'both') return '薄弱 + 到期'
  if (reason === 'weak') return '薄弱词'
  return '间隔到期'
}

function speak(word: string) {
  if (!import.meta.client || !('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  utterance.rate = 0.82
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

async function load() {
  loading.value = true
  try {
    data.value = await api.get<ReviewQueue>('/student/review')
  } catch (error) {
    toast.error(errorMessage(error, '复习队列加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="学生端 · 今日复习"
      title="今天需要再看一遍的单词"
      description="到期词和薄弱词会优先进入队列。复习完成后，系统会按记忆强度安排下一次时间。"
    >
      <template #actions>
        <NuxtLink
          v-if="data?.words.length && data.remainingToday > 0"
          to="/student/practice?mode=review"
          class="btn-primary"
        >
          <RotateCcw :size="16" />
          一键复习今日全部
        </NuxtLink>
        <span v-else-if="data && data.remainingToday === 0" class="text-xs text-muted">今日复习已完成，明天再来</span>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="6" label="正在读取复习队列" />

    <template v-else-if="data">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">今日待复习</p>
          <p class="mt-2 font-display text-3xl text-ink">{{ data.words.length }}</p>
          <p class="mt-1 text-[10px] text-muted">{{ data.date }} · 今日还可复习 {{ data.remainingToday }} 题（每天 {{ data.dailyLimit }} 题）</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">其中薄弱词</p>
          <p class="mt-2 font-display text-3xl text-clay">{{ weakCount }}</p>
          <p class="mt-1 text-[10px] text-muted">近 7 次正确率低于 50% 或连续答错</p>
        </div>
        <div class="card col-span-2 p-5 lg:col-span-1">
          <p class="text-[11px] text-muted">建议方式</p>
          <p class="mt-2 text-sm font-medium text-ink">先看一遍，再整组练习</p>
          <p class="mt-1 text-[10px] leading-relaxed text-muted">薄弱词会持续出现，直到正确率回升。</p>
        </div>
      </section>

      <div class="mt-6 flex items-start gap-2.5 rounded-2xl border border-ocean/15 bg-ocean-soft/60 px-4 py-3.5 text-xs leading-relaxed text-ink-soft">
        <Info :size="15" class="mt-0.5 shrink-0 text-ocean" />
        <p>“间隔到期”表示按记忆强度该复习了；“薄弱词”表示近期错误较多。两类都会在今天强制出现。</p>
      </div>

      <div class="mt-6 flex items-end justify-between">
        <div>
          <p class="eyebrow">复习列表</p>
          <h2 class="mt-1 section-title">按优先级排列</h2>
        </div>
        <span class="text-[11px] text-muted">薄弱词优先</span>
      </div>

      <div v-if="data.words.length" class="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          v-for="word in data.words"
          :key="word.id"
          class="card flex flex-col p-4"
        >
          <div class="flex items-start gap-3">
            <div class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-paper">
              <img
                v-if="word.imageUrl && word.imageStatus === 'approved'"
                :src="word.imageUrl"
                :alt="word.spelling"
                class="size-full object-cover"
                loading="lazy"
              >
              <span v-else class="font-display text-lg text-muted/60">{{ word.spelling.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-semibold text-ink">{{ word.spelling }}</p>
                <button class="text-muted transition hover:text-forest" @click="speak(word.spelling)">
                  <Volume2 :size="13" />
                </button>
                <span class="chip-clay ml-auto !py-0.5" :class="word.reason === 'due' ? '!border-ocean/15 !bg-ocean-soft !text-ocean' : ''">
                  {{ reasonLabel(word.reason) }}
                </span>
              </div>
              <p class="mt-0.5 truncate text-[11px] text-muted">{{ word.phonetic }} · {{ word.chineseDef }}</p>
              <div class="mt-2 flex items-center gap-2">
                <MasteryMeter :strength="word.mastery?.strength || 0" compact />
                <span class="text-[10px] text-muted">强度 {{ word.mastery?.strength || 0 }}/5</span>
                <span v-if="word.mastery?.accuracy !== undefined" class="text-[10px] text-muted">
                  · {{ Math.round((word.mastery.accuracy || 0) * 100) }}%
                </span>
              </div>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-paper/70 px-3 py-2 text-[10px] text-muted">
            <div>
              <p>上次复习</p>
              <p class="mt-0.5 text-ink-soft">{{ formatDateTimeCN(word.mastery?.lastReviewTime) }}</p>
            </div>
            <div>
              <p>下次复习</p>
              <p class="mt-0.5 text-ink-soft">{{ formatDateTimeCN(word.mastery?.nextReviewTime) }}</p>
            </div>
          </div>

          <div class="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
            <span class="inline-flex items-center gap-1.5 text-[10px] text-muted">
              <CalendarClock :size="12" />
              {{ word.mastery?.isWeak ? '高频复习中' : '按间隔复习' }}
            </span>
            <NuxtLink
              :to="`/student/practice?wordId=${word.id}`"
              class="btn-ghost btn-sm !text-forest"
            >
              单独练
              <ArrowRight :size="12" />
            </NuxtLink>
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        title="今天没有到期单词"
        description="可以继续学习课本中的新单元。到期词会在之后自动出现。"
      >
        <template #icon><RefreshCw :size="18" /></template>
        <template #action>
          <NuxtLink to="/student" class="btn-primary">
            <BookOpen :size="15" />
            去选课本
          </NuxtLink>
        </template>
      </EmptyState>
    </template>
  </div>
</template>
