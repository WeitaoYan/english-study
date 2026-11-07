// 把单词真人发音搬到 R2：三路取音——Free Dictionary API → 维基词典挂的英语录音 → Lingua Libre 英音录音；下载验货 → R2 → word_audio 表。
// 用法：
//   node tools/migrate-audio.mjs [--limit 500] [--words apple,book,school] [--dry-run]
// 每小时跑一次，每次取还没音频的已启用词（按拼写顺序），直到搬完。
// 失败的词记进 tools/audio-migration-progress.json，累计失败 2 次后跳过、最后汇总上报。
// 注意：不走管理员账号登录——R2/D1 全部走本机 wrangler（run_wrangler_cf.py 换取凭证）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

const API_DIR = '/home/hatch/workspace/english-study/apps/api'
const WRANGLER = '/home/hatch/workspace/tools/run_wrangler_cf.py'
const BUCKET = 'english-study-images'
const AUDIO_BASE = 'https://api.english.ikber.cc/api/audio'
const PROGRESS_FILE = '/home/hatch/workspace/english-study/tools/audio-migration-progress.json'
const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const MAX_ATTEMPTS = 2
const MAX_TRANSIENT = 5
const CONCURRENCY = 3

const args = {}
{
  const tokens = process.argv.slice(2)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.startsWith('--')) continue
    const [k, v] = token.replace(/^--/, '').split('=')
    if (v !== undefined) args[k] = v
    else if (tokens[i + 1] && !tokens[i + 1].startsWith('--')) args[k] = tokens[++i]
    else args[k] = true
  }
}
const LIMIT = Number(args.limit || 500)
const DRY_RUN = Boolean(args.dryRun)
const ONLY_WORDS = args.words ? String(args.words).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null

function runWrangler(wranglerArgs) {
  return execFileAsync('python3', [WRANGLER, API_DIR, ...wranglerArgs], { maxBuffer: 64 * 1024 * 1024 })
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''")
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
    return { failed: {} }
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'english-study-audio-migration/1.0' } })
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
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'english-study-audio-migration/1.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

function isMp3(buf) {
  if (!buf || buf.length < 1000) return false
  // ID3 标签或 MPEG 帧同步头
  return (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
}

// Commons 原文件名 → MP3 转码直链。两个关键点：
// 1. MD5 按下划线版文件名算（"En-us-name (2).ogg" → "En-us-name_(2).ogg"），按带空格的算会 404。
// 2. MediaWiki 文件名首字母大写：Wiktionary 列出的是小写 en-us-December.ogg，
//    但 Commons 规范名是 En-us-December.ogg，hash 路径与 URL 都按规范名算，否则 404。
function transcodeUrl(filename) {
  const canonical = filename.charAt(0).toUpperCase() + filename.slice(1)
  const slug = canonical.replace(/ /g, '_')
  const md5 = createHash('md5').update(slug).digest('hex')
  return `https://upload.wikimedia.org/wikipedia/commons/transcoded/${md5[0]}/${md5.slice(0, 2)}/${encodeURIComponent(slug)}/${encodeURIComponent(slug)}.mp3`
}

// 从 Commons 文件页 curid 解析出文件名，再拼 MP3 转码直链（upload.wikimedia.org 更稳，
// dictionaryapi.dev 的媒体地址在这台机器的代理上曾报 502）。
async function commonsMp3Url(sourceUrl) {
  const match = sourceUrl && sourceUrl.match(/curid=(\d+)/)
  if (!match) return null
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&pageids=${match[1]}&prop=info`,
  )
  const page = data?.query?.pages?.[match[1]]
  const title = page?.title
  if (!title || !title.startsWith('File:')) return null
  return transcodeUrl(title.slice(5))
}

function pickAudio(entries) {
  const audios = []
  for (const entry of entries || []) {
    for (const p of entry.phonetics || []) {
      if (p.audio) audios.push({ url: p.audio, sourceUrl: p.sourceUrl || '' })
    }
  }
  if (!audios.length) return null
  return (
    audios.find((a) => a.url.includes('-us.mp3')) ||
    audios.find((a) => a.url.includes('-uk.mp3')) ||
    audios[0]
  )
}

// 第三路之一：维基词典词条挂的英语录音（en-us/en-gb/...）。只认 en- 开头的文件，
// 避免拿到荷兰语、瑞典语等其他语言的同名录音。
async function wiktionaryAudioFile(word) {
  // 维基词典 API 对标题首字母大小写敏感：D1 里是小写 christmas，但词条页是
  // 大写 Christmas，小写查不到任何图片，必须先把首字母大写。
  const title = word.charAt(0).toUpperCase() + word.slice(1)
  const data = await fetchJson(
    `https://en.wiktionary.org/w/api.php?action=query&format=json&prop=images&titles=${encodeURIComponent(title)}&imlimit=50`,
  )
  const files = []
  for (const page of Object.values(data?.query?.pages || {})) {
    for (const img of page.images || []) {
      const t = img.title || ''
      if (/^File:/i.test(t) && /\.(ogg|wav|mp3|oga)$/i.test(t)) files.push(t.slice(5))
    }
  }
  const lower = word.toLowerCase()
  const english = files.filter((f) => /^en-/i.test(f) && f.toLowerCase().includes(lower))
  const exact = (prefix) =>
    english.find((f) => new RegExp(`^${prefix}-${lower}\\.(ogg|wav|mp3|oga)$`, 'i').test(f))
  return exact('en-us') || exact('en-gb') || exact('en-au') || exact('en-ca') || english[0] || null
}

// 第三路之二：Lingua Libre 英音录音（LL-Q1860 (eng)-<主播>-<单词>.wav），要求末段与单词精确匹配。
async function linguaLibreAudioFile(word) {
  const lower = word.toLowerCase()
  const findExact = (hits) => {
    for (const r of hits || []) {
      const m = r.title.match(/^File:LL-Q1860 \(eng\)-.+-([^.]+)\.wav$/i)
      if (m && m[1].toLowerCase() === lower) return r.title.slice(5)
    }
    return null
  }
  // 第一查：标题含 LL-Q1860 (eng) 与该词；常用词（to/with）会被含该词的短语结果淹没，
  // 查不到时再按文件名结尾查（intitle:"-to.wav" 只返回以该词结尾的文件）。
  const first = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(`intitle:"LL-Q1860 (eng)" ${word}`)}&srnamespace=6&srlimit=20`,
  )
  const found = findExact(first?.query?.search)
  if (found) return found
  const second = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(`intitle:"-${word}.wav"`)}&srnamespace=6&srlimit=20`,
  )
  return findExact(second?.query?.search)
}

async function downloadVerifiedMp3(url) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const b = await fetchBytes(url)
      if (!isMp3(b)) throw new Error(`非 MP3 或过小（${b.length} 字节）`)
      return b
    } catch (error) {
      lastError = error
      if (attempt === 0) await sleep(2000)
    }
  }
  throw lastError
}

async function storeAudio(word, buf, type, source) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'))
  const tmpFile = path.join(tmpDir, `${word.id}.mp3`)
  fs.writeFileSync(tmpFile, buf)
  const key = `audio/${word.id}.mp3`
  try {
    if (!DRY_RUN) {
      // 必须加 --remote：不加会写到本机 Miniflare 假 R2，线上 Worker 读不到。
      await runWrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', tmpFile, '--remote'])
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
  return { ok: true, type, size: buf.length, key, source }
}

async function migrateWord(word, progress) {
  const spelling = word.spelling
  try {
    // 第一路：Free Dictionary API（词典 JSON 经代理常 502，重试 3 次）。
    let entries = null
    let dictError = ''
    for (let attempt = 0; attempt < 3 && !entries; attempt++) {
      try {
        entries = await fetchJson(`${DICT_API}/${encodeURIComponent(spelling)}`)
      } catch (error) {
        dictError = String(error.message || error)
        if (attempt < 2) await sleep(2000)
      }
    }
    if (entries) {
      const picked = pickAudio(entries)
      if (picked) {
        const type = picked.url.includes('-us.mp3') ? 'us' : picked.url.includes('-uk.mp3') ? 'uk' : 'us'
        let buf = null
        try {
          buf = await downloadVerifiedMp3(picked.url)
        } catch {
          buf = null
        }
        if (!buf) {
          const fallback = await commonsMp3Url(picked.sourceUrl).catch(() => null)
          if (fallback) {
            try {
              buf = await downloadVerifiedMp3(fallback)
            } catch {
              buf = null
            }
          }
        }
        if (buf) return await storeAudio(word, buf, type, 'wiktionary/free-dictionary-api')
      }
    }
    // 第三路：词典没词条、或有词条无音频时，走维基词典 → Lingua Libre；
    // 候选文件按顺序逐个试下载，一个失败就试下一个，不要因一个文件失败就放弃。
    const candidates = []
    let thirdError = ''
    try {
      const wiktFile = await wiktionaryAudioFile(spelling)
      if (wiktFile) candidates.push({ file: wiktFile, type: /^en-gb-/i.test(wiktFile) ? 'uk' : 'us', source: 'wiktionary' })
    } catch (error) {
      thirdError = String(error.message || error)
    }
    try {
      const llFile = await linguaLibreAudioFile(spelling)
      if (llFile) candidates.push({ file: llFile, type: 'us', source: 'lingua-libre' })
    } catch (error) {
      if (!thirdError) thirdError = String(error.message || error)
    }
    for (const candidate of candidates) {
      const buf = await downloadVerifiedMp3(transcodeUrl(candidate.file)).catch(() => null)
      if (buf) return await storeAudio(word, buf, candidate.type, candidate.source)
    }
    // 三路都无才算确实拿不到；查询/下载中途出错是临时失败，下次重试，
    // 不能记成“无音频”，否则限流错会被误判跳过。
    if (!entries) return { ok: false, reason: `词典查询失败：${dictError}` }
    if (thirdError) return { ok: false, reason: `第三路查询失败：${thirdError}` }
    if (candidates.length) return { ok: false, reason: '音频下载失败' }
    return { ok: false, reason: 'API 无音频' }
  } catch (error) {
    return { ok: false, reason: String(error.message || error) }
  }
}

async function main() {
  const progress = loadProgress()
  // 跳过规则：只有“确实无音频”计入 attempts（2 次跳过）；502/429/404/超时等
  // 临时失败计入 transient（5 次才跳过），避免限流把本有录音的词永久跳过。
  const skippedSpellings = () =>
    Object.entries(progress.failed || {})
      .filter(([, info]) => (info.attempts || 0) >= MAX_ATTEMPTS || (info.transient || 0) >= MAX_TRANSIENT)
      .map(([spelling]) => spelling)
  // remaining 不计跳过词：跳过词已确认拿不到录音、走浏览器 TTS，不再是“待搬”的词；
  // 否则 remaining 最低只会到跳过词数、永远到不了 0，任务完成条件无法触发。
  const skipSqlClause = (list) =>
    list.length ? `AND lower(spelling) NOT IN (${list.map((w) => `'${sqlEscape(w)}'`).join(',')})` : ''
  const skip = skippedSpellings()

  let words
  if (ONLY_WORDS) {
    const inList = ONLY_WORDS.map((w) => `'${sqlEscape(w)}'`).join(',')
    words = await d1Query(
      `SELECT id, spelling FROM word WHERE enabled = 1 AND lower(spelling) IN (${inList}) ORDER BY spelling`,
    )
  } else {
    words = await d1Query(
      `SELECT id, spelling FROM word WHERE enabled = 1
       AND id NOT IN (SELECT word_id FROM word_audio) ${skipSqlClause(skip)}
       ORDER BY spelling LIMIT ${LIMIT}`,
    )
  }
  const remainingBefore = ONLY_WORDS
    ? null
    : (await d1Query(
        `SELECT COUNT(*) AS c FROM word WHERE enabled = 1 AND id NOT IN (SELECT word_id FROM word_audio) ${skipSqlClause(skip)}`,
      ))[0]?.c

  console.log(JSON.stringify({ pending: words.length, remainingBefore, skipped: skip.length, dryRun: DRY_RUN }))

  const successes = []
  const failures = []
  let pending = []
  let flushing = null
  // 增量写库：每攒 25 个成功就写一次 D1，中途被环境重启杀掉也不丢已搬的词。
  // （之前是整批跑完才一次性写库，一次重启就丢一整批。）
  async function flushPending() {
    while (pending.length || flushing) {
      if (flushing) {
        await flushing
        continue
      }
      if (!pending.length) break
      const batch = pending
      pending = []
      flushing = (async () => {
        if (DRY_RUN) return
        const values = batch
          .map(
            (s) =>
              `('wa_${randomUUID().replace(/-/g, '')}', '${sqlEscape(s.id)}', '${sqlEscape(`${AUDIO_BASE}/${s.id}`)}', '${s.type}', '${sqlEscape(s.source || 'wiktionary/free-dictionary-api')}')`,
          )
          .join(',\n')
        const sqlFile = path.join(os.tmpdir(), `word-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sql`)
        fs.writeFileSync(
          sqlFile,
          `INSERT OR IGNORE INTO word_audio (id, word_id, audio_url, pronunciation_type, source) VALUES\n${values};\n`,
        )
        try {
          await runWrangler(['d1', 'execute', 'english-study', '--remote', '--file', sqlFile])
          console.log(`已入库 ${batch.length} 个`)
        } finally {
          fs.rmSync(sqlFile, { force: true })
        }
      })()
      try {
        await flushing
      } finally {
        flushing = null
      }
    }
  }
  let cursor = 0
  async function worker() {
    while (cursor < words.length) {
      const word = words[cursor++]
      const result = await migrateWord(word, progress)
      // 降速：每词之间停 300ms，减少 Wikimedia 429 限流。
      await sleep(300)
      if (result.ok) {
        successes.push({ ...word, ...result })
        pending.push({ ...word, ...result })
        delete progress.failed[word.spelling.toLowerCase()]
        console.log(`OK ${word.spelling} (${result.type}, ${result.size} 字节)`)
        if (pending.length >= 25) await flushPending()
      } else {
        failures.push({ ...word, reason: result.reason })
        const key = word.spelling.toLowerCase()
        const prev = progress.failed[key] || { attempts: 0, transient: 0 }
        const noAudio = result.reason.includes('API 无音频')
        progress.failed[key] = {
          attempts: noAudio ? (prev.attempts || 0) + 1 : (prev.attempts || 0),
          transient: noAudio ? (prev.transient || 0) : (prev.transient || 0) + 1,
          error: result.reason,
        }
        console.log(`FAIL ${word.spelling}: ${result.reason}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, words.length || 1) }, () => worker()))

  await flushPending()

  saveProgress(progress)
  // 本批新跳过的词也要排除，否则 remaining 会把它们算进去。
  const finalSkip = skippedSpellings()
  const remaining = ONLY_WORDS
    ? null
    : (await d1Query(
        `SELECT COUNT(*) AS c FROM word WHERE enabled = 1 AND id NOT IN (SELECT word_id FROM word_audio) ${skipSqlClause(finalSkip)}`,
      ))[0]?.c
  console.log(
    JSON.stringify({
      done: true,
      processed: words.length,
      ok: successes.length,
      failed: failures.length,
      failedWords: failures.map((f) => f.spelling),
      skippedForever: finalSkip,
      remaining,
    }),
  )
}

main().catch((error) => {
  console.error(JSON.stringify({ done: false, error: String(error.message || error) }))
  process.exit(1)
})
