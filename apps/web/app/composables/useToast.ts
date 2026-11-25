export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

let toastId = 0
/** 同时最多显示的提示条数，超过就丢最旧的，避免多条提示把屏幕堆满。 */
const MAX_VISIBLE_TOASTS = 3

export function useToast() {
  const toasts = useState<ToastItem[]>('toasts', () => [])
  // 会话失效（401 跳登录）期间屏蔽错误提示：跳登录本身就是提示，
  // 各请求的 catch 再各弹一条「未登录」就是噪音。登录成功后恢复。
  const suppressErrors = useState('toast-suppress-errors', () => false)

  function show(message: string, type: ToastItem['type'] = 'info', duration = 3200) {
    if (type === 'error' && suppressErrors.value) return -1
    // 相同文案已在显示就不再叠加：一次会话失效会让多个并发请求同时 401，
    // 不去重就会刷出多条一模一样的提示。
    const existing = toasts.value.find((toast) => toast.message === message && toast.type === type)
    if (existing) return existing.id
    const id = ++toastId
    const next = [...toasts.value, { id, message, type }]
    toasts.value = next.length > MAX_VISIBLE_TOASTS ? next.slice(next.length - MAX_VISIBLE_TOASTS) : next
    if (import.meta.client) {
      window.setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  function success(message: string) {
    return show(message, 'success')
  }

  function error(message: string) {
    return show(message, 'error', 4500)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function clear() {
    toasts.value = []
  }

  function suppressErrorToasts() {
    suppressErrors.value = true
  }

  function resumeErrorToasts() {
    suppressErrors.value = false
  }

  return { toasts, show, success, error, dismiss, clear, suppressErrorToasts, resumeErrorToasts }
}

export function errorMessage(error: unknown, fallback = '操作失败，请稍后再试'): string {
  if (error && typeof error === 'object') {
    const value = error as { data?: { error?: string }; message?: string; statusMessage?: string }
    return value.data?.error || value.statusMessage || value.message || fallback
  }
  return fallback
}
