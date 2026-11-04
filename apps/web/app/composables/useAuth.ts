import type { Role, UserSummary } from '@english-study/shared'

export function useAuth() {
  const user = useState<UserSummary | null>('auth-user', () => null)
  const ready = useState('auth-ready', () => false)
  const loading = useState('auth-loading', () => false)

  const home = computed(() => {
    if (!user.value) return '/login'
    if (user.value.role === 'student') return '/student'
    if (user.value.role === 'parent') return '/parent'
    return '/admin'
  })

  /** 是否正处在家长切换进来的孩子视角：此时切回家长必须验证家长密码。 */
  const isChildView = computed(() => Boolean(user.value?.switchedFromParent))

  function applySession(nextUser: UserSummary, token?: string) {
    user.value = nextUser
    ready.value = true
    if (import.meta.client && token) {
      localStorage.setItem('es_token', token)
    }
  }

  async function fetchMe(force = false) {
    if (ready.value && !force) return user.value
    const api = useApi()
    try {
      const response = await api.get<{ user: UserSummary }>('/auth/me')
      user.value = response.user
    } catch {
      user.value = null
    } finally {
      ready.value = true
    }
    return user.value
  }

  async function login(identifier: string, password: string) {
    loading.value = true
    const api = useApi()
    try {
      const response = await api.post<{ user: UserSummary; token: string }>('/auth/login', {
        identifier,
        password,
      })
      applySession(response.user, response.token)
      return response.user
    } finally {
      loading.value = false
    }
  }

  async function register(email: string, nickname: string, password: string) {
    loading.value = true
    const api = useApi()
    try {
      const response = await api.post<{ user: UserSummary; token: string }>('/auth/register', {
        email,
        nickname,
        password,
      })
      applySession(response.user, response.token)
      return response.user
    } finally {
      loading.value = false
    }
  }

  async function switchToChild(childId: string) {
    const api = useApi()
    const response = await api.post<{ user: UserSummary; token: string }>('/auth/switch-to-child', {
      childId,
    })
    applySession(response.user, response.token)
    return response.user
  }

  async function switchBack(password: string) {
    const api = useApi()
    const response = await api.post<{ user: UserSummary; token: string }>('/auth/switch-back', {
      password,
    })
    applySession(response.user, response.token)
    return response.user
  }

  async function logout() {
    const api = useApi()
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore
    }
    user.value = null
    ready.value = true
    if (import.meta.client) localStorage.removeItem('es_token')
    await navigateTo('/login')
  }

  function roleHome(role: Role) {
    return role === 'student' ? '/student' : role === 'parent' ? '/parent' : '/admin'
  }

  return { user, ready, loading, home, isChildView, fetchMe, login, register, switchToChild, switchBack, logout, roleHome }
}
