<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Image as ImageIcon,
  Play,
  RefreshCw,
  Volume2,
} from 'lucide-vue-next'
import type { UnitDetail } from '@english-study/shared'

const route = useRoute()
const api = useApi()
const toast = useToast()

const data = ref<UnitDetail | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    data.value = await api.get<UnitDetail>(`/student/units/${route.params.id}`)
  } catch (error) {
    toast.error(errorMessage(error, '单元加载失败'))
  } finally {
    loading.value = false
  }
}

let audioEl: HTMLAudioElement | null = null
// 只放真人录音（TTS 已移除）；没有录音的词不显示播放按钮。
function playAudio(word: { audioUrl: string | null }) {
  if (!import.meta.client || !word.audioUrl) return
  audioEl?.pause()
  const audio = new Audio(word.audioUrl)
  audioEl = audio
  audio.play().catch(() => {})
}

onMounted(load)
</script>

<template>
  <div>
    <div class="mb-5">
      <NuxtLink
        :to="data ? `/student/textbooks/${data.textbook.id}` : '/student'"
        class="btn-ghost -ml-2"
      >
        <ArrowLeft :size="15" />
        返回单元列表
      </NuxtLink>
    </div>

    <LoadingBlock v-if="loading" :lines="7" label="正在加载单词" />

    <template v-else-if="data">
      <section class="card overflow-hidden">
        <div class="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-start gap-4">
            <div class="grid size-14 shrink-0 place-items-center rounded-2xl bg-forest-soft font-display text-xl text-forest">
              {{ String(data.unit.unitNo).padStart(2, '0') }}
            </div>
            <div>
              <p class="text-[11px] text-muted">{{ data.textbook.version }} · {{ data.textbook.grade }}{{ data.textbook.semester }}</p>
              <h1 class="mt-1.5 font-display text-2xl leading-tight tracking-tight text-ink sm:text-3xl">{{ data.unit.unitName }}</h1>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>{{ data.unit.wordCount }} 个单词</span>
                <span class="size-1 rounded-full bg-line-strong" />
                <span>已学 {{ data.unit.learnedWords }}</span>
                <span class="size-1 rounded-full bg-line-strong" />
                <span>掌握 {{ data.unit.masteredWords }}</span>
                <span v-if="data.unit.dueCount" class="chip-clay !py-0.5">{{ data.unit.dueCount }} 个待复习</span>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <NuxtLink
              :to="`/student/practice?unitId=${data.unit.id}`"
              class="btn-primary"
            >
              <Play :size="15" fill="currentColor" />
              开始本单元练习
            </NuxtLink>
            <NuxtLink to="/student/review" class="btn-secondary">
              <RefreshCw :size="15" />
              今日复习
            </NuxtLink>
          </div>
        </div>
        <div class="border-t border-line/70 bg-paper/50 px-5 py-3.5 sm:px-7">
          <div class="flex flex-wrap items-center gap-2 text-[10px] text-muted">
            <span>本次练习会混合生成</span>
            <span class="chip-forest !py-0.5">释义选词</span>
            <span class="chip-forest !py-0.5">补全字母</span>
            <span class="chip-forest !py-0.5">句子填空</span>
            <span class="chip-forest !py-0.5">看图选词</span>
            <span class="ml-auto">有图单词才会出现看图题 · 发音已审核的单词才会出现听音题</span>
          </div>
        </div>
      </section>

      <div class="mt-7 flex items-end justify-between">
        <div>
          <p class="eyebrow">单词列表</p>
          <h2 class="mt-1 section-title">本单元全部单词</h2>
        </div>
        <span class="text-[11px] text-muted">按单元顺序</span>
      </div>

      <div v-if="data.words.length" class="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          v-for="(word, index) in data.words"
          :key="word.id"
          class="card flex items-center gap-3.5 p-3.5 transition hover:border-forest/20 sm:p-4"
        >
          <div class="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-paper">
            <img
              v-if="word.imageUrl && word.imageStatus === 'approved'"
              :src="word.imageUrl"
              :alt="word.spelling"
              class="size-full object-cover"
              loading="lazy"
            >
            <span v-else class="font-display text-lg text-muted/60">{{ word.spelling.charAt(0).toUpperCase() }}</span>
            <span class="absolute left-0 top-0 rounded-br-md bg-white/80 px-1 py-0.5 text-[8px] text-muted">{{ index + 1 }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="truncate text-sm font-semibold tracking-tight text-ink">{{ word.spelling }}</p>
              <span v-if="word.pos" class="text-[10px] italic text-muted">{{ word.pos }}</span>
              <button v-if="word.audioUrl" class="text-muted transition hover:text-forest" title="发音" @click="playAudio(word)">
                <Volume2 :size="13" />
              </button>
            </div>
            <p class="mt-0.5 truncate text-[11px] text-muted">
              <span v-if="word.phonetic">{{ word.phonetic }} · </span>{{ word.chineseDef }}
            </p>
            <div class="mt-2 flex items-center justify-between gap-2">
              <MasteryMeter :strength="word.mastery?.strength || 0" compact />
              <span
                v-if="word.mastery?.isWeak"
                class="text-[10px] font-medium text-clay"
              >薄弱词</span>
              <span v-else-if="!word.mastery" class="text-[10px] text-muted">未学习</span>
              <span v-else class="text-[10px] text-muted">{{ Math.round((word.mastery.accuracy || 0) * 100) }}%</span>
            </div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <span v-if="word.imageUrl && word.imageStatus === 'approved'" class="inline-flex items-center gap-1 rounded-md bg-forest-soft px-1.5 py-0.5 text-[9px] text-forest">
              <ImageIcon :size="10" /> 有图
            </span>
            <NuxtLink
              :to="`/student/practice?wordId=${word.id}`"
              class="btn-ghost !px-2 !py-1 text-[10px]"
            >
              练这个
              <ArrowRight :size="11" />
            </NuxtLink>
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        title="这个单元还没有单词"
        description="请联系管理员为单元关联单词。"
      >
        <template #icon><BookOpen :size="18" /></template>
        <template #action>
          <NuxtLink :to="`/student/textbooks/${data.textbook.id}`" class="btn-secondary">
            返回单元列表
          </NuxtLink>
        </template>
      </EmptyState>
    </template>
  </div>
</template>
