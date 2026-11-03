export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

let toastId = 0

export function useToast() {
  const toasts = useState<ToastItem[]>('toasts', () => [])

  function show(message: string, type: ToastItem['type'] = 'info', duration = 3200) {
    const id = ++toastId
    toasts.value = [...toasts.value, { id, message, type }]
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

  return { toasts, show, success, error, dismiss }
}

export function errorMessage(error: unknown, fallback = '操作失败，请稍后再试'): string {
  if (error && typeof error === 'object') {
    const value = error as { data?: { error?: string }; message?: string; statusMessage?: string }
    return value.data?.error || value.statusMessage || value.message || fallback
  }
  return fallback
}
