<script setup lang="ts">
import {
  ArrowLeftRight,
  BarChart3,
  BookMarked,
  BookOpen,
  ChevronRight,
  Gift,
  GraduationCap,
  Image as ImageIcon,
  LayoutDashboard,
  Library,
  ListChecks,
  Loader2,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-vue-next'
import type { Component } from 'vue'

const auth = useAuth()
const route = useRoute()
const toast = useToast()

const switchBackOpen = ref(false)
const switchBackPassword = ref('')
const switchBackError = ref('')
const switchingBack = ref(false)

async function submitSwitchBack() {
  switchBackError.value = ''
  if (!switchBackPassword.value) {
    switchBackError.value = '请输入家长密码'
    return
  }
  switchingBack.value = true
  try {
    await auth.switchBack(switchBackPassword.value)
    toast.success('已切回家长身份')
    switchBackOpen.value = false
    switchBackPassword.value = ''
    await navigateTo('/parent')
  } catch (error) {
    switchBackError.value = errorMessage(error, '切回失败')
  } finally {
    switchingBack.value = false
  }
}

interface NavItem {
  label: string
  to: string
  icon: Component
  exact?: boolean
}

const studentNav: NavItem[] = [
  { label: '选课本', to: '/student', icon: BookOpen, exact: true },
  { label: '今日复习', to: '/student/review', icon: RefreshCw },
  { label: '我的进度', to: '/student/progress', icon: BarChart3 },
  { label: '奖励进度', to: '/student/rewards', icon: Gift },
]

const parentNav: NavItem[] = [
  { label: '孩子与报告', to: '/parent', icon: Users, exact: true },
  { label: '激励设置', to: '/parent/incentives', icon: Settings },
  { label: '奖励账本', to: '/parent/ledger', icon: BookMarked },
]

const adminNav: NavItem[] = [
  { label: '数据概览', to: '/admin', icon: LayoutDashboard, exact: true },
  { label: '课本管理', to: '/admin/textbooks', icon: Library },
  { label: '单词库', to: '/admin/words', icon: BookOpen },
  { label: '图片管理', to: '/admin/images', icon: ImageIcon },
  { label: '题库管理', to: '/admin/questions', icon: ListChecks },
  { label: '用户与家庭', to: '/admin/users', icon: Users },
]

const navItems = computed(() => {
  if (auth.user.value?.role === 'parent') return parentNav
  if (auth.user.value?.role === 'admin') return adminNav
  return studentNav
})

const roleMeta = computed(() => {
  if (auth.user.value?.switchedFromParent) {
    return { label: '孩子视角', note: '由家长切换进入，切回需验证家长密码', icon: GraduationCap }
  }
  if (auth.user.value?.role === 'parent') {
    return { label: '家长端', note: '了解进度，约定奖励', icon: Users }
  }
  if (auth.user.value?.role === 'admin') {
    return { label: '管理端', note: '维护内容与数据', icon: ShieldCheck }
  }
  return { label: '学生端', note: '按课本，稳步记单词', icon: GraduationCap }
})

function active(to: string, exact?: boolean) {
  if (exact) return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}

async function signOut() {
  await auth.logout()
}
</script>

<template>
  <div v-if="!auth.user.value" class="min-h-screen">
    <slot />
  </div>

  <div v-else class="min-h-screen">
    <aside
      class="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line/80 bg-cream/75 px-5 py-6 backdrop-blur-xl lg:flex"
    >
      <NuxtLink to="/" class="flex items-center gap-3 px-1">
        <span class="grid size-10 place-items-center rounded-2xl bg-forest text-white shadow-[0_10px_24px_-14px_rgba(47,95,76,0.9)]">
          <BookOpen :size="20" :stroke-width="1.8" />
        </span>
        <span>
          <span class="block font-display text-xl leading-none tracking-tight text-ink">单词簿</span>
          <span class="mt-1 block text-[10px] tracking-[0.18em] text-muted">WORD NOTEBOOK</span>
        </span>
      </NuxtLink>

      <div class="mt-8 rounded-2xl border border-line/80 bg-paper/70 px-3.5 py-3">
        <div class="flex items-center gap-2 text-[11px] font-medium text-muted">
          <component :is="roleMeta.icon" :size="13" />
          {{ roleMeta.label }}
        </div>
        <p class="mt-1.5 text-sm font-medium text-ink">{{ auth.user.value.nickname }}</p>
        <p class="mt-0.5 text-[11px] text-muted">{{ roleMeta.note }}</p>
      </div>

      <button
        v-if="auth.isChildView.value"
        class="btn-secondary mt-3 w-full"
        @click="switchBackOpen = true"
      >
        <ArrowLeftRight :size="16" />
        切回家长身份
      </button>

      <nav class="mt-7 flex-1 space-y-1">
        <p class="eyebrow mb-2 px-3">导航</p>
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition"
          :class="active(item.to, item.exact)
            ? 'bg-forest text-white shadow-[0_10px_22px_-16px_rgba(47,95,76,0.9)]'
            : 'text-ink-soft hover:bg-forest-soft/70 hover:text-forest-deep'"
        >
          <component :is="item.icon" :size="17" :stroke-width="1.8" />
          <span class="flex-1">{{ item.label }}</span>
          <ChevronRight
            v-if="active(item.to, item.exact)"
            :size="14"
            class="opacity-60"
          />
        </NuxtLink>

        <template v-if="auth.user.value.role === 'student'">
          <div class="mt-8 rounded-2xl bg-forest-soft/70 px-3.5 py-4">
            <p class="text-[11px] font-semibold tracking-wide text-forest">学习提示</p>
            <p class="mt-2 text-xs leading-relaxed text-ink-soft">
              到期和薄弱单词会优先出现。答错不要紧，系统会安排更早的复习。
            </p>
          </div>
        </template>
      </nav>

      <div class="border-t border-line/80 pt-4">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-ink">{{ auth.user.value.nickname }}</p>
            <p class="text-[11px] text-muted">{{ auth.user.value.email || '无邮箱（家长创建的孩子账号）' }}</p>
          </div>
          <button class="btn-ghost size-9 !p-0" title="退出登录" @click="signOut">
            <LogOut :size="16" />
          </button>
        </div>
        <p class="mt-4 text-[10px] leading-relaxed text-muted/80">
          平台仅记录学习行为与激励达成条件，不预设奖励内容。
        </p>
      </div>
    </aside>

    <header
      class="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur-xl lg:hidden"
    >
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <span class="grid size-8 place-items-center rounded-xl bg-forest text-white">
          <BookOpen :size="16" />
        </span>
        <span class="font-display text-lg text-ink">单词簿</span>
      </NuxtLink>
      <div class="flex items-center gap-1">
        <button
          v-if="auth.isChildView.value"
          class="btn-ghost size-9 !p-0"
          title="切回家长身份"
          @click="switchBackOpen = true"
        >
          <ArrowLeftRight :size="18" />
        </button>
        <button class="btn-ghost size-9 !p-0" title="退出登录" @click="signOut">
          <LogOut :size="18" />
        </button>
      </div>
    </header>

    <main class="lg:pl-[264px]">
      <div class="mx-auto min-h-screen max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-10 lg:pt-10">
        <slot />
        <p class="mt-10 border-t border-line/70 pt-4 text-center text-[11px] leading-relaxed text-muted">
          单词真人发音来自
          <a class="underline" href="https://www.wiktionary.org" target="_blank" rel="noopener">Wiktionary</a>
          /
          <a class="underline" href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a>，依
          <a class="underline" href="https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 4.0</a>
          许可使用。
        </p>
      </div>
    </main>

    <!-- 移动端底部 TabBar：只在小屏出现，PC 端仍用左侧边栏切换。 -->
    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      aria-label="底部导航"
    >
      <div class="flex">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-2 pt-1.5"
          :class="active(item.to, item.exact) ? 'text-forest' : 'text-muted'"
        >
          <span class="h-1 w-6 rounded-full" :class="active(item.to, item.exact) ? 'bg-forest' : 'bg-transparent'" />
          <component :is="item.icon" :size="20" :stroke-width="1.8" />
          <span class="w-full truncate text-center text-[10px] font-medium leading-tight">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <Modal
      :open="switchBackOpen"
      title="切回家长身份"
      description="请输入家长密码验证身份。孩子视角下无法直接进入家长端，密码是唯一的切回凭证。"
      @close="switchBackOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="switch-back-password">家长密码</label>
          <input
            id="switch-back-password"
            v-model="switchBackPassword"
            class="input"
            type="password"
            autocomplete="current-password"
            placeholder="请输入家长密码"
            @keyup.enter="submitSwitchBack"
          >
        </div>
        <p v-if="switchBackError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ switchBackError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="switchBackOpen = false">取消</button>
        <button class="btn-primary" :disabled="switchingBack" @click="submitSwitchBack">
          <Loader2 v-if="switchingBack" :size="15" class="animate-spin" />
          验证并切回
        </button>
      </template>
    </Modal>
  </div>
</template>
