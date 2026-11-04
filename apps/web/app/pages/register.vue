<script setup lang="ts">
import { ArrowRight, BookOpen, Loader2 } from 'lucide-vue-next'

definePageMeta({ layout: false })

const auth = useAuth()
const toast = useToast()

const email = ref('')
const nickname = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    error.value = '请输入正确的邮箱'
    return
  }
  if (!nickname.value.trim()) {
    error.value = '请填写昵称'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  submitting.value = true
  try {
    await auth.register(email.value.trim().toLowerCase(), nickname.value.trim(), password.value)
    toast.success('注册成功，已进入家长端')
    await navigateTo('/parent')
  } catch (err) {
    error.value = errorMessage(err, '注册失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
    <div class="w-full max-w-md">
      <div class="flex items-center gap-3">
        <span class="grid size-11 place-items-center rounded-2xl bg-forest text-white">
          <BookOpen :size="21" />
        </span>
        <div>
          <p class="font-display text-2xl tracking-tight text-ink">单词簿</p>
          <p class="text-[10px] tracking-[0.2em] text-muted">WORD NOTEBOOK</p>
        </div>
      </div>

      <p class="eyebrow mt-9">家长注册</p>
      <h2 class="mt-2 font-display text-3xl tracking-tight text-ink">用邮箱创建家长账号</h2>
      <p class="mt-2.5 text-sm leading-relaxed text-muted">
        注册后进入家长端，在自己账号内创建孩子账号；孩子无需邮箱，家长登录后可切换到孩子视角，
        每个孩子各自完成自己的练习与复习。
      </p>

      <form class="mt-8 space-y-4" @submit.prevent="submit">
        <div>
          <label class="label" for="email">邮箱</label>
          <input
            id="email"
            v-model="email"
            class="input"
            type="email"
            autocomplete="email"
            placeholder="请输入邮箱"
          >
        </div>
        <div>
          <label class="label" for="nickname">昵称</label>
          <input
            id="nickname"
            v-model="nickname"
            class="input"
            type="text"
            autocomplete="nickname"
            placeholder="例如：林妈妈"
            maxlength="50"
          >
        </div>
        <div>
          <label class="label" for="password">密码</label>
          <input
            id="password"
            v-model="password"
            class="input"
            type="password"
            autocomplete="new-password"
            placeholder="至少 6 位"
          >
        </div>
        <p v-if="error" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ error }}
        </p>
        <button class="btn-primary w-full !py-3" type="submit" :disabled="submitting">
          <Loader2 v-if="submitting" :size="16" class="animate-spin" />
          <template v-else>
            注册并进入家长端
            <ArrowRight :size="16" />
          </template>
        </button>
      </form>

      <p class="mt-8 text-center text-xs text-muted">
        已有账号？
        <NuxtLink to="/login" class="font-medium text-forest underline underline-offset-2">去登录</NuxtLink>
      </p>
    </div>
  </div>
</template>
