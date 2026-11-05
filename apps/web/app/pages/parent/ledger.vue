<script setup lang="ts">
import {
  BookMarked,
  Check,
  CheckCircle2,
  Clock3,
  Gift,
  Loader2,
  MessageSquare,
  RotateCcw,
  X,
} from 'lucide-vue-next'
import type { IncentiveEvent, IncentiveStatus } from '@english-study/shared'
import {
  INCENTIVE_STATUS_LABELS,
  formatDateTimeCN,
  formatIncentiveCondition,
} from '@english-study/shared'

type TabKey = 'all' | IncentiveStatus

const api = useApi()
const toast = useToast()

const events = ref<IncentiveEvent[]>([])
const loading = ref(true)
const activeTab = ref<TabKey>('pending_confirm')
const processing = ref('')

const noteOpen = ref(false)
const noteTarget = ref<IncentiveEvent | null>(null)
const noteText = ref('')
const savingNote = ref(false)

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'pending_confirm', label: '待确认' },
  { key: 'pending_redeem', label: '待兑现' },
  { key: 'redeemed', label: '已兑换' },
  { key: 'revoked', label: '已撤销' },
  { key: 'all', label: '全部' },
]

const counts = computed(() => {
  const result: Record<TabKey, number> = {
    all: events.value.length,
    pending_confirm: 0,
    pending_redeem: 0,
    redeemed: 0,
    revoked: 0,
  }
  for (const event of events.value) result[event.status] += 1
  return result
})

const filtered = computed(() =>
  activeTab.value === 'all'
    ? events.value
    : events.value.filter((event) => event.status === activeTab.value),
)

const statusTone: Record<IncentiveStatus, string> = {
  pending_confirm: 'chip-clay',
  pending_redeem: 'chip border-ocean/15 bg-ocean-soft text-ocean',
  redeemed: 'chip-forest',
  revoked: 'chip',
}

function condition(event: IncentiveEvent) {
  return formatIncentiveCondition(event.triggerType, event.triggerParams)
}

async function load() {
  loading.value = true
  try {
    const result = await api.get<{ data: IncentiveEvent[] }>('/parent/ledger')
    events.value = result.data
  } catch (error) {
    toast.error(errorMessage(error, '奖励账本加载失败'))
  } finally {
    loading.value = false
  }
}

async function act(event: IncentiveEvent, action: 'confirm' | 'redeem' | 'revoke') {
  processing.value = event.id
  try {
    await api.patch(`/parent/ledger/${event.id}`, { action })
    const messages = {
      confirm: '已确认达成，等待线下兑现',
      redeem: '已标记为兑换完成',
      revoke: '已撤销该条记录',
    }
    toast.success(messages[action])
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '操作失败'))
  } finally {
    processing.value = ''
  }
}

function openNote(event: IncentiveEvent) {
  noteTarget.value = event
  noteText.value = event.note || ''
  noteOpen.value = true
}

async function saveNote() {
  if (!noteTarget.value || savingNote.value) return
  savingNote.value = true
  try {
    await api.patch(`/parent/ledger/${noteTarget.value.id}`, {
      action: 'note',
      note: noteText.value.trim(),
    })
    toast.success('备注已保存')
    noteOpen.value = false
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '备注保存失败'))
  } finally {
    savingNote.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="家长端 · 奖励账本"
      title="把约定记录下来"
      description="条件达成后系统自动生成记录。确认、兑现、撤销和备注都由你操作，孩子端只能查看结果。"
    >
      <template #actions>
        <NuxtLink to="/parent/incentives" class="btn-secondary">
          <Gift :size="15" />
          激励设置
        </NuxtLink>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="7" label="正在读取奖励记录" />

    <template v-else>
      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">待确认</p>
          <p class="mt-2 font-display text-3xl text-clay">{{ counts.pending_confirm }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">待兑现</p>
          <p class="mt-2 font-display text-3xl text-ocean">{{ counts.pending_redeem }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">累计已兑换</p>
          <p class="mt-2 font-display text-3xl text-forest">{{ counts.redeemed }}</p>
        </div>
      </section>

      <div class="mt-6 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-cream/60 p-1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs transition"
          :class="activeTab === tab.key ? 'bg-white font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="ml-1 text-[10px] opacity-60">{{ counts[tab.key] }}</span>
        </button>
      </div>

      <div v-if="filtered.length" class="mt-4 space-y-3">
        <article v-for="event in filtered" :key="event.id" class="card overflow-hidden">
          <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-xl"
              :class="event.status === 'redeemed' ? 'bg-forest-soft text-forest' : event.status === 'revoked' ? 'bg-paper-deep text-muted' : 'bg-clay-soft text-clay'"
            >
              <CheckCircle2 v-if="event.status === 'redeemed'" :size="18" />
              <Clock3 v-else-if="event.status === 'pending_redeem'" :size="18" />
              <Gift v-else :size="18" />
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium text-ink">{{ event.studentName || '孩子' }}</p>
                <span :class="statusTone[event.status]">{{ INCENTIVE_STATUS_LABELS[event.status] }}</span>
                <span v-if="event.note" class="chip !py-0.5">
                  <MessageSquare :size="10" />
                  有备注
                </span>
              </div>
              <p class="mt-2 text-xs leading-relaxed text-ink-soft">{{ condition(event) }}</p>
              <div class="mt-2.5 rounded-xl bg-paper/80 px-3 py-2.5">
                <p class="text-[10px] text-muted">约定奖励</p>
                <p class="mt-0.5 text-sm font-medium text-ink">{{ event.rewardDescription }}</p>
              </div>
              <div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
                <span>达成于 {{ formatDateTimeCN(event.triggeredAt) }}</span>
                <span v-if="event.confirmedAt">确认于 {{ formatDateTimeCN(event.confirmedAt) }}</span>
                <span v-if="event.redeemedAt">兑换于 {{ formatDateTimeCN(event.redeemedAt) }}</span>
              </div>
              <p v-if="event.note" class="mt-2 rounded-lg bg-cream/70 px-3 py-2 text-[10px] leading-relaxed text-muted">
                备注：{{ event.note }}
              </p>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
              <template v-if="event.status === 'pending_confirm'">
                <button class="btn-primary btn-sm" :disabled="processing === event.id" @click="act(event, 'confirm')">
                  <Loader2 v-if="processing === event.id" :size="13" class="animate-spin" />
                  <Check v-else :size="13" />
                  确认达成
                </button>
                <button class="btn-ghost btn-sm !text-danger" :disabled="processing === event.id" @click="act(event, 'revoke')">
                  <X :size="13" />
                  撤销
                </button>
              </template>
              <template v-else-if="event.status === 'pending_redeem'">
                <button class="btn-primary btn-sm" :disabled="processing === event.id" @click="act(event, 'redeem')">
                  <Loader2 v-if="processing === event.id" :size="13" class="animate-spin" />
                  <Check v-else :size="13" />
                  标记已兑换
                </button>
                <button class="btn-ghost btn-sm !text-danger" :disabled="processing === event.id" @click="act(event, 'revoke')">
                  <X :size="13" />
                  撤销
                </button>
              </template>
              <button class="btn-secondary btn-sm" @click="openNote(event)">
                <MessageSquare :size="13" />
                {{ event.note ? '编辑备注' : '添加备注' }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <EmptyState
        v-else
        title="这个分类还没有记录"
        description="当孩子达到你设置的激励条件后，系统会自动在这里生成一条待确认记录。"
      >
        <template #icon><BookMarked :size="18" /></template>
        <template #action>
          <NuxtLink to="/parent/incentives" class="btn-secondary">
            <RotateCcw :size="14" />
            查看激励规则
          </NuxtLink>
        </template>
      </EmptyState>
    </template>

    <Modal
      :open="noteOpen"
      title="添加备注"
      description="备注只用于家庭内部记录，孩子端可以看到。"
      @close="noteOpen = false"
    >
      <div v-if="noteTarget" class="space-y-4">
        <div class="rounded-xl border border-line bg-paper/70 px-3.5 py-3">
          <p class="text-xs leading-relaxed text-ink">{{ condition(noteTarget) }}</p>
          <p class="mt-1 text-[11px] text-muted">{{ noteTarget.rewardDescription }}</p>
        </div>
        <div>
          <label class="label" for="ledger-note">备注内容</label>
          <textarea
            id="ledger-note"
            v-model="noteText"
            class="input min-h-[100px] resize-y"
            maxlength="300"
            placeholder="例如：周六下午去书店 / 本周已兑现"
          />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="noteOpen = false">取消</button>
        <button class="btn-primary" :disabled="savingNote" @click="saveNote">
          <Loader2 v-if="savingNote" :size="15" class="animate-spin" />
          <Check v-else :size="15" />
          保存备注
        </button>
      </template>
    </Modal>
  </div>
</template>
