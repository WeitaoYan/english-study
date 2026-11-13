// 单词配图导入：维基百科首图 → Openverse；下载验货 → R2 → word_image 表（status='pending'，待管理员在图片审核页过目）。
// 用法：
//   node tools/migrate-images.mjs --dry-run            先看一眼：哪些词待导、哪些已跳过，不写 R2/D1、不改进度文件
//   node tools/migrate-images.mjs                      导全部待导词（默认 500 个一批，跑完 remaining 还有就再跑一次）
//   node tools/migrate-images.mjs --words sun,moon     只导指定词（已有图片的词默认跳过）
//   node tools/migrate-images.mjs --words sun --force  指定词已有图片也重导
//   node tools/migrate-images.mjs --limit 100          一批只导 100 个
// 选词：已启用且无 word_image 行的词，按拼写顺序；失败的词记进
// tools/image-migration-progress.json，断点续跑。
// Openverse 匿名每天限 200 次请求：进度文件按天计数，到 180 即停，留到明天再跑。
// 注意：不走管理员账号登录——R2/D1 全部走本机 wrangler（run_wrangler_cf.py 换取凭证）。
// 注意：D1 免费版每天 500 万行读额度是整个 Cloudflare 账号下所有库共用，额度用完当天所有读库都会报 7500，
// UTC 午夜（北京时间次日 08:00）自动恢复；急用可升 Workers Paid（$5/月）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

const API_DIR = '/home/hatch/workspace/english-study/apps/api'
const WRANGLER = '/home/hatch/workspace/tools/run_wrangler_cf.py'
const BUCKET = 'english-study-images'
const PROGRESS_FILE = '/home/hatch/workspace/english-study/tools/image-migration-progress.json'
const UA = 'english-study-image-migration/1.0 (contact: admin@ikber.cc)'
const MAX_BYTES = 2 * 1024 * 1024
const MIN_BYTES = 5 * 1024
const OPENVERSER_DAILY_CAP = 180

const args = {}
{
  const tokens = process.argv.slice(2)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.startsWith('--')) continue
    const [rawK, v] = token.replace(/^--/, '').split('=')
    // --dry-run 与 --dryRun 都要能用：短横线写法转驼峰，否则 args.dryRun 永远读不到，
    // --dry-run 会静默失效、直接做真实写入（2026-11-07 音频脚本实测发现）。
    const k = rawK.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (v !== undefined) args[k] = v
    else if (tokens[i + 1] && !tokens[i + 1].startsWith('--')) args[k] = tokens[++i]
    else args[k] = true
  }
}
const LIMIT = Number(args.limit || 500)
const DRY_RUN = Boolean(args.dryRun)
const FORCE = Boolean(args.force)
const ONLY_WORDS = args.words ? String(args.words).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null

function runWrangler(wranglerArgs) {
  return execFileAsync('python3', [WRANGLER, API_DIR, ...wranglerArgs], { maxBuffer: 64 * 1024 * 1024 })
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''")
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchBytes(url, timeoutMs = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

async function d1Query(sql) {
  const { stdout } = await runWrangler(['d1', 'execute', 'english-study', '--remote', '--command', sql, '--json'])
  const parsed = JSON.parse(stdout)
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  return first?.results || []
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
  } catch {
    return { done: {}, failed: {}, openverseDay: '', openverseCount: 0 }
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n')
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
}

// 真图校验：JPEG / PNG 开头，且在 5KB–2MB 之间。
function imageExt(buf) {
  if (!buf || buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  return null
}

async function downloadVerifiedImage(url) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const buf = await fetchBytes(url)
      const ext = imageExt(buf)
      if (!ext) throw new Error(`非 JPG/PNG 或大小不在 5KB–2MB 内（${buf.length} 字节）`)
      return { buf, ext }
    } catch (error) {
      lastError = error
      if (attempt === 0) await sleep(2000)
    }
  }
  throw lastError
}

// 授权是否可用：只认允许商用与改动的 CC 协议与公有领域，NC / ND / 合理使用一律不要。
function licenseAllowed(shortName) {
  const s = String(shortName || '')
  if (/fair use/i.test(s)) return false
  if (/\bNC\b/i.test(s) || /\bND\b/i.test(s)) return false
  return /CC BY|CC0|Public domain/i.test(s)
}

// 第一路：维基百科首图（piprop=thumbnail|name 给 800px 缩略图与原文件名，
// 再向 Commons 查该文件的授权，只认可商用的才要）。
async function wikipediaImage(spelling) {
  const title = spelling.charAt(0).toUpperCase() + spelling.slice(1)
  const data = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&titles=${encodeURIComponent(title)}&pithumbsize=800&piprop=thumbnail|name`,
  ).catch(() => null)
  const pages = Object.values(data?.query?.pages || {})
  const page = pages[0]
  const thumb = page?.thumbnail
  const fileName = page?.pageimage
  if (!thumb?.source || !fileName || (thumb.width || 0) < 300) return null
  const info = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&titles=${encodeURIComponent(`File:${fileName}`)}&iiprop=url|extmetadata`,
  ).catch(() => null)
  const imageinfo = Object.values(info?.query?.pages || {})[0]?.imageinfo?.[0]
  const meta = imageinfo?.extmetadata || {}
  const license = stripTags(meta.LicenseShortName?.value || '')
  if (!licenseAllowed(license)) return null
  const creator = stripTags(meta.Artist?.value || '').slice(0, 100) || fileName
  return {
    url: thumb.source,
    source: 'wikipedia',
    license,
    creator,
    attribution: `图片：${creator} · ${license} · Wikimedia Commons`,
  }
}

const OPENVERSER_LICENSE_LABEL = { by: 'CC BY', 'by-sa': 'CC BY-SA', cc0: 'CC0', pdm: 'Public Domain' }

// 第二路：Openverse（只认 by / by-sa / cc0 / pdm 四种授权，前 5 个结果逐个试下载，
// 第一个能验过真图的就要）。返回 null 表示这路没找到；抛 'openverse-capped' 表示当日额度已用完。
async function openverseImage(spelling, progress) {
  const today = new Date().toISOString().slice(0, 10)
  if (progress.openverseDay !== today) {
    progress.openverseDay = today
    progress.openverseCount = 0
  }
  if (progress.openverseCount >= OPENVERSER_DAILY_CAP) throw new Error('openverse-capped')
  let data = null
  try {
    data = await fetchJson(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(spelling)}&license=by,by-sa,cc0,pdm&page_size=5&filter_dead=false`,
    )
  } catch (error) {
    if (String(error.message || error).includes('429')) throw new Error('openverse-capped')
    return null
  } finally {
    progress.openverseCount++
  }
  for (const r of data?.results || []) {
    if (!OPENVERSER_LICENSE_LABEL[r.license] || !r.url) continue
    try {
      await downloadVerifiedImage(r.url)
    } catch {
      continue
    }
    return {
      url: r.url,
      source: 'openverse',
      license: OPENVERSER_LICENSE_LABEL[r.license],
      creator: stripTags(r.creator || '').slice(0, 100) || '未知作者',
      attribution: stripTags(r.attribution || '').slice(0, 300)
        || `图片：${stripTags(r.creator || '未知作者')} · ${OPENVERSER_LICENSE_LABEL[r.license]} · Openverse`,
    }
  }
  return null
}

async function storeImage(word, candidate) {
  const { buf, ext } = await downloadVerifiedImage(candidate.url)
  const imageId = `img-${randomUUID()}`
  const key = `word-images/${word.id}/${imageId}.${ext}`
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-'))
  const tmpFile = path.join(tmpDir, `${word.id}.${ext}`)
  fs.writeFileSync(tmpFile, buf)
  try {
    if (!DRY_RUN) {
      // 必须加 --remote：不加会写到本机 Miniflare 假 R2，线上 Worker 读不到。
      await runWrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', tmpFile, '--remote'])
      await d1Query(
        `INSERT INTO word_image (id, word_id, image_url, r2_key, upload_method, status, source, license, creator, attribution, created_at)
         VALUES ('${imageId}', '${word.id}', '/api/images/${imageId}', '${key}', 'import', 'pending',
           '${sqlEscape(candidate.source)}', '${sqlEscape(candidate.license)}', '${sqlEscape(candidate.creator)}',
           '${sqlEscape(candidate.attribution)}', '${new Date().toISOString()}')`,
      )
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
  return { imageId, size: buf.length, ext, ...candidate }
}

async function main() {
  const progress = loadProgress()
  if (!progress.done) progress.done = {}
  if (!progress.failed) progress.failed = {}

  let words
  if (ONLY_WORDS) {
    const list = ONLY_WORDS.map((s) => `'${sqlEscape(s)}'`).join(',')
    words = await d1Query(`SELECT id, spelling FROM word WHERE LOWER(spelling) IN (${list}) ORDER BY spelling`)
    const found = new Set(words.map((w) => w.spelling.toLowerCase()))
    for (const s of ONLY_WORDS) if (!found.has(s)) console.log(`词库里没有 ${s}，跳过`)
  } else {
    words = await d1Query(
      `SELECT w.id, w.spelling FROM word w WHERE w.enabled = 1
       AND NOT EXISTS (SELECT 1 FROM word_image wi WHERE wi.word_id = w.id)
       ORDER BY w.spelling`,
    )
  }

  const stats = { imported: 0, bySource: {}, failed: 0, skipped: 0, remaining: 0 }
  let stopped = ''
  const batch = words.slice(0, LIMIT)
  // 4 并发：单词全程约 10 秒（代理延迟），串行 1700+ 个词要 5 小时，并发后约 1 小时。
  // 进度对象是共享内存，saveProgress 是同步写文件，各 worker 写出的都是最新全量。
  const CONCURRENCY = 4
  let next = 0
  async function worker() {
    while (next < batch.length && !stopped) {
      const word = batch[next++]
      const key = word.spelling.toLowerCase()
      if (progress.done[key] && !FORCE) {
        stats.skipped++
        continue
      }
      let candidate = null
      let failReason = ''
      try {
        candidate = await wikipediaImage(word.spelling)
        if (!candidate) {
          try {
            candidate = await openverseImage(word.spelling, progress)
          } catch (error) {
            if (String(error.message || error) === 'openverse-capped') {
              stopped = 'openverse-capped'
              stats.remaining++
              break
            }
            throw error
          }
        }
        if (!candidate) failReason = '维基无首图、Openverse 无可用结果'
      } catch (error) {
        failReason = String(error.message || error).slice(0, 120)
      }
      if (!candidate) {
        progress.failed[key] = failReason
        stats.failed++
        console.log(`✗ ${word.spelling}：${failReason}`)
        if (!DRY_RUN) saveProgress(progress)
        continue
      }
      try {
        const result = await storeImage(word, candidate)
        progress.done[key] = { source: candidate.source, license: candidate.license, imageId: result.imageId }
        delete progress.failed[key]
        stats.imported++
        stats.bySource[candidate.source] = (stats.bySource[candidate.source] || 0) + 1
        console.log(`✓ ${word.spelling}：${candidate.source}（${candidate.license}，${Math.round(result.size / 1024)}KB）${DRY_RUN ? ' [dry-run]' : ''}`)
      } catch (error) {
        progress.failed[key] = String(error.message || error).slice(0, 120)
        stats.failed++
        console.log(`✗ ${word.spelling}：保存失败 ${String(error.message || error).slice(0, 120)}`)
      }
      if (!DRY_RUN) saveProgress(progress)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  if (!DRY_RUN) saveProgress(progress)

  const processed = stats.imported + stats.failed + stats.skipped
  const totalRemaining = ONLY_WORDS ? 0 : Math.max(0, words.length - processed)
  console.log(`\n导入 ${stats.imported} 张（${Object.entries(stats.bySource).map(([s, n]) => `${s} ${n}`).join('、') || '无'}），失败 ${stats.failed} 个，跳过 ${stats.skipped} 个，剩余待导约 ${totalRemaining} 个${DRY_RUN ? ' [dry-run，未写入]' : ''}`)
  if (stopped === 'openverse-capped') {
    console.log('Openverse 当日额度（180 次）已用完，剩下的词明天再跑（进度文件已保存，断点续跑）。')
  }
}

main().catch((error) => {
  console.error('导入中断：', error)
  process.exit(1)
})
