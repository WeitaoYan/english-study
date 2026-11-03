<script setup lang="ts">
import { ArrowLeft, BookOpen, ChevronRight, RefreshCw, Layers3 } from 'lucide-vue-next'
import type { TextbookDetail } from '@english-study/shared'

const route = useRoute()
const api = useApi()
const toast = useToast()

const data = ref<TextbookDetail | null>(null)
const loading = ref(true)

const coverMap: Record<string, string> = {
  forest: 'from-[#315f4c] via-[#2a5242] to-[#1f4134]',
  ocean: 'from-[#467695] via-[#3b647f] to-[#2d5169]',
  clay: 'from-[#b9714d] via-[#a35f3e] to-[#844a30]',
  plum: 'from-[#7c5a73] via-[#6a4a62] to-[#55394e]',
  sand: 'from-[#b59a66] via-[#9e8454] to-[#826a40]',
}

const coverClass = computed(() => coverMap[data.value?.textbook.coverColor || 'forest'] || coverMap.forest)
const hasDue = computed(() => (data.value?.textbook.dueCount || 0) > 0)

async function load() {
  loading.value = true
  try {
    data.value = await api.get<TextbookDetail>(`/student/textbooks/${route.params.id}`)
  } catch (error) {
    toast.error(errorMessage(error, '课本加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="mb-5">
      <NuxtLink to="/student" class="btn-ghost -ml-2">
        <ArrowLeft :size="15" />
        返回课本列表
      </NuxtLink>
    </div>

    <LoadingBlock v-if="loading" :lines="6" label="正在加载单元" />

    <template v-else-if="data">
      <section class="card overflow-hidden">
        <div class="relative bg-gradient-to-br p-6 text-white sm:p-8" :class="coverClass">
          <div class="absolute -right-16 -top-16 size-64 rounded-full border border-white/10" />
          <div class="absolute -right-6 top-10 size-36 rounded-full border border-white/10" />
          <div class="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
            <div>
              <p class="text-[11px] tracking-wide text-white/55">{{ data.textbook.version }} · {{ data.textbook.grade }}{{ data.textbook.semester }}</p>
              <h1 class="mt-3 font-display text-3xl leading-tight tracking-tight sm:text-4xl">{{ data.textbook.name }}</h1>
              <p class="mt-3 text-sm text-white/60">{{ data.textbook.unitCount }} 个单元 · {{ data.textbook.wordCount }} 个单词</p>
            </div>
            <div class="flex items-center gap-5">
              <div class="text-right">
                <p class="text-[10px] text-white/50">整体进度</p>
                <p class="mt-1 font-display text-3xl">{{ data.textbook.progress }}%</p>
              </div>
              <NuxtLink
                v-if="hasDue"
                to="/student/review"
                class="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-xs font-medium text-white backdrop-blur transition hover:bg-white/25"
              >
                <RefreshCw :size="14" />
                {{ data.textbook.dueCount }} 个待复习
              </NuxtLink>
            </div>
          </div>
          <div class="relative mt-6 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div class="h-full rounded-full bg-white/75 transition-all duration-500" :style="{ width: `${data.textbook.progress}%` }" />
          </div>
          <div class="relative mt-2 flex justify-between text-[10px] text-white/50">
            <span>已学 {{ data.textbook.learnedWords }} / {{ data.textbook.wordCount }}</span>
            <span>掌握 {{ data.textbook.masteredWords }} 个</span>
          </div>
        </div>
      </section>

      <div class="mt-7 flex items-end justify-between">
        <div>
          <p class="eyebrow">单元列表</p>
          <h2 class="mt-1 section-title">按顺序学习，也可以先复习到期单元</h2>
        </div>
        <span class="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
          <Layers3 :size="13" />
          共 {{ data.units.length }} 个单元
        </span>
      </div>

      <div v-if="data.units.length" class="mt-4 space-y-3">
        <NuxtLink
          v-for="unit in data.units"
          :key="unit.id"
          :to="`/student/units/${unit.id}`"
          class="card group flex items-center gap-4 p-4 transition hover:border-forest/25 hover:bg-forest-soft/25 sm:p-5"
        >
          <div class="grid size-12 shrink-0 place-items-center rounded-2xl bg-forest-soft font-display text-lg text-forest">
            {{ String(unit.unitNo).padStart(2, '0') }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-medium text-ink">{{ unit.unitName }}</p>
              <span v-if="unit.dueCount" class="chip-clay !py-0.5">{{ unit.dueCount }} 个待复习</span>
              <span v-else-if="unit.progress === 100" class="chip-forest !py-0.5">已完成</span>
            </div>
            <div class="mt-2 flex items-center gap-3">
              <ProgressBar :value="unit.progress" size="sm" class="max-w-[260px]" />
              <span class="shrink-0 text-[10px] text-muted">{{ unit.learnedWords }}/{{ unit.wordCount }} 词</span>
            </div>
          </div>
          <div class="hidden shrink-0 text-right sm:block">
            <p class="text-sm font-medium text-ink">{{ unit.progress }}%</p>
            <p class="mt-0.5 text-[10px] text-muted">掌握 {{ unit.masteredWords }} 个</p>
          </div>
          <ChevronRight :size="18" class="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-forest" />
        </NuxtLink>
      </div>
      <EmptyState
        v-else
        title="这本课本还没有单元"
        description="请等待管理员补充单元和单词。"
      >
        <template #icon><BookOpen :size="18" /></template>
      </EmptyState>
    </template>
  </div>
</template>
