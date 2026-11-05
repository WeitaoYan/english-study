type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export function useApi() {
  const config = useRuntimeConfig()
  const baseURL = (config.public.apiBase as string) || '/api'

  function token(): string | null {
    if (!import.meta.client) return null
    return localStorage.getItem('es_token')
  }

  // 令牌剩不到 24 小时即自动刷新：7 天内只要打开过就一直续上，
  // 只有超过 7 天没打开、令牌彻底过期后才需要重新登录。
  const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000
  let refreshPromise: Promise<string | null> | null = null

  function tokenExpiry(value: string): number | null {
    try {
      const part = value.split('.')[1] || ''
      const json = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4))
      const payload = JSON.parse(json) as { exp?: unknown }
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null
    } catch {
      return null
    }
  }

  // 令牌快到期时换一张新的；多个请求同时触发只刷一次。刷失败返回 null，
  // 调用方继续用旧令牌发请求，过期了会走原有的 401 跳登录流程。
  async function refreshTokenIfNeeded(): Promise<string | null> {
    if (!import.meta.client) return token()
    const current = token()
    if (!current) return null
    const expiry = tokenExpiry(current)
    if (expiry === null || expiry - Date.now() > REFRESH_THRESHOLD_MS) return current
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const response = await $fetch<{ token: string }>('/auth/refresh', {
            baseURL,
            method: 'POST',
            headers: { Authorization: `Bearer ${current}` },
          })
          localStorage.setItem('es_token', response.token)
          return response.token
        } catch {
          return null
        } finally {
          refreshPromise = null
        }
      })()
    }
    return (await refreshPromise) || current
  }

  async function request<T>(method: HttpMethod, path: string, options: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    }
    const authToken = await refreshTokenIfNeeded()
    if (authToken) headers.Authorization = `Bearer ${authToken}`

    try {
      return await $fetch<T>(path, {
        baseURL,
        method,
        credentials: 'include',
        headers,
        ...options,
      })
    } catch (error: unknown) {
      const status = (error as { statusCode?: number; status?: number })?.statusCode
        || (error as { status?: number })?.status
      if (status === 401 && import.meta.client) {
        const currentPath = window.location.pathname
        if (currentPath !== '/login') {
          localStorage.removeItem('es_token')
          await navigateTo({
            path: '/login',
            query: { redirect: currentPath + window.location.search },
          })
        }
      }
      throw error
    }
  }

  return {
    refreshTokenIfNeeded,
    get: <T>(path: string, options: Record<string, unknown> = {}) => request<T>('GET', path, options),
    post: <T>(path: string, body?: unknown, options: Record<string, unknown> = {}) =>
      request<T>('POST', path, { body, ...options }),
    put: <T>(path: string, body?: unknown, options: Record<string, unknown> = {}) =>
      request<T>('PUT', path, { body, ...options }),
    patch: <T>(path: string, body?: unknown, options: Record<string, unknown> = {}) =>
      request<T>('PATCH', path, { body, ...options }),
    delete: <T>(path: string, options: Record<string, unknown> = {}) => request<T>('DELETE', path, options),
  }
}
