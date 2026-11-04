<script setup lang="ts">
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gift,
  Loader2,
  Plus,
  UserPlus,
  Users,
} from 'lucide-vue-next'
import type { ChildSummary } from '@english-study/shared'

const api = useApi()
const toast = useToast()
const auth = useAuth()

const children = ref<ChildSummary[]>([])
const loading = ref(true)
const bindOpen = ref(false)
const bindForm = reactive({ phone: '', relation: '孩子' })
const binding = ref(false)
const bindError = ref('')
const createOpen = ref(false)
const createForm = reactive({ nickname: '', relation: '孩子' })
const creating = ref(false)
const createError = ref('')
const switchingId = ref('')

const activeChildren = computed(() => children.value.filter((child) => child.status === 'active'))
const totalPending = computed(() => children.value.reduce((sum, child) => sum + child.pendingRewards, 0))
const learnedToday = computed(() => children.value.filter((child) => child.today.answered > 0).length)

async function load() {
  loading.value = true
  try {
    const response = await api.get<{ data: ChildSummary[] }>('/parent/children')
    children.value = response.data || []
  } catch (error) {
    toast.error(errorMessage(error, '孩子列表加载失败'))
  } finally {
    loading.value = false
  }
}

async function bind() {
  bindError.value = ''
  if (!/^1\d{10}$/.test(bindForm.phone.trim())) {
    bindError.value = '请输入正确的学生手机号'
    return
  }
  binding.value = true
  try {
    await api.post('/parent/bind', {
      phone: bindForm.phone.trim(),
      relation: bindForm.relation.trim() || '孩子',
    })
    toast.success('绑定邀请已发送，等待学生确认')
    bindOpen.value = false
    bindForm.phone = ''
    bindForm.relation = '孩子'
    await load()
  } catch (error) {
    bindError.value = errorMessage(error, '绑定失败')
  } finally {
    binding.value = false
  }
}

async function createChild() {
  createError.value = ''
  if (!createForm.nickname.trim()) {
    createError.value = '请填写孩子昵称'
    return
  }
  creating.value = true
  try {
    await api.post('/parent/children', {
      nickname: createForm.nickname.trim(),
      relation: createForm.relation.trim() || '孩子',
    })
    toast.success('孩子账号已创建，可直接切换到孩子视角')
    createOpen.value = false
    createForm.nickname = ''
    createForm.relation = '孩子'
    await load()
  } catch (error) {
    createError.value = errorMessage(error, '创建失败')
  } finally {
    creating.value = false
  }
}

async function switchToChild(child: ChildSummary) {
  switchingId.value = child.id
  try {
    await auth.switchToChild(child.id)
    toast.success(`已切换到 ${child.nickname} 的视角`)
    await navigateTo('/student')
  } catch (error) {
    toast.error(errorMessage(error, '切换失败'))
  } finally {
    switchingId.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="家长端"
      title="孩子的学习情况"
      description="查看今日学习、本周进度与待确认奖励。所有报告来自原始答题记录。"
    >
      <template #actions>
        <button class="btn-primary" @click="createOpen = true">
          <Plus :size="16" />
          创建孩子账号
        </button>
        <button class="btn-secondary" @click="bindOpen = true">
          <UserPlus :size="16" />
          绑定已有孩子
        </button>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="5" label="正在读取孩子学习数据" />

    <template v-else>
      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">已绑定孩子</p>
          <p class="mt-2 font-display text-3xl text-ink">{{ activeChildren.length }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">今日已学习</p>
          <p class="mt-2 font-display text-3xl text-forest">{{ learnedToday }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">待确认奖励</p>
          <p class="mt-2 font-display text-3xl" :class="totalPending ? 'text-clay' : 'text-ink'">{{ totalPending }}</p>
        </div>
      </section>

      <div class="mt-7 flex items-end justify-between">
        <div>
          <p class="eyebrow">孩子列表</p>
          <h2 class="mt-1 section-title">点击查看完整学习报告</h2>
        </div>
        <span class="text-[11px] text-muted">{{ children.length }} 条绑定记录</span>
      </div>

      <div v-if="children.length" class="mt-4 grid gap-4 lg:grid-cols-2">
        <template v-for="child in children" :key="child.id">
          <article
            v-if="child.status === 'active'"
            class="card group overflow-hidden transition hover:-translate-y-0.5 hover:border-forest/25 hover:shadow-[0_24px_50px_-34px_rgba(34,48,42,0.5)]"
          >
            <div class="flex items-start gap-4 p-5">
              <span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-forest-soft font-display text-xl text-forest">
                {{ child.nickname.charAt(0) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-base font-medium text-ink">{{ child.nickname }}</p>
                  <span class="chip">{{ child.relation }}</span>
                  <span v-if="child.pendingRewards" class="chip-clay">{{ child.pendingRewards }} 条待确认</span>
                </div>
                <p class="mt-1 text-[11px] text-muted">{{ child.phone || '家长创建 · 无手机号' }}</p>
                <div class="mt-4 grid grid-cols-3 gap-2">
                  <div class="rounded-xl bg-paper/80 px-3 py-2.5">
                    <p class="text-[9px] text-muted">今日答题</p>
                    <p class="mt-1 text-sm font-medium text-ink">{{ child.today.answered }}</p>
                  </div>
                  <div class="rounded-xl bg-paper/80 px-3 py-2.5">
                    <p class="text-[9px] text-muted">今日正确率</p>
                    <p class="mt-1 text-sm font-medium text-ink">{{ child.today.accuracy }}%</p>
                  </div>
                  <div class="rounded-xl bg-paper/80 px-3 py-2.5">
                    <p class="text-[9px] text-muted">今日时长</p>
                    <p class="mt-1 text-sm font-medium text-ink">{{ child.today.minutes }} 分</p>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between border-t border-line/70 bg-paper/40 px-5 py-3">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
                <span class="inline-flex items-center gap-1"><Clock3 :size="11" /> 本周 {{ child.week.activeDays }} 天有学习</span>
                <span class="inline-flex items-center gap-1"><CheckCircle2 :size="11" /> 新学 {{ child.week.newWords }} 词</span>
                <span v-if="child.weakWords" class="inline-flex items-center gap-1 text-clay"><Gift :size="11" /> {{ child.weakWords }} 个薄弱词</span>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <NuxtLink :to="`/parent/children/${child.id}`" class="btn-ghost btn-sm">
                  查看报告
                  <ArrowRight :size="13" />
                </NuxtLink>
                <button class="btn-primary btn-sm" :disabled="switchingId === child.id" @click="switchToChild(child)">
                  <Loader2 v-if="switchingId === child.id" :size="13" class="animate-spin" />
                  进入孩子视角
                </button>
              </div>
            </div>
          </article>

          <div v-else class="card flex flex-col justify-between border-dashed p-5">
            <div class="flex items-start gap-4">
              <span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-paper-deep font-display text-xl text-muted">
                {{ child.nickname.charAt(0) }}
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <p class="text-base font-medium text-ink">{{ child.nickname }}</p>
                  <span class="chip-clay">待学生确认</span>
                </div>
                <p class="mt-1 text-[11px] text-muted">{{ child.phone || '家长创建 · 无手机号' }} · {{ child.relation }}</p>
                <p class="mt-3 text-xs leading-relaxed text-muted">
                  绑定邀请已发送。学生登录后，在“奖励进度”页确认即可查看数据。
                </p>
              </div>
            </div>
          </div>
        </template>
      </div>

      <EmptyState
        v-else
        title="还没有孩子账号"
        description="直接创建孩子账号，无需手机号；也可以绑定已有学生账号的手机号，学生确认后即可查看学习报告。"
      >
        <template #icon><Users :size="18" /></template>
        <template #action>
          <button class="btn-primary" @click="createOpen = true">
            <Plus :size="15" />
            创建第一个孩子
          </button>
        </template>
      </EmptyState>
    </template>

    <Modal
      :open="createOpen"
      title="创建孩子账号"
      description="孩子无需手机号和邮箱，创建后立即启用；家长登录后可切换到孩子视角，每个孩子各自完成自己的练习与复习。"
      @close="createOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="create-nickname">孩子昵称</label>
          <input
            id="create-nickname"
            v-model="createForm.nickname"
            class="input"
            type="text"
            placeholder="例如：小满"
            maxlength="50"
          >
        </div>
        <div>
          <label class="label" for="create-relation">关系</label>
          <select id="create-relation" v-model="createForm.relation" class="input">
            <option value="孩子">孩子</option>
            <option value="女儿">女儿</option>
            <option value="儿子">儿子</option>
            <option value="学生">学生</option>
          </select>
        </div>
        <p v-if="createError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ createError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="createOpen = false">取消</button>
        <button class="btn-primary" :disabled="creating" @click="createChild">
          <Loader2 v-if="creating" :size="15" class="animate-spin" />
          创建孩子账号
        </button>
      </template>
    </Modal>

    <Modal
      :open="bindOpen"
      title="绑定孩子"
      description="学生需要在自己的账号中确认绑定。平台不会自动通过。"
      @close="bindOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="bind-phone">学生手机号</label>
          <input
            id="bind-phone"
            v-model="bindForm.phone"
            class="input"
            type="tel"
            inputmode="numeric"
            maxlength="11"
            placeholder="请输入学生账号手机号"
          >
        </div>
        <div>
          <label class="label" for="bind-relation">关系</label>
          <select id="bind-relation" v-model="bindForm.relation" class="input">
            <option value="孩子">孩子</option>
            <option value="女儿">女儿</option>
            <option value="儿子">儿子</option>
            <option value="学生">学生</option>
          </select>
        </div>
        <p v-if="bindError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ bindError }}
        </p>
        <div class="rounded-xl bg-paper px-3.5 py-3 text-[10px] leading-relaxed text-muted">
          演示学生账号：13800000002。绑定后学生需在“奖励进度”页确认。
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="bindOpen = false">取消</button>
        <button class="btn-primary" :disabled="binding" @click="bind">
          <Loader2 v-if="binding" :size="15" class="animate-spin" />
          发送绑定邀请
        </button>
      </template>
    </Modal>
  </div>
</template>
