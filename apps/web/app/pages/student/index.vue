<script setup lang="ts">
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-vue-next'
import type { StudentDashboard, Textbook } from '@english-study/shared'
import { formatDateTimeCN } from '@english-study/shared'

const auth = useAuth()
const api = useApi()
const toast = useToast()

const data = ref<StudentDashboard | null>(null)
const loading = ref(true)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const firstTextbook = computed(() => data.value?.textbooks?.[0])
const reviewTarget = computed(() => data.value?.totals.dueToday || 0)

const coverMap: Record<string, string> = {
  forest: 'from-[#315f4c] via-[#2a5242] to-[#1f4134]',
  ocean: 'from-[#467695] via-[#3b647f] to-[#2d5169]',
  clay: 'from-[#b9714d] via-[#a35f3e] to-[#844a30]',
  plum: 'from-[#7c5a73] via-[#6a4a62] to-[#55394e]',
  sand: 'from-[#b59a66] via-[#9e8454] to-[#826a40]',
}

function coverClass(textbook: Textbook) {
  return coverMap[textbook.coverColor] || coverMap.forest
}

async function load() {
  loading.value = true
  try {
    data.value = await api.get<StudentDashboard>('/student/dashboard')
  } catch (error) {
    toast.error(errorMessage(error, '学习数据加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="学生端"
      :title="`${greeting}，${auth.user.value?.nickname || '同学'}`"
      description="到期复习和薄弱单词会优先出现。今天先完成一小步，剩下的交给时间。"
    >
      <template #actions>
        <NuxtLink to="/student/review" class="btn-primary">
          <RefreshCw :size="16" />
          {{ reviewTarget ? `复习 ${reviewTarget} 个到期词` : '查看今日复习' }}
        </NuxtLink>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="5" label="正在整理今天的学习计划" />

    <template v-else-if="data">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="今日待复习"
          :value="data.totals.dueToday"
          sub="含到期词与薄弱词"
          :icon="RefreshCw"
          tone="clay"
        />
        <StatCard
          label="已学单词"
          :value="data.totals.learnedWords"
          sub="至少完成过一次作答"
          :icon="BookOpen"
          tone="forest"
        />
        <StatCard
          label="掌握单词"
          :value="data.totals.masteredWords"
          sub="记忆强度达到 3 级及以上"
          :icon="Target"
          tone="ocean"
        />
        <StatCard
          label="连续学习"
          :value="`${data.totals.streakDays} 天`"
          sub="按自然日统计"
          :icon="Flame"
          tone="gold"
        />
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
        <section>
          <div class="mb-3 flex items-end justify-between">
            <div>
              <p class="eyebrow">我的课本</p>
              <h2 class="mt-1 section-title">选择一本课本继续</h2>
            </div>
            <NuxtLink v-if="firstTextbook" :to="`/student/textbooks/${firstTextbook.id}`" class="btn-ghost btn-sm">
              查看单元
              <ArrowRight :size="14" />
            </NuxtLink>
          </div>

          <div v-if="data.textbooks.length" class="grid gap-4 sm:grid-cols-2">
            <NuxtLink
              v-for="textbook in data.textbooks"
              :key="textbook.id"
              :to="`/student/textbooks/${textbook.id}`"
              class="group card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-34px_rgba(34,48,42,0.55)]"
            >
              <div class="relative bg-gradient-to-br p-5 text-white" :class="coverClass(textbook)">
                <div class="absolute -right-8 -top-8 size-28 rounded-full border border-white/10" />
                <div class="absolute -right-3 top-8 size-16 rounded-full border border-white/10" />
                <div class="relative flex min-h-[92px] flex-col justify-between">
                  <div class="flex items-center justify-between text-[10px] text-white/60">
                    <span>{{ textbook.version }} · {{ textbook.grade }}{{ textbook.semester }}</span>
                    <span>{{ textbook.unitCount }} 个单元</span>
                  </div>
                  <div>
                    <p class="font-display text-xl leading-tight tracking-tight">{{ textbook.name }}</p>
                    <p class="mt-1 text-[11px] text-white/60">{{ textbook.wordCount }} 个单词</p>
                  </div>
                </div>
              </div>
              <div class="p-4">
                <div class="flex items-center justify-between text-[11px] text-muted">
                  <span>已学 {{ textbook.learnedWords }} / {{ textbook.wordCount }}</span>
                  <span class="font-medium text-ink">{{ textbook.progress }}%</span>
                </div>
                <ProgressBar :value="textbook.progress" class="mt-2" :tone="textbook.coverColor === 'clay' ? 'clay' : 'forest'" />
                <div class="mt-3 flex items-center justify-between text-[10px] text-muted">
                  <span>掌握 {{ textbook.masteredWords }} 个</span>
                  <span v-if="textbook.dueCount" class="chip-clay !py-0.5">{{ textbook.dueCount }} 个待复习</span>
                  <span v-else class="text-forest">暂无到期</span>
                </div>
              </div>
            </NuxtLink>
          </div>
          <EmptyState
            v-else
            title="还没有指定课本"
            description="家长还没有给你指定课本，请让家长在孩子详情里指定后再开始学习。"
          >
            <template #icon><BookOpen :size="18" /></template>
          </EmptyState>
        </section>

        <aside class="space-y-6">
          <section class="card overflow-hidden">
            <div class="border-b border-line bg-cream/80 px-5 py-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="eyebrow">今日概览</p>
                  <p class="mt-1 text-sm font-medium text-ink">{{ data.today.answered ? '今天已经留下记录' : '今天还没有开始' }}</p>
                </div>
                <span class="grid size-9 place-items-center rounded-xl bg-forest-soft text-forest">
                  <CheckCircle2 :size="17" />
                </span>
              </div>
            </div>
            <div class="grid grid-cols-2 divide-x divide-line/70">
              <div class="px-5 py-4">
                <p class="text-[10px] text-muted">答题</p>
                <p class="mt-1 font-display text-2xl text-ink">{{ data.today.answered }}</p>
              </div>
              <div class="px-5 py-4">
                <p class="text-[10px] text-muted">正确率</p>
                <p class="mt-1 font-display text-2xl text-ink">{{ data.today.accuracy }}%</p>
              </div>
              <div class="border-t border-line/70 px-5 py-4">
                <p class="text-[10px] text-muted">学习时长</p>
                <p class="mt-1 text-sm font-medium text-ink">{{ data.today.minutes }} 分钟</p>
              </div>
              <div class="border-t border-line/70 px-5 py-4">
                <p class="text-[10px] text-muted">新学 / 复习</p>
                <p class="mt-1 text-sm font-medium text-ink">{{ data.today.newWords }} / {{ data.today.reviewedWords }}</p>
              </div>
            </div>
            <div class="border-t border-line/70 px-5 py-4">
              <div class="flex items-center justify-between text-[11px]">
                <span class="inline-flex items-center gap-1.5 text-muted"><Clock3 :size="13" /> 今日目标</span>
                <span class="font-medium text-ink">{{ data.today.answered >= 10 ? '已达成' : `还差 ${Math.max(0, 10 - data.today.answered)} 题` }}</span>
              </div>
              <ProgressBar :value="Math.min(100, data.today.answered * 10)" class="mt-2" size="sm" />
            </div>
          </section>

          <section class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="eyebrow">学习日历</p>
                <p class="mt-1 text-sm font-medium text-ink">近 30 天</p>
              </div>
              <CalendarDays :size="17" class="text-muted" />
            </div>
            <CalendarHeatmap :days="data.calendar" class="mt-5" />
          </section>

          <section v-if="data.recentSessions.length" class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="eyebrow">最近练习</p>
                <p class="mt-1 text-sm font-medium text-ink">练习记录</p>
              </div>
              <BarChart3 :size="17" class="text-muted" />
            </div>
            <div class="mt-4 space-y-3">
              <NuxtLink
                v-for="session in data.recentSessions"
                :key="session.id"
                :to="session.unitName ? `/student/progress` : '/student'"
                class="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-white/50 px-3 py-2.5 transition hover:border-forest/20 hover:bg-forest-soft/30"
              >
                <div class="min-w-0">
                  <p class="truncate text-xs font-medium text-ink">{{ session.unitName || session.textbookName || '综合复习' }}</p>
                  <p class="mt-0.5 text-[10px] text-muted">{{ formatDateTimeCN(session.finishedAt) }}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs font-medium text-ink">{{ session.correctCount }}/{{ session.totalCount }}</p>
                  <p class="text-[10px] text-muted">正确</p>
                </div>
              </NuxtLink>
            </div>
          </section>
        </aside>
      </div>

      <section v-if="!data.today.answered" class="mt-6 flex flex-col items-start justify-between gap-4 rounded-3xl border border-forest/15 bg-forest-soft/50 px-5 py-5 sm:flex-row sm:items-center">
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-forest text-white">
            <Sparkles :size="16" />
          </span>
          <div>
            <p class="text-sm font-medium text-ink">今天从 10 道题开始</p>
            <p class="mt-1 text-xs leading-relaxed text-ink-soft">系统会先安排到期词和薄弱词，再补充新词。完成后家长端会同步看到记录。</p>
          </div>
        </div>
        <NuxtLink v-if="firstTextbook" :to="`/student/textbooks/${firstTextbook.id}`" class="btn-primary shrink-0">
          开始学习
          <ArrowRight :size="15" />
        </NuxtLink>
      </section>

      <div class="mt-5 flex items-center justify-center gap-2 text-[10px] text-muted">
        <Layers :size="12" />
        学习记录按原始答题保存，可追溯
      </div>
    </template>
  </div>
</template>
