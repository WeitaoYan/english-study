<script setup lang="ts">
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import type { Collocation, ExampleSentence, Word } from '@english-study/shared'
import { csvCell, xlsxToCsv } from '../../utils/xlsx'

interface AdminWord extends Word {
  units: string[]
}

interface UnitOption {
  id: string
  unitNo: number
  unitName: string
  textbookName: string
  grade: string
  semester: string
}

interface ImportResult {
  imported: number
  linked: number
  errors: Array<{ row: number; message: string }>
}

const api = useApi()
const toast = useToast()

const words = ref<AdminWord[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const search = ref('')
const hasImage = ref('')
const enabledFilter = ref('')
const loading = ref(true)
const units = ref<UnitOption[]>([])

const modalOpen = ref(false)
const editingId = ref('')
const saving = ref(false)
const formError = ref('')
const examplesText = ref('')
const collocationsText = ref('')

const importOpen = ref(false)
const importing = ref(false)
const importCsv = ref('')
const importUnitId = ref('')
const importResult = ref<ImportResult | null>(null)
const importError = ref('')
const importFileInput = ref<HTMLInputElement | null>(null)
const importFileName = ref('')

const deleteOpen = ref(false)
const deleteTarget = ref<AdminWord | null>(null)
const deleting = ref(false)

const form = reactive({
  spelling: '',
  phonetic: '',
  pos: '',
  chineseDef: '',
  englishDef: '',
  difficulty: 1,
  enabled: true,
  autoFill: true,
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const startIndex = computed(() => (total.value ? (page.value - 1) * limit + 1 : 0))
const endIndex = computed(() => Math.min(page.value * limit, total.value))

async function load() {
  loading.value = true
  try {
    const result = await api.get<{ data: AdminWord[]; total: number; page: number; limit: number }>('/admin/words', {
      query: {
        search: search.value.trim(),
        hasImage: hasImage.value,
        enabled: enabledFilter.value,
        page: page.value,
        limit,
      },
    })
    words.value = result.data
    total.value = result.total
  } catch (error) {
    toast.error(errorMessage(error, '单词列表加载失败'))
  } finally {
    loading.value = false
  }
}

async function loadUnits() {
  try {
    const result = await api.get<{ data: UnitOption[] }>('/admin/units')
    units.value = result.data
  } catch {
    // 导入时单元为可选项，加载失败不阻断主流程。
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

function serializeExamples(examples: ExampleSentence[]) {
  return examples.map((item) => (item.zh ? `${item.en} | ${item.zh}` : item.en)).join('\n')
}

function serializeCollocations(collocations: Collocation[]) {
  return collocations.map((item) => (item.zh ? `${item.phrase} | ${item.zh}` : item.phrase)).join('\n')
}

function parseExamples(value: string): ExampleSentence[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [en, zh] = line.split('|').map((part) => part.trim())
      return { en: en || '', zh: zh || undefined }
    })
    .filter((item) => item.en)
}

function parseCollocations(value: string): Collocation[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [phrase, zh] = line.split('|').map((part) => part.trim())
      return { phrase: phrase || '', zh: zh || undefined }
    })
    .filter((item) => item.phrase)
}

function resetForm() {
  form.spelling = ''
  form.phonetic = ''
  form.pos = ''
  form.chineseDef = ''
  form.englishDef = ''
  form.difficulty = 1
  form.enabled = true
  form.autoFill = true
  examplesText.value = ''
  collocationsText.value = ''
  formError.value = ''
}

function openCreate() {
  editingId.value = ''
  resetForm()
  modalOpen.value = true
}

function openEdit(word: AdminWord) {
  editingId.value = word.id
  form.spelling = word.spelling
  form.phonetic = word.phonetic || ''
  form.pos = word.pos || ''
  form.chineseDef = word.chineseDef
  form.englishDef = word.englishDef || ''
  form.difficulty = word.difficulty
  form.enabled = word.enabled
  form.autoFill = false
  examplesText.value = serializeExamples(word.examples)
  collocationsText.value = serializeCollocations(word.collocations)
  formError.value = ''
  modalOpen.value = true
}

async function save() {
  formError.value = ''
  const autoFillCreate = form.autoFill && !editingId.value
  if (!form.spelling.trim()) {
    formError.value = '请填写单词拼写'
    return
  }
  if (!autoFillCreate && !form.chineseDef.trim()) {
    formError.value = '请填写中文释义'
    return
  }
  saving.value = true
  try {
    const payload = {
      spelling: form.spelling.trim(),
      phonetic: form.phonetic.trim() || null,
      pos: form.pos.trim() || null,
      chineseDef: form.chineseDef.trim(),
      englishDef: form.englishDef.trim() || null,
      difficulty: autoFillCreate ? undefined : Number(form.difficulty) || 1,
      enabled: form.enabled,
      examples: parseExamples(examplesText.value),
      collocations: parseCollocations(collocationsText.value),
    }
    if (editingId.value) {
      await api.patch(`/admin/words/${editingId.value}`, payload)
      toast.success('单词已更新')
    } else {
      const created = await api.post<{ aiFilled?: boolean }>('/admin/words', { ...payload, autoFill: form.autoFill })
      toast.success(created.aiFilled ? '单词已创建，内容由 AI 补充' : '单词已创建')
    }
    modalOpen.value = false
    await load()
  } catch (error) {
    formError.value = errorMessage(error, '保存失败')
  } finally {
    saving.value = false
  }
}

function askDelete(word: AdminWord) {
  deleteTarget.value = word
  deleteOpen.value = true
}

async function remove() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const result = await api.delete<{ ok: boolean; disabled?: boolean }>(`/admin/words/${deleteTarget.value.id}`)
    toast.success(result.disabled ? '已有答题记录，单词已停用' : '单词已删除')
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}

function openImport() {
  importCsv.value = 'spelling,chinese_def,phonetic,pos,difficulty,examples\n'
  importUnitId.value = ''
  importResult.value = null
  importError.value = ''
  importFileName.value = ''
  if (importFileInput.value) importFileInput.value.value = ''
  importOpen.value = true
}

async function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importError.value = ''
  importResult.value = null
  try {
    const lower = file.name.toLowerCase()
    let csv = ''
    if (lower.endsWith('.xlsx')) {
      csv = await xlsxToCsv(file)
    } else if (lower.endsWith('.tsv') || lower.endsWith('.txt')) {
      csv = (await file.text()).split(/\r?\n/)
        .map(line => line.split('\t').map(cell => csvCell(cell)).join(','))
        .join('\n')
    } else if (lower.endsWith('.csv')) {
      csv = await file.text()
    } else {
      importError.value = '仅支持 .xlsx、.csv 或制表符分隔的 .tsv / .txt 文件'
      return
    }
    if (!csv.trim()) {
      importError.value = '文件中没有可导入的数据'
      return
    }
    importCsv.value = csv
    importFileName.value = file.name
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '文件解析失败'
  }
}

async function runImport() {
  importError.value = ''
  importResult.value = null
  if (!importCsv.value.trim()) {
    importError.value = '请粘贴 CSV 内容'
    return
  }
  importing.value = true
  try {
    const result = await api.post<ImportResult>('/admin/words/import', {
      csv: importCsv.value,
      unitId: importUnitId.value || undefined,
    })
    importResult.value = result
    if (result.imported) {
      toast.success(`已导入 ${result.imported} 个单词`)
      await load()
    } else {
      toast.error('没有成功导入任何单词')
    }
  } catch (error) {
    importError.value = errorMessage(error, '导入失败')
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await Promise.all([load(), loadUnits()])
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="管理端 · 单词库"
      title="维护单词内容"
      description="单词支持释义、音标、例句与搭配。图片与音频在对应模块维护。停用或删除有答题记录的单词不会破坏历史数据。"
    >
      <template #actions>
        <button class="btn-secondary" @click="openImport">
          <FileUp :size="15" />
          批量导入
        </button>
        <button class="btn-primary" @click="openCreate">
          <Plus :size="16" />
          新增单词
        </button>
      </template>
    </PageHeader>

    <div class="card p-3.5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div class="relative flex-1">
          <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input v-model="search" class="input !pl-9" placeholder="搜索拼写或中文释义" @keyup.enter="applyFilters">
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="hasImage" class="input !w-auto !py-2" @change="applyFilters">
            <option value="">全部图片状态</option>
            <option value="true">已有图片</option>
            <option value="false">缺少图片</option>
          </select>
          <select v-model="enabledFilter" class="input !w-auto !py-2" @change="applyFilters">
            <option value="">全部启用状态</option>
            <option value="true">已启用</option>
            <option value="false">已停用</option>
          </select>
          <button class="btn-secondary btn-sm" @click="applyFilters">筛选</button>
        </div>
      </div>
    </div>

    <LoadingBlock v-if="loading" :lines="6" label="正在读取单词库" />

    <template v-else>
      <div class="mt-4 table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>单词</th>
              <th>单元</th>
              <th>图片</th>
              <th>难度</th>
              <th>状态</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="word in words" :key="word.id">
              <td>
                <div class="flex items-center gap-3">
                  <div class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-paper">
                    <img v-if="word.imageUrl && word.imageStatus === 'approved'" :src="word.imageUrl" :alt="word.spelling" class="size-full object-cover">
                    <span v-else class="text-[10px] text-muted">{{ word.spelling.charAt(0).toUpperCase() }}</span>
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium text-ink">{{ word.spelling }}</p>
                    <p class="max-w-[240px] truncate text-[10px] text-muted">
                      {{ word.phonetic }}<template v-if="word.phonetic && word.pos"> · </template>{{ word.pos }} {{ word.chineseDef }}
                    </p>
                  </div>
                </div>
              </td>
              <td>
                <div class="flex max-w-[180px] flex-wrap gap-1">
                  <span v-for="unit in word.units" :key="unit" class="chip !px-2 !py-0.5 !text-[9px]">{{ unit }}</span>
                  <span v-if="!word.units.length" class="text-[10px] text-muted">未关联</span>
                </div>
              </td>
              <td>
                <span v-if="word.imageUrl && word.imageStatus === 'approved'" class="chip-forest !py-0.5">
                  <ImageIcon :size="10" /> 已通过
                </span>
                <span v-else-if="word.imageStatus === 'pending'" class="chip-clay !py-0.5">待审核</span>
                <span v-else-if="word.hasImage" class="chip !py-0.5">已有图</span>
                <span v-else class="text-[10px] text-muted">缺少</span>
              </td>
              <td>
                <span class="text-xs">{{ word.difficulty }} 级</span>
              </td>
              <td>
                <span :class="word.enabled ? 'chip-forest' : 'chip-danger'" class="!py-0.5">
                  {{ word.enabled ? '启用' : '停用' }}
                </span>
              </td>
              <td>
                <div class="flex items-center justify-end gap-1">
                  <button class="btn-ghost btn-sm" @click="openEdit(word)">
                    <Pencil :size="13" />
                    编辑
                  </button>
                  <button class="btn-ghost btn-sm !text-danger" @click="askDelete(word)">
                    <Trash2 :size="13" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!words.length" class="px-4 py-12 text-center text-xs text-muted">没有匹配的单词</p>
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
      :title="editingId ? '编辑单词' : '新增单词'"
      description="例句与搭配每行一条，用 | 分隔英文与中文。"
      wide
      @close="modalOpen = false"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <label v-if="!editingId" class="flex items-center gap-2.5 sm:col-span-2">
          <input v-model="form.autoFill" type="checkbox" class="size-4 accent-[#2f5f4c]">
          <span class="text-xs text-ink-soft">只填拼写，其余内容由 AI 自动补充</span>
        </label>
        <p
          v-if="form.autoFill && !editingId"
          class="rounded-xl bg-paper px-3.5 py-2.5 text-[10px] leading-relaxed text-muted sm:col-span-2"
        >
          音标、词性、释义、难度、例句与搭配将由 Cloudflare AI 补充；手动填写的内容优先生效。
        </p>
        <div>
          <label class="label" for="word-spelling">拼写</label>
          <input id="word-spelling" v-model="form.spelling" class="input" maxlength="80" placeholder="apple">
        </div>
        <div>
          <label class="label" for="word-phonetic">音标</label>
          <input id="word-phonetic" v-model="form.phonetic" class="input" maxlength="80" placeholder="/ˈæpl/">
        </div>
        <div>
          <label class="label" for="word-pos">词性</label>
          <input id="word-pos" v-model="form.pos" class="input" maxlength="30" placeholder="n. / v. / adj.">
        </div>
        <div v-if="editingId || !form.autoFill">
          <label class="label" for="word-difficulty">难度</label>
          <select id="word-difficulty" v-model.number="form.difficulty" class="input">
            <option :value="1">1 级</option>
            <option :value="2">2 级</option>
            <option :value="3">3 级</option>
            <option :value="4">4 级</option>
            <option :value="5">5 级</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="word-chinese">中文释义</label>
          <input id="word-chinese" v-model="form.chineseDef" class="input" maxlength="300" placeholder="苹果">
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="word-english">英文释义</label>
          <input id="word-english" v-model="form.englishDef" class="input" maxlength="500" placeholder="a round fruit with red or green skin">
        </div>
        <label class="flex items-end gap-2.5 pb-2">
          <input v-model="form.enabled" type="checkbox" class="size-4 accent-[#2f5f4c]">
          <span class="text-xs text-ink-soft">启用该单词</span>
        </label>
        <div class="sm:col-span-2">
          <label class="label" for="word-examples">例句（每行一条）</label>
          <textarea id="word-examples" v-model="examplesText" class="input min-h-[88px] resize-y font-mono text-xs" placeholder="I eat an apple every day. | 我每天吃一个苹果。" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="word-collocations">常用搭配（每行一条）</label>
          <textarea id="word-collocations" v-model="collocationsText" class="input min-h-[72px] resize-y font-mono text-xs" placeholder="an apple tree | 一棵苹果树" />
        </div>
        <p v-if="formError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger sm:col-span-2">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="modalOpen = false">取消</button>
        <button class="btn-primary" :disabled="saving" @click="save">
          <Loader2 v-if="saving" :size="15" class="animate-spin" />
          保存单词
        </button>
      </template>
    </Modal>

    <Modal
      :open="importOpen"
      title="批量导入单词"
      description="支持带表头的 Excel（.xlsx）或 CSV。必填列：spelling、chinese_def。也可同时关联到一个单元。"
      wide
      @close="importOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="import-unit">关联单元（可选）</label>
          <select id="import-unit" v-model="importUnitId" class="input">
            <option value="">仅导入单词库，不关联单元</option>
            <option v-for="unit in units" :key="unit.id" :value="unit.id">
              {{ unit.grade }}{{ unit.semester }} · {{ unit.textbookName }} · {{ unit.unitName }}
            </option>
          </select>
        </div>
        <div>
          <label class="label" for="import-file">选择文件（.xlsx / .csv / .tsv）</label>
          <input
            id="import-file"
            ref="importFileInput"
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            class="block w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-xs text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-forest-soft file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-forest"
            @change="onImportFileChange"
          >
          <p class="mt-1.5 text-[10px] leading-relaxed text-muted">
            选择文件后会自动填入下方内容，可先检查或修改再导入。{{ importFileName ? `当前文件：${importFileName}` : '' }}
          </p>
        </div>
        <div>
          <label class="label" for="import-csv">CSV 内容</label>
          <textarea
            id="import-csv"
            v-model="importCsv"
            class="input min-h-[220px] resize-y font-mono text-xs"
            spellcheck="false"
          />
        </div>
        <p class="rounded-xl bg-paper px-3.5 py-3 text-[10px] leading-relaxed text-muted">
          示例表头：spelling,chinese_def,phonetic,pos,difficulty,examples。单次最多 500 条。重复单词不会被自动合并，请先确认。
        </p>
        <div v-if="importResult" class="rounded-xl border border-forest/15 bg-forest-soft/60 px-3.5 py-3">
          <p class="text-xs font-medium text-forest">导入完成</p>
          <p class="mt-1 text-[11px] text-ink-soft">
            成功 {{ importResult.imported }} 条，关联单元 {{ importResult.linked }} 条，失败 {{ importResult.errors.length }} 条。
          </p>
          <div v-if="importResult.errors.length" class="mt-2 max-h-32 space-y-1 overflow-y-auto">
            <p v-for="error in importResult.errors" :key="`${error.row}-${error.message}`" class="text-[10px] text-danger">
              第 {{ error.row }} 行：{{ error.message }}
            </p>
          </div>
        </div>
        <p v-if="importError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ importError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="importOpen = false">关闭</button>
        <button class="btn-primary" :disabled="importing" @click="runImport">
          <Loader2 v-if="importing" :size="15" class="animate-spin" />
          <Upload v-else :size="15" />
          开始导入
        </button>
      </template>
    </Modal>

    <Modal
      :open="deleteOpen"
      title="删除单词"
      description="若该单词已有答题记录，系统会自动改为停用，以保留历史数据。"
      @close="deleteOpen = false"
    >
      <div v-if="deleteTarget" class="rounded-xl border border-line bg-paper/70 px-4 py-3.5">
        <p class="text-sm font-medium text-ink">{{ deleteTarget.spelling }}</p>
        <p class="mt-1 text-[11px] text-muted">{{ deleteTarget.chineseDef }}</p>
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
