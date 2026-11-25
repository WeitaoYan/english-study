<script setup lang="ts">
import {
  ArrowRight,
  BookOpen,
  Check,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Target,
  Volume2,
} from 'lucide-vue-next'

definePageMeta({ layout: false })

const auth = useAuth()

// 首页登录与否都能自由看，不再自动跳工作台；已登录用户点右上角的按钮进工作台。

const highlights = [
  {
    icon: BookOpen,
    title: '课本同步',
    text: '按小学、初中课本单元学单词，学到哪单元就练哪单元的词。',
  },
  {
    icon: RefreshCw,
    title: '螺旋复习',
    text: '到期词、薄弱词、新词分层排队，系统按记忆状态安排下一次复习。',
  },
  {
    icon: Volume2,
    title: '真人发音',
    text: '听音题用真人录音，不是机器合成音；没录音的词不出听音题。',
  },
  {
    icon: Target,
    title: '错词重练',
    text: '按孩子常错的题型出题，答对出队、答错排到队尾再练一次。',
  },
  {
    icon: ListChecks,
    title: '专项练习',
    text: '家长按一种题型加单元范围组套题，针对性练，不用整本翻。',
  },
  {
    icon: ShieldCheck,
    title: '家长可控的激励',
    text: '条件达成自动记账，确认、兑现、撤销都由家长操作。无签到、无勋章、无排行榜。',
  },
]

const steps = [
  { no: '01', title: '家长用邮箱注册', text: '注册后进入家长端，一个账号管家里的孩子。' },
  { no: '02', title: '创建孩子账号', text: '孩子无需邮箱，由家长在自己账号内创建。' },
  { no: '03', title: '切换孩子视角开始练', text: '家长登录后点孩子卡片进入孩子视角，按课本练、按状态复习。' },
]
</script>

<template>
  <div class="min-h-screen">
    <header class="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <span class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-2xl bg-forest text-white">
          <BookOpen :size="20" :stroke-width="1.8" />
        </span>
        <span>
          <span class="block font-display text-xl leading-none tracking-tight text-ink">单词簿</span>
          <span class="mt-1 block text-[10px] tracking-[0.18em] text-muted">WORD NOTEBOOK</span>
        </span>
      </span>
      <span class="flex items-center gap-2">
        <NuxtLink v-if="auth.user.value" :to="auth.home.value" class="btn-primary !px-4 !py-2">进入工作台</NuxtLink>
        <template v-else>
          <NuxtLink to="/login" class="btn-ghost">登录</NuxtLink>
          <NuxtLink to="/register" class="btn-primary !px-4 !py-2">家长注册</NuxtLink>
        </template>
      </span>
    </header>

    <main class="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <section class="card mt-4 px-6 py-10 text-center sm:px-10 sm:py-14">
        <p class="eyebrow !mb-0">课本同步 · 螺旋记忆</p>
        <h1 class="mx-auto mt-4 max-w-2xl font-display text-4xl leading-[1.2] tracking-tight text-ink sm:text-5xl">
          把每一次复习，<br>
          变成看得见的进步。
        </h1>
        <p class="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          面向小学、初中学生的课本同步单词学习工具。按课本单元学习，系统根据记忆状态安排复习；平台只客观记录学习行为，奖励由家长与孩子共同约定。
        </p>
        <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <NuxtLink v-if="auth.user.value" :to="auth.home.value" class="btn-primary w-full !py-3 sm:w-auto">
            进入我的工作台
            <ArrowRight :size="16" />
          </NuxtLink>
          <template v-else>
            <NuxtLink to="/register" class="btn-primary w-full !py-3 sm:w-auto">
              家长注册，免费开始
              <ArrowRight :size="16" />
            </NuxtLink>
            <NuxtLink to="/login" class="btn-secondary w-full !py-3 sm:w-auto">已有账号，去登录</NuxtLink>
          </template>
        </div>
        <p class="mt-5 text-[11px] leading-relaxed text-muted">
          学生没有独立登录入口：家长登录后，在孩子卡片点「进入孩子视角」即可进入孩子端。
        </p>
      </section>

      <section class="mt-12">
        <p class="eyebrow">为什么用单词簿</p>
        <h2 class="page-title mt-2">练得明白，记得牢。</h2>
        <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="item in highlights" :key="item.title" class="card !rounded-2xl px-5 py-5">
            <span class="grid size-10 place-items-center rounded-xl bg-forest-soft text-forest">
              <component :is="item.icon" :size="19" :stroke-width="1.8" />
            </span>
            <h3 class="mt-4 text-base font-semibold text-ink">{{ item.title }}</h3>
            <p class="mt-1.5 text-sm leading-relaxed text-muted">{{ item.text }}</p>
          </article>
        </div>
      </section>

      <section class="mt-12">
        <p class="eyebrow">三步开始</p>
        <h2 class="page-title mt-2">注册一次，全家都能用。</h2>
        <div class="mt-6 grid gap-4 md:grid-cols-3">
          <article v-for="step in steps" :key="step.no" class="card !rounded-2xl px-5 py-5">
            <p class="font-display text-2xl text-gold">{{ step.no }}</p>
            <h3 class="mt-3 text-base font-semibold text-ink">{{ step.title }}</h3>
            <p class="mt-1.5 text-sm leading-relaxed text-muted">{{ step.text }}</p>
          </article>
        </div>
      </section>

      <section class="card mt-12 flex flex-col items-start gap-4 px-6 py-8 sm:flex-row sm:items-center">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold">
          <Check :size="19" :stroke-width="2" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold text-ink">不靠打卡和排名推着孩子学。</h2>
          <p class="mt-1 text-sm leading-relaxed text-muted">没有签到、勋章和排行榜。到期就复习，错了就再练，进度家长随时能看到。</p>
        </div>
        <NuxtLink to="/register" class="btn-primary shrink-0">
          家长注册
          <ArrowRight :size="16" />
        </NuxtLink>
      </section>

      <p class="mt-10 border-t border-line/70 pt-4 text-center text-[11px] leading-relaxed text-muted">
        单词真人发音来自
        <a class="underline" href="https://www.wiktionary.org" target="_blank" rel="noopener">Wiktionary</a>
        /
        <a class="underline" href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a>，依
        <a class="underline" href="https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 4.0</a>
        许可使用。
      </p>
      <p class="mt-3 text-center text-[11px] leading-relaxed text-muted">
        数学练习：
        <a class="font-medium text-forest underline underline-offset-2" href="https://study.ikber.cc" target="_blank" rel="noopener">爱学习 · 数学练习</a>
      </p>
    </main>
  </div>
</template>
