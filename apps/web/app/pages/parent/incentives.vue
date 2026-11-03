<script setup lang="ts">
import {
  Check,
  Gift,
  Info,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-vue-next'
import type { IncentiveRule, IncentiveTrigger } from '@english-study/shared'
import {
  INCENTIVE_TRIGGER_LABELS,
  formatDateTimeCN,
  formatIncentiveCondition,
} from '@english-study/shared'

interface ParentUnitOption {
  id: string
  unitNo: number
  unitName: string
  textbookName: string
  grade: string
}

const api = useApi()
const toast = useToast()

const rules = ref<IncentiveRule[]>([])
const units = ref<ParentUnitOption[]>([])
const loading = ref(true)

const modalOpen = ref(false)
const editingId = ref('')
const saving = ref(false)
const formError = ref('')

const deleteOpen = ref(false)
const deleteTarget = ref<IncentiveRule | null>(null)
const deleting = ref(false)

const triggerOptions = Object.entries(INCENTIVE_TRIGGER_LABELS) as Array<[IncentiveTrigger, string]>

const form = reactive({
  triggerType: 'unit_complete' as IncentiveTrigger,
  unitId: '',
  minStrength: 1,
  days: 5,
  minAnswers: 10,
  accuracy: 85,
  wrongLimit: 5,
  count: 20,
  rewardDescription: '',
  enabled: true,
})

const unitOptions = computed(() =>
  units.value.map((unit) => ({
    value: unit.id,
    label: `${unit.grade} · ${unit.textbookName} · ${unit.unitName}`,
  })),
)

const enabledCount = computed(() => rules.value.filter((rule) => rule.enabled).length)
const totalEvents = computed(() => rules.value.reduce((sum, rule) => sum + (rule.eventCount || 0), 0))

async function load() {
  loading.value = true
  try {
    const [incentives, unitList] = await Promise.all([
      api.get<{ familyId: string | null; data: IncentiveRule[] }>('/parent/incentives'),
      api.get<{ data: ParentUnitOption[] }>('/parent/units'),
    ])
    rules.value = incentives.data
    units.value = unitList.data || []
  } catch (error) {
    toast.error(errorMessage(error, '激励规则加载失败'))
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.triggerType = 'unit_complete'
  form.unitId = unitOptions.value[0]?.value || ''
  form.minStrength = 1
  form.days = 5
  form.minAnswers = 10
  form.accuracy = 85
  form.wrongLimit = 5
  form.count = 20
  form.rewardDescription = ''
  form.enabled = true
  formError.value = ''
}

function openCreate() {
  editingId.value = ''
  resetForm()
  modalOpen.value = true
}

function openEdit(rule: IncentiveRule) {
  editingId.value = rule.id
  resetForm()
  form.triggerType = rule.triggerType
  form.rewardDescription = rule.rewardDescription
  form.enabled = rule.enabled
  const params = rule.triggerParams || {}
  if (rule.triggerType === 'unit_complete') {
    form.unitId = String(params.unitId || '')
    form.minStrength = Number(params.minStrength ?? 1)
  }
  if (rule.triggerType === 'streak_days') form.days = Number(params.days ?? 5)
  if (rule.triggerType === 'daily_accuracy') {
    form.minAnswers = Number(params.minAnswers ?? 10)
    form.accuracy = Number(params.accuracy ?? 85)
  }
  if (rule.triggerType === 'weekly_wrong_lt') {
    form.minAnswers = Number(params.minAnswers ?? 20)
    form.wrongLimit = Number(params.wrongLimit ?? 5)
  }
  if (rule.triggerType === 'review_count') form.count = Number(params.count ?? 20)
  modalOpen.value = true
}

function buildParams(): Record<string, string | number> {
  switch (form.triggerType) {
    case 'unit_complete':
      return {
        unitId: form.unitId,
        unitName: unitOptions.value.find((unit) => unit.value === form.unitId)?.label.split(' · ').slice(-1)[0] || '',
        minStrength: form.minStrength,
      }
    case 'streak_days':
      return { days: form.days }
    case 'daily_accuracy':
      return { minAnswers: form.minAnswers, accuracy: form.accuracy }
    case 'weekly_wrong_lt':
      return { minAnswers: form.minAnswers, wrongLimit: form.wrongLimit }
    case 'review_count':
      return { count: form.count }
    default:
      return {}
  }
}

async function save() {
  formError.value = ''
  if (!form.rewardDescription.trim()) {
    formError.value = '请填写奖励内容，例如“周末多玩 30 分钟”'
    return
  }
  if (form.triggerType === 'unit_complete' && !form.unitId) {
    formError.value = '请选择要考核的单元'
    return
  }
  if (['daily_accuracy', 'weekly_wrong_lt'].includes(form.triggerType) && form.minAnswers < 1) {
    formError.value = '题量至少为 1'
    return
  }
  if (form.triggerType === 'daily_accuracy' && (form.accuracy < 1 || form.accuracy > 100)) {
    formError.value = '正确率需在 1% 到 100% 之间'
    return
  }

  saving.value = true
  const payload = {
    triggerType: form.triggerType,
    triggerParams: buildParams(),
    rewardDescription: form.rewardDescription.trim(),
    enabled: form.enabled,
  }
  try {
    if (editingId.value) {
      await api.patch(`/parent/incentives/${editingId.value}`, payload)
      toast.success('规则已更新')
    } else {
      await api.post('/parent/incentives', payload)
      toast.success('规则已添加')
    }
    modalOpen.value = false
    await load()
  } catch (error) {
    formError.value = errorMessage(error, '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggle(rule: IncentiveRule) {
  const next = !rule.enabled
  rule.enabled = next
  try {
    await api.patch(`/parent/incentives/${rule.id}`, { enabled: next })
    toast.success(next ? '规则已启用' : '规则已停用')
  } catch (error) {
    rule.enabled = !next
    toast.error(errorMessage(error, '操作失败'))
  }
}

function askDelete(rule: IncentiveRule) {
  deleteTarget.value = rule
  deleteOpen.value = true
}

async function remove() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const result = await api.delete<{ ok: boolean; disabled?: boolean }>(`/parent/incentives/${deleteTarget.value.id}`)
    toast.success(result.disabled ? '规则已产生记录，已改为停用' : '规则已删除')
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="家长端 · 激励设置"
      title="约定鼓励方式"
      description="条件由你设定，奖励内容完全由你填写。平台只在条件达成时生成记录，不预设奖品，也不替你做确认。"
    >
      <template #actions>
        <button class="btn-primary" @click="openCreate">
          <Plus :size="16" />
          新增规则
        </button>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="6" label="正在读取激励规则" />

    <template v-else>
      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">规则总数</p>
          <p class="mt-2 font-display text-3xl text-ink">{{ rules.length }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">正在启用</p>
          <p class="mt-2 font-display text-3xl text-forest">{{ enabledCount }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">累计触发</p>
          <p class="mt-2 font-display text-3xl text-clay">{{ totalEvents }}</p>
        </div>
      </section>

      <div class="mt-5 flex items-start gap-2.5 rounded-2xl border border-ocean/15 bg-ocean-soft/50 px-4 py-3.5">
        <Info :size="15" class="mt-0.5 shrink-0 text-ocean" />
        <p class="text-[11px] leading-relaxed text-ink-soft">
          建议同时保留 1 条“完成单元”和 1 条“连续学习”规则，避免只盯正确率。条件触发后需要你在奖励账本中确认，孩子才能看到结果。
        </p>
      </div>

      <div class="mt-6 flex items-end justify-between">
        <div>
          <p class="eyebrow">规则列表</p>
          <h2 class="mt-1 section-title">当前家庭约定</h2>
        </div>
        <span class="text-[11px] text-muted">{{ rules.length }} 条规则</span>
      </div>

      <div v-if="rules.length" class="mt-4 grid gap-4 lg:grid-cols-2">
        <article
          v-for="rule in rules"
          :key="rule.id"
          class="card flex flex-col overflow-hidden transition"
          :class="rule.enabled ? '' : 'opacity-70'"
        >
          <div class="flex items-start gap-3 p-5">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-xl"
              :class="rule.enabled ? 'bg-forest-soft text-forest' : 'bg-paper-deep text-muted'"
            >
              <Gift :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="chip-forest !py-0.5">{{ INCENTIVE_TRIGGER_LABELS[rule.triggerType] }}</span>
                <span v-if="!rule.enabled" class="chip !py-0.5">已停用</span>
              </div>
              <p class="mt-2 text-sm leading-relaxed text-ink">
                {{ formatIncentiveCondition(rule.triggerType, rule.triggerParams) }}
              </p>
              <div class="mt-3 rounded-xl bg-paper/80 px-3 py-2.5">
                <p class="text-[10px] text-muted">奖励内容</p>
                <p class="mt-0.5 text-sm font-medium text-ink">{{ rule.rewardDescription }}</p>
              </div>
              <p class="mt-2.5 text-[10px] text-muted">
                已触发 {{ rule.eventCount || 0 }} 次 · 创建于 {{ formatDateTimeCN(rule.createdAt) }}
              </p>
            </div>
          </div>

          <div class="mt-auto flex items-center justify-between border-t border-line/70 bg-paper/40 px-5 py-3">
            <button
              class="inline-flex items-center gap-1.5 text-[11px] font-medium transition"
              :class="rule.enabled ? 'text-forest' : 'text-muted'"
              @click="toggle(rule)"
            >
              <span
                class="relative inline-flex h-5 w-9 items-center rounded-full transition"
                :class="rule.enabled ? 'bg-forest' : 'bg-line-strong'"
              >
                <span
                  class="absolute size-3.5 rounded-full bg-white shadow transition"
                  :class="rule.enabled ? 'left-[18px]' : 'left-[3px]'"
                />
              </span>
              {{ rule.enabled ? '已启用' : '已停用' }}
            </button>
            <div class="flex items-center gap-1">
              <button class="btn-ghost btn-sm" @click="openEdit(rule)">
                <Pencil :size="13" />
                编辑
              </button>
              <button class="btn-ghost btn-sm !text-danger" @click="askDelete(rule)">
                <Trash2 :size="13" />
                删除
              </button>
            </div>
          </div>
        </article>
      </div>

      <EmptyState
        v-else
        title="还没有设置激励规则"
        description="可以从“完成指定单元学习”开始，奖励内容写成一件你们本来就会一起做的事。"
      >
        <template #icon><Settings2 :size="18" /></template>
        <template #action>
          <button class="btn-primary" @click="openCreate">
            <Plus :size="15" />
            添加第一条规则
          </button>
        </template>
      </EmptyState>
    </template>

    <Modal
      :open="modalOpen"
      :title="editingId ? '编辑激励规则' : '新增激励规则'"
      description="先选择条件类型，再填写条件参数和你们约定的奖励内容。"
      wide
      @close="modalOpen = false"
    >
      <div class="space-y-5">
        <div>
          <label class="label" for="trigger-type">条件类型</label>
          <select id="trigger-type" v-model="form.triggerType" class="input">
            <option v-for="[value, label] in triggerOptions" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
        </div>

        <div v-if="form.triggerType === 'unit_complete'" class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label" for="rule-unit">指定单元</label>
            <select id="rule-unit" v-model="form.unitId" class="input">
              <option value="" disabled>请选择单元</option>
              <option v-for="unit in unitOptions" :key="unit.value" :value="unit.value">
                {{ unit.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="label" for="rule-strength">掌握度要求（0-5 级）</label>
            <input id="rule-strength" v-model.number="form.minStrength" class="input" type="number" min="0" max="5">
          </div>
          <p class="flex items-end pb-3 text-[10px] leading-relaxed text-muted">
            达到该记忆强度才视为“掌握”。建议从 1 级开始。
          </p>
        </div>

        <div v-else-if="form.triggerType === 'streak_days'">
          <label class="label" for="rule-days">连续学习天数</label>
          <input id="rule-days" v-model.number="form.days" class="input" type="number" min="1" max="365">
        </div>

        <div v-else-if="form.triggerType === 'daily_accuracy'" class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="rule-min-answers">单日最少答题数</label>
            <input id="rule-min-answers" v-model.number="form.minAnswers" class="input" type="number" min="1" max="500">
          </div>
          <div>
            <label class="label" for="rule-accuracy">正确率要求（%）</label>
            <input id="rule-accuracy" v-model.number="form.accuracy" class="input" type="number" min="1" max="100">
          </div>
          <p class="text-[10px] leading-relaxed text-muted sm:col-span-2">
            正确率按当日全部作答计算。建议设置在 80% 左右，避免孩子为了正确率回避新词。
          </p>
        </div>

        <div v-else-if="form.triggerType === 'weekly_wrong_lt'" class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="rule-week-answers">本周最少答题数</label>
            <input id="rule-week-answers" v-model.number="form.minAnswers" class="input" type="number" min="1" max="1000">
          </div>
          <div>
            <label class="label" for="rule-wrong-limit">错词上限</label>
            <input id="rule-wrong-limit" v-model.number="form.wrongLimit" class="input" type="number" min="1" max="500">
          </div>
          <p class="text-[10px] leading-relaxed text-muted sm:col-span-2">
            本周去重后的错词数量少于上限时触发。适合鼓励稳定复习，而不是追求一次全对。
          </p>
        </div>

        <div v-else-if="form.triggerType === 'review_count'">
          <label class="label" for="rule-review-count">单日复习题数</label>
          <input id="rule-review-count" v-model.number="form.count" class="input" type="number" min="1" max="500">
        </div>

        <div>
          <label class="label" for="rule-reward">奖励内容</label>
          <textarea
            id="rule-reward"
            v-model="form.rewardDescription"
            class="input min-h-[88px] resize-y"
            maxlength="200"
            placeholder="例如：周末多玩 30 分钟 / 挑选一本新的课外书"
          />
          <p class="mt-1 text-[10px] text-muted">由你完全自定义，平台不会给出奖励建议。</p>
        </div>

        <label class="flex items-center gap-2.5 rounded-xl border border-line bg-paper/70 px-3.5 py-3">
          <input v-model="form.enabled" type="checkbox" class="size-4 accent-[#2f5f4c]">
          <span class="text-xs text-ink-soft">创建后立即启用</span>
        </label>

        <p v-if="formError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="modalOpen = false">取消</button>
        <button class="btn-primary" :disabled="saving" @click="save">
          <Loader2 v-if="saving" :size="15" class="animate-spin" />
          <Check v-else :size="15" />
          保存规则
        </button>
      </template>
    </Modal>

    <Modal
      :open="deleteOpen"
      title="删除激励规则"
      description="删除后不再生成新的达成记录。已有记录会保留在奖励账本中。"
      @close="deleteOpen = false"
    >
      <div v-if="deleteTarget" class="rounded-xl border border-line bg-paper/70 px-4 py-3.5">
        <p class="text-xs leading-relaxed text-ink">
          {{ formatIncentiveCondition(deleteTarget.triggerType, deleteTarget.triggerParams) }}
        </p>
        <p class="mt-1.5 text-sm font-medium text-ink">{{ deleteTarget.rewardDescription }}</p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="deleteOpen = false">取消</button>
        <button class="btn-danger" :disabled="deleting" @click="remove">
          <Loader2 v-if="deleting" :size="15" class="animate-spin" />
          <X v-else :size="15" />
          确认删除
        </button>
      </template>
    </Modal>
  </div>
</template>
