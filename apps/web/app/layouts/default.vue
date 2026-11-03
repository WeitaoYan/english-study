<script setup lang="ts">
import {
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
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'

const auth = useAuth()
const route = useRoute()

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
  if (auth.user.value?.role === 'parent') {
    return { label: '家长端', note: '了解进度，约定奖励', icon: Users }
  }
  if (auth.user.value?.role === 'admin') {
    return { label: '管理端', note: '维护内容与数据', icon: ShieldCheck }
  }
  return { label: '学生端', note: '按课本，稳步记单词', icon: GraduationCap }
})

const mobileOpen = ref(false)

function active(to: string, exact?: boolean) {
  if (exact) return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}

function closeMobile() {
  mobileOpen.value = false
}

watch(() => route.fullPath, closeMobile)

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
            <p class="text-[11px] text-muted">{{ auth.user.value.phone }}</p>
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
      <button class="btn-ghost size-9 !p-0" @click="mobileOpen = true">
        <Menu :size="19" />
      </button>
    </header>

    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-50 lg:hidden"
    >
      <div class="absolute inset-0 bg-ink/25 backdrop-blur-sm" @click="closeMobile" />
      <aside class="absolute inset-y-0 left-0 flex w-[290px] flex-col bg-paper px-5 py-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="grid size-9 place-items-center rounded-xl bg-forest text-white">
              <BookOpen :size="17" />
            </span>
            <span class="font-display text-xl text-ink">单词簿</span>
          </div>
          <button class="btn-ghost size-9 !p-0" @click="closeMobile">
            <X :size="18" />
          </button>
        </div>

        <div class="mt-6 rounded-2xl border border-line bg-cream px-4 py-3">
          <p class="text-[11px] text-muted">{{ roleMeta.label }}</p>
          <p class="mt-1 text-sm font-medium text-ink">{{ auth.user.value.nickname }}</p>
        </div>

        <nav class="mt-5 flex-1 space-y-1 overflow-y-auto">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-sm"
            :class="active(item.to, item.exact)
              ? 'bg-forest text-white'
              : 'text-ink-soft hover:bg-forest-soft'"
          >
            <component :is="item.icon" :size="17" />
            {{ item.label }}
          </NuxtLink>
        </nav>

        <button class="btn-secondary w-full" @click="signOut">
          <LogOut :size="16" />
          退出登录
        </button>
      </aside>
    </div>

    <main class="lg:pl-[264px]">
      <div class="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <slot />
      </div>
    </main>
  </div>
</template>
