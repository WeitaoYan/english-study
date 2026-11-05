<script setup lang="ts">
import {
  Check,
  House,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-vue-next'
import type { Role } from '@english-study/shared'
import { formatDateTimeCN } from '@english-study/shared'

interface AdminUser {
  id: string
  role: Role
  nickname: string
  email: string | null
  enabled: boolean
  createdAt: string
  parentName: string | null
  parentPhone: string | null
  parentEmail: string | null
}

interface FamilyMember {
  id: string
  studentUserId: string
  studentName: string
  studentEmail: string | null
  relation: string
  status: 'pending' | 'active' | 'rejected'
}

interface FamilyGroup {
  id: string
  parentUserId: string
  parentName: string
  parentPhone: string | null
  members: FamilyMember[]
}

type TabKey = 'users' | 'families'

const api = useApi()
const toast = useToast()

const activeTab = ref<TabKey>('users')
const users = ref<AdminUser[]>([])
const families = ref<FamilyGroup[]>([])
const loading = ref(true)
const roleFilter = ref('')
const search = ref('')

const userModalOpen = ref(false)
const editingUserId = ref('')
const savingUser = ref(false)
const userError = ref('')
const userForm = reactive({
  role: 'student' as Role,
  nickname: '',
  email: '',
  password: '',
  enabled: true,
})

const bindOpen = ref(false)
const binding = ref(false)
const bindError = ref('')
const bindForm = reactive({ parentId: '', studentId: '', relation: '孩子' })

const removeOpen = ref(false)
const removeFamily = ref<FamilyGroup | null>(null)
const removeMember = ref<FamilyMember | null>(null)
const removing = ref(false)
const updatingMember = ref('')

const roleLabels: Record<Role, string> = {
  student: '学生',
  parent: '家长',
  admin: '管理员',
}

const roleTone: Record<Role, string> = {
  student: 'chip-forest',
  parent: 'chip-clay',
  admin: 'chip',
}

const memberStatusLabels: Record<FamilyMember['status'], string> = {
  pending: '待确认',
  active: '已绑定',
  rejected: '已拒绝',
}

const filteredUsers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return users.value.filter((user) => {
    if (roleFilter.value && user.role !== roleFilter.value) return false
    if (!keyword) return true
    return user.nickname.toLowerCase().includes(keyword)
      || (user.email || '').toLowerCase().includes(keyword)
  })
})

const counts = computed(() => ({
  student: users.value.filter((user) => user.role === 'student').length,
  parent: users.value.filter((user) => user.role === 'parent').length,
  admin: users.value.filter((user) => user.role === 'admin').length,
}))

const parentOptions = computed(() => users.value.filter((user) => user.role === 'parent' && user.enabled))
const studentOptions = computed(() => users.value.filter((user) => user.role === 'student' && user.enabled))

async function load() {
  loading.value = true
  try {
    const [userResult, familyResult] = await Promise.all([
      api.get<{ data: AdminUser[] }>('/admin/users'),
      api.get<{ data: FamilyGroup[] }>('/admin/families'),
    ])
    users.value = userResult.data
    families.value = familyResult.data
  } catch (error) {
    toast.error(errorMessage(error, '用户与家庭数据加载失败'))
  } finally {
    loading.value = false
  }
}

function openCreateUser() {
  editingUserId.value = ''
  userForm.role = 'parent'
  userForm.nickname = ''
  userForm.email = ''
  userForm.password = ''
  userForm.enabled = true
  userError.value = ''
  userModalOpen.value = true
}

function openEditUser(user: AdminUser) {
  editingUserId.value = user.id
  userForm.role = user.role
  userForm.nickname = user.nickname
  userForm.email = user.email || ''
  userForm.password = ''
  userForm.enabled = user.enabled
  userError.value = ''
  userModalOpen.value = true
}

async function saveUser() {
  if (savingUser.value) return
  userError.value = ''
  if (!userForm.nickname.trim()) {
    userError.value = '请填写昵称'
    return
  }
  const editingStudent = Boolean(editingUserId.value) && userForm.role === 'student'
  if (!editingStudent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email.trim())) {
    userError.value = '请输入正确的邮箱'
    return
  }
  if (!editingUserId.value && userForm.password.length < 6) {
    userError.value = '初始密码至少 6 位'
    return
  }
  if (editingUserId.value && userForm.password && userForm.password.length < 6) {
    userError.value = '新密码至少 6 位'
    return
  }
  savingUser.value = true
  try {
    if (editingUserId.value) {
      const payload: Record<string, unknown> = {
        nickname: userForm.nickname.trim(),
        enabled: userForm.enabled,
      }
      // 虚拟学生没有邮箱字段，不随编辑补上邮箱。
      if (!editingStudent) payload.email = userForm.email.trim().toLowerCase()
      if (userForm.password) payload.password = userForm.password
      await api.patch(`/admin/users/${editingUserId.value}`, payload)
      toast.success('账号已更新')
    } else {
      await api.post('/admin/users', {
        role: userForm.role,
        nickname: userForm.nickname.trim(),
        email: userForm.email.trim().toLowerCase(),
        password: userForm.password,
      })
      toast.success('账号已创建')
    }
    userModalOpen.value = false
    await load()
  } catch (error) {
    userError.value = errorMessage(error, '保存失败')
  } finally {
    savingUser.value = false
  }
}

function openBind(parentId = '') {
  bindForm.parentId = parentId || parentOptions.value[0]?.id || ''
  bindForm.studentId = studentOptions.value[0]?.id || ''
  bindForm.relation = '孩子'
  bindError.value = ''
  bindOpen.value = true
}

async function bind() {
  bindError.value = ''
  if (!bindForm.parentId || !bindForm.studentId) {
    bindError.value = '请选择家长和学生账号'
    return
  }
  binding.value = true
  try {
    await api.post('/admin/families/bind', {
      parentId: bindForm.parentId,
      studentId: bindForm.studentId,
      relation: bindForm.relation.trim() || '孩子',
    })
    toast.success('家庭绑定已建立')
    bindOpen.value = false
    await load()
  } catch (error) {
    bindError.value = errorMessage(error, '绑定失败')
  } finally {
    binding.value = false
  }
}

async function updateMember(family: FamilyGroup, member: FamilyMember, status: 'active' | 'rejected') {
  updatingMember.value = member.id
  try {
    await api.patch(`/admin/families/${family.id}/members/${member.id}`, { status })
    toast.success(status === 'active' ? '成员已启用' : '成员已拒绝')
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '操作失败'))
  } finally {
    updatingMember.value = ''
  }
}

function askRemoveMember(family: FamilyGroup, member: FamilyMember) {
  removeFamily.value = family
  removeMember.value = member
  removeOpen.value = true
}

async function removeMemberConfirm() {
  if (!removeFamily.value || !removeMember.value) return
  removing.value = true
  try {
    await api.delete(`/admin/families/${removeFamily.value.id}/members/${removeMember.value.id}`)
    toast.success('绑定关系已移除')
    removeOpen.value = false
    removeFamily.value = null
    removeMember.value = null
    await load()
  } catch (error) {
    toast.error(errorMessage(error, '移除失败'))
  } finally {
    removing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="管理端 · 用户与家庭"
      title="账号与绑定关系"
      description="创建账号、调整状态，或管理家长与学生的绑定。学生主动确认的绑定也可在这里查看和处理。"
    >
      <template #actions>
        <button class="btn-secondary" @click="openBind()">
          <UserPlus :size="15" />
          建立绑定
        </button>
        <button class="btn-primary" @click="openCreateUser">
          <Plus :size="16" />
          新增账号
        </button>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" :lines="7" label="正在读取账号与家庭" />

    <template v-else>
      <section class="grid grid-cols-3 gap-3">
        <div class="card p-5">
          <p class="text-[11px] text-muted">学生账号</p>
          <p class="mt-2 font-display text-3xl text-forest">{{ counts.student }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">家长账号</p>
          <p class="mt-2 font-display text-3xl text-clay">{{ counts.parent }}</p>
        </div>
        <div class="card p-5">
          <p class="text-[11px] text-muted">家庭组</p>
          <p class="mt-2 font-display text-3xl text-ink">{{ families.length }}</p>
        </div>
      </section>

      <div class="mt-6 flex items-center gap-1 rounded-xl border border-line bg-cream/60 p-1">
        <button
          class="flex-1 rounded-lg px-3 py-2 text-xs transition"
          :class="activeTab === 'users' ? 'bg-white font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'"
          @click="activeTab = 'users'"
        >
          <Users :size="13" class="mr-1.5 inline" />
          账号列表
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-xs transition"
          :class="activeTab === 'families' ? 'bg-white font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'"
          @click="activeTab = 'families'"
        >
          <House :size="13" class="mr-1.5 inline" />
          家庭关系
        </button>
      </div>

      <template v-if="activeTab === 'users'">
        <div class="mt-4 card p-3.5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div class="relative flex-1">
              <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input v-model="search" class="input !pl-9" placeholder="搜索昵称或邮箱">
            </div>
            <select v-model="roleFilter" class="input !w-auto !py-2">
              <option value="">全部角色</option>
              <option value="student">学生</option>
              <option value="parent">家长</option>
              <option value="admin">管理员</option>
            </select>
            <span class="text-[11px] text-muted">{{ filteredUsers.length }} 个账号</span>
          </div>
        </div>

        <div class="mt-4 table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>账号</th>
                <th>角色</th>
                <th>邮箱</th>
                <th>家长关联</th>
                <th>状态</th>
                <th>创建时间</th>
                <th class="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredUsers" :key="user.id">
                <td><p class="font-medium text-ink">{{ user.nickname }}</p></td>
                <td><span :class="roleTone[user.role]" class="!py-0.5">{{ roleLabels[user.role] }}</span></td>
                <td><span class="text-xs">{{ user.email || '无邮箱' }}</span></td>
                <td>
                  <span v-if="user.parentName" class="text-xs">{{ user.parentName }} · {{ user.parentEmail || '无邮箱' }}</span>
                  <span v-else class="text-[10px] text-muted">—</span>
                </td>
                <td><span :class="user.enabled ? 'chip-forest' : 'chip-danger'" class="!py-0.5">{{ user.enabled ? '启用' : '停用' }}</span></td>
                <td><span class="text-[10px] text-muted">{{ formatDateTimeCN(user.createdAt) }}</span></td>
                <td>
                  <div class="flex justify-end">
                    <button class="btn-ghost btn-sm" @click="openEditUser(user)">
                      <Pencil :size="13" />
                      编辑
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!filteredUsers.length" class="px-4 py-12 text-center text-xs text-muted">没有匹配的账号</p>
        </div>
      </template>

      <template v-else>
        <div class="mt-4 space-y-4">
          <article v-for="family in families" :key="family.id" class="card overflow-hidden">
            <div class="flex flex-col gap-3 border-b border-line/70 bg-paper/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-3">
                <span class="grid size-10 place-items-center rounded-xl bg-clay-soft text-clay">
                  <Users :size="17" />
                </span>
                <div>
                  <p class="text-sm font-medium text-ink">{{ family.parentName }}</p>
                  <p class="mt-0.5 text-[10px] text-muted">{{ family.parentPhone }} · {{ family.members.length }} 个孩子</p>
                </div>
              </div>
              <button class="btn-secondary btn-sm" @click="openBind(family.parentUserId)">
                <UserPlus :size="13" />
                绑定孩子
              </button>
            </div>

            <div v-if="family.members.length" class="divide-y divide-line/70">
              <div v-for="member in family.members" :key="member.id" class="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-forest-soft text-[11px] font-medium text-forest">
                    {{ member.studentName?.charAt(0) || '?' }}
                  </span>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-xs font-medium text-ink">{{ member.studentName }}</p>
                      <span class="chip !py-0.5">{{ member.relation }}</span>
                      <span
                        :class="member.status === 'active' ? 'chip-forest' : member.status === 'pending' ? 'chip-clay' : 'chip-danger'"
                        class="!py-0.5"
                      >
                        {{ memberStatusLabels[member.status] }}
                      </span>
                    </div>
                    <p class="mt-0.5 text-[10px] text-muted">{{ member.studentEmail || '无邮箱' }}</p>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <button
                    v-if="member.status !== 'active'"
                    class="btn-secondary btn-sm"
                    :disabled="updatingMember === member.id"
                    @click="updateMember(family, member, 'active')"
                  >
                    <Loader2 v-if="updatingMember === member.id" :size="12" class="animate-spin" />
                    <Check v-else :size="12" />
                    启用
                  </button>
                  <button
                    v-if="member.status === 'pending'"
                    class="btn-ghost btn-sm !text-danger"
                    :disabled="updatingMember === member.id"
                    @click="updateMember(family, member, 'rejected')"
                  >
                    <X :size="12" />
                    拒绝
                  </button>
                  <button class="btn-ghost btn-sm !text-danger" @click="askRemoveMember(family, member)">
                    <Trash2 :size="12" />
                  </button>
                </div>
              </div>
            </div>
            <p v-else class="px-5 py-8 text-center text-xs text-muted">这个家庭还没有绑定学生</p>
          </article>

          <EmptyState v-if="!families.length" title="还没有家庭组" description="家长绑定或管理员建立绑定后，家庭关系会出现在这里。">
            <template #icon><House :size="18" /></template>
            <template #action>
              <button class="btn-primary" @click="openBind()">
                <UserPlus :size="15" />
                建立第一条绑定
              </button>
            </template>
          </EmptyState>
        </div>
      </template>
    </template>

    <Modal
      :open="userModalOpen"
      :title="editingUserId ? '编辑账号' : '新增账号'"
      description="角色创建后不可修改。编辑时密码留空表示不修改。"
      @close="userModalOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="account-role">角色</label>
          <select v-if="!(editingUserId && userForm.role === 'student')" id="account-role" v-model="userForm.role" class="input" :disabled="Boolean(editingUserId)">
            <option value="parent">家长</option>
            <option value="admin">管理员</option>
          </select>
          <p v-else class="rounded-xl border border-line bg-paper/70 px-3.5 py-2.5 text-sm text-ink">
            学生 · 虚拟子账号（由家长创建，没有独立登录入口）
          </p>
        </div>
        <div>
          <label class="label" for="account-name">昵称</label>
          <input id="account-name" v-model="userForm.nickname" class="input" maxlength="50" placeholder="林小满">
        </div>
        <div v-if="!(editingUserId && userForm.role === 'student')">
          <label class="label" for="account-email">邮箱</label>
          <input id="account-email" v-model="userForm.email" class="input" type="email" placeholder="parent@example.com">
        </div>
        <div>
          <label class="label" for="account-password">{{ editingUserId ? '新密码（留空不修改）' : '初始密码' }}</label>
          <input id="account-password" v-model="userForm.password" class="input" type="password" autocomplete="new-password" placeholder="至少 6 位">
        </div>
        <label v-if="editingUserId" class="flex items-center gap-2.5 rounded-xl border border-line bg-paper/70 px-3.5 py-3">
          <input v-model="userForm.enabled" type="checkbox" class="size-4 accent-[#2f5f4c]">
          <span class="text-xs text-ink-soft">账号启用</span>
        </label>
        <p v-if="userError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ userError }}
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="userModalOpen = false">取消</button>
        <button class="btn-primary" :disabled="savingUser" @click="saveUser">
          <Loader2 v-if="savingUser" :size="15" class="animate-spin" />
          保存账号
        </button>
      </template>
    </Modal>

    <Modal
      :open="bindOpen"
      title="建立家庭绑定"
      description="管理员建立的绑定立即生效。家长自己发送的邀请仍需学生确认。"
      @close="bindOpen = false"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="bind-parent">家长账号</label>
          <select id="bind-parent" v-model="bindForm.parentId" class="input">
            <option value="" disabled>请选择家长</option>
            <option v-for="parent in parentOptions" :key="parent.id" :value="parent.id">
              {{ parent.nickname }} · {{ parent.email || '无邮箱' }}
            </option>
          </select>
        </div>
        <div>
          <label class="label" for="bind-student">学生账号</label>
          <select id="bind-student" v-model="bindForm.studentId" class="input">
            <option value="" disabled>请选择学生</option>
            <option v-for="student in studentOptions" :key="student.id" :value="student.id">
              {{ student.nickname }} · {{ student.email || '无邮箱' }}
            </option>
          </select>
        </div>
        <div>
          <label class="label" for="bind-relation">关系</label>
          <input id="bind-relation" v-model="bindForm.relation" class="input" maxlength="20" placeholder="孩子">
        </div>
        <p v-if="bindError" class="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
          {{ bindError }}
        </p>
        <p class="rounded-xl bg-paper px-3.5 py-3 text-[10px] leading-relaxed text-muted">
          绑定后家长可以查看该学生的学习报告，并为其设置激励规则。
        </p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="bindOpen = false">取消</button>
        <button class="btn-primary" :disabled="binding" @click="bind">
          <Loader2 v-if="binding" :size="15" class="animate-spin" />
          <ShieldCheck v-else :size="15" />
          确认绑定
        </button>
      </template>
    </Modal>

    <Modal
      :open="removeOpen"
      title="移除绑定关系"
      description="移除后家长将不能再查看该学生的学习报告。历史学习记录不会删除。"
      @close="removeOpen = false"
    >
      <div v-if="removeMember" class="rounded-xl border border-line bg-paper/70 px-4 py-3.5">
        <p class="text-sm font-medium text-ink">{{ removeMember.studentName }}</p>
        <p class="mt-1 text-[11px] text-muted">{{ removeMember.studentEmail || '无邮箱' }} · {{ removeMember.relation }}</p>
      </div>
      <template #footer>
        <button class="btn-secondary" @click="removeOpen = false">取消</button>
        <button class="btn-danger" :disabled="removing" @click="removeMemberConfirm">
          <Loader2 v-if="removing" :size="15" class="animate-spin" />
          <Trash2 v-else :size="15" />
          确认移除
        </button>
      </template>
    </Modal>
  </div>
</template>
