<script setup lang="ts">
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarRange,
  Clock3,
  FileText,
  Gift,
  Info,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-vue-next'
import type { ParentReport } from '@english-study/shared'
import { formatDateTimeCN } from '@english-study/shared'

const route = useRoute()
const api = useApi()
const toast = useToast()

const data = ref<ParentReport | null>(null)
const loading = ref(true)
const days = ref(7)

async function load() {
  loading.value = true
  try {
    data.value = await api.get<ParentReport>(`/parent/children/${route.params.id}/report`, {
      query: { days: days.value },
    })
  } catch (error) {
    toast.error(errorMessage(error, '学习报告加载失败'))
  } finally {
    loading.value = false
  }
}

async function setDays(value: number) {
  days.value = value
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="mb-5">
      <NuxtLink to="/parent" class="btn-ghost -ml-2">
        <ArrowLeft :size="15" />
        返回孩子列表
      </NuxtLink>
    </div>

    <LoadingBlock v-if="loading" :lines="7" label="正在生成学习报告" />

    <template v-else-if="data">
      <PageHeader
        eyebrow="家长端 · 学习报告"
        title="学习报告"
        :description="`${data.child.nickname} 的学习记录，数据来自原始答题结果。`"
      >
        <template #actions>
          <NuxtLink :to="`/parent/children/${data.child.id}/words`" class="btn-secondary">
            <BookOpen :size="15" />
            单词管理
          </NuxtLink>
          <NuxtLink v-if="data.pendingRewards" to="/parent/ledger" class="btn-primary">
            <Gift :size="15" />
            {{ data.pendingRewards }} 条待确认
          </NuxtLink>
        </template>
      </PageHeader>

      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="今日答题"
          :value="data.today.answered"
          :sub="`正确 ${data.today.correct} 题`"
          :icon="Target"
          tone="forest"
        />
        <StatCard
          label="今日正确率"
          :value="`${data.today.accuracy}%`"
          :sub="data.today.answered ? '按今日作答计算' : '今天还没有作答'"
          :icon="TrendingUp"
          tone="ocean"
        />
        <StatCard
          label="今日学习时长"
          :value="`${data.today.minutes} 分`"
          :sub="`新学 ${data.today.newWords} · 复习 ${data.today.reviewedWords}`"
          :icon="Clock3"
          tone="gold"
        />
        <StatCard
          label="本周活跃"
          :value="`${data.week.activeDays} 天`"
          :sub="`本周 ${data.week.answered} 题 · 正确率 ${data.week.accuracy}%`"
          :icon="CalendarRange"
          tone="clay"
        />
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section class="card p-5 sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="eyebrow">历史趋势</p>
              <h2 class="mt-1 section-title">答题量与正确率</h2>
            </div>
            <div class="flex rounded-xl border border-line bg-paper/70 p-1">
              <button
                class="rounded-lg px-3 py-1.5 text-[11px] transition"
                :class="days === 7 ? 'bg-white font-medium text-ink shadow-sm' : 'text-muted'"
                @click="setDays(7)"
              >
                近 7 天
              </button>
              <button
                class="rounded-lg px-3 py-1.5 text-[11px] transition"
                :class="days === 30 ? 'bg-white font-medium text-ink shadow-sm' : 'text-muted'"
                @click="setDays(30)"
              >
                近 30 天
              </button>
            </div>
          </div>
          <TrendBars :points="data.trend" class="mt-5" :height="days === 7 ? 190 : 170" />
        </section>

        <aside class="space-y-4">
          <section class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="eyebrow">本周概览</p>
                <p class="mt-1 text-sm font-medium text-ink">学习节奏</p>
              </div>
              <RefreshCw :size="16" class="text-muted" />
            </div>
            <div class="mt-4 space-y-3 text-xs">
              <div class="flex justify-between">
                <span class="text-muted">本周答题</span>
                <span class="font-medium text-ink">{{ data.week.answered }} 题</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">本周新学</span>
                <span class="font-medium text-ink">{{ data.week.newWords }} 词</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">本周正确率</span>
                <span class="font-medium text-forest">{{ data.week.accuracy }}%</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">薄弱单词</span>
                <span class="font-medium text-clay">{{ data.weakWords.length }} 个</span>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-line bg-cream/70 p-4">
            <div class="flex items-start gap-2.5">
              <Info :size="14" class="mt-0.5 shrink-0 text-ocean" />
              <p class="text-[10px] leading-relaxed text-muted">
                报告根据答题记录实时汇总。错词与复习原因仅作学习提示，不用于评价孩子。
              </p>
            </div>
          </section>
        </aside>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section class="card p-5 sm:p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="eyebrow">单元进度</p>
              <h2 class="mt-1 section-title">各单元完成比例</h2>
            </div>
            <span class="text-[11px] text-muted">{{ data.units.length }} 个单元</span>
          </div>
          <div class="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            <div
              v-for="unit in data.units"
              :key="unit.id"
              class="rounded-xl border border-line/70 bg-white/50 px-3.5 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-xs font-medium text-ink">{{ unit.unitName }}</p>
                  <p class="mt-0.5 text-[10px] text-muted">{{ unit.textbookName }}</p>
                </div>
                <span class="shrink-0 text-[11px] font-medium text-ink">{{ unit.progress }}%</span>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <ProgressBar :value="unit.progress" size="sm" />
                <span class="shrink-0 text-[9px] text-muted">{{ unit.learnedWords }}/{{ unit.wordCount }}</span>
              </div>
            </div>
            <p v-if="!data.units.length" class="py-8 text-center text-xs text-muted">暂无单元数据</p>
          </div>
        </section>

        <section class="card p-5 sm:p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="eyebrow">薄弱单词</p>
              <h2 class="mt-1 section-title">近期错误率较高</h2>
            </div>
            <AlertTriangle :size="16" class="text-clay" />
          </div>
          <div v-if="data.weakWords.length" class="mt-4 space-y-2.5">
            <div
              v-for="word in data.weakWords"
              :key="word.id"
              class="rounded-xl border border-line/70 bg-white/50 px-3.5 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium text-ink">{{ word.spelling }}</p>
                    <span class="text-[10px] text-muted">{{ word.phonetic }}</span>
                  </div>
                  <p class="mt-0.5 truncate text-[10px] text-muted">{{ word.chineseDef }}</p>
                </div>
                <span class="chip-clay shrink-0">{{ Math.round(word.accuracy * 100) }}%</span>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="text-[9px] text-muted">主要错误：</span>
                <span
                  v-for="type in word.errorTypes"
                  :key="type"
                  class="rounded-full bg-danger-soft px-2 py-0.5 text-[9px] text-danger"
                >{{ type }}</span>
                <span v-if="!word.errorTypes.length" class="text-[9px] text-muted">连续答错 {{ word.consecutiveWrong }} 次</span>
              </div>
            </div>
          </div>
          <p v-else class="py-8 text-center text-xs text-muted">暂无薄弱单词</p>
        </section>
      </div>

      <section class="card mt-6 p-5 sm:p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="eyebrow">复习说明</p>
            <h2 class="mt-1 section-title">今天为什么会复习这些词</h2>
          </div>
          <FileText :size="16" class="text-muted" />
        </div>
        <div v-if="data.reviewExplanations.length" class="mt-4 grid gap-2 md:grid-cols-2">
          <div
            v-for="item in data.reviewExplanations"
            :key="item.wordId"
            class="flex items-start gap-3 rounded-xl bg-paper/70 px-3.5 py-3"
          >
            <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-forest-soft text-[10px] font-medium text-forest">复</span>
            <div class="min-w-0">
              <p class="text-xs font-medium text-ink">{{ item.spelling }}</p>
              <p class="mt-0.5 text-[10px] leading-relaxed text-muted">{{ item.reason }}</p>
              <p v-if="item.nextReviewTime" class="mt-1 text-[9px] text-muted/80">下次安排：{{ formatDateTimeCN(item.nextReviewTime) }}</p>
            </div>
          </div>
        </div>
        <p v-else class="py-8 text-center text-xs text-muted">今天没有到期的复习词</p>
      </section>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-cream/60 px-4 py-3.5">
        <p class="text-[10px] leading-relaxed text-muted">数据来自原始答题记录。若发现异常，可在“单词管理”中标记重点关注。</p>
        <NuxtLink :to="`/parent/children/${data.child.id}/words`" class="btn-ghost btn-sm !text-forest">
          查看单词
          <ArrowRight :size="12" />
        </NuxtLink>
      </div>
    </template>

    <EmptyState
      v-else
      title="无法查看该报告"
      description="请确认已与该学生完成绑定，或返回孩子列表重新选择。"
    >
      <template #icon><Users :size="18" /></template>
      <template #action>
        <NuxtLink to="/parent" class="btn-primary">返回孩子列表</NuxtLink>
      </template>
    </EmptyState>
  </div>
</template>
