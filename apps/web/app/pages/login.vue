<script setup lang="ts">
import { ArrowRight, BookOpen, Check, Loader2, RefreshCw, ShieldCheck } from 'lucide-vue-next'

definePageMeta({ layout: false })

const auth = useAuth()
const route = useRoute()
const toast = useToast()

const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  const value = email.value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    error.value = '请输入正确的邮箱'
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
    error.value = errorMessage(err, '登录失败，请检查邮箱和密码')
  } finally {
    submitting.value = false
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
          使用邮箱登录，进入各自的工作台。家长可以用邮箱注册，注册后在自己账号内创建孩子账号，孩子无需邮箱。
        </p>

        <form class="mt-8 space-y-4" @submit.prevent="submit">
          <div>
            <label class="label" for="email">邮箱</label>
            <input
              id="email"
              v-model="email"
              class="input"
              type="email"
              autocomplete="username"
              placeholder="请输入邮箱"
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

        <p class="mt-6 text-center text-[11px] leading-relaxed text-muted">
          学生没有独立登录入口：家长登录后，在孩子卡片点「进入孩子视角」即可进入孩子端。
        </p>

        <p class="mt-4 text-center text-xs text-muted">
          家长还没有账号？
          <NuxtLink to="/register" class="font-medium text-forest underline underline-offset-2">用邮箱注册</NuxtLink>
        </p>
      </div>
    </section>
  </div>
</template>
