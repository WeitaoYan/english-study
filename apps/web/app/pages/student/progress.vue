<script setup lang="ts">
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Target,
  TrendingUp,
} from 'lucide-vue-next'
import type { ProgressOverview, ProgressUnit, Textbook } from '@english-study/shared'

const api = useApi()
const toast = useToast()
const route = useRoute()

const textbooks = ref<Textbook[]>([])
const data = ref<ProgressOverview | null>(null)
const loading = ref(true)
const selectedId = ref('')

const summary = computed(() => {
  if (!data.value) return null
  return {
    progress: data.value.textbook.progress,
    learned: data.value.textbook.learnedWords,
    mastered: data.value.textbook.masteredWords,
    weak: data.value.weakWords.length,
    total: data.value.textbook.wordCount,
  }
})

async function loadTextbooks() {
  try {
    const result = await api.get<{ data: Textbook[] }>('/student/textbooks')
    textbooks.value = result.data || []
    if (!selectedId.value) selectedId.value = textbooks.value[0]?.id || ''
  } catch (error) {
    toast.error(errorMessage(error, '课本列表加载失败'))
  }
}

async function loadProgress() {
  if (!selectedId.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    data.value = await api.get<ProgressOverview>('/student/progress', {
      query: { textbookId: selectedId.value },
    })
  } catch (error) {
    toast.error(errorMessage(error, '进度加载失败'))
  } finally {
    loading.value = false
  }
}

async function changeTextbook() {
  await loadProgress()
  if (import.meta.client) {
    const query = { ...route.query, textbookId: selectedId.value }
    await navigateTo({ path: '/student/progress', query }, { replace: true })
  }
}

onMounted(async () => {
  await loadTextbooks()
  selectedId.value = String(route.query.textbookId || selectedId.value)
  await loadProgress()
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="学生端 · 我的进度"
      title="看见已经走过的路"
      description="按课本和单元查看掌握情况。薄弱单词会持续进入每日复习队列。"
    >
      <template #actions>
        <select v-model="selectedId" class="input min-w-[220px] !py-2.5" @change="changeTextbook">
          <option v-for="textbook in textbooks" :key="textbook.id" :value="textbook.id">
            {{ textbook.name }}
          </option>
        </select>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="6" label="正在统计学习进度" />

    <template v-else-if="data && summary">
      <section class="card overflow-hidden">
        <div class="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-start gap-4">
            <div class="grid size-12 shrink-0 place-items-center rounded-2xl bg-forest-soft text-forest">
              <BookOpen :size="20" />
            </div>
            <div>
              <p class="text-[11px] text-muted">{{ data.textbook.version }} · {{ data.textbook.grade }}{{ data.textbook.semester }}</p>
              <h2 class="mt-1 font-display text-2xl tracking-tight text-ink">{{ data.textbook.name }}</h2>
              <p class="mt-1 text-xs text-muted">{{ data.textbook.unitCount }} 个单元 · {{ summary.total }} 个单词</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <div>
              <p class="text-[10px] text-muted">整体进度</p>
              <p class="mt-1 font-display text-2xl text-ink">{{ summary.progress }}%</p>
            </div>
            <div>
              <p class="text-[10px] text-muted">已学</p>
              <p class="mt-1 text-sm font-medium text-ink">{{ summary.learned }} 个</p>
            </div>
            <div>
              <p class="text-[10px] text-muted">掌握</p>
              <p class="mt-1 text-sm font-medium text-forest">{{ summary.mastered }} 个</p>
            </div>
            <div>
              <p class="text-[10px] text-muted">薄弱</p>
              <p class="mt-1 text-sm font-medium text-clay">{{ summary.weak }} 个</p>
            </div>
          </div>
        </div>
        <div class="px-5 pb-5 sm:px-7 sm:pb-7">
          <ProgressBar :value="summary.progress" />
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section>
          <div class="mb-3 flex items-end justify-between">
            <div>
              <p class="eyebrow">单元掌握情况</p>
              <h2 class="mt-1 section-title">按单元查看</h2>
            </div>
            <span class="text-[11px] text-muted">{{ data.units.length }} 个单元</span>
          </div>
          <div class="space-y-2.5">
            <NuxtLink
              v-for="unit in data.units"
              :key="unit.id"
              :to="`/student/units/${unit.id}`"
              class="card group flex items-center gap-3 p-4 transition hover:border-forest/25 hover:bg-forest-soft/20"
            >
              <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-paper-deep font-display text-xs text-ink-soft">
                {{ String(unit.unitNo).padStart(2, '0') }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="truncate text-xs font-medium text-ink">{{ unit.unitName }}</p>
                  <span v-if="unit.weakWords" class="chip-danger !py-0.5">{{ unit.weakWords }} 薄弱</span>
                </div>
                <div class="mt-1.5 flex items-center gap-3">
                  <ProgressBar :value="unit.progress" size="sm" class="max-w-[220px]" />
                  <span class="text-[10px] text-muted">{{ unit.learnedWords }}/{{ unit.wordCount }}</span>
                </div>
              </div>
              <span class="hidden text-[11px] font-medium text-ink sm:block">{{ unit.progress }}%</span>
              <ChevronRight :size="15" class="shrink-0 text-muted transition group-hover:text-forest" />
            </NuxtLink>
          </div>
        </section>

        <aside class="space-y-6">
          <section class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="eyebrow">学习日历</p>
                <p class="mt-1 text-sm font-medium text-ink">最近 30 天</p>
              </div>
              <CalendarDays :size="17" class="text-muted" />
            </div>
            <CalendarHeatmap :days="data.calendar" class="mt-5" />
          </section>

          <section class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="eyebrow">学习节奏</p>
                <p class="mt-1 text-sm font-medium text-ink">本期概览</p>
              </div>
              <TrendingUp :size="17" class="text-muted" />
            </div>
            <div class="mt-4 space-y-3 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-muted">已学单词</span>
                <span class="font-medium text-ink">{{ summary.learned }} / {{ summary.total }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted">掌握单词</span>
                <span class="font-medium text-forest">{{ summary.mastered }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted">待复习</span>
                <span class="font-medium text-ink">{{ data.textbook.dueCount }}</span>
              </div>
            </div>
            <NuxtLink to="/student/review" class="btn-secondary mt-5 w-full">
              查看复习队列
            </NuxtLink>
          </section>
        </aside>
      </div>

      <section class="mt-6">
        <div class="mb-3 flex items-end justify-between">
          <div>
            <p class="eyebrow">薄弱单词</p>
            <h2 class="mt-1 section-title">近期需要多看一眼</h2>
          </div>
          <span class="text-[11px] text-muted">{{ data.weakWords.length }} 个</span>
        </div>

        <div v-if="data.weakWords.length" class="card divide-y divide-line/70 overflow-hidden">
          <div
            v-for="word in data.weakWords"
            :key="word.id"
            class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
          >
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-clay-soft text-clay">
                <AlertTriangle :size="15" />
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium text-ink">{{ word.spelling }}</p>
                  <span class="text-[10px] text-muted">{{ word.phonetic }}</span>
                </div>
                <p class="truncate text-[11px] text-muted">{{ word.chineseDef }}</p>
              </div>
            </div>
            <div class="flex items-center gap-4 sm:gap-7">
              <div class="text-right">
                <p class="text-[10px] text-muted">正确率</p>
                <p class="text-xs font-medium text-clay">{{ Math.round((word.mastery?.accuracy || 0) * 100) }}%</p>
              </div>
              <div class="text-right">
                <p class="text-[10px] text-muted">连续答错</p>
                <p class="text-xs font-medium text-ink">{{ word.mastery?.consecutiveWrong || 0 }} 次</p>
              </div>
              <MasteryMeter :strength="word.mastery?.strength || 0" compact />
              <NuxtLink
                :to="`/student/practice?wordId=${word.id}`"
                class="btn-ghost btn-sm shrink-0 !text-forest"
              >
                练这个
              </NuxtLink>
            </div>
          </div>
        </div>
        <EmptyState
          v-else
          title="暂时没有薄弱单词"
          description="继续按计划练习，系统会根据近 7 次答题正确率自动标记。"
          compact
        >
          <template #icon><Target :size="18" /></template>
        </EmptyState>
      </section>
    </template>

    <EmptyState
      v-else
      title="暂无学习进度"
      description="完成一次练习后，这里会显示单元进度、薄弱单词与学习日历。"
    >
      <template #icon><BookOpen :size="18" /></template>
      <template #action>
        <NuxtLink to="/student" class="btn-primary">去选课本</NuxtLink>
      </template>
    </EmptyState>
  </div>
</template>
