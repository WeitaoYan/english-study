<script setup lang="ts">
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarRange,
  Check,
  Clock3,
  FileText,
  Gift,
  Info,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Volume2,
  X,
} from 'lucide-vue-next'
import { QUESTION_ABILITY_HINTS, QUESTION_ABILITY_LABELS, QUESTION_TYPE_LABELS } from '@english-study/shared'
import type { ChildTextbookOption, ParentReport, QuestionAbility, QuestionType, RecentAnswer, RecentAnswersResponse, SpecialPractice, SpecialPracticeCreate, TextbookPreview } from '@english-study/shared'
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

// 预览单词表：点开先看这本课本按单元分的单词，确认是想要的再勾选。
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewTextbook = ref<ChildTextbookOption | null>(null)
const preview = ref<TextbookPreview | null>(null)

async function openPreview(textbook: ChildTextbookOption) {
  previewTextbook.value = textbook
  preview.value = null
  previewOpen.value = true
  previewLoading.value = true
  try {
    preview.value = await api.get<TextbookPreview>(`/parent/children/${route.params.id}/textbooks/${textbook.id}/preview`)
  } catch (error) {
    toast.error(errorMessage(error, '单词表加载失败'))
    previewOpen.value = false
  } finally {
    previewLoading.value = false
  }
}

function selectPreviewTextbook() {
  if (!previewTextbook.value) return
  if (!selectedTextbookIds.value.includes(previewTextbook.value.id)) {
    selectedTextbookIds.value = [...selectedTextbookIds.value, previewTextbook.value.id]
  }
  previewOpen.value = false
}

// 专项练习：家长给孩子建的固定题型套题（一种题型 + 单元范围 + 每套默认 10 题）。
const SPECIAL_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  'definition_choice',
  'letter_fill',
  'sentence_fill',
  'image_choice',
  'audio_choice',
  'pronunciation_choice',
].map((value) => ({ value, label: QUESTION_TYPE_LABELS[value] }))

const specialPractices = ref<SpecialPractice[]>([])
const specialLoading = ref(false)
const createOpen = ref(false)
const createLoading = ref(false)
const createUnitsLoading = ref(false)
const createSaving = ref(false)
const formTitle = ref('')
const formType = ref<QuestionType>('definition_choice')
const formUnitIds = ref<string[]>([])
const formCount = ref(10)
// 每本已指定课本的单元（新建时一次性取回，按课本分组勾选）。
const createTextbookUnits = ref<{ textbookId: string; textbookName: string; units: { id: string; unitNo: number; unitName: string; wordCount: number }[] }[]>([])
const deleteTarget = ref<SpecialPractice | null>(null)
const deleting = ref(false)

const assignedTextbooks = computed(() => textbooks.value.filter((item) => item.assigned))

async function loadSpecialPractices() {
  specialLoading.value = true
  try {
    const result = await api.get<{ data: SpecialPractice[] }>(`/parent/children/${route.params.id}/special-practices`)
    specialPractices.value = result.data || []
  } catch (error) {
    toast.error(errorMessage(error, '专项练习加载失败'))
  } finally {
    specialLoading.value = false
  }
}

// 套题的单元按课本分组展示：三上：Unit 1、Unit 2；三下：Unit 1。
function groupSpecialUnits(item: SpecialPractice) {
  const groups: { textbookName: string; unitNames: string[] }[] = []
  for (const unit of item.units) {
    const group = groups.find((entry) => entry.textbookName === unit.textbookName)
    const label = `Unit ${unit.unitNo} · ${unit.unitName}`
    if (group) group.unitNames.push(label)
    else groups.push({ textbookName: unit.textbookName, unitNames: [label] })
  }
  return groups
}

async function openCreate() {
  formTitle.value = ''
  formType.value = 'definition_choice'
  formUnitIds.value = []
  formCount.value = 10
  createTextbookUnits.value = []
  createOpen.value = true
  createLoading.value = true
  createUnitsLoading.value = true
  try {
    const groups = await Promise.all(
      assignedTextbooks.value.map(async (textbook) => {
        const result = await api.get<{ data: { id: string; unitNo: number; unitName: string; wordCount: number }[] }>(
          `/parent/children/${route.params.id}/textbooks/${textbook.id}/units`,
        )
        return { textbookId: textbook.id, textbookName: textbook.name, units: result.data || [] }
      }),
    )
    createTextbookUnits.value = groups.filter((group) => group.units.length > 0)
  } catch (error) {
    toast.error(errorMessage(error, '单元列表加载失败'))
  } finally {
    createUnitsLoading.value = false
    createLoading.value = false
  }
}

function toggleCreateUnit(unitId: string) {
  formUnitIds.value = formUnitIds.value.includes(unitId)
    ? formUnitIds.value.filter((id) => id !== unitId)
    : [...formUnitIds.value, unitId]
}

function toggleCreateTextbook(group: { textbookId: string; units: { id: string }[] }) {
  const ids = group.units.map((unit) => unit.id)
  const allSelected = ids.every((id) => formUnitIds.value.includes(id))
  formUnitIds.value = allSelected
    ? formUnitIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...formUnitIds.value, ...ids])]
}

async function createSpecial() {
  if (!formUnitIds.value.length) {
    toast.error('请至少勾选一个单元')
    return
  }
  if (createSaving.value) return
  createSaving.value = true
  try {
    const body: SpecialPracticeCreate = {
      title: formTitle.value.trim() || undefined,
      questionType: formType.value,
      unitIds: formUnitIds.value,
      questionCount: formCount.value,
    }
    const result = await api.post<{ data: SpecialPractice & { eligibleWordCount?: number } }>(
      `/parent/children/${route.params.id}/special-practices`,
      body,
    )
    specialPractices.value = [result.data, ...specialPractices.value]
    createOpen.value = false
    toast.success(`已创建「${result.data.title}」，所选单元里有 ${result.data.eligibleWordCount ?? 0} 个词能出这种题型`)
  } catch (error) {
    toast.error(errorMessage(error, '创建失败'))
  } finally {
    createSaving.value = false
  }
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    await api.delete(`/parent/children/${route.params.id}/special-practices/${deleteTarget.value.id}`)
    specialPractices.value = specialPractices.value.filter((item) => item.id !== deleteTarget.value!.id)
    toast.success('已删除该套专项练习')
    deleteTarget.value = null
  } catch (error) {
    toast.error(errorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
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

// 近期答题：具体每道题怎么答的，错题醒目标出。默认最新 20 条，只看错题时服务端过滤。
const recentAnswers = ref<RecentAnswer[]>([])
const recentLoading = ref(false)
const onlyWrong = ref(false)

const SESSION_MODE_LABELS: Record<string, string> = {
  review: '今日复习',
  unit: '单元练习',
  special: '专项练习',
  mistake: '错词重练',
}

async function loadRecentAnswers() {
  recentLoading.value = true
  try {
    const result = await api.get<RecentAnswersResponse>(`/parent/children/${route.params.id}/recent-answers`, {
      query: { limit: 20, onlyWrong: onlyWrong.value ? 1 : 0 },
    })
    recentAnswers.value = result.answers || []
  } catch (error) {
    toast.error(errorMessage(error, '近期答题加载失败'))
  } finally {
    recentLoading.value = false
  }
}

async function setOnlyWrong(value: boolean) {
  onlyWrong.value = value
  await loadRecentAnswers()
}

function playAudio(url: string | null) {
  if (!url) return
  const audio = new Audio(url)
  void audio.play()
}

/** 按能力维度汇总错题：听力（听不懂）、拼写（不会写）、词义（不懂意思）。 */
const abilityGroups = computed(() => {
  const order: QuestionAbility[] = ['listening', 'spelling', 'meaning']
  return order
    .map((ability) => {
      const types = (data.value?.typeStats || []).filter((stat) => stat.ability === ability)
      const answered = types.reduce((sum, stat) => sum + stat.answered, 0)
      const correct = types.reduce((sum, stat) => sum + stat.correct, 0)
      return {
        ability,
        label: QUESTION_ABILITY_LABELS[ability],
        hint: QUESTION_ABILITY_HINTS[ability],
        types,
        answered,
        correct,
        wrong: answered - correct,
        accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      }
    })
    .filter((group) => group.types.length > 0)
})

function accuracyTone(accuracy: number): 'forest' | 'gold' | 'clay' {
  return accuracy >= 80 ? 'forest' : accuracy >= 60 ? 'gold' : 'clay'
}

function accuracyTextClass(accuracy: number): string {
  return accuracy >= 80 ? 'text-forest' : accuracy >= 60 ? 'text-gold' : 'text-clay'
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
  loadRecentAnswers()
  loadTextbooks()
  loadReviewLimit()
  loadSpecialPractices()
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
          <div
            v-for="textbook in textbooks"
            :key="textbook.id"
            class="flex items-center gap-3 rounded-xl border border-line/70 bg-white/60 px-3.5 py-3 transition hover:border-forest/25"
          >
            <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input v-model="selectedTextbookIds" type="checkbox" :value="textbook.id" class="size-4 shrink-0 accent-[#2f5f4c]">
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-ink">{{ textbook.name }}</span>
                <span class="mt-0.5 block text-[11px] text-muted">{{ textbook.version }} · {{ textbook.grade }}{{ textbook.semester }} · {{ textbook.unitCount }} 个单元</span>
              </span>
            </label>
            <span v-if="textbook.assigned" class="chip shrink-0">已指定</span>
            <button type="button" class="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-forest-deep hover:bg-forest/10" @click="openPreview(textbook)">
              预览单词
            </button>
          </div>
        </div>
        <p v-else class="mt-4 text-xs text-muted">暂无已发布的课本，请等待管理员发布。</p>
      </section>

      <Modal
        :open="previewOpen"
        :title="previewTextbook ? previewTextbook.name : '预览单词表'"
        :description="preview ? `${preview.textbook.version} · ${preview.textbook.grade}${preview.textbook.semester} · 共 ${preview.textbook.unitCount} 个单元 · ${preview.textbook.wordCount} 个单词` : (previewTextbook ? `${previewTextbook.version} · ${previewTextbook.grade}${previewTextbook.semester}` : '')"
        wide
        @close="previewOpen = false"
      >
        <div v-if="previewLoading" class="space-y-2">
          <div v-for="index in 5" :key="index" class="skeleton h-8" />
        </div>
        <div v-else-if="preview && preview.units.length" class="space-y-5">
          <div v-for="unit in preview.units" :key="unit.id">
            <div class="flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
              <p class="text-sm font-medium text-ink">Unit {{ unit.unitNo }} · {{ unit.unitName }}</p>
              <p class="shrink-0 text-xs text-muted">{{ unit.wordCount }} 词</p>
            </div>
            <div v-if="unit.words.length" class="mt-1">
              <div v-for="word in unit.words" :key="word.id" class="flex flex-wrap items-baseline gap-x-2 border-b border-line/50 py-1.5 text-sm last:border-0">
                <span class="font-medium text-ink">{{ word.spelling }}</span>
                <span v-if="word.phonetic" class="text-xs text-muted">{{ word.phonetic }}</span>
                <span v-if="word.pos" class="text-xs text-muted">{{ word.pos }}</span>
                <span class="text-muted">{{ word.chineseDef }}</span>
              </div>
            </div>
            <p v-else class="mt-1 text-xs text-muted">本单元暂无单词</p>
          </div>
        </div>
        <p v-else-if="preview" class="text-sm text-muted">这本课本还没有单元或单词。</p>
        <template #footer>
          <button class="btn-ghost btn-sm" @click="previewOpen = false">关闭</button>
          <button
            v-if="previewTextbook"
            class="btn-primary btn-sm"
            :disabled="selectedTextbookIds.includes(previewTextbook.id)"
            @click="selectPreviewTextbook"
          >
            {{ selectedTextbookIds.includes(previewTextbook.id) ? '已勾选' : '勾选这本课本' }}
          </button>
        </template>
      </Modal>

      <section class="card mt-6 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="eyebrow">专项练习</p>
            <h2 class="mt-1 section-title">专项练习套题</h2>
            <p class="mt-1 text-xs text-muted">给孩子指定一种题型和一个单元范围，孩子每次打开都随机出题，只练这一种题型。</p>
          </div>
          <button class="btn-primary btn-sm" :disabled="!assignedTextbooks.length" @click="openCreate">
            新建套题
          </button>
        </div>
        <p v-if="!assignedTextbooks.length" class="mt-4 text-xs text-muted">先在上面指定课本，才能建专项练习。</p>
        <div v-else-if="specialLoading" class="mt-4 space-y-2">
          <div v-for="index in 2" :key="index" class="skeleton h-16" />
        </div>
        <div v-else-if="specialPractices.length" class="mt-4 space-y-2">
          <div
            v-for="item in specialPractices"
            :key="item.id"
            class="rounded-xl border border-line/70 bg-white/60 px-3.5 py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-ink">{{ item.title }}</p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ QUESTION_TYPE_LABELS[item.questionType] }} · 每套 {{ item.questionCount }} 题 · 共 {{ item.wordCount }} 个词
                </p>
              </div>
              <button type="button" class="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50" @click="deleteTarget = item">
                删除
              </button>
            </div>
            <p class="mt-1.5 text-xs leading-relaxed text-muted">
              <template v-for="(group, index) in groupSpecialUnits(item)" :key="group.textbookName">
                <span v-if="index > 0">；</span>{{ group.textbookName }}：{{ group.unitNames.join('、') }}
              </template>
            </p>
          </div>
        </div>
        <p v-else class="mt-4 text-xs text-muted">还没建专项练习。点右上角“新建套题”，选一种题型和单元范围即可。</p>
      </section>

      <Modal
        :open="createOpen"
        title="新建专项练习"
        description="选一种题型、勾选单元范围，每套默认 10 题。孩子每次打开这套练习，都会从这些单元里随机出题，只出这一种题型。"
        wide
        @close="createOpen = false"
      >
        <div class="space-y-5">
          <div>
            <label class="form-label">名称（可选）</label>
            <input v-model="formTitle" type="text" maxlength="50" placeholder="不填则自动用题型命名，如“听音选词专项”" class="form-input">
          </div>
          <div>
            <label class="form-label">题型（固定一种）</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in SPECIAL_TYPE_OPTIONS"
                :key="option.value"
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                :class="formType === option.value ? 'border-forest bg-forest text-white' : 'border-line bg-white text-ink hover:border-forest/40'"
                @click="formType = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <div>
            <label class="form-label">单元范围（可跨多本课本勾选）</label>
            <div v-if="createUnitsLoading" class="space-y-2">
              <div v-for="index in 3" :key="index" class="skeleton h-10" />
            </div>
            <div v-else-if="createTextbookUnits.length" class="space-y-4">
              <div v-for="group in createTextbookUnits" :key="group.textbookId">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-medium text-ink">{{ group.textbookName }}</p>
                  <button type="button" class="text-xs font-medium text-forest-deep underline underline-offset-2" @click="toggleCreateTextbook(group)">
                    {{ group.units.every((unit) => formUnitIds.includes(unit.id)) ? '取消全选' : '全选' }}
                  </button>
                </div>
                <div class="mt-2 space-y-1.5">
                  <label
                    v-for="unit in group.units"
                    :key="unit.id"
                    class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line/60 bg-white/60 px-3 py-2"
                  >
                    <input :checked="formUnitIds.includes(unit.id)" type="checkbox" class="size-4 shrink-0 accent-[#2f5f4c]" @change="toggleCreateUnit(unit.id)">
                    <span class="min-w-0 flex-1 text-sm text-ink">Unit {{ unit.unitNo }} · {{ unit.unitName }}</span>
                    <span class="shrink-0 text-xs text-muted">{{ unit.wordCount }} 词</span>
                  </label>
                </div>
              </div>
            </div>
            <p v-else class="text-xs text-muted">已指定的课本里暂无单元。</p>
          </div>
          <div>
            <label class="form-label">每套题数</label>
            <input v-model.number="formCount" type="number" min="1" max="50" step="1" class="form-input w-28">
            <p class="mt-1 text-xs text-muted">默认 10 题，1–50 题；所选单元里能出该题型的词不够时，按实际能出的出。</p>
          </div>
        </div>
        <template #footer>
          <button class="btn-ghost btn-sm" @click="createOpen = false">取消</button>
          <button class="btn-primary btn-sm" :disabled="createSaving || !formUnitIds.length" @click="createSpecial">
            <Loader2 v-if="createSaving" :size="14" class="animate-spin" />
            创建套题
          </button>
        </template>
      </Modal>

      <Modal
        :open="!!deleteTarget"
        title="删除这套专项练习？"
        description="删除后孩子端将不再看到这套练习；已经开局的会话与答题记录会保留。"
        @close="deleteTarget = null"
      >
        <p v-if="deleteTarget" class="text-sm text-ink">「{{ deleteTarget.title }}」· {{ QUESTION_TYPE_LABELS[deleteTarget.questionType] }} · 每套 {{ deleteTarget.questionCount }} 题</p>
        <template #footer>
          <button class="btn-ghost btn-sm" @click="deleteTarget = null">取消</button>
          <button class="btn-primary btn-sm !bg-red-600" :disabled="deleting" @click="confirmDelete">
            <Loader2 v-if="deleting" :size="14" class="animate-spin" />
            确认删除
          </button>
        </template>
      </Modal>

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

      <section class="card mt-6 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="eyebrow">错题分析</p>
            <h2 class="mt-1 section-title">错在哪里</h2>
            <p class="mt-1 text-xs text-muted">按题型统计近 {{ days }} 天的答题：听力是听不懂，拼写是不会写，词义是不懂意思；正确率越低越需要加强。</p>
          </div>
          <span class="text-[11px] text-muted">近 {{ days }} 天</span>
        </div>
        <div v-if="abilityGroups.length" class="mt-5 grid gap-4 md:grid-cols-3">
          <div
            v-for="group in abilityGroups"
            :key="group.ability"
            class="rounded-2xl border border-line/70 bg-white/50 p-4"
          >
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-sm font-medium text-ink">
                {{ group.label }}
                <span class="text-[11px] font-normal text-muted">· {{ group.hint }}</span>
              </p>
              <span class="text-lg font-semibold" :class="accuracyTextClass(group.accuracy)">{{ group.accuracy }}%</span>
            </div>
            <p class="mt-0.5 text-[11px] text-muted">答 {{ group.answered }} 题 · 错 {{ group.wrong }} 题</p>
            <ProgressBar :value="group.accuracy" :tone="accuracyTone(group.accuracy)" size="sm" class="mt-2.5" />
            <div class="mt-4 space-y-2.5">
              <div v-for="stat in group.types" :key="stat.type" class="rounded-xl bg-paper/70 px-3 py-2.5">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-medium text-ink">{{ stat.label }}</p>
                  <span class="text-[11px] font-medium text-ink">{{ stat.accuracy }}%</span>
                </div>
                <p class="mt-0.5 text-[10px] text-muted">答 {{ stat.answered }} 题 · 错 {{ stat.wrong }} 题</p>
                <div v-if="stat.topErrors.length" class="mt-2 flex flex-wrap items-center gap-1.5">
                  <span class="text-[9px] text-muted">错得最多：</span>
                  <span
                    v-for="word in stat.topErrors"
                    :key="word.spelling"
                    :title="word.chineseDef"
                    class="rounded-full bg-danger-soft px-2 py-0.5 text-[9px] text-danger"
                  >{{ word.spelling }} ×{{ word.wrong }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="py-8 text-center text-xs text-muted">这段时间还没有答题，练几局就能量出短板。</p>
      </section>

      <section class="card mt-6 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="eyebrow">答题明细</p>
            <h2 class="mt-1 section-title">近期答题</h2>
            <p class="mt-1 text-xs text-muted">最新 20 条答题记录，能看到每道题的题目和答案；错题红色标出。</p>
          </div>
          <div class="flex items-center gap-1.5 rounded-full border border-line bg-white/60 p-1">
            <button
              type="button"
              class="rounded-full px-3 py-1 text-[11px] font-medium"
              :class="onlyWrong ? 'text-muted' : 'bg-ink text-paper'"
              @click="setOnlyWrong(false)"
            >
              全部
            </button>
            <button
              type="button"
              class="rounded-full px-3 py-1 text-[11px] font-medium"
              :class="onlyWrong ? 'bg-danger text-white' : 'text-muted'"
              @click="setOnlyWrong(true)"
            >
              只看错题
            </button>
          </div>
        </div>
        <div v-if="recentLoading" class="py-8 text-center text-xs text-muted">正在加载答题记录…</div>
        <div v-else-if="recentAnswers.length" class="mt-5 space-y-3">
          <div
            v-for="item in recentAnswers"
            :key="item.id"
            class="rounded-2xl border px-4 py-3.5"
            :class="item.isCorrect ? 'border-line/70 bg-white/50' : 'border-danger/50 bg-danger-soft/40'"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                :class="item.isCorrect ? 'bg-forest-soft text-forest' : 'bg-danger text-white'"
              >
                <Check v-if="item.isCorrect" :size="11" />
                <X v-else :size="11" />
                {{ item.isCorrect ? '答对' : '答错' }}
              </span>
              <span class="text-[11px] font-medium text-ink">{{ item.typeLabel }}</span>
              <span class="text-[11px] text-muted">{{ SESSION_MODE_LABELS[item.sessionMode] || item.sessionMode }}</span>
              <span class="ml-auto text-[10px] text-muted">{{ formatDateTimeCN(item.answeredAt) }}</span>
            </div>
            <div class="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p class="text-sm font-medium text-ink">{{ item.word.spelling }}</p>
              <span v-if="item.word.phonetic" class="text-[11px] text-muted">{{ item.word.phonetic }}</span>
              <span class="text-[11px] text-muted">{{ item.word.chineseDef }}</span>
            </div>
            <div v-if="item.questionType === 'image_choice' && item.word.imageUrl" class="mt-2.5">
              <img :src="item.word.imageUrl" :alt="item.word.spelling" class="h-24 w-24 rounded-xl border border-line/70 bg-white object-contain" />
            </div>
            <button
              v-else-if="item.questionType === 'audio_choice' && item.word.audioUrl"
              type="button"
              class="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11px] text-ink"
              @click="playAudio(item.word.audioUrl)"
            >
              <Volume2 :size="13" />
              播放这道题的录音
            </button>
            <p v-if="item.prompt && item.questionType !== 'image_choice' && item.questionType !== 'audio_choice'" class="mt-2 text-xs leading-relaxed text-ink/80">
              题目：{{ item.prompt }}
            </p>
            <div v-if="item.questionType === 'pronunciation_choice'" class="mt-2 space-y-1 text-xs leading-relaxed">
              <p>
                <span class="text-muted">孩子选了：</span>
                <span :class="item.isCorrect ? 'text-forest' : 'text-danger'">{{ item.userAnswerWord ? `“${item.userAnswerWord}” 的发音` : '一段录音' }}</span>
                <button
                  v-if="item.userAnswer"
                  type="button"
                  class="ml-1.5 inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[10px] text-ink"
                  @click="playAudio(item.userAnswer)"
                >
                  <Volume2 :size="11" />
                  播放
                </button>
              </p>
              <p v-if="!item.isCorrect">
                <span class="text-muted">正确发音：</span>
                <span class="text-forest">{{ item.correctAnswerWord ? `“${item.correctAnswerWord}” 的发音` : '目标词的录音' }}</span>
                <button
                  v-if="item.correctAnswer"
                  type="button"
                  class="ml-1.5 inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[10px] text-ink"
                  @click="playAudio(item.correctAnswer)"
                >
                  <Volume2 :size="11" />
                  播放
                </button>
              </p>
            </div>
            <div v-else class="mt-2 space-y-1 text-xs leading-relaxed">
              <p>
                <span class="text-muted">孩子答：</span>
                <span :class="item.isCorrect ? 'font-medium text-forest' : 'font-medium text-danger'">{{ item.userAnswer }}</span>
              </p>
              <p v-if="!item.isCorrect">
                <span class="text-muted">正确答案：</span>
                <span class="font-medium text-forest">{{ item.correctAnswer }}</span>
              </p>
            </div>
          </div>
        </div>
        <p v-else class="py-8 text-center text-xs text-muted">{{ onlyWrong ? '最近 20 条里没有错题' : '还没有答题记录' }}</p>
      </section>

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
