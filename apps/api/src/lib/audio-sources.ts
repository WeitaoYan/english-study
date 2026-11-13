// 单词音频备选源：与迁移脚本（tools/migrate-audio.mjs）同款三路找录音，
// 区别是这里返回全部候选（供管理端试听后换源），而不是只挑一个。
// 注意：Worker 里 fetch 外部音频与词典接口都走公网；某路失败不影响其他路。
import type { AudioCandidate } from '@english-study/shared'
import { md5Hex } from './md5'

const UA = 'english-study/1.0 (contact: admin@ikber.cc)'
const JSON_TIMEOUT_MS = 8000
const DOWNLOAD_TIMEOUT_MS = 30000
const MAX_AUDIO_BYTES = 1024 * 1024

async function fetchJson(url: string): Promise<unknown | null> {
  // 词典接口偶发 502（迁移脚本里也重试 3 次），失败一次后等 1 秒再试。
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
        headers: { 'User-Agent': UA },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000))
    }
  }
  return null
}

/** Commons 原文件名 → MP3 转码直链（与迁移脚本同款算法）。 */
export function commonsTranscodeUrl(filename: string): string {
  // MediaWiki 文件名首字母大写：Wiktionary 列出的是小写 en-us-December.ogg，
  // 但 Commons 规范名是 En-us-December.ogg，hash 路径与 URL 都按规范名算，否则 404。
  const canonical = filename.charAt(0).toUpperCase() + filename.slice(1)
  const slug = canonical.replace(/ /g, '_')
  const md5 = md5Hex(slug)
  return `https://upload.wikimedia.org/wikipedia/commons/transcoded/${md5[0]}/${md5.slice(0, 2)}/${encodeURIComponent(slug)}/${encodeURIComponent(slug)}.mp3`
}

// 从 Commons 文件页 curid 解析出文件名，再拼 MP3 转码直链。
async function commonsMp3Url(sourceUrl: string): Promise<string | null> {
  const match = sourceUrl && sourceUrl.match(/curid=(\d+)/)
  if (!match) return null
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&pageids=${match[1]}&prop=info`,
  )
  const page = (data as { query?: { pages?: Record<string, { title?: string }> } })?.query?.pages?.[match[1]]
  const title = page?.title
  if (!title || !title.startsWith('File:')) return null
  return commonsTranscodeUrl(title.slice(5))
}

function accentLabel(prefix: string): { type: string; label: string } {
  switch (prefix.toLowerCase()) {
    case 'en-us':
      return { type: 'us', label: '美音' }
    case 'en-gb':
    case 'en-uk':
      return { type: 'uk', label: '英音' }
    case 'en-au':
      return { type: 'au', label: '澳音' }
    case 'en-ca':
      return { type: 'ca', label: '加音' }
    default:
      return { type: 'other', label: prefix }
  }
}

// 第一路：Free Dictionary API 的 phonetics。只认 MP3 直链；
// OGG 走 sourceUrl 的 Commons curid 转 MP3（与迁移脚本同款 fallback）。
async function dictionaryCandidates(spelling: string): Promise<AudioCandidate[]> {
  const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(spelling)}`)
  const out: AudioCandidate[] = []
  const entries = Array.isArray(data) ? data : []
  for (const entry of entries) {
    const phonetics = (entry as { phonetics?: Array<{ audio?: string; sourceUrl?: string }> }).phonetics || []
    for (const p of phonetics) {
      if (!p.audio) continue
      if (p.audio.endsWith('.mp3')) {
        const m = p.audio.match(/-([a-z]{2})\.mp3$/i)
        const accent = m ? accentLabel(`en-${m[1]}`) : { type: 'other', label: '词典录音' }
        out.push({ url: p.audio, label: accent.label, pronunciationType: accent.type, source: 'dictionaryapi' })
      } else if (p.sourceUrl) {
        const mp3 = await commonsMp3Url(p.sourceUrl)
        if (mp3) {
          const m = p.audio.match(/-([a-z]{2})\.(ogg|wav)$/i)
          const accent = m ? accentLabel(`en-${m[1]}`) : { type: 'other', label: '词典录音' }
          out.push({ url: mp3, label: accent.label, pronunciationType: accent.type, source: 'dictionaryapi' })
        }
      }
    }
  }
  return out
}

// 第二路：Wiktionary 词条挂的英语录音（全部列出，美音/英音/澳音/加音优先）。
async function wiktionaryCandidates(spelling: string): Promise<AudioCandidate[]> {
  const title = spelling.charAt(0).toUpperCase() + spelling.slice(1)
  const data = await fetchJson(
    `https://en.wiktionary.org/w/api.php?action=query&format=json&prop=images&titles=${encodeURIComponent(title)}&imlimit=50`,
  )
  const pages = (data as { query?: { pages?: Record<string, { images?: Array<{ title?: string }> }> } })?.query?.pages || {}
  const files: string[] = []
  for (const page of Object.values(pages)) {
    for (const img of page.images || []) {
      const t = img.title || ''
      if (/^File:/i.test(t) && /\.(ogg|wav|mp3|oga)$/i.test(t)) files.push(t.slice(5))
    }
  }
  const lower = spelling.toLowerCase()
  const english = files.filter((f) => /^en-/i.test(f) && f.toLowerCase().includes(lower))
  const order = ['en-us', 'en-gb', 'en-uk', 'en-au', 'en-ca']
  english.sort((a, b) => {
    const ia = order.findIndex((p) => a.toLowerCase().startsWith(p))
    const ib = order.findIndex((p) => b.toLowerCase().startsWith(p))
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return english.slice(0, 6).map((file) => {
    const prefix = file.split('-').slice(0, 2).join('-')
    const accent = accentLabel(prefix)
    return { url: commonsTranscodeUrl(file), label: accent.label, pronunciationType: accent.type, source: 'wiktionary' as const }
  })
}

// 第三路：Lingua Libre 英音录音（LL-Q1860 (eng)-<主播>-<单词>.wav，取最多 3 个不同主播）。
async function linguaLibreCandidates(spelling: string): Promise<AudioCandidate[]> {
  const lower = spelling.toLowerCase()
  const findExact = (hits: Array<{ title?: string }> | undefined): string[] => {
    const found: string[] = []
    for (const r of hits || []) {
      const m = (r.title || '').match(/^File:LL-Q1860 \(eng\)-.+-([^.]+)\.wav$/i)
      if (m && m[1].toLowerCase() === lower) found.push(r.title!.slice(5))
    }
    return found
  }
  // 常用词会被含该词的短语结果淹没，查不到时再按文件名结尾查。
  const first = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(`intitle:"LL-Q1860 (eng)" ${spelling}`)}&srnamespace=6&srlimit=20`,
  )
  let files = findExact((first as { query?: { search?: Array<{ title?: string }> } })?.query?.search)
  if (!files.length) {
    const second = await fetchJson(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(`intitle:"-${spelling}.wav"`)}&srnamespace=6&srlimit=20`,
    )
    files = findExact((second as { query?: { search?: Array<{ title?: string }> } })?.query?.search)
  }
  const seen = new Set<string>()
  const out: AudioCandidate[] = []
  for (const file of files) {
    const m = file.match(/^LL-Q1860 \(eng\)-(.+)-[^.]+\.wav$/i)
    const speaker = m ? m[1] : 'Lingua Libre'
    if (seen.has(speaker)) continue
    seen.add(speaker)
    out.push({ url: commonsTranscodeUrl(file), label: `Lingua Libre（${speaker}）`, pronunciationType: 'uk', source: 'lingua-libre' })
    if (out.length >= 3) break
  }
  return out
}

/** 三路并行找备选录音，按 URL 去重；某路失败不影响其他路。 */
export async function listAudioCandidates(spelling: string): Promise<AudioCandidate[]> {
  const results = await Promise.allSettled([
    dictionaryCandidates(spelling),
    wiktionaryCandidates(spelling),
    linguaLibreCandidates(spelling),
  ])
  const all: AudioCandidate[] = []
  for (const r of results) if (r.status === 'fulfilled') all.push(...r.value)
  const seen = new Set<string>()
  return all.filter((c) => {
    if (!c.url || seen.has(c.url)) return false
    seen.add(c.url)
    return true
  })
}

/** 真 MP3 校验（与迁移脚本同款：ID3 或 MPEG 帧同步头，且不小于 1000 字节）。 */
export function isMp3(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 1000) return false
  const b = new Uint8Array(buf)
  return (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
}

/** 下载并校验 MP3（两次重试，超 1MB 拒绝）。 */
export async function downloadVerifiedMp3(url: string): Promise<ArrayBuffer> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { 'User-Agent': UA },
      })
      if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      if (buf.byteLength > MAX_AUDIO_BYTES) throw new Error('音频文件过大（超过 1MB）')
      if (!isMp3(buf)) throw new Error('下载到的不是 MP3 文件')
      return buf
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw lastError || new Error('下载失败')
}
