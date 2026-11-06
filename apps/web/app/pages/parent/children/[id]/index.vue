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
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-vue-next'
import type { ChildTextbookOption, ParentReport } from '@english-study/shared'
import { formatDateTimeCN } from '@english-study/shared'

const route = useRoute()
const api = useApi()
const toast = useToast()

const data = ref<ParentReport | null>(null)
const loading = ref(true)
const days = ref(7)

const textbooks = ref<ChildTextbookOption[]>([])
const textbooksLoading = ref(false)
const selectedTextbookIds = ref<string[]>([])
const savingTextbooks = ref(false)

const textbooksDirty = computed(() => {
  const current = textbooks.value.filter((item) => item.assigned).map((item) => item.id).sort().join(',')
  return [...selectedTextbookIds.value].sort().join(',') !== current
})

async function loadTextbooks() {
  textbooksLoading.value = true
  try {
    const result = await api.get<{ data: ChildTextbookOption[] }>(`/parent/children/${route.params.id}/textbooks`)
    textbooks.value = result.data || []
    selectedTextbookIds.value = textbooks.value.filter((item) => item.assigned).map((item) => item.id)
  } catch (error) {
    toast.error(errorMessage(error, '课本列表加载失败'))
  } finally {
    textbooksLoading.value = false
  }
}

async function saveTextbooks() {
  if (savingTextbooks.value) return
  savingTextbooks.value = true
  try {
    await api.put(`/parent/children/${route.params.id}/textbooks`, { textbookIds: selectedTextbookIds.value })
    textbooks.value = textbooks.value.map((item) => ({ ...item, assigned: selectedTextbookIds.value.includes(item.id) }))
    toast.success('已更新指定课本')
  } catch (error) {
    toast.error(errorMessage(error, '保存失败'))
  } finally {
    savingTextbooks.value = false
  }
}

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

const reviewDailyLimit = ref(10)
const savedReviewDailyLimit = ref(10)
const savingReviewLimit = ref(false)

async function loadReviewLimit() {
  try {
    const result = await api.get<{ reviewDailyLimit: number }>(`/parent/children/${route.params.id}/settings`)
    reviewDailyLimit.value = result.reviewDailyLimit || 10
    savedReviewDailyLimit.value = reviewDailyLimit.value
  } catch (error) {
    toast.error(errorMessage(error, '复习设置加载失败'))
  }
}

function clampReviewLimit() {
  if (!Number.isFinite(reviewDailyLimit.value)) reviewDailyLimit.value = savedReviewDailyLimit.value
  reviewDailyLimit.value = Math.min(50, Math.max(5, Math.round(reviewDailyLimit.value)))
}

async function saveReviewLimit() {
  if (savingReviewLimit.value) return
  clampReviewLimit()
  savingReviewLimit.value = true
  try {
    await api.put(`/parent/children/${route.params.id}/settings`, { reviewDailyLimit: reviewDailyLimit.value })
    savedReviewDailyLimit.value = reviewDailyLimit.value
    toast.success('已更新每日复习题数')
  } catch (error) {
    toast.error(errorMessage(error, '保存失败'))
  } finally {
    savingReviewLimit.value = false
  }
}

onMounted(() => {
  load()
  loadTextbooks()
  loadReviewLimit()
})
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

      <section class="card mt-6 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="eyebrow">指定课本</p>
            <h2 class="mt-1 section-title">孩子能看到的课本</h2>
            <p class="mt-1 text-xs text-muted">只勾选的课本会出现在孩子端；没指定的课本孩子看不到，也练不了。</p>
            <p class="mt-1 text-xs text-muted">没有想要的课本？可以联系管理员 <a class="text-forest-deep underline" href="mailto:admin@ikber.cc">admin@ikber.cc</a>，请他帮忙添加；能把课本单词表拍下来发给他就更好。</p>
          </div>
          <button class="btn-primary btn-sm" :disabled="savingTextbooks || !textbooksDirty" @click="saveTextbooks">
            <Loader2 v-if="savingTextbooks" :size="14" class="animate-spin" />
            保存指定
          </button>
        </div>
        <div v-if="textbooksLoading" class="mt-4 space-y-2">
          <div v-for="index in 3" :key="index" class="skeleton h-12" />
        </div>
        <div v-else-if="textbooks.length" class="mt-4 space-y-2">
          <label
            v-for="textbook in textbooks"
            :key="textbook.id"
            class="flex cursor-pointer items-center gap-3 rounded-xl border border-line/70 bg-white/60 px-3.5 py-3 transition hover:border-forest/25"
          >
            <input v-model="selectedTextbookIds" type="checkbox" :value="textbook.id" class="size-4 accent-[#2f5f4c]">
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-ink">{{ textbook.name }}</span>
              <span class="mt-0.5 block text-[11px] text-muted">{{ textbook.version }} · {{ textbook.grade }}{{ textbook.semester }} · {{ textbook.unitCount }} 个单元</span>
            </span>
            <span v-if="textbook.assigned" class="chip">已指定</span>
          </label>
        </div>
        <p v-else class="mt-4 text-xs text-muted">暂无已发布的课本，请等待管理员发布。</p>
      </section>

      <section class="card mt-6 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="eyebrow">每日复习</p>
            <h2 class="mt-1 section-title">每天复习多少题</h2>
            <p class="mt-1 text-xs text-muted">只算复习模式的题目，不管新词单元练习；每天 0 点重置，到量后当天不再开复习局。</p>
          </div>
          <button class="btn-primary btn-sm" :disabled="savingReviewLimit || reviewDailyLimit === savedReviewDailyLimit" @click="saveReviewLimit">
            <Loader2 v-if="savingReviewLimit" :size="14" class="animate-spin" />
            保存
          </button>
        </div>
        <div class="mt-4 flex items-center gap-2">
          <button class="btn-ghost btn-sm" :disabled="reviewDailyLimit <= 5" @click="reviewDailyLimit = Math.max(5, reviewDailyLimit - 5)">− 5</button>
          <input v-model.number="reviewDailyLimit" type="number" min="5" max="50" class="input w-20 text-center !py-2" @change="clampReviewLimit">
          <span class="text-xs text-muted">题 / 天（5–50）</span>
          <button class="btn-ghost btn-sm" :disabled="reviewDailyLimit >= 50" @click="reviewDailyLimit = Math.min(50, reviewDailyLimit + 5)">+ 5</button>
        </div>
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
