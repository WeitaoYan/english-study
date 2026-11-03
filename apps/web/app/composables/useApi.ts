type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export function useApi() {
  const config = useRuntimeConfig()
  const baseURL = (config.public.apiBase as string) || '/api'

  function token(): string | null {
    if (!import.meta.client) return null
    return localStorage.getItem('es_token')
  }

  async function request<T>(method: HttpMethod, path: string, options: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    }
    const authToken = token()
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
    get: <T>(path: string, options: Record<string, unknown> = {}) => request<T>('GET', path, options),
    post: <T>(path: string, body?: unknown, options: Record<string, unknown> = {}) =>
      request<T>('POST', path, { body, ...options }),
    patch: <T>(path: string, body?: unknown, options: Record<string, unknown> = {}) =>
      request<T>('PATCH', path, { body, ...options }),
    delete: <T>(path: string, options: Record<string, unknown> = {}) => request<T>('DELETE', path, options),
  }
}
