<script setup lang="ts">
import {
  BookOpen,
  ChevronRight,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import { GRADE_OPTIONS } from '@english-study/shared'

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
  createdAt: string
}

const api = useApi()
const toast = useToast()

const textbooks = ref<AdminTextbook[]>([])
const loading = ref(true)
const search = ref('')
const statusFilter = ref('')
const gradeFilter = ref('')

const modalOpen = ref(false)
const editingId = ref('')
const saving = ref(false)
const formError = ref('')

const deleteOpen = ref(false)
const deleteTarget = ref<AdminTextbook | null>(null)
const deleting = ref(false)

const form = reactive({
  name: '',
  version: '人教版',
  grade: '三年级',
  semester: '上册',
  status: 'draft' as AdminTextbook['status'],
  coverColor: 'forest',
})

const statusLabels: Record<AdminTextbook['status'], string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

const statusTone: Record<AdminTextbook['status'], string> = {
  draft: 'chip',
  published: 'chip-forest',
  archived: 'chip-danger',
}

const coverOptions = [
  { value: 'forest', label: '森林绿', class: 'bg-[#315f4c]' },
  { value: 'ocean', label: '海蓝', class: 'bg-[#467695]' },
  { value: 'clay', label: '陶土', class: 'bg-[#b9714d]' },
  { value: 'plum', label: '梅紫', class: 'bg-[#7c5a73]' },
  { value: 'sand', label: '沙金', class: 'bg-[#b59a66]' },
]

const filtered = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return textbooks.value.filter((textbook) => {
    if (statusFilter.value && textbook.status !== statusFilter.value) return false
    if (gradeFilter.value && textbook.grade !== gradeFilter.value) return false
    if (!keyword) return true
    return textbook.name.toLowerCase().includes(keyword)
      || textbook.version.toLowerCase().includes(keyword)
      || textbook.grade.includes(keyword)
  })
})

const publishedCount = computed(() => textbooks.value.filter((textbook) => textbook.status === 'published').length)
const totalUnits = computed(() => textbooks.value.reduce((sum, textbook) => sum + textbook.unitCount, 0))
const totalWords = computed(() => textbooks.value.reduce((sum, textbook) => sum + textbook.wordCount, 0))

async function load() {
  loading.value = true
  try {
    const result = await api.get<{ data: AdminTextbook[] }>('/admin/textbooks')
    textbooks.value = result.data
  } catch (error) {
    toast.error(errorMessage(error, '课本列表加载失败'))
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.name = ''
  form.version = '人教版'
  form.grade = '三年级'
  form.semester = '上册'
  form.status = 'draft'
  form.coverColor = 'forest'
  formError.value = ''
}

function openCreate() {
  editingId.value = ''
  resetForm()
  modalOpen.value = true
}

function openEdit(textbook: AdminTextbook) {
  editingId.value = textbook.id
  form.name = textbook.name
  form.version = textbook.version
  form.grade = textbook.grade
  form.semester = textbook.semester
  form.status = textbook.status
  form.coverColor = textbook.coverColor
  formError.value = ''
  modalOpen.value = true
}

async function save() {
  formError.value = ''
  if (!form.name.trim()) {
    formError.value = '请填写课本名称'
    return
  }
  if (!form.version.trim()) {
    formError.value = '请填写教材版本'
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      version: form.version.trim(),
      grade: form.grade,
      semester: form.semester,
      status: form.status,
      coverColor: form.coverColor,
    }
    if (editingId.value) {
      await api.patch(`/admin/textbooks/${editingId.value}`, payload)
      toast.success('课本已更新')
    } else {
      await api.post('/admin/textbooks', payload)
      toast.success('课本已创建')
    }
    modalOpen.value = false
    await load()
  } catch (error) {
    formError.value = errorMessage(error, '保存失败')
  } finally {
    saving.value = false
  }
}

function askDelete(textbook: AdminTextbook) {
  deleteTarget.value = textbook
  deleteOpen.value = true
}

async function remove() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const result = await api.delete<{ ok: boolean; archived?: boolean }>(`/admin/textbooks/${deleteTarget.value.id}`)
    toast.success(result.archived ? '已有学习记录，课本已归档' : '课本已删除')
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
      eyebrow="管理端 · 课本管理"
      title="课本与单元结构"
      description="维护教材版本、年级、学期与发布状态。只有“已发布”的课本会出现在学生端。"
    >
      <template #actions>
        <button class="btn-primary" @click="openCreate">
          <Plus :size="16" />
          新增课本
        </button>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="6" label="正在读取课本" />

    <template v-else>
      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">课本总数</p>
          <p class="mt-2 font-display text-3xl text-ink">{{ textbooks.length }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">已发布</p>
          <p class="mt-2 font-display text-3xl text-forest">{{ publishedCount }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">单元 / 单词</p>
          <p class="mt-2 font-display text-2xl text-ink">{{ totalUnits }} / {{ totalWords }}</p>
        </div>
      </section>

      <div class="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-cream/60 p-3.5 lg:flex-row lg:items-center">
        <div class="relative flex-1">
          <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input v-model="search" class="input !pl-9" placeholder="搜索课本名称或版本">
        </div>
        <div class="flex flex-wrap gap-2">
          <select v-model="gradeFilter" class="input !w-auto !py-2">
            <option value="">全部年级</option>
            <option v-for="grade in GRADE_OPTIONS" :key="grade" :value="grade">{{ grade }}</option>
          </select>
          <select v-model="statusFilter" class="input !w-auto !py-2">
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="archived">已归档</option>
          </select>
          <span class="self-center text-[11px] text-muted">{{ filtered.length }} 本</span>
        </div>
      </div>

      <div v-if="filtered.length" class="mt-4 grid gap-4 lg:grid-cols-2">
        <article v-for="textbook in filtered" :key="textbook.id" class="card overflow-hidden">
          <div class="flex items-start gap-4 p-5">
            <span
              class="grid size-12 shrink-0 place-items-center rounded-2xl text-white"
              :class="coverOptions.find((item) => item.value === textbook.coverColor)?.class || 'bg-[#315f4c]'"
            >
              <BookOpen :size="20" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <NuxtLink :to="`/admin/textbooks/${textbook.id}`" class="text-base font-medium text-ink hover:text-forest">
                  {{ textbook.name }}
                </NuxtLink>
                <span :class="statusTone[textbook.status]">{{ statusLabels[textbook.status] }}</span>
              </div>
              <p class="mt-1 text-[11px] text-muted">{{ textbook.version }} · {{ textbook.grade }}{{ textbook.semester }}</p>
              <div class="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted">
                <span class="inline-flex items-center gap-1"><Layers3 :size="11" /> {{ textbook.unitCount }} 个单元</span>
                <span class="inline-flex items-center gap-1"><BookOpen :size="11" /> {{ textbook.wordCount }} 个单词</span>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between border-t border-line/70 bg-paper/40 px-5 py-3">
            <NuxtLink :to="`/admin/textbooks/${textbook.id}`" class="btn-ghost btn-sm !text-forest">
              管理单元
              <ChevronRight :size="13" />
            </NuxtLink>
            <div class="flex items-center gap-1">
              <button class="btn-ghost btn-sm" @click="openEdit(textbook)">
                <Pencil :size="13" />
                编辑
              </button>
              <button class="btn-ghost btn-sm !text-danger" @click="askDelete(textbook)">
                <Trash2 :size="13" />
                删除
              </button>
            </div>
          </div>
        </article>
      </div>

      <EmptyState v-else title="没有匹配的课本" description="调整筛选条件，或新增一本课本。">
        <template #icon><BookOpen :size="18" /></template>
        <template #action>
          <button class="btn-primary" @click="openCreate">
            <Plus :size="15" />
            新增课本
          </button>
        </template>
      </EmptyState>
    </template>

    <Modal
      :open="modalOpen"
      :title="editingId ? '编辑课本' : '新增课本'"
      description="发布后学生端才可见。建议先创建单元与单词，再切换为已发布。"
      wide
      @close="modalOpen = false"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label" for="tb-name">课本名称</label>
          <input id="tb-name" v-model="form.name" class="input" maxlength="100" placeholder="例如：英语（三年级上册）">
        </div>
        <div>
          <label class="label" for="tb-version">教材版本</label>
          <input id="tb-version" v-model="form.version" class="input" maxlength="50" placeholder="人教版 / 外研版">
        </div>
        <div>
          <label class="label" for="tb-grade">年级</label>
          <select id="tb-grade" v-model="form.grade" class="input">
            <option v-for="grade in GRADE_OPTIONS" :key="grade" :value="grade">{{ grade }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="tb-semester">学期</label>
          <select id="tb-semester" v-model="form.semester" class="input">
            <option value="上册">上册</option>
            <option value="下册">下册</option>
            <option value="全一册">全一册</option>
          </select>
        </div>
        <div>
          <label class="label" for="tb-status">状态</label>
          <select id="tb-status" v-model="form.status" class="input">
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="archived">已归档</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label">封面主题</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in coverOptions"
              :key="option.value"
              type="button"
              class="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition"
              :class="form.coverColor === option.value ? 'border-forest bg-forest-soft text-forest' : 'border-line bg-white/70 text-muted'"
              @click="form.coverColor = option.value"
            >
              <span class="size-3.5 rounded-full" :class="option.class" />
              {{ option.label }}
            </button>
          </div>
        </div>
        <p v-if="formError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger sm:col-span-2">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="modalOpen = false">取消</button>
        <button class="btn-primary" :disabled="saving" @click="save">
          <Loader2 v-if="saving" :size="15" class="animate-spin" />
          保存课本
        </button>
      </template>
    </Modal>

    <Modal
      :open="deleteOpen"
      title="删除课本"
      description="若该课本已有练习记录，系统会自动改为归档而不是物理删除。"
      @close="deleteOpen = false"
    >
      <div v-if="deleteTarget" class="rounded-xl border border-line bg-paper/70 px-4 py-3.5">
        <p class="text-sm font-medium text-ink">{{ deleteTarget.name }}</p>
        <p class="mt-1 text-[11px] text-muted">{{ deleteTarget.version }} · {{ deleteTarget.grade }}{{ deleteTarget.semester }} · {{ deleteTarget.unitCount }} 个单元</p>
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
