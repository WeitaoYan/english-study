<script setup lang="ts">
import {
  BookMarked,
  Check,
  Clock3,
  Gift,
  Info,
  Users,
  X,
} from 'lucide-vue-next'
import type { IncentiveEvent, IncentiveStatus, StudentRewards } from '@english-study/shared'
import {
  INCENTIVE_STATUS_LABELS,
  formatDateTimeCN,
  formatIncentiveCondition,
} from '@english-study/shared'

const api = useApi()
const toast = useToast()

const data = ref<StudentRewards | null>(null)
const loading = ref(true)
const activeTab = ref<Exclude<IncentiveStatus, 'revoked'>>('pending_confirm')
const processing = ref('')

const tabs: Array<{ key: Exclude<IncentiveStatus, 'revoked'>; label: string }> = [
  { key: 'pending_confirm', label: '待确认' },
  { key: 'pending_redeem', label: '待兑现' },
  { key: 'redeemed', label: '已兑换' },
]

const filteredEvents = computed(() =>
  (data.value?.events || []).filter((event) => event.status === activeTab.value),
)

const statusTone: Record<string, string> = {
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
    data.value = await api.get<StudentRewards>('/student/rewards')
  } catch (error) {
    toast.error(errorMessage(error, '奖励进度加载失败'))
  } finally {
    loading.value = false
  }
}

async function acceptInvite(id: string) {
  if (processing.value) return
  processing.value = id
  try {
    await api.post(`/family/invites/${id}/accept`)
    toast.success('已确认家庭绑定')
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '确认失败'))
  } finally {
    processing.value = ''
  }
}

async function rejectInvite(id: string) {
  if (processing.value) return
  processing.value = id
  try {
    await api.post(`/family/invites/${id}/reject`)
    toast.success('已拒绝该绑定邀请')
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '操作失败'))
  } finally {
    processing.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="学生端 · 奖励进度"
      title="家庭约定的奖励记录"
      description="平台只记录条件是否达成，不预设奖励内容，也不能代替家长确认或兑换。"
    >
      <template #actions>
        <NuxtLink to="/student" class="btn-secondary">
          继续学习
        </NuxtLink>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="6" label="正在读取奖励记录" />

    <template v-else-if="data">
      <section v-if="data.invites.length" class="mb-6 space-y-2">
        <div
          v-for="invite in data.invites"
          :key="invite.id"
          class="flex flex-col gap-3 rounded-2xl border border-gold/25 bg-gold-soft/70 px-4 py-3.5 sm:flex-row sm:items-center"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
            <Users :size="16" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-ink">家长绑定邀请</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
              {{ invite.parentName }} 申请绑定为你的{{ invite.relation }}，确认后家长可以查看学习报告并设置激励规则。
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button class="btn-secondary btn-sm" :disabled="processing === invite.id" @click="rejectInvite(invite.id)">
              <X :size="13" />
              拒绝
            </button>
            <button class="btn-primary btn-sm" :disabled="processing === invite.id" @click="acceptInvite(invite.id)">
              <Check :size="13" />
              确认绑定
            </button>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">待家长确认</p>
          <p class="mt-2 font-display text-3xl text-clay">{{ data.counts.pending_confirm }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">待兑现</p>
          <p class="mt-2 font-display text-3xl text-ocean">{{ data.counts.pending_redeem }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">已兑换</p>
          <p class="mt-2 font-display text-3xl text-forest">{{ data.counts.redeemed }}</p>
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section>
          <div class="mb-3">
            <p class="eyebrow">家庭规则</p>
            <h2 class="mt-1 section-title">当前生效的激励条件</h2>
          </div>
          <div v-if="data.rules.length" class="space-y-3">
            <div v-for="rule in data.rules" :key="rule.id" class="card p-4">
              <div class="flex items-start gap-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-forest-soft text-forest">
                  <Gift :size="16" />
                </span>
                <div class="min-w-0">
                  <p class="text-xs leading-relaxed text-ink">{{ formatIncentiveCondition(rule.triggerType, rule.triggerParams) }}</p>
                  <p class="mt-2 text-[11px] text-muted">奖励内容</p>
                  <p class="mt-0.5 text-sm font-medium text-ink">{{ rule.rewardDescription }}</p>
                </div>
              </div>
            </div>
          </div>
          <EmptyState
            v-else
            title="家长还没有设置规则"
            description="家长可在激励设置中添加条件，例如完成指定单元或连续学习。"
            compact
          >
            <template #icon><Gift :size="17" /></template>
          </EmptyState>

          <div class="mt-4 flex items-start gap-2 rounded-xl border border-line bg-cream/70 px-3.5 py-3 text-[10px] leading-relaxed text-muted">
            <Info :size="13" class="mt-0.5 shrink-0" />
            奖励内容由家长自行填写。学生端只能查看进度，不能修改规则或自行确认兑换。
          </div>
        </section>

        <section>
          <div class="mb-3 flex items-end justify-between">
            <div>
              <p class="eyebrow">奖励记录</p>
              <h2 class="mt-1 section-title">按状态查看</h2>
            </div>
            <span class="inline-flex items-center gap-1 text-[10px] text-muted">
              <Clock3 :size="12" />
              自动生成
            </span>
          </div>

          <div class="mb-3 flex rounded-xl border border-line bg-cream/60 p-1">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="flex-1 rounded-lg px-3 py-2 text-xs transition"
              :class="activeTab === tab.key ? 'bg-white font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
              <span class="ml-1 text-[10px] opacity-60">{{ data.counts[tab.key] }}</span>
            </button>
          </div>

          <div v-if="filteredEvents.length" class="space-y-2.5">
            <div v-for="event in filteredEvents" :key="event.id" class="card p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs leading-relaxed text-ink">{{ condition(event) }}</p>
                  <p class="mt-1.5 text-sm font-medium text-ink">{{ event.rewardDescription }}</p>
                  <p class="mt-1 text-[10px] text-muted">达成于 {{ formatDateTimeCN(event.triggeredAt) }}</p>
                </div>
                <span :class="statusTone[event.status]">{{ INCENTIVE_STATUS_LABELS[event.status] }}</span>
              </div>
              <div v-if="event.note" class="mt-3 rounded-lg bg-paper px-3 py-2 text-[10px] leading-relaxed text-muted">
                家长备注：{{ event.note }}
              </div>
              <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line/60 pt-2.5 text-[10px] text-muted">
                <span v-if="event.confirmedAt">确认 {{ formatDateTimeCN(event.confirmedAt) }}</span>
                <span v-if="event.redeemedAt">兑换 {{ formatDateTimeCN(event.redeemedAt) }}</span>
                <span v-if="event.status === 'pending_confirm'">等待家长确认</span>
                <span v-if="event.status === 'pending_redeem'">已确认，等待线下兑现</span>
              </div>
            </div>
          </div>
          <EmptyState
            v-else
            title="这个分类还没有记录"
            description="条件达成后系统会自动生成记录，并同步到家长端。"
            compact
          >
            <template #icon><BookMarked :size="17" /></template>
          </EmptyState>
        </section>
      </div>
    </template>
  </div>
</template>
