<script setup lang="ts">
import {
  Check,
  Loader2,
  Search,
  Volume2,
  X,
} from 'lucide-vue-next'
import { formatDateTimeCN, TTS_STATUS_LABELS } from '@english-study/shared'
import type { TtsStatus, Word } from '@english-study/shared'

type TabKey = TtsStatus

interface PronunciationRow extends Word {
  units: string[]
}

const api = useApi()
const toast = useToast()

const activeTab = ref<TabKey>('pending')
const search = ref('')
const words = ref<PronunciationRow[]>([])
const total = ref(0)
const loading = ref(true)

const reviewOpen = ref(false)
const reviewTarget = ref<PronunciationRow | null>(null)
const reviewStatus = ref<'approved' | 'rejected'>('approved')
const reviewNote = ref('')
const reviewing = ref(false)

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
]

// 与学生端练习页完全相同的发音参数：美式英语、语速 0.82。
// 审核听到的就是学生听到的（同一台设备、同一浏览器内）；换设备后语音可能略有差异。
function speak(word: string) {
  if (!import.meta.client || !('speechSynthesis' in window)) {
    toast.error('当前浏览器不支持语音合成，请换一个支持的浏览器审核')
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  utterance.rate = 0.82
  window.speechSynthesis.speak(utterance)
}

async function load() {
  loading.value = true
  try {
    const result = await api.get<{ data: PronunciationRow[]; total: number }>('/admin/pronunciation', {
      query: {
        status: activeTab.value,
        search: search.value.trim() || undefined,
      },
    })
    words.value = result.data
    total.value = result.total
  } catch (error) {
    toast.error(errorMessage(error, '发音审核列表加载失败'))
  } finally {
    loading.value = false
  }
}

async function changeTab(tab: TabKey) {
  activeTab.value = tab
  await load()
}

const onSearchInput = useDebouncedFn(load, 320).run

function askReview(word: PronunciationRow, status: 'approved' | 'rejected') {
  reviewTarget.value = word
  reviewStatus.value = status
  reviewNote.value = word.ttsReviewNote || ''
  reviewOpen.value = true
}

async function submitReview() {
  if (!reviewTarget.value || reviewing.value) return
  reviewing.value = true
  try {
    await api.patch(`/admin/pronunciation/${reviewTarget.value.id}`, {
      status: reviewStatus.value,
      note: reviewNote.value.trim() || undefined,
    })
    toast.success(reviewStatus.value === 'approved' ? '发音已通过审核，该单词可出听音题' : '发音已驳回，不会出听音题')
    reviewOpen.value = false
    reviewTarget.value = null
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '审核失败'))
  } finally {
    reviewing.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  if (import.meta.client && 'speechSynthesis' in window) window.speechSynthesis.cancel()
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="管理端 · 发音审核"
      title="TTS 发音审核"
      description="点播放试听浏览器 TTS 发音，确认发音无误后通过；只有已通过的单词才会出现听音选词。未通过或被驳回的单词仍可出释义、拼写、句子、看图等题型。审核以你当前设备和浏览器的语音为准，学生换设备后语音可能略有差异。"
    />

    <div class="relative">
      <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        v-model="search"
        class="input !pl-9"
        placeholder="输入拼写或释义搜索"
        @input="onSearchInput"
        @keyup.enter="load"
      >
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-cream/60 p-1">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs transition"
        :class="activeTab === tab.key ? 'bg-white font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'"
        @click="changeTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <LoadingBlock v-if="loading" :lines="6" label="正在读取单词" />

    <template v-else>
      <div class="mt-4 flex items-end justify-between">
        <div>
          <p class="eyebrow">{{ TTS_STATUS_LABELS[activeTab] }}</p>
          <h2 class="mt-1 section-title">
            {{ activeTab === 'pending' ? '先播放试听，确认发音无误再通过' : activeTab === 'approved' ? '当前可用于听音选词' : '不会出听音题，可重新试听后通过' }}
          </h2>
        </div>
        <span class="text-[11px] text-muted">{{ total }} 个单词 · 仅显示已启用单词</span>
      </div>

      <div v-if="words.length" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="word in words" :key="word.id" class="card p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-ink">{{ word.spelling }}</p>
            <span
              class="chip !py-0.5"
              :class="word.ttsStatus === 'approved' ? 'chip-forest' : word.ttsStatus === 'pending' ? 'chip-clay' : 'chip-danger'"
            >
              {{ TTS_STATUS_LABELS[word.ttsStatus] }}
            </span>
          </div>
          <p class="mt-0.5 truncate text-[10px] text-muted">
            {{ word.phonetic || '' }} {{ word.pos || '' }} · {{ word.chineseDef }}
          </p>
          <p v-if="word.ttsReviewedAt" class="mt-2 text-[9px] text-muted">
            审核于 {{ formatDateTimeCN(word.ttsReviewedAt) }}
          </p>
          <p v-if="word.ttsReviewNote" class="mt-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-[10px] text-muted">
            {{ word.ttsReviewNote }}
          </p>
          <div class="mt-3 flex items-center gap-1.5">
            <button class="btn-secondary btn-sm flex-1" @click="speak(word.spelling)">
              <Volume2 :size="13" />
              播放发音
            </button>
            <button
              v-if="word.ttsStatus !== 'approved'"
              class="btn-primary btn-sm flex-1"
              @click="askReview(word, 'approved')"
            >
              <Check :size="13" />
              通过
            </button>
            <button
              v-if="word.ttsStatus !== 'rejected'"
              class="btn-danger btn-sm"
              :class="word.ttsStatus === 'approved' ? 'flex-1' : ''"
              @click="askReview(word, 'rejected')"
            >
              <X :size="13" />
              驳回
            </button>
          </div>
        </article>
      </div>
      <EmptyState
        v-else
        :title="activeTab === 'pending' ? '没有待审核发音' : '这个分类还没有单词'"
        description="新单词默认进入待审核，试听通过后才会出现听音题。"
        compact
      >
        <template #icon><Volume2 :size="18" /></template>
      </EmptyState>
    </template>

    <Modal
      :open="reviewOpen"
      :title="reviewStatus === 'approved' ? '通过发音审核' : '驳回发音'"
      :description="reviewStatus === 'approved' ? '通过后该单词会进入听音选词出题池，学生端用同样的 TTS 参数播放发音。' : '驳回后该单词不会出听音题，但仍可出其他题型，可备注发音问题方便后续处理。'"
      @close="reviewOpen = false"
    >
      <div v-if="reviewTarget" class="space-y-4">
        <div class="flex items-center gap-3 rounded-xl border border-line bg-paper/70 px-3.5 py-3">
          <button class="btn-secondary btn-sm shrink-0" @click="speak(reviewTarget.spelling)">
            <Volume2 :size="13" />
            再听一次
          </button>
          <div class="min-w-0">
            <p class="text-sm font-medium text-ink">{{ reviewTarget.spelling }}</p>
            <p class="truncate text-[10px] text-muted">{{ reviewTarget.chineseDef }}</p>
          </div>
        </div>
        <div>
          <label class="label" for="tts-review-note">审核备注（可选）</label>
          <textarea id="tts-review-note" v-model="reviewNote" class="input min-h-[88px] resize-y" maxlength="300" placeholder="例如：发音清晰，与音标一致；或：TTS 把这个词读错了" />
        </div>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="reviewOpen = false">取消</button>
        <button :class="reviewStatus === 'approved' ? 'btn-primary' : 'btn-danger'" :disabled="reviewing" @click="submitReview">
          <Loader2 v-if="reviewing" :size="15" class="animate-spin" />
          {{ reviewStatus === 'approved' ? '确认通过' : '确认驳回' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
