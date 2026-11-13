<script setup lang="ts">
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-vue-next'
import { formatDateTimeCN } from '@english-study/shared'

interface ImageRow {
  id: string
  wordId: string
  spelling: string
  chineseDef: string
  imageUrl: string
  r2Key: string | null
  uploadMethod: string
  status: 'pending' | 'approved' | 'rejected' | 'replaced'
  source: string | null
  license: string | null
  creator: string | null
  attribution: string | null
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}

interface MissingRow {
  id: string
  spelling: string
  chineseDef: string
  phonetic: string | null
  latestStatus: string | null
  imageCount: number
}

interface WordOption {
  id: string
  spelling: string
  chineseDef: string
  imageUrl: string | null
  imageStatus: string | null
}

type TabKey = 'pending' | 'approved' | 'rejected' | 'missing'

const api = useApi()
const toast = useToast()

const activeTab = ref<TabKey>('pending')
const images = ref<ImageRow[]>([])
const missing = ref<MissingRow[]>([])
const loading = ref(true)

const reviewOpen = ref(false)
const reviewTarget = ref<ImageRow | null>(null)
const reviewStatus = ref<'approved' | 'rejected'>('approved')
const reviewNote = ref('')
const reviewing = ref(false)

const uploadOpen = ref(false)
const uploadWordId = ref('')
const uploadWordLabel = ref('')
const uploadFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const uploadSearch = ref('')
const uploadResults = ref<WordOption[]>([])
const uploadSearching = ref(false)
const uploading = ref(false)
const uploadError = ref('')

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
  { key: 'missing', label: '缺少图片' },
]

async function load() {
  loading.value = true
  try {
    if (activeTab.value === 'missing') {
      const result = await api.get<{ data: MissingRow[] }>('/admin/images/missing')
      missing.value = result.data
    } else {
      const result = await api.get<{ data: ImageRow[] }>('/admin/images', {
        query: { status: activeTab.value },
      })
      images.value = result.data
    }
  } catch (error) {
    toast.error(errorMessage(error, '图片列表加载失败'))
  } finally {
    loading.value = false
  }
}

async function changeTab(tab: TabKey) {
  activeTab.value = tab
  await load()
}

function askReview(image: ImageRow, status: 'approved' | 'rejected') {
  reviewTarget.value = image
  reviewStatus.value = status
  reviewNote.value = image.reviewNote || ''
  reviewOpen.value = true
}

async function submitReview() {
  if (!reviewTarget.value || reviewing.value) return
  reviewing.value = true
  try {
    await api.patch(`/admin/images/${reviewTarget.value.id}`, {
      status: reviewStatus.value,
      note: reviewNote.value.trim() || undefined,
    })
    toast.success(reviewStatus.value === 'approved' ? '图片已通过审核' : '图片已驳回')
    reviewOpen.value = false
    reviewTarget.value = null
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '审核失败'))
  } finally {
    reviewing.value = false
  }
}

function openUpload(word?: MissingRow | WordOption) {
  uploadOpen.value = true
  uploadError.value = ''
  uploadFiles.value = []
  uploadSearch.value = ''
  uploadResults.value = []
  if (word) {
    uploadWordId.value = word.id
    uploadWordLabel.value = `${word.spelling} · ${word.chineseDef}`
  } else {
    uploadWordId.value = ''
    uploadWordLabel.value = ''
  }
  if (fileInput.value) fileInput.value.value = ''
}

async function searchWords() {
  if (!uploadSearch.value.trim()) {
    uploadResults.value = []
    return
  }
  uploadSearching.value = true
  try {
    const result = await api.get<{ data: WordOption[] }>('/admin/words', {
      query: { search: uploadSearch.value.trim(), limit: 20, enabled: 'true' },
    })
    uploadResults.value = result.data
  } catch (error) {
    toast.error(errorMessage(error, '单词搜索失败'))
  } finally {
    uploadSearching.value = false
  }
}

const onUploadSearch = useDebouncedFn(searchWords, 320).run

function selectWord(word: WordOption) {
  uploadWordId.value = word.id
  uploadWordLabel.value = `${word.spelling} · ${word.chineseDef}`
  uploadResults.value = []
  uploadSearch.value = ''
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  uploadFiles.value = Array.from(target.files || [])
}

async function submitUpload() {
  if (uploading.value) return
  uploadError.value = ''
  if (!uploadWordId.value) {
    uploadError.value = '请先选择要上传图片的单词'
    return
  }
  if (!uploadFiles.value.length) {
    uploadError.value = '请选择图片文件'
    return
  }
  if (uploadFiles.value.some((file) => file.size > 5 * 1024 * 1024)) {
    uploadError.value = '单张图片不能超过 5MB'
    return
  }
  uploading.value = true
  try {
    const form = new FormData()
    for (const file of uploadFiles.value) form.append('files', file)
    const result = await api.post<{ count?: number }>(`/admin/words/${uploadWordId.value}/images`, form)
    toast.success(`已上传 ${result.count || uploadFiles.value.length} 张图片，等待审核`)
    uploadOpen.value = false
    activeTab.value = 'pending'
    await load()
  } catch (error) {
    uploadError.value = errorMessage(error, '上传失败')
  } finally {
    uploading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="管理端 · 图片管理"
      title="单词图片审核"
      description="上传后进入待审核，通过后才会用于看图选词。新图片通过时会自动替换旧图，但不会删除历史记录。"
    >
      <template #actions>
        <button class="btn-primary" @click="openUpload()">
          <Upload :size="15" />
          上传图片
        </button>
      </template>
    </PageHeader>

    <div class="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-cream/60 p-1">
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

    <LoadingBlock v-if="loading" :lines="6" label="正在读取图片" />

    <template v-else>
      <template v-if="activeTab === 'missing'">
        <div class="mt-4 flex items-end justify-between">
          <div>
            <p class="eyebrow">缺少图片</p>
            <h2 class="mt-1 section-title">仍可用于释义、拼写与句子题</h2>
          </div>
          <span class="text-[11px] text-muted">{{ missing.length }} 个单词</span>
        </div>

        <div v-if="missing.length" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="word in missing" :key="word.id" class="card flex items-center gap-3 p-4">
            <span class="grid size-12 shrink-0 place-items-center rounded-xl border border-dashed border-line-strong bg-paper text-muted">
              <ImageIcon :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ink">{{ word.spelling }}</p>
              <p class="truncate text-[10px] text-muted">{{ word.chineseDef }}</p>
              <p class="mt-1 text-[9px] text-muted">
                {{ word.latestStatus === 'rejected' ? '上次被驳回' : word.latestStatus === 'pending' ? '有待审核图片' : '暂无图片' }}
              </p>
            </div>
            <button class="btn-secondary btn-sm shrink-0" @click="openUpload(word)">
              <Upload :size="12" />
              上传
            </button>
          </article>
        </div>
        <EmptyState v-else title="所有单词都有已通过的图片" description="缺少图片的单词会出现在这里，方便集中补齐。" compact>
          <template #icon><ShieldCheck :size="18" /></template>
        </EmptyState>
      </template>

      <template v-else>
        <div class="mt-4 flex items-end justify-between">
          <div>
            <p class="eyebrow">
              {{ activeTab === 'pending' ? '待审核' : activeTab === 'approved' ? '已通过' : '已驳回' }}
            </p>
            <h2 class="mt-1 section-title">
              {{ activeTab === 'pending' ? '确认图片与单词匹配' : activeTab === 'approved' ? '当前可用于题目' : '可重新上传或再次通过' }}
            </h2>
          </div>
          <span class="text-[11px] text-muted">{{ images.length }} 张</span>
        </div>

        <div v-if="images.length" class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="image in images" :key="image.id" class="card overflow-hidden">
            <div class="aspect-[4/3] overflow-hidden bg-paper-deep">
              <img :src="image.imageUrl" :alt="image.spelling" class="size-full object-cover" loading="lazy">
            </div>
            <div class="p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-medium text-ink">{{ image.spelling }}</p>
                <span
                  class="chip !py-0.5"
                  :class="image.status === 'approved' ? 'chip-forest' : image.status === 'pending' ? 'chip-clay' : 'chip-danger'"
                >
                  {{ image.status === 'approved' ? '已通过' : image.status === 'pending' ? '待审核' : '已驳回' }}
                </span>
              </div>
              <p class="mt-0.5 truncate text-[10px] text-muted">{{ image.chineseDef }}</p>
              <p v-if="image.source" class="mt-1.5 text-[10px] leading-relaxed text-muted">
                来源：{{ image.source === 'wikipedia' ? '维基百科' : image.source === 'openverse' ? 'Openverse' : image.source }}
                <template v-if="image.license"> · {{ image.license }}</template>
                <template v-if="image.creator"> · {{ image.creator }}</template>
              </p>
              <p class="mt-2 text-[9px] text-muted">上传于 {{ formatDateTimeCN(image.createdAt) }}</p>
              <p v-if="image.reviewNote" class="mt-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-[10px] text-muted">
                {{ image.reviewNote }}
              </p>
              <div class="mt-3 flex items-center gap-1.5">
                <button
                  v-if="image.status !== 'approved'"
                  class="btn-primary btn-sm flex-1"
                  @click="askReview(image, 'approved')"
                >
                  <Check :size="13" />
                  通过
                </button>
                <button
                  v-if="image.status !== 'rejected'"
                  class="btn-danger btn-sm"
                  :class="image.status === 'approved' ? 'flex-1' : ''"
                  @click="askReview(image, 'rejected')"
                >
                  <X :size="13" />
                  驳回
                </button>
                <button class="btn-ghost btn-sm" @click="openUpload({ id: image.wordId, spelling: image.spelling, chineseDef: image.chineseDef, imageUrl: image.imageUrl, imageStatus: image.status })">
                  <Upload :size="13" />
                  重传
                </button>
              </div>
            </div>
          </article>
        </div>
        <EmptyState
          v-else
          :title="activeTab === 'pending' ? '没有待审核图片' : '这个分类还没有图片'"
          description="上传新图片后会自动进入待审核列表。"
          compact
        >
          <template #icon><ImageIcon :size="18" /></template>
        </EmptyState>
      </template>
    </template>

    <Modal
      :open="reviewOpen"
      :title="reviewStatus === 'approved' ? '通过图片审核' : '驳回图片'"
      :description="reviewStatus === 'approved' ? '通过后该图片会用于看图选词，并替换旧图。' : '驳回后不会用于出题，可备注原因方便后续处理。'"
      @close="reviewOpen = false"
    >
      <div v-if="reviewTarget" class="space-y-4">
        <div class="flex items-center gap-3 rounded-xl border border-line bg-paper/70 px-3.5 py-3">
          <img :src="reviewTarget.imageUrl" :alt="reviewTarget.spelling" class="size-16 rounded-lg object-cover">
          <div>
            <p class="text-sm font-medium text-ink">{{ reviewTarget.spelling }}</p>
            <p class="text-[10px] text-muted">{{ reviewTarget.chineseDef }}</p>
            <p v-if="reviewTarget.attribution" class="mt-1 text-[10px] leading-relaxed text-muted">{{ reviewTarget.attribution }}</p>
          </div>
        </div>
        <div>
          <label class="label" for="review-note">审核备注（可选）</label>
          <textarea id="review-note" v-model="reviewNote" class="input min-h-[88px] resize-y" maxlength="300" placeholder="例如：图片清晰，与释义匹配" />
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

    <Modal
      :open="uploadOpen"
      title="上传单词图片"
      description="支持 JPG、PNG、WebP、GIF、SVG，单张不超过 5MB，可一次选择多张。上传后需审核通过才会用于题目。"
      @close="uploadOpen = false"
    >
      <div class="space-y-4">
        <div v-if="uploadWordLabel" class="flex items-center justify-between gap-3 rounded-xl border border-forest/15 bg-forest-soft/50 px-3.5 py-3">
          <div class="min-w-0">
            <p class="text-[10px] text-muted">已选择单词</p>
            <p class="truncate text-sm font-medium text-ink">{{ uploadWordLabel }}</p>
          </div>
          <button class="btn-ghost btn-sm" @click="uploadWordId = ''; uploadWordLabel = ''">更换</button>
        </div>

        <div v-else>
          <label class="label" for="upload-word-search">选择单词</label>
          <div class="relative">
            <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="upload-word-search"
              v-model="uploadSearch"
              class="input !pl-9"
              placeholder="输入拼写或释义搜索"
              @input="onUploadSearch"
              @keyup.enter="searchWords"
            >
          </div>
          <div class="mt-2 max-h-44 overflow-y-auto">
            <div v-if="uploadSearching" class="flex items-center gap-2 py-3 text-xs text-muted">
              <Loader2 :size="13" class="animate-spin" />
              正在搜索
            </div>
            <template v-else>
              <button
                v-for="word in uploadResults"
                :key="word.id"
                class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-forest-soft/40"
                @click="selectWord(word)"
              >
                <span class="min-w-0">
                  <span class="block text-xs font-medium text-ink">{{ word.spelling }}</span>
                  <span class="block truncate text-[10px] text-muted">{{ word.chineseDef }}</span>
                </span>
                <span v-if="word.imageStatus === 'approved'" class="chip-forest !py-0.5">已有图</span>
              </button>
            </template>
            <p v-if="!uploadSearching && uploadSearch && !uploadResults.length" class="py-3 text-center text-[10px] text-muted">没有找到单词</p>
          </div>
        </div>

        <div>
          <label class="label" for="upload-file">图片文件</label>
          <input
            id="upload-file"
            ref="fileInput"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            class="block w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-xs text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-forest-soft file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-forest"
            @change="onFileChange"
          >
          <p v-if="uploadFiles.length" class="mt-1.5 text-[10px] text-muted">
            已选择 {{ uploadFiles.length }} 张：{{ uploadFiles.map((file) => file.name).join('、') }}
          </p>
        </div>

        <p v-if="uploadError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ uploadError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="uploadOpen = false">取消</button>
        <button class="btn-primary" :disabled="uploading" @click="submitUpload">
          <Loader2 v-if="uploading" :size="15" class="animate-spin" />
          <Upload v-else :size="15" />
          上传并送审
        </button>
      </template>
    </Modal>
  </div>
</template>
