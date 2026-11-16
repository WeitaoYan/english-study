// 单词配图备选源：与导入脚本（tools/migrate-images.mjs）同款四路找图，
// 区别是这里返回全部候选（供管理端预览后换源），而不是只挑一个。
// 注意：Worker 里 fetch 外部图片与接口都走公网；某路失败不影响其他路。
// Openverse 每次备选查询用 2 次匿名调用（插画 + 照片），计入每日 200 次额度，
// 管理端是偶发操作，不走导入脚本的 180 次计数。
import type { ImageCandidate } from '@english-study/shared'
import emojiMap from '../../../../tools/emoji-word-map.json'

const UA = 'english-study/1.0 (contact: admin@ikber.cc)'
const JSON_TIMEOUT_MS = 8000
const DOWNLOAD_TIMEOUT_MS = 30000
const MIN_PHOTO_BYTES = 5 * 1024
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

async function fetchJson(url: string): Promise<unknown | null> {
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

export function stripTags(s: string): string {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
}

// 授权是否可用：只认允许商用与改动的 CC 协议与公有领域，NC / ND / 合理使用一律不要。
export function licenseAllowed(shortName: string): boolean {
  const s = String(shortName || '')
  if (/fair use/i.test(s)) return false
  if (/\bNC\b/i.test(s) || /\bND\b/i.test(s)) return false
  return /CC BY|CC0|Public domain/i.test(s)
}

function twemojiCodepoints(emoji: string): string {
  return [...emoji]
    .map((ch) => ch.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== 'fe0f')
    .join('-')
}

// 第一路：Twemoji 卡通表情（CC BY 4.0）。映射表是人工复核过的 782 个词；
// maxcdn 主用（本机 node fetch 拉 jsdelivr 会挂满超时，Worker 里两路都可达，
// 这里只返回 maxcdn 一条，换源下载时若 404 再由前端提示换别的）。
function twemojiCandidate(spelling: string): ImageCandidate | null {
  const emoji = (emojiMap as Record<string, string>)[spelling.toLowerCase()]
  if (!emoji) return null
  const cps = twemojiCodepoints(emoji)
  return {
    url: `https://twemoji.maxcdn.com/v/latest/svg/${cps}.svg`,
    label: 'Twemoji 卡通',
    source: 'twemoji',
    license: 'CC BY 4.0',
    creator: 'Twemoji',
    attribution: '图片：Twemoji · CC BY 4.0',
    kind: 'svg',
  }
}

// 第三路：维基百科首图（800px 缩略图，只认可商用授权的才要）。
async function wikipediaCandidate(spelling: string): Promise<ImageCandidate | null> {
  const title = spelling.charAt(0).toUpperCase() + spelling.slice(1)
  const data = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&titles=${encodeURIComponent(title)}&pithumbsize=800&piprop=thumbnail|name`,
  )
  const pages = Object.values(((data as { query?: { pages?: Record<string, unknown> } })?.query?.pages) || {})
  const page = pages[0] as { thumbnail?: { source?: string; width?: number }; pageimage?: string } | undefined
  const thumb = page?.thumbnail
  const fileName = page?.pageimage
  if (!thumb?.source || !fileName || (thumb.width || 0) < 300) return null
  const info = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&titles=${encodeURIComponent(`File:${fileName}`)}&iiprop=url|extmetadata`,
  )
  const imageinfo = (Object.values(((info as { query?: { pages?: Record<string, unknown> } })?.query?.pages) || {})[0] as { imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> } | undefined)?.imageinfo?.[0]
  const meta = imageinfo?.extmetadata || {}
  const license = stripTags(meta.LicenseShortName?.value || '')
  if (!licenseAllowed(license)) return null
  const creator = stripTags(meta.Artist?.value || '').slice(0, 100) || fileName
  return {
    url: thumb.source,
    label: '维基百科首图',
    source: 'wikipedia',
    license,
    creator,
    attribution: `图片：${creator} · ${license} · Wikimedia Commons`,
    kind: 'photo',
  }
}

const OPENVERSER_LICENSE_LABEL: Record<string, string> = { by: 'CC BY', 'by-sa': 'CC BY-SA', cc0: 'CC0', pdm: 'Public Domain' }

// 第二路插画 / 第四路照片：Openverse（只认 by / by-sa / cc0 / pdm 四种授权，
// 每路最多 3 张，供管理端挑；不下载验图，换源时再验）。
async function openverseCandidates(spelling: string, category: 'illustration' | 'photo'): Promise<ImageCandidate[]> {
  const categoryParam = category === 'illustration' ? '&category=illustration' : ''
  const data = await fetchJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(spelling)}&license=by,by-sa,cc0,pdm&page_size=5&filter_dead=false${categoryParam}`,
  )
  const out: ImageCandidate[] = []
  for (const r of ((data as { results?: Array<Record<string, unknown>> })?.results) || []) {
    const licenseKey = String(r.license || '')
    const label = OPENVERSER_LICENSE_LABEL[licenseKey]
    if (!label || !r.url) continue
    const creator = stripTags(String(r.creator || '')).slice(0, 100) || '未知作者'
    out.push({
      url: String(r.url),
      label: category === 'illustration' ? 'Openverse 插画' : 'Openverse 照片',
      source: category === 'illustration' ? 'openverse-illustration' : 'openverse',
      license: label,
      creator,
      attribution: stripTags(String(r.attribution || '')).slice(0, 300)
        || `图片：${creator} · ${label} · Openverse`,
      kind: 'photo',
    })
    if (out.length >= 3) break
  }
  return out
}

/** 四路并行找备选配图，按 URL 去重；某路失败不影响其他路。 */
export async function listImageCandidates(spelling: string): Promise<ImageCandidate[]> {
  const results = await Promise.allSettled([
    Promise.resolve(twemojiCandidate(spelling)).then((c) => (c ? [c] : [])),
    openverseCandidates(spelling, 'illustration'),
    wikipediaCandidate(spelling).then((c) => (c ? [c] : [])),
    openverseCandidates(spelling, 'photo'),
  ])
  const all: ImageCandidate[] = []
  for (const r of results) if (r.status === 'fulfilled') all.push(...r.value)
  const seen = new Set<string>()
  return all.filter((c) => {
    if (!c.url || seen.has(c.url)) return false
    seen.add(c.url)
    return true
  })
}

// 真图校验（与导入脚本同款）：JPEG / PNG 开头且 5KB–2MB；SVG 以 <svg 开头（100 字节–100KB）。
export function imageExt(buf: ArrayBuffer): 'jpg' | 'png' | null {
  if (!buf || buf.byteLength < MIN_PHOTO_BYTES || buf.byteLength > MAX_PHOTO_BYTES) return null
  const b = new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  return null
}

export function isSvg(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 100 || buf.byteLength > 100 * 1024) return false
  const head = new TextDecoder().decode(buf.slice(0, 1024)).replace(/^\uFEFF/, '').trimStart()
  return head.startsWith('<svg') || head.startsWith('<?xml')
}

export interface VerifiedImage {
  buf: ArrayBuffer
  ext: 'jpg' | 'png' | 'svg'
  contentType: string
}

/** 下载并校验图片（两次重试）。kind 为 svg 时验 SVG，否则验 JPG/PNG。 */
export async function downloadVerifiedImage(url: string, kind: 'svg' | 'photo'): Promise<VerifiedImage> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { 'User-Agent': UA },
      })
      if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      if (kind === 'svg') {
        if (!isSvg(buf)) throw new Error('下载到的不是 SVG 图片')
        return { buf, ext: 'svg', contentType: 'image/svg+xml' }
      }
      const ext = imageExt(buf)
      if (!ext) throw new Error(`非 JPG/PNG 或大小不在 5KB–2MB 内（${buf.byteLength} 字节）`)
      return { buf, ext, contentType: ext === 'jpg' ? 'image/jpeg' : 'image/png' }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw lastError || new Error('图片下载失败')
}
