<script setup lang="ts">
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MinusCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-vue-next'

interface AdminTextbook {
  id: string
  name: string
  version: string
  grade: string
  semester: string
  status: 'draft' | 'published' | 'archived'
  coverColor: string
  unitCount: number
  wordCount: number
}

interface AdminUnit {
  id: string
  textbookId: string
  unitNo: number
  unitName: string
  sortOrder: number
  wordCount: number
}

interface LibraryWord {
  id: string
  spelling: string
  chineseDef: string
  phonetic: string | null
  imageUrl: string | null
  imageStatus: string | null
  hasImage: boolean
  enabled: boolean
}

const route = useRoute()
const api = useApi()
const toast = useToast()

const textbook = ref<AdminTextbook | null>(null)
const units = ref<AdminUnit[]>([])
const loading = ref(true)

const unitModalOpen = ref(false)
const editingUnitId = ref('')
const savingUnit = ref(false)
const unitError = ref('')
const unitForm = reactive({ unitNo: 1, unitName: '', sortOrder: 1 })

const deleteOpen = ref(false)
const deleteTarget = ref<AdminUnit | null>(null)
const deleting = ref(false)

const wordsOpen = ref(false)
const activeUnit = ref<AdminUnit | null>(null)
const unitWords = ref<LibraryWord[]>([])
const unitWordsLoading = ref(false)
const wordSearch = ref('')
const searchResults = ref<LibraryWord[]>([])
const searching = ref(false)
const addingId = ref('')
const addingSpelling = ref(false)
const removingId = ref('')
const normalizedSearch = computed(() => wordSearch.value.trim().toLowerCase())
// 搜不到且输入像个单词拼写时，允许用 AI 直接加词：
// 搜索结果里已有完全相同拼写时不显示（点“添加”即可，或已在单元里）。
const canAiAdd = computed(() => {
  if (searching.value) return false
  const spelling = normalizedSearch.value
  if (!spelling || !/^[a-z]+(?:[ '-][a-z]+)*$/.test(spelling)) return false
  return !searchResults.value.some((word) => word.spelling.toLowerCase() === spelling)
})
// 完全匹配的词已在本单元时：它会从可添加列表里被过滤掉，界面上只剩近似词，
// 容易让人误以为“没有完全匹配的词、AI 入口也没出现”——直接把状态说清楚。
const exactInUnit = computed(() => {
  if (searching.value) return null
  const spelling = normalizedSearch.value
  if (!spelling) return null
  const found = searchResults.value.find((word) => word.spelling.toLowerCase() === spelling)
  return found && unitWordIds.value.has(found.id) ? found.spelling : null
})
let searchTimer: ReturnType<typeof setTimeout> | null = null

const totalWords = computed(() => units.value.reduce((sum, unit) => sum + unit.wordCount, 0))
const unitWordIds = computed(() => new Set(unitWords.value.map((word) => word.id)))
const availableResults = computed(() => searchResults.value.filter((word) => !unitWordIds.value.has(word.id)))

async function load() {
  loading.value = true
  try {
    const [textbookResult, unitResult] = await Promise.all([
      api.get<{ data: AdminTextbook[] }>('/admin/textbooks'),
      api.get<{ data: AdminUnit[] }>(`/admin/textbooks/${route.params.id}/units`),
    ])
    textbook.value = textbookResult.data.find((item) => item.id === route.params.id) || null
    units.value = unitResult.data
  } catch (error) {
    toast.error(errorMessage(error, '课本详情加载失败'))
  } finally {
    loading.value = false
  }
}

function openCreateUnit() {
  editingUnitId.value = ''
  const maxNo = units.value.reduce((max, unit) => Math.max(max, unit.unitNo), 0)
  const maxSort = units.value.reduce((max, unit) => Math.max(max, unit.sortOrder), 0)
  unitForm.unitNo = maxNo + 1
  unitForm.unitName = `Unit ${maxNo + 1}`
  unitForm.sortOrder = maxSort + 1
  unitError.value = ''
  unitModalOpen.value = true
}

function openEditUnit(unit: AdminUnit) {
  editingUnitId.value = unit.id
  unitForm.unitNo = unit.unitNo
  unitForm.unitName = unit.unitName
  unitForm.sortOrder = unit.sortOrder
  unitError.value = ''
  unitModalOpen.value = true
}

async function saveUnit() {
  unitError.value = ''
  if (!unitForm.unitName.trim()) {
    unitError.value = '请填写单元名称'
    return
  }
  savingUnit.value = true
  try {
    const payload = {
      textbookId: String(route.params.id),
      unitNo: Number(unitForm.unitNo) || 1,
      unitName: unitForm.unitName.trim(),
      sortOrder: Number(unitForm.sortOrder) || 0,
    }
    if (editingUnitId.value) {
      await api.patch(`/admin/units/${editingUnitId.value}`, payload)
      toast.success('单元已更新')
    } else {
      await api.post('/admin/units', payload)
      toast.success('单元已创建')
    }
    unitModalOpen.value = false
    await load()
  } catch (error) {
    unitError.value = errorMessage(error, '保存失败')
  } finally {
    savingUnit.value = false
  }
}

function askDelete(unit: AdminUnit) {
  deleteTarget.value = unit
  deleteOpen.value = true
}

async function removeUnit() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await api.delete(`/admin/units/${deleteTarget.value.id}`)
    toast.success('单元已删除')
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}

async function loadUnitWords(unit: AdminUnit) {
  unitWordsLoading.value = true
  try {
    const result = await api.get<{ data: LibraryWord[] }>(`/admin/units/${unit.id}/words`)
    unitWords.value = result.data
  } catch (error) {
    toast.error(errorMessage(error, '单元单词加载失败'))
  } finally {
    unitWordsLoading.value = false
  }
}

async function openWords(unit: AdminUnit) {
  activeUnit.value = unit
  wordsOpen.value = true
  wordSearch.value = ''
  searchResults.value = []
  await loadUnitWords(unit)
}

async function searchLibrary() {
  if (searching.value) return
  searching.value = true
  try {
    const result = await api.get<{ data: LibraryWord[] }>('/admin/words', {
      query: { search: wordSearch.value.trim(), enabled: 'true', limit: 30 },
    })
    searchResults.value = result.data
  } catch (error) {
    toast.error(errorMessage(error, '单词搜索失败'))
  } finally {
    searching.value = false
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchLibrary()
  }, 320)
}

async function addWord(word: LibraryWord) {
  if (!activeUnit.value) return
  addingId.value = word.id
  try {
    await api.post(`/admin/units/${activeUnit.value.id}/words`, {
      wordId: word.id,
    })
    toast.success(`已添加 ${word.spelling}`)
    await loadUnitWords(activeUnit.value)
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '添加失败'))
  } finally {
    addingId.value = ''
  }
}

async function addWordBySpelling() {
  if (!activeUnit.value || !canAiAdd.value) return
  addingSpelling.value = true
  try {
    const result = await api.post<{ wordId: string; created: boolean }>(`/admin/units/${activeUnit.value.id}/words`, {
      spelling: normalizedSearch.value,
    })
    toast.success(result.created ? `已用 AI 加词 ${normalizedSearch.value} 并添加到单元` : `已添加 ${normalizedSearch.value}`)
    await loadUnitWords(activeUnit.value)
    await load()
    // 刷新搜索结果：新词出现后“AI 加词”入口随之消失，避免重复提交。
    await searchLibrary()
  } catch (error) {
    toast.error(errorMessage(error, 'AI 加词失败'))
  } finally {
    addingSpelling.value = false
  }
}

async function removeWord(word: LibraryWord) {
  if (!activeUnit.value) return
  removingId.value = word.id
  try {
    await api.delete(`/admin/units/${activeUnit.value.id}/words/${word.id}`)
    toast.success(`已从单元移除 ${word.spelling}`)
    await loadUnitWords(activeUnit.value)
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '移除失败'))
  } finally {
    removingId.value = ''
  }
}

onMounted(load)
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <div>
    <div class="mb-5">
      <NuxtLink to="/admin/textbooks" class="btn-ghost -ml-2">
        <ArrowLeft :size="15" />
        返回课本列表
      </NuxtLink>
    </div>

    <LoadingBlock v-if="loading" :lines="7" label="正在读取单元" />

    <template v-else-if="textbook">
      <PageHeader
        eyebrow="管理端 · 单元管理"
        :title="textbook.name"
        :description="`${textbook.version} · ${textbook.grade}${textbook.semester}。在这里维护单元顺序，并为每个单元关联单词。`"
      >
        <template #actions>
          <NuxtLink to="/admin/words" class="btn-secondary">
            <BookOpen :size="15" />
            单词库
          </NuxtLink>
          <button class="btn-primary" @click="openCreateUnit">
            <Plus :size="16" />
            新增单元
          </button>
        </template>
      </PageHeader>

      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">单元数</p>
          <p class="mt-2 font-display text-3xl text-ink">{{ units.length }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">关联单词</p>
          <p class="mt-2 font-display text-3xl text-forest">{{ totalWords }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">状态</p>
          <p class="mt-2 text-sm font-medium text-ink">
            {{ textbook.status === 'published' ? '已发布' : textbook.status === 'draft' ? '草稿' : '已归档' }}
          </p>
        </div>
      </section>

      <div class="mt-6 flex items-end justify-between">
        <div>
          <p class="eyebrow">单元列表</p>
          <h2 class="mt-1 section-title">按排序展示给学生</h2>
        </div>
        <span class="text-[11px] text-muted">{{ units.length }} 个单元</span>
      </div>

      <div v-if="units.length" class="mt-4 space-y-3">
        <article v-for="unit in units" :key="unit.id" class="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-forest-soft font-display text-lg text-forest">
            {{ String(unit.unitNo).padStart(2, '0') }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-ink">{{ unit.unitName }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted">
              <span class="inline-flex items-center gap-1"><Layers3 :size="11" /> 排序 {{ unit.sortOrder }}</span>
              <span class="inline-flex items-center gap-1"><BookOpen :size="11" /> {{ unit.wordCount }} 个单词</span>
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <button class="btn-secondary btn-sm" @click="openWords(unit)">
              管理单词
              <ChevronRight :size="13" />
            </button>
            <button class="btn-ghost btn-sm" @click="openEditUnit(unit)">
              <Pencil :size="13" />
              编辑
            </button>
            <button class="btn-ghost btn-sm !text-danger" @click="askDelete(unit)">
              <Trash2 :size="13" />
            </button>
          </div>
        </article>
      </div>

      <EmptyState v-else title="还没有单元" description="创建单元后，即可把单词库中的单词关联进来。">
        <template #icon><Layers3 :size="18" /></template>
        <template #action>
          <button class="btn-primary" @click="openCreateUnit">
            <Plus :size="15" />
            创建第一个单元
          </button>
        </template>
      </EmptyState>
    </template>

    <EmptyState v-else title="课本不存在" description="可能已被删除，请返回课本列表重新选择。">
      <template #icon><BookOpen :size="18" /></template>
      <template #action>
        <NuxtLink to="/admin/textbooks" class="btn-primary">返回课本列表</NuxtLink>
      </template>
    </EmptyState>

    <Modal
      :open="unitModalOpen"
      :title="editingUnitId ? '编辑单元' : '新增单元'"
      description="单元编号与排序会决定学生端的展示顺序。"
      @close="unitModalOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="unit-name">单元名称</label>
          <input id="unit-name" v-model="unitForm.unitName" class="input" maxlength="100" placeholder="例如：Unit 1  Hello!">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label" for="unit-no">单元编号</label>
            <input id="unit-no" v-model.number="unitForm.unitNo" class="input" type="number" min="1" max="999">
          </div>
          <div>
            <label class="label" for="unit-sort">排序</label>
            <input id="unit-sort" v-model.number="unitForm.sortOrder" class="input" type="number" min="0">
          </div>
        </div>
        <p v-if="unitError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ unitError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="unitModalOpen = false">取消</button>
        <button class="btn-primary" :disabled="savingUnit" @click="saveUnit">
          <Loader2 v-if="savingUnit" :size="15" class="animate-spin" />
          保存单元
        </button>
      </template>
    </Modal>

    <Modal
      :open="deleteOpen"
      title="删除单元"
      description="单元下的单词关联会一并删除，单词本身仍保留在单词库中。"
      @close="deleteOpen = false"
    >
      <div v-if="deleteTarget" class="rounded-xl border border-line bg-paper/70 px-4 py-3.5">
        <p class="text-sm font-medium text-ink">{{ deleteTarget.unitName }}</p>
        <p class="mt-1 text-[11px] text-muted">Unit {{ deleteTarget.unitNo }} · {{ deleteTarget.wordCount }} 个单词</p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="deleteOpen = false">取消</button>
        <button class="btn-danger" :disabled="deleting" @click="removeUnit">
          <Loader2 v-if="deleting" :size="15" class="animate-spin" />
          <Trash2 v-else :size="15" />
          确认删除
        </button>
      </template>
    </Modal>

    <Modal
      :open="wordsOpen"
      :title="`管理单词 · ${activeUnit?.unitName || ''}`"
      description="从单词库搜索并添加到当前单元，库中没有的单词可用 AI 直接加词；也可移除不再属于本单元的单词。"
      wide
      @close="wordsOpen = false"
    >
      <div class="grid gap-5 lg:grid-cols-2">
        <section>
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-ink">单元内单词</p>
            <span class="text-[10px] text-muted">{{ unitWords.length }} 个</span>
          </div>
          <div v-if="unitWordsLoading" class="mt-3 space-y-2">
            <div v-for="index in 4" :key="index" class="skeleton h-12" />
          </div>
          <div v-else-if="unitWords.length" class="mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
            <div v-for="word in unitWords" :key="word.id" class="flex items-center gap-2.5 rounded-xl border border-line/70 bg-white/60 px-3 py-2.5">
              <div class="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-paper">
                <img v-if="word.imageUrl && word.imageStatus === 'approved'" :src="word.imageUrl" :alt="word.spelling" class="size-full object-cover">
                <span v-else class="text-[10px] text-muted">{{ word.spelling.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-ink">{{ word.spelling }}</p>
                <p class="truncate text-[10px] text-muted">{{ word.chineseDef }}</p>
              </div>
              <button class="btn-ghost btn-sm !text-danger" :disabled="removingId === word.id" @click="removeWord(word)">
                <Loader2 v-if="removingId === word.id" :size="13" class="animate-spin" />
                <MinusCircle v-else :size="13" />
              </button>
            </div>
          </div>
          <EmptyState v-else title="单元还没有单词" description="在右侧搜索并添加。" compact>
            <template #icon><BookOpen :size="16" /></template>
          </EmptyState>
        </section>

        <section>
          <p class="text-xs font-medium text-ink">从单词库添加</p>
          <div class="relative mt-2">
            <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input v-model="wordSearch" class="input !pl-9" placeholder="输入拼写或释义搜索" @input="onSearchInput" @keyup.enter="searchLibrary">
          </div>
          <div class="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">
            <p v-if="exactInUnit" class="rounded-xl bg-forest-soft/60 px-3 py-2 text-[11px] text-forest-deep">
              「{{ exactInUnit }}」已在本单元，无需重复添加。
            </p>
            <div v-if="searching" class="flex items-center gap-2 py-4 text-xs text-muted">
              <Loader2 :size="14" class="animate-spin" />
              正在搜索
            </div>
            <template v-else-if="availableResults.length">
              <div v-for="word in availableResults" :key="word.id" class="flex items-center gap-2.5 rounded-xl border border-line/70 bg-white/60 px-3 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium text-ink">{{ word.spelling }}</p>
                  <p class="truncate text-[10px] text-muted">{{ word.chineseDef }}</p>
                </div>
                <span v-if="word.imageUrl && word.imageStatus === 'approved'" class="inline-flex items-center gap-0.5 text-[9px] text-forest">
                  <ImageIcon :size="10" /> 有图
                </span>
                <button class="btn-secondary btn-sm" :disabled="addingId === word.id" @click="addWord(word)">
                  <Loader2 v-if="addingId === word.id" :size="12" class="animate-spin" />
                  <Plus v-else :size="12" />
                  添加
                </button>
              </div>
            </template>
            <p v-else class="py-6 text-center text-[11px] text-muted">
              {{ searchResults.length ? '搜索结果都已在本单元' : wordSearch.trim() ? '库中没有相关单词' : '输入关键词搜索单词库' }}
            </p>
            <div v-if="canAiAdd" class="mt-3 rounded-xl border border-dashed border-line bg-paper/70 px-3 py-3">
              <p class="text-[11px] leading-relaxed text-ink-soft">库中没有「{{ normalizedSearch }}」</p>
              <button class="btn-primary btn-sm mt-2" :disabled="addingSpelling" @click="addWordBySpelling">
                <Loader2 v-if="addingSpelling" :size="12" class="animate-spin" />
                <Sparkles v-else :size="12" />
                {{ addingSpelling ? 'AI 正在补充内容…' : '用 AI 加词并加入单元' }}
              </button>
              <p class="mt-1.5 text-[10px] leading-relaxed text-muted">由 AI 自动补充音标、释义、例句与搭配，新词发音默认待审核。</p>
            </div>
          </div>
        </section>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="wordsOpen = false">
          <X :size="14" />
          关闭
        </button>
        <NuxtLink to="/admin/words" class="btn-primary">
          <BookOpen :size="14" />
          去单词库
        </NuxtLink>
      </template>
    </Modal>
  </div>
</template>
