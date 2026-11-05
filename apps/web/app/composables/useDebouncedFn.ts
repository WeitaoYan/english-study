// 输入防抖：连续触发时只在停下 delay 毫秒后执行一次，常用于搜索框，
// 避免每敲一个字母就发一次请求。组件卸载时自动取消未执行的调用。
export function useDebouncedFn<T extends (...args: any[]) => void>(fn: T, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null

  const run = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, delay)
  }

  const cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  onBeforeUnmount(cancel)

  return { run, cancel }
}
