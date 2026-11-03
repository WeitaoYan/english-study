<script setup lang="ts">
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Eye,
  Focus,
  Image as ImageIcon,
  Search,
  Star,
  Volume2,
} from 'lucide-vue-next'
import type { WordWithMastery } from '@english-study/shared'
import { formatDateCN } from '@english-study/shared'

interface TextbookOption {
  id: string
  name: string
  version: string
  grade: string
  semester: string
}

interface ChildWord extends WordWithMastery {
  focused: boolean
}

interface WordsResponse {
  textbooks: TextbookOption[]
  textbookId: string
  words: ChildWord[]
}

const route = useRoute()
const api = useApi()
const toast = useToast()

const data = ref<WordsResponse | null>(null)
const loading = ref(true)
const textbookId = ref('')
const search = ref('')
const onlyFocused = ref(false)
const onlyWeak = ref(false)
const processing = ref('')
const detail = ref<ChildWord | null>(null)

const filteredWords = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return (data.value?.words || []).filter((word) => {
    if (onlyFocused.value && !word.focused) return false
    if (onlyWeak.value && !word.mastery?.isWeak) return false
    if (!keyword) return true
    return word.spelling.toLowerCase().includes(keyword) || word.chineseDef.includes(keyword)
  })
})

const focusedCount = computed(() => (data.value?.words || []).filter((word) => word.focused).length)
const weakCount = computed(() => (data.value?.words || []).filter((word) => word.mastery?.isWeak).length)
const currentTextbook = computed(() =>
  data.value?.textbooks.find((textbook) => textbook.id === textbookId.value),
)

async function load(id?: string) {
  loading.value = true
  try {
    const result = await api.get<WordsResponse>(`/parent/children/${route.params.id}/words`, {
      query: id ? { textbookId: id } : {},
    })
    data.value = result
    textbookId.value = result.textbookId || ''
  } catch (error) {
    toast.error(errorMessage(error, '单词列表加载失败'))
  } finally {
    loading.value = false
  }
}

async function changeTextbook() {
  await load(textbookId.value)
}

async function toggleFocus(word: ChildWord) {
  processing.value = word.id
  const next = !word.focused
  try {
    await api.post(`/parent/children/${route.params.id}/words/${word.id}/focus`, {
      focused: next,
    })
    word.focused = next
    if (detail.value?.id === word.id) detail.value.focused = next
    toast.success(next ? '已标记为重点关注' : '已取消关注')
  } catch (error) {
    toast.error(errorMessage(error, '操作失败'))
  } finally {
    processing.value = ''
  }
}

function speak(word: string) {
  if (!import.meta.client || !('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  utterance.rate = 0.85
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function masteryText(word: ChildWord) {
  if (!word.mastery) return '尚未学习'
  if (word.mastery.isWeak) return `近 7 次正确率 ${Math.round((word.mastery.accuracy || 0) * 100)}%`
  return `记忆强度 ${word.mastery.strength} 级 · 正确率 ${Math.round((word.mastery.accuracy || 0) * 100)}%`
}

onMounted(() => load())
</script>

<template>
  <div>
    <div class="mb-5">
      <NuxtLink :to="`/parent/children/${route.params.id}`" class="btn-ghost -ml-2">
        <ArrowLeft :size="15" />
        返回学习报告
      </NuxtLink>
    </div>

    <PageHeader
      eyebrow="家长端 · 单词管理"
      title="陪孩子多看一眼"
      description="查看当前课本的单词与掌握情况。标记“重点关注”只是提醒，不会改变孩子的学习记录，也不会公开评价。"
    >
      <template #actions>
        <select v-if="data?.textbooks.length" v-model="textbookId" class="input min-w-[220px] !py-2.5" @change="changeTextbook">
          <option v-for="textbook in data.textbooks" :key="textbook.id" :value="textbook.id">
            {{ textbook.grade }}{{ textbook.semester }} · {{ textbook.name }}
          </option>
        </select>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="7" label="正在读取单词列表" />

    <template v-else-if="data">
      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">当前课本单词</p>
          <p class="mt-2 font-display text-3xl text-ink">{{ data.words.length }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">重点关注</p>
          <p class="mt-2 font-display text-3xl text-gold">{{ focusedCount }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">薄弱单词</p>
          <p class="mt-2 font-display text-3xl text-clay">{{ weakCount }}</p>
        </div>
      </section>

      <div class="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-cream/60 p-3.5 sm:flex-row sm:items-center">
        <div class="relative flex-1">
          <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input v-model="search" class="input !pl-9" placeholder="搜索拼写或中文释义">
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="btn-sm rounded-full border px-3 py-1.5 text-xs transition"
            :class="onlyFocused ? 'border-gold/30 bg-gold-soft text-gold' : 'border-line bg-white/70 text-muted'"
            @click="onlyFocused = !onlyFocused"
          >
            <Star :size="12" class="mr-1 inline" />
            只看关注
          </button>
          <button
            class="btn-sm rounded-full border px-3 py-1.5 text-xs transition"
            :class="onlyWeak ? 'border-clay/30 bg-clay-soft text-clay' : 'border-line bg-white/70 text-muted'"
            @click="onlyWeak = !onlyWeak"
          >
            <AlertTriangle :size="12" class="mr-1 inline" />
            只看薄弱
          </button>
          <span class="text-[11px] text-muted">{{ filteredWords.length }} 个结果</span>
        </div>
      </div>

      <div v-if="filteredWords.length" class="mt-4 space-y-2.5">
        <article
          v-for="word in filteredWords"
          :key="word.id"
          class="card flex flex-col gap-3 p-4 transition hover:border-forest/20 sm:flex-row sm:items-center"
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
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-semibold tracking-tight text-ink">{{ word.spelling }}</p>
              <span v-if="word.phonetic" class="text-[10px] text-muted">{{ word.phonetic }}</span>
              <span v-if="word.pos" class="text-[10px] italic text-muted">{{ word.pos }}</span>
              <span v-if="word.mastery?.isWeak" class="chip-clay !py-0.5">薄弱</span>
              <span v-if="word.focused" class="chip border-gold/20 bg-gold-soft !py-0.5 text-gold">
                <Star :size="10" />
                重点关注
              </span>
            </div>
            <p class="mt-0.5 truncate text-[11px] text-muted">{{ word.chineseDef }}</p>
            <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
              <span>{{ masteryText(word) }}</span>
              <span v-if="word.mastery?.nextReviewTime">下次复习 {{ formatDateCN(word.mastery.nextReviewTime) }}</span>
              <span v-if="word.imageUrl && word.imageStatus === 'approved'" class="inline-flex items-center gap-0.5 text-forest">
                <ImageIcon :size="10" /> 有图
              </span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <button class="btn-ghost btn-sm" @click="speak(word.spelling)">
              <Volume2 :size="13" />
            </button>
            <button class="btn-ghost btn-sm" @click="detail = word">
              <Eye :size="13" />
              详情
            </button>
            <button
              class="btn-sm inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition"
              :class="word.focused
                ? 'border-gold/30 bg-gold-soft text-gold'
                : 'border-line bg-white/70 text-ink-soft hover:border-gold/30 hover:text-gold'"
              :disabled="processing === word.id"
              @click="toggleFocus(word)"
            >
              <Check v-if="word.focused" :size="12" />
              <Focus v-else :size="12" />
              {{ word.focused ? '已关注' : '关注' }}
            </button>
          </div>
        </article>
      </div>

      <EmptyState
        v-else
        title="没有匹配的单词"
        description="可以清空搜索或切换课本。关注与薄弱筛选不会影响孩子的学习记录。"
        compact
      >
        <template #icon><BookOpen :size="18" /></template>
      </EmptyState>

      <p class="mt-5 text-center text-[10px] leading-relaxed text-muted">
        {{ currentTextbook ? `${currentTextbook.version} · ${currentTextbook.grade}${currentTextbook.semester}` : '' }}
        重点关注仅家长端可见，用于线下提醒。
      </p>
    </template>

    <EmptyState
      v-else
      title="无法读取单词"
      description="请确认已与该学生完成绑定，或返回孩子列表重新选择。"
    >
      <template #icon><BookOpen :size="18" /></template>
    </EmptyState>

    <Modal
      :open="Boolean(detail)"
      :title="detail?.spelling || '单词详情'"
      :description="detail?.chineseDef"
      wide
      @close="detail = null"
    >
      <div v-if="detail" class="grid gap-5 sm:grid-cols-[180px_1fr]">
        <div>
          <div class="grid aspect-square place-items-center overflow-hidden rounded-2xl border border-line bg-paper">
            <img
              v-if="detail.imageUrl && detail.imageStatus === 'approved'"
              :src="detail.imageUrl"
              :alt="detail.spelling"
              class="size-full object-cover"
            >
            <span v-else class="font-display text-5xl text-muted/50">{{ detail.spelling.charAt(0).toUpperCase() }}</span>
          </div>
          <button class="btn-secondary mt-3 w-full" @click="speak(detail.spelling)">
            <Volume2 :size="14" />
            朗读发音
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-display text-2xl text-ink">{{ detail.spelling }}</p>
              <span v-if="detail.phonetic" class="text-xs text-muted">{{ detail.phonetic }}</span>
              <span v-if="detail.pos" class="chip !py-0.5">{{ detail.pos }}</span>
            </div>
            <p class="mt-1 text-sm text-ink-soft">{{ detail.chineseDef }}</p>
            <p v-if="detail.englishDef" class="mt-1 text-xs leading-relaxed text-muted">{{ detail.englishDef }}</p>
          </div>

          <div class="rounded-xl bg-paper/70 px-3.5 py-3">
            <p class="text-[10px] text-muted">学习情况</p>
            <p class="mt-1 text-xs text-ink-soft">{{ masteryText(detail) }}</p>
            <p v-if="detail.mastery" class="mt-1 text-[10px] text-muted">
              总作答 {{ detail.mastery.totalAttempts }} 次 · 连续答对 {{ detail.mastery.consecutiveCorrect }} 次
            </p>
            <p v-else class="mt-1 text-[10px] text-muted">孩子还没有练习过这个单词。</p>
          </div>

          <div v-if="detail.examples.length">
            <p class="text-[10px] font-medium tracking-wide text-muted">例句</p>
            <div class="mt-1.5 space-y-1.5">
              <div v-for="example in detail.examples" :key="example.en" class="rounded-lg border border-line/70 bg-white/60 px-3 py-2">
                <p class="text-xs text-ink">{{ example.en }}</p>
                <p v-if="example.zh" class="mt-0.5 text-[10px] text-muted">{{ example.zh }}</p>
              </div>
            </div>
          </div>

          <div v-if="detail.collocations.length">
            <p class="text-[10px] font-medium tracking-wide text-muted">常用搭配</p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <span v-for="item in detail.collocations" :key="item.phrase" class="chip">
                {{ item.phrase }}<template v-if="item.zh"> · {{ item.zh }}</template>
              </span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="detail = null">关闭</button>
        <button
          v-if="detail"
          class="btn-primary"
          :disabled="processing === detail.id"
          @click="toggleFocus(detail)"
        >
          <Star :size="14" />
          {{ detail.focused ? '取消重点关注' : '标记重点关注' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
