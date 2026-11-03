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

  async function login(phone: string, password: string) {
    loading.value = true
    const api = useApi()
    try {
      const response = await api.post<{ user: UserSummary; token: string }>('/auth/login', {
        phone,
        password,
      })
      user.value = response.user
      ready.value = true
      if (import.meta.client && response.token) {
        localStorage.setItem('es_token', response.token)
      }
      return response.user
    } finally {
      loading.value = false
    }
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

  return { user, ready, loading, home, fetchMe, login, logout, roleHome }
}
