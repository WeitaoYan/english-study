<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import type { QuestionType } from '@english-study/shared'
import { QUESTION_TYPE_LABELS } from '@english-study/shared'

interface QuestionRow {
  id: string
  wordId: string
  spelling: string
  chineseDef: string
  type: QuestionType
  stem: string
  options: string[]
  correctAnswer: string
  explanation: string | null
  difficulty: number
  status: 'draft' | 'published' | 'archived'
  createdAt: string
}

interface WordOption {
  id: string
  spelling: string
  chineseDef: string
  phonetic: string | null
}

const api = useApi()
const toast = useToast()

const questions = ref<QuestionRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const typeFilter = ref('')
const statusFilter = ref('')
const loading = ref(true)

const modalOpen = ref(false)
const editingId = ref('')
const saving = ref(false)
const formError = ref('')
const optionsText = ref('')
const wordSearch = ref('')
const wordResults = ref<WordOption[]>([])
const wordSearching = ref(false)
const selectedWordLabel = ref('')

const deleteOpen = ref(false)
const deleteTarget = ref<QuestionRow | null>(null)
const deleting = ref(false)

const form = reactive({
  wordId: '',
  type: 'definition_choice' as QuestionType,
  stem: '',
  correctAnswer: '',
  explanation: '',
  difficulty: 1,
  status: 'draft' as QuestionRow['status'],
})

// 搭配题已暂停、听词选音不开放人工题（选项是录音、没法用文字出题）：
// 表单与筛选都不再提供这两个题型（旧数据的类型标签仍用 QUESTION_TYPE_LABELS 展示）。
const typeOptions = (Object.entries(QUESTION_TYPE_LABELS) as Array<[QuestionType, string]>)
  .filter(([value]) => value !== 'collocation_choice' && value !== 'pronunciation_choice')
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const startIndex = computed(() => (total.value ? (page.value - 1) * limit + 1 : 0))
const endIndex = computed(() => Math.min(page.value * limit, total.value))

const statusLabels: Record<QuestionRow['status'], string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

const statusTone: Record<QuestionRow['status'], string> = {
  draft: 'chip',
  published: 'chip-forest',
  archived: 'chip-danger',
}

async function load() {
  loading.value = true
  try {
    const result = await api.get<{ data: QuestionRow[]; total: number; page: number; limit: number }>('/admin/questions', {
      query: {
        type: typeFilter.value,
        status: statusFilter.value,
        page: page.value,
        limit,
      },
    })
    questions.value = result.data
    total.value = result.total
  } catch (error) {
    toast.error(errorMessage(error, '题目列表加载失败'))
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  load()
}

function goPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}

async function searchWords() {
  wordSearching.value = true
  try {
    const result = await api.get<{ data: WordOption[] }>('/admin/words', {
      query: { search: wordSearch.value.trim(), limit: 20, enabled: 'true' },
    })
    wordResults.value = result.data
  } catch (error) {
    toast.error(errorMessage(error, '单词搜索失败'))
  } finally {
    wordSearching.value = false
  }
}

const onWordSearch = useDebouncedFn(searchWords, 320).run

function selectWord(word: WordOption) {
  form.wordId = word.id
  selectedWordLabel.value = `${word.spelling} · ${word.chineseDef}`
  if (!form.stem) {
    form.stem = word.chineseDef
    form.correctAnswer = word.spelling
    form.type = 'definition_choice'
    optionsText.value = ''
  }
  wordResults.value = []
  wordSearch.value = ''
}

function resetForm() {
  form.wordId = ''
  form.type = 'definition_choice'
  form.stem = ''
  form.correctAnswer = ''
  form.explanation = ''
  form.difficulty = 1
  form.status = 'draft'
  optionsText.value = ''
  selectedWordLabel.value = ''
  wordSearch.value = ''
  wordResults.value = []
  formError.value = ''
}

async function openCreate() {
  editingId.value = ''
  resetForm()
  modalOpen.value = true
  await searchWords()
}

async function openEdit(question: QuestionRow) {
  editingId.value = question.id
  form.wordId = question.wordId
  form.type = question.type
  form.stem = question.stem
  form.correctAnswer = question.correctAnswer
  form.explanation = question.explanation || ''
  form.difficulty = question.difficulty
  form.status = question.status
  optionsText.value = question.options.join('\n')
  selectedWordLabel.value = `${question.spelling} · ${question.chineseDef}`
  wordSearch.value = ''
  wordResults.value = []
  formError.value = ''
  modalOpen.value = true
}

async function save() {
  if (saving.value) return
  formError.value = ''
  if (!form.wordId) {
    formError.value = '请选择关联单词'
    return
  }
  if (!form.stem.trim()) {
    formError.value = '请填写题干'
    return
  }
  if (!form.correctAnswer.trim()) {
    formError.value = '请填写正确答案'
    return
  }
  saving.value = true
  try {
    const payload = {
      wordId: form.wordId,
      type: form.type,
      stem: form.stem.trim(),
      options: optionsText.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      correctAnswer: form.correctAnswer.trim(),
      explanation: form.explanation.trim() || undefined,
      difficulty: Number(form.difficulty) || 1,
      status: form.status,
    }
    if (editingId.value) {
      await api.patch(`/admin/questions/${editingId.value}`, payload)
      toast.success('题目已更新')
    } else {
      await api.post('/admin/questions', payload)
      toast.success('题目已创建')
    }
    modalOpen.value = false
    await load()
  } catch (error) {
    formError.value = errorMessage(error, '保存失败')
  } finally {
    saving.value = false
  }
}

function askDelete(question: QuestionRow) {
  deleteTarget.value = question
  deleteOpen.value = true
}

async function remove() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await api.delete(`/admin/questions/${deleteTarget.value.id}`)
    toast.success('题目已删除')
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="管理端 · 题库管理"
      title="补充题目与解析"
      description="学生练习默认按单词数据动态出题。这里用于维护需要人工校对或补充的题目，状态为“已发布”的题目才会被使用。"
    >
      <template #actions>
        <button class="btn-primary" @click="openCreate">
          <Plus :size="16" />
          新增题目
        </button>
      </template>
    </PageHeader>

    <div class="card p-3.5">
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="typeFilter" class="input !w-auto !py-2" @change="applyFilters">
          <option value="">全部题型</option>
          <option v-for="[value, label] in typeOptions" :key="value" :value="value">{{ label }}</option>
        </select>
        <select v-model="statusFilter" class="input !w-auto !py-2" @change="applyFilters">
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
          <option value="archived">已归档</option>
        </select>
        <button class="btn-secondary btn-sm" @click="applyFilters">筛选</button>
        <span class="ml-auto text-[11px] text-muted">共 {{ total }} 道题</span>
      </div>
    </div>

    <LoadingBlock v-if="loading" :lines="6" label="正在读取题库" />

    <template v-else>
      <div class="mt-4 table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>关联单词</th>
              <th>题型</th>
              <th>题干</th>
              <th>选项</th>
              <th>难度</th>
              <th>状态</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="question in questions" :key="question.id">
              <td>
                <p class="font-medium text-ink">{{ question.spelling }}</p>
                <p class="max-w-[160px] truncate text-[10px] text-muted">{{ question.chineseDef }}</p>
              </td>
              <td><span class="chip !py-0.5">{{ QUESTION_TYPE_LABELS[question.type] }}</span></td>
              <td><p class="max-w-[260px] truncate">{{ question.stem }}</p></td>
              <td><span class="text-xs">{{ question.options.length }} 个</span></td>
              <td><span class="text-xs">{{ question.difficulty }} 级</span></td>
              <td><span :class="statusTone[question.status]" class="!py-0.5">{{ statusLabels[question.status] }}</span></td>
              <td>
                <div class="flex items-center justify-end gap-1">
                  <button class="btn-ghost btn-sm" @click="openEdit(question)">
                    <Pencil :size="13" />
                    编辑
                  </button>
                  <button class="btn-ghost btn-sm !text-danger" @click="askDelete(question)">
                    <Trash2 :size="13" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!questions.length" class="px-4 py-12 text-center text-xs text-muted">没有匹配的题目</p>
      </div>

      <div class="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p class="text-[11px] text-muted">显示 {{ startIndex }}–{{ endIndex }} 条，共 {{ total }} 条</p>
        <div class="flex items-center gap-1.5">
          <button class="btn-secondary btn-sm" :disabled="page <= 1" @click="goPage(page - 1)">
            <ChevronLeft :size="13" />
            上一页
          </button>
          <span class="px-2 text-[11px] text-muted">{{ page }} / {{ totalPages }}</span>
          <button class="btn-secondary btn-sm" :disabled="page >= totalPages" @click="goPage(page + 1)">
            下一页
            <ChevronRight :size="13" />
          </button>
        </div>
      </div>
    </template>

    <Modal
      :open="modalOpen"
      :title="editingId ? '编辑题目' : '新增题目'"
      description="题干可使用 ____ 表示空格。选项每行一个，正确答案需与选项或单词拼写一致。"
      wide
      @close="modalOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label">关联单词</label>
          <div v-if="form.wordId" class="flex items-center justify-between gap-3 rounded-xl border border-forest/15 bg-forest-soft/50 px-3.5 py-3">
            <p class="truncate text-sm font-medium text-ink">{{ selectedWordLabel }}</p>
            <button class="btn-ghost btn-sm" @click="form.wordId = ''; selectedWordLabel = ''">更换</button>
          </div>
          <template v-else>
            <div class="relative">
              <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                v-model="wordSearch"
                class="input !pl-9"
                placeholder="输入拼写或释义搜索单词"
                @input="onWordSearch"
                @keyup.enter="searchWords"
              >
            </div>
            <div class="mt-2 max-h-40 overflow-y-auto rounded-xl border border-line bg-white/60">
              <div v-if="wordSearching" class="flex items-center gap-2 px-3 py-2.5 text-xs text-muted">
                <Loader2 :size="13" class="animate-spin" />
                正在搜索
              </div>
              <template v-else>
                <button
                  v-for="word in wordResults"
                  :key="word.id"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-forest-soft/40"
                  @click="selectWord(word)"
                >
                  <span class="min-w-0">
                    <span class="block text-xs font-medium text-ink">{{ word.spelling }}</span>
                    <span class="block truncate text-[10px] text-muted">{{ word.chineseDef }}</span>
                  </span>
                  <span class="text-[9px] text-muted">{{ word.phonetic }}</span>
                </button>
              </template>
              <p v-if="!wordSearching && !wordResults.length" class="px-3 py-2.5 text-center text-[10px] text-muted">没有找到单词</p>
            </div>
          </template>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="q-type">题型</label>
            <select id="q-type" v-model="form.type" class="input">
              <option v-for="[value, label] in typeOptions" :key="value" :value="value">{{ label }}</option>
            </select>
          </div>
          <div>
            <label class="label" for="q-difficulty">难度</label>
            <select id="q-difficulty" v-model.number="form.difficulty" class="input">
              <option :value="1">1 级</option>
              <option :value="2">2 级</option>
              <option :value="3">3 级</option>
              <option :value="4">4 级</option>
              <option :value="5">5 级</option>
            </select>
          </div>
        </div>

        <div>
          <label class="label" for="q-stem">题干</label>
          <textarea id="q-stem" v-model="form.stem" class="input min-h-[80px] resize-y" maxlength="1000" placeholder="例如：This is my English ____." />
        </div>

        <div>
          <label class="label" for="q-options">选项（每行一个，可留空）</label>
          <textarea id="q-options" v-model="optionsText" class="input min-h-[88px] resize-y font-mono text-xs" placeholder="apple&#10;banana&#10;book" />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="q-answer">正确答案</label>
            <input id="q-answer" v-model="form.correctAnswer" class="input" maxlength="200" placeholder="apple">
          </div>
          <div>
            <label class="label" for="q-status">状态</label>
            <select id="q-status" v-model="form.status" class="input">
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>

        <div>
          <label class="label" for="q-explanation">解析（可选）</label>
          <textarea id="q-explanation" v-model="form.explanation" class="input min-h-[72px] resize-y" maxlength="1000" placeholder="用于答题后的说明" />
        </div>

        <p v-if="formError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="modalOpen = false">取消</button>
        <button class="btn-primary" :disabled="saving" @click="save">
          <Loader2 v-if="saving" :size="15" class="animate-spin" />
          保存题目
        </button>
      </template>
    </Modal>

    <Modal
      :open="deleteOpen"
      title="删除题目"
      description="删除后不可恢复。已经产生的答题记录会保留，但不再引用该题。"
      @close="deleteOpen = false"
    >
      <div v-if="deleteTarget" class="rounded-xl border border-line bg-paper/70 px-4 py-3.5">
        <p class="text-sm font-medium text-ink">{{ deleteTarget.spelling }}</p>
        <p class="mt-1 text-[11px] text-muted">{{ QUESTION_TYPE_LABELS[deleteTarget.type] }} · {{ deleteTarget.stem }}</p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="deleteOpen = false">取消</button>
        <button class="btn-danger" :disabled="deleting" @click="remove">
          <Loader2 v-if="deleting" :size="15" class="animate-spin" />
          <Trash2 v-else :size="15" />
          确认删除
        </button>
      </template>
    </Modal>
  </div>
</template>
