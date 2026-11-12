import type { Word } from '@english-study/shared'

export interface CachedUnitWords {
  /** 单元单词内容版本号（与服务端指纹一致时直接用缓存）。 */
  version: string
  /** 单元单词（静态内容，不含掌握度）。 */
  words: Word[]
  /** 单元名与课本信息快照：只为让缓存优先渲染时头部不留空，进度数字以服务端为准。 */
  unit: { unitNo: number; unitName: string }
  textbook: { id: string; name: string; version: string; grade: string; semester: string }
  savedAt: number
}

const PREFIX = 'es_unit_words:'
const INDEX_KEY = 'es_unit_words:index'
const MAX_CACHED_UNITS = 20

/**
 * 单元单词本地缓存：单词内容按版本号存 localStorage，版本没变就不再下载。
 * 缓存的只是单词静态内容（与用户无关），各词掌握度每次打开都重新拉。
 */
export function useUnitWordsCache() {
  function readIndex(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as unknown
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  }

  function read(unitId: string): CachedUnitWords | null {
    if (!import.meta.client) return null
    try {
      const raw = localStorage.getItem(PREFIX + unitId)
      if (!raw) return null
      const parsed = JSON.parse(raw) as CachedUnitWords
      if (!parsed || typeof parsed.version !== 'string' || !Array.isArray(parsed.words)) return null
      return parsed
    } catch {
      return null
    }
  }

  function write(unitId: string, entry: Omit<CachedUnitWords, 'savedAt'>) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(PREFIX + unitId, JSON.stringify({ ...entry, savedAt: Date.now() }))
      const index = readIndex().filter((id) => id !== unitId)
      index.push(unitId)
      // 最多留 20 个单元，超出时删最久没更新的。
      while (index.length > MAX_CACHED_UNITS) {
        const oldest = index.shift()
        if (oldest) localStorage.removeItem(PREFIX + oldest)
      }
      localStorage.setItem(INDEX_KEY, JSON.stringify(index))
    } catch {
      // 存储满了或不可用时静默失败：下次打开重新下载，不影响使用。
    }
  }

  function clear(unitId: string) {
    if (!import.meta.client) return
    try {
      localStorage.removeItem(PREFIX + unitId)
      localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((id) => id !== unitId)))
    } catch {
      // ignore
    }
  }

  return { read, write, clear }
}
