<script setup lang="ts">
import { ArrowRight, BookOpen, Check, GraduationCap, Loader2, RefreshCw, ShieldCheck, Users } from 'lucide-vue-next'

definePageMeta({ layout: false })

const auth = useAuth()
const route = useRoute()
const toast = useToast()

const identifier = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)
const demoLoading = ref('')

const demos = [
  {
    role: '学生',
    name: '林小满',
    phone: '13800000002',
    password: 'demo1234',
    icon: GraduationCap,
    tone: 'bg-forest-soft text-forest',
  },
  {
    role: '家长',
    name: '林妈妈',
    phone: '13800000001',
    password: 'demo1234',
    icon: Users,
    tone: 'bg-clay-soft text-clay',
  },
  {
    role: '管理员',
    name: '系统管理员',
    phone: '13800000000',
    password: 'admin1234',
    icon: ShieldCheck,
    tone: 'bg-ocean-soft text-ocean',
  },
]

async function submit() {
  error.value = ''
  const value = identifier.value.trim()
  const isEmail = value.includes('@')
  if (isEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : !/^1\d{10}$/.test(value)) {
    error.value = isEmail ? '请输入正确的邮箱' : '请输入 11 位手机号'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  submitting.value = true
  try {
    await auth.login(value, password.value)
    toast.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    await navigateTo(redirect && redirect !== '/login' ? redirect : auth.home.value)
  } catch (err) {
    error.value = errorMessage(err, '登录失败，请检查账号和密码')
  } finally {
    submitting.value = false
  }
}

async function demoLogin(demo: (typeof demos)[number]) {
  error.value = ''
  demoLoading.value = demo.role
  identifier.value = demo.phone
  password.value = demo.password
  try {
    await auth.login(demo.phone, demo.password)
    toast.success(`已进入${demo.role}演示`)
    await navigateTo(auth.home.value)
  } catch (err) {
    error.value = errorMessage(err, '演示登录失败')
  } finally {
    demoLoading.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen lg:grid lg:grid-cols-[1.05fr_0.95fr]">
    <section class="relative hidden overflow-hidden bg-forest-deep px-12 py-12 text-white lg:flex lg:flex-col">
      <div class="absolute -right-32 -top-28 size-[28rem] rounded-full border border-white/10" />
      <div class="absolute -right-20 -top-16 size-[20rem] rounded-full border border-white/10" />
      <div class="absolute -bottom-40 -left-24 size-[30rem] rounded-full bg-forest/40 blur-3xl" />
      <div class="relative">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-2xl bg-white/12 backdrop-blur">
            <BookOpen :size="22" :stroke-width="1.8" />
          </span>
          <div>
            <p class="font-display text-2xl leading-none tracking-tight">单词簿</p>
            <p class="mt-1 text-[10px] tracking-[0.22em] text-white/50">WORD NOTEBOOK</p>
          </div>
        </div>
      </div>

      <div class="relative mt-24 max-w-xl">
        <p class="eyebrow !text-white/50">课本同步 · 螺旋记忆</p>
        <h1 class="mt-5 font-display text-5xl leading-[1.15] tracking-tight">
          把每一次复习，<br>
          变成看得见的进步。
        </h1>
        <p class="mt-6 max-w-md text-sm leading-relaxed text-white/65">
          按课本单元学习，系统根据记忆状态安排复习。平台只客观记录学习行为，奖励由家长与孩子共同约定。
        </p>
      </div>

      <div class="relative mt-14 grid max-w-lg gap-3">
        <div class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur">
          <RefreshCw :size="17" class="mt-0.5 text-gold" />
          <div>
            <p class="text-sm font-medium">螺旋复习</p>
            <p class="mt-1 text-xs leading-relaxed text-white/55">到期词、薄弱词、新词分层排队，不靠死记硬背。</p>
          </div>
        </div>
        <div class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur">
          <ShieldCheck :size="17" class="mt-0.5 text-gold" />
          <div>
            <p class="text-sm font-medium">家长可控的激励记账</p>
            <p class="mt-1 text-xs leading-relaxed text-white/55">条件达成自动生成记录，确认、兑现、撤销都由家长操作。</p>
          </div>
        </div>
      </div>

      <div class="relative mt-auto flex items-center gap-2 text-[11px] text-white/40">
        <Check :size="13" />
        无签到、无勋章、无排行榜
      </div>
    </section>

    <section class="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div class="w-full max-w-md">
        <div class="mb-9 flex items-center gap-3 lg:hidden">
          <span class="grid size-11 place-items-center rounded-2xl bg-forest text-white">
            <BookOpen :size="21" />
          </span>
          <div>
            <p class="font-display text-2xl tracking-tight text-ink">单词簿</p>
            <p class="text-[10px] tracking-[0.2em] text-muted">WORD NOTEBOOK</p>
          </div>
        </div>

        <p class="eyebrow">欢迎回来</p>
        <h2 class="mt-2 font-display text-3xl tracking-tight text-ink">登录学习空间</h2>
        <p class="mt-2.5 text-sm leading-relaxed text-muted">
          使用手机号或邮箱登录，进入各自的工作台。家长可以用邮箱注册，注册后在自己账号内创建孩子账号，孩子无需手机号。
        </p>

        <form class="mt-8 space-y-4" @submit.prevent="submit">
          <div>
            <label class="label" for="identifier">手机号或邮箱</label>
            <input
              id="identifier"
              v-model="identifier"
              class="input"
              type="text"
              autocomplete="username"
              placeholder="请输入手机号或邮箱"
            >
          </div>
          <div>
            <label class="label" for="password">密码</label>
            <input
              id="password"
              v-model="password"
              class="input"
              type="password"
              autocomplete="current-password"
              placeholder="请输入密码"
            >
          </div>
          <p v-if="error" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
            {{ error }}
          </p>
          <button class="btn-primary w-full !py-3" type="submit" :disabled="submitting">
            <Loader2 v-if="submitting" :size="16" class="animate-spin" />
            <template v-else>
              登录
              <ArrowRight :size="16" />
            </template>
          </button>
        </form>

        <div class="my-7 flex items-center gap-3">
          <span class="h-px flex-1 bg-line" />
          <span class="text-[10px] tracking-wider text-muted">演示账号 · 一键进入</span>
          <span class="h-px flex-1 bg-line" />
        </div>

        <div class="space-y-2">
          <button
            v-for="demo in demos"
            :key="demo.role"
            class="group flex w-full items-center gap-3 rounded-2xl border border-line bg-cream/70 px-3.5 py-3 text-left transition hover:border-forest/25 hover:bg-forest-soft/35"
            :disabled="Boolean(demoLoading)"
            @click="demoLogin(demo)"
          >
            <span class="grid size-9 place-items-center rounded-xl" :class="demo.tone">
              <component :is="demo.icon" :size="16" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-ink">{{ demo.role }} · {{ demo.name }}</span>
              <span class="mt-0.5 block text-[10px] text-muted">{{ demo.phone }} / {{ demo.password }}</span>
            </span>
            <Loader2 v-if="demoLoading === demo.role" :size="15" class="animate-spin text-muted" />
            <ArrowRight v-else :size="15" class="text-muted transition group-hover:translate-x-0.5 group-hover:text-forest" />
          </button>
        </div>

        <p class="mt-8 text-center text-xs text-muted">
          家长还没有账号？
          <NuxtLink to="/register" class="font-medium text-forest underline underline-offset-2">用邮箱注册</NuxtLink>
        </p>

        <p class="mt-4 text-center text-[10px] leading-relaxed text-muted/80">
          演示数据仅用于预览功能。正式部署前请创建新的管理员账号并修改初始密码。
        </p>
      </div>
    </section>
  </div>
</template>
