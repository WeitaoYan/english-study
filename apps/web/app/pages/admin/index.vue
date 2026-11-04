<script setup lang="ts">
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Gift,
  Image as ImageIcon,
  ListChecks,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Volume2,
} from 'lucide-vue-next'
import type { AdminStats } from '@english-study/shared'
import {
  INCENTIVE_STATUS_LABELS,
  INCENTIVE_TRIGGER_LABELS,
  formatDateTimeCN,
} from '@english-study/shared'

const api = useApi()
const toast = useToast()

const data = ref<AdminStats | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    data.value = await api.get<AdminStats>('/admin/stats')
  } catch (error) {
    toast.error(errorMessage(error, '统计数据加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="管理端 · 数据概览"
      title="内容与学习概况"
      description="查看用户规模、练习活跃、图片覆盖率与家庭激励使用情况。数据来自原始答题与审核记录。"
    >
      <template #actions>
        <NuxtLink to="/admin/textbooks" class="btn-secondary">
          <BookOpen :size="15" />
          管理课本
        </NuxtLink>
        <NuxtLink to="/admin/images" class="btn-primary">
          <ImageIcon :size="15" />
          审核图片
        </NuxtLink>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="7" label="正在汇总平台数据" />

    <template v-else-if="data">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="学生账号" :value="data.users.students" :sub="`家长 ${data.users.parents} · 管理员 ${data.users.admins}`" :icon="Users" tone="forest" />
        <StatCard label="今日答题" :value="data.practice.todayAnswers" :sub="`今日练习 ${data.practice.todaySessions} 次`" :icon="Target" tone="clay" />
        <StatCard label="图片覆盖率" :value="`${data.coverage.imageRate}%`" :sub="`${data.coverage.withImage} / ${data.coverage.totalWords} 个单词`" :icon="ImageIcon" tone="ocean" />
        <StatCard label="待确认奖励" :value="data.incentives.pendingEvents" :sub="`${data.incentives.rules} 条规则 · 使用率 ${data.incentives.usageRate}%`" :icon="Gift" tone="gold" />
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section class="card p-5 sm:p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="eyebrow">学习活跃</p>
              <h2 class="mt-1 section-title">练习规模</h2>
            </div>
            <Activity :size="18" class="text-muted" />
          </div>
          <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-2xl bg-paper/80 px-4 py-4">
              <p class="text-[10px] text-muted">今日活跃</p>
              <p class="mt-1 font-display text-2xl text-ink">{{ data.active.dau }}</p>
            </div>
            <div class="rounded-2xl bg-paper/80 px-4 py-4">
              <p class="text-[10px] text-muted">近 7 天活跃</p>
              <p class="mt-1 font-display text-2xl text-ink">{{ data.active.wau }}</p>
            </div>
            <div class="rounded-2xl bg-paper/80 px-4 py-4">
              <p class="text-[10px] text-muted">近 30 天活跃</p>
              <p class="mt-1 font-display text-2xl text-ink">{{ data.active.mau }}</p>
            </div>
            <div class="rounded-2xl bg-forest-soft/70 px-4 py-4">
              <p class="text-[10px] text-muted">本周答题</p>
              <p class="mt-1 font-display text-2xl text-forest">{{ data.practice.weekAnswers }}</p>
            </div>
          </div>
          <div class="mt-5 space-y-3">
            <div class="flex items-center justify-between text-xs">
              <span class="inline-flex items-center gap-1.5 text-muted"><CalendarCheck :size="13" /> 今日复习题</span>
              <span class="font-medium text-ink">{{ data.practice.reviewAnswers }} 题</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="inline-flex items-center gap-1.5 text-muted"><TrendingUp :size="13" /> 今日练习次数</span>
              <span class="font-medium text-ink">{{ data.practice.todaySessions }} 次</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="inline-flex items-center gap-1.5 text-muted"><ShieldCheck :size="13" /> 已审核通过图片</span>
              <span class="font-medium text-ink">{{ data.coverage.approvedImages }} 张</span>
            </div>
          </div>
        </section>

        <aside class="space-y-4">
          <section class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="eyebrow">内容覆盖</p>
                <p class="mt-1 text-sm font-medium text-ink">图片审核状态</p>
              </div>
              <ImageIcon :size="17" class="text-muted" />
            </div>
            <div class="mt-4">
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-muted">已有图片的单词</span>
                <span class="font-medium text-ink">{{ data.coverage.withImage }} / {{ data.coverage.totalWords }}</span>
              </div>
              <ProgressBar :value="data.coverage.imageRate" class="mt-2" />
            </div>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <div class="rounded-xl bg-forest-soft/70 px-3 py-2.5">
                <p class="text-[9px] text-muted">已通过</p>
                <p class="mt-1 text-sm font-medium text-forest">{{ data.coverage.approvedImages }}</p>
              </div>
              <div class="rounded-xl bg-clay-soft/70 px-3 py-2.5">
                <p class="text-[9px] text-muted">待审核</p>
                <p class="mt-1 text-sm font-medium text-clay">{{ data.coverage.pendingImages }}</p>
              </div>
            </div>
            <NuxtLink to="/admin/images" class="btn-secondary mt-4 w-full btn-sm">
              进入图片管理
              <ArrowRight :size="13" />
            </NuxtLink>
            <div class="mt-4 border-t border-line/70 pt-4">
              <div class="flex items-center justify-between">
                <p class="text-[11px] text-muted">发音审核（TTS 听音题）</p>
                <Volume2 :size="14" class="text-muted" />
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <div class="rounded-xl bg-forest-soft/70 px-3 py-2.5">
                  <p class="text-[9px] text-muted">已通过</p>
                  <p class="mt-1 text-sm font-medium text-forest">{{ data.pronunciation.approved }}</p>
                </div>
                <div class="rounded-xl bg-clay-soft/70 px-3 py-2.5">
                  <p class="text-[9px] text-muted">待审核</p>
                  <p class="mt-1 text-sm font-medium text-clay">{{ data.pronunciation.pending }}</p>
                </div>
              </div>
              <NuxtLink to="/admin/pronunciation" class="btn-secondary mt-3 w-full btn-sm">
                进入发音审核
                <ArrowRight :size="13" />
              </NuxtLink>
            </div>
          </section>

          <section class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="eyebrow">激励使用</p>
                <p class="mt-1 text-sm font-medium text-ink">家庭规则覆盖</p>
              </div>
              <Gift :size="17" class="text-muted" />
            </div>
            <div class="mt-4 flex items-end justify-between">
              <p class="font-display text-3xl text-ink">{{ data.incentives.usageRate }}%</p>
              <p class="text-[10px] text-muted">{{ data.incentives.familiesWithRules }} 个家庭已设置</p>
            </div>
            <ProgressBar :value="data.incentives.usageRate" class="mt-2" tone="clay" />
            <p class="mt-3 text-[10px] leading-relaxed text-muted">
              平台只负责条件判定和记录，不介入奖励内容与兑现方式。
            </p>
          </section>
        </aside>
      </div>

      <section class="card mt-6 overflow-hidden">
        <div class="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <div>
            <p class="eyebrow">最近奖励事件</p>
            <h2 class="mt-1 section-title">最新达成记录</h2>
          </div>
          <NuxtLink to="/admin/users" class="btn-ghost btn-sm">
            用户与家庭
            <ArrowRight :size="13" />
          </NuxtLink>
        </div>
        <div v-if="data.recentEvents.length" class="divide-y divide-line/70">
          <div v-for="event in data.recentEvents" :key="event.id" class="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-xs font-medium text-ink">{{ event.studentName || '学生' }}</p>
                <span class="chip !py-0.5">{{ INCENTIVE_TRIGGER_LABELS[event.triggerType] }}</span>
                <span class="chip-forest !py-0.5">{{ INCENTIVE_STATUS_LABELS[event.status] }}</span>
              </div>
              <p class="mt-1 truncate text-[11px] text-muted">{{ event.rewardDescription }}</p>
            </div>
            <p class="shrink-0 text-[10px] text-muted">{{ formatDateTimeCN(event.triggeredAt) }}</p>
          </div>
        </div>
        <p v-else class="px-5 py-10 text-center text-xs text-muted">暂无奖励事件</p>
      </section>

      <section class="mt-6 grid gap-3 sm:grid-cols-3">
        <NuxtLink to="/admin/words" class="card flex items-center gap-3 p-4 transition hover:border-forest/25 hover:bg-forest-soft/30">
          <span class="grid size-9 place-items-center rounded-xl bg-forest-soft text-forest"><BookOpen :size="16" /></span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ink">单词库</p>
            <p class="text-[10px] text-muted">新增、编辑与批量导入</p>
          </div>
          <ArrowRight :size="14" class="text-muted" />
        </NuxtLink>
        <NuxtLink to="/admin/questions" class="card flex items-center gap-3 p-4 transition hover:border-forest/25 hover:bg-forest-soft/30">
          <span class="grid size-9 place-items-center rounded-xl bg-ocean-soft text-ocean"><ListChecks :size="16" /></span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ink">题库管理</p>
            <p class="text-[10px] text-muted">维护补充题目与解析</p>
          </div>
          <ArrowRight :size="14" class="text-muted" />
        </NuxtLink>
        <NuxtLink to="/admin/users" class="card flex items-center gap-3 p-4 transition hover:border-forest/25 hover:bg-forest-soft/30">
          <span class="grid size-9 place-items-center rounded-xl bg-clay-soft text-clay"><Users :size="16" /></span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ink">用户与家庭</p>
            <p class="text-[10px] text-muted">账号状态与绑定关系</p>
          </div>
          <ArrowRight :size="14" class="text-muted" />
        </NuxtLink>
      </section>
    </template>

    <EmptyState v-else title="暂时无法读取统计数据" description="请刷新页面，或确认管理接口已正常部署。">
      <template #icon><Activity :size="18" /></template>
    </EmptyState>
  </div>
</template>
