// 端到端验证单元练习轮换取词：临时家长+孩子连做 4 局 un-3a-1，
// 前 3 局应覆盖 30 个词各不相同，第 4 局回到第 1 批（轮完一圈）。
// 用完即删临时账号。密码随机生成，只存在内存里。
import { randomUUID } from 'node:crypto'

const API = 'https://api.english.ikber.cc/api'
const EMAIL = 'test-parent@ikber.cc'
const PASSWORD = `Tmp-${randomUUID().slice(0, 8)}!`
const UNIT = 'un-3a-1'
const TEXTBOOK = 'tb-3a'

async function call(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}
async function put(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

const reg = await call('/auth/register', null, { email: EMAIL, password: PASSWORD, nickname: '测试家长', role: 'parent' })
console.log('parent id:', reg.id || reg.user?.id)
const login = await call('/auth/login', null, { email: EMAIL, password: PASSWORD })
const parentToken = login.token
console.log('parent login ok')
const child = await call('/parent/children', parentToken, { nickname: '测试孩子' })
console.log('child id:', child.id)
await put(`/parent/children/${child.id}/textbooks`, parentToken, { textbookIds: [TEXTBOOK] })
console.log('textbook assigned')
const switched = await call('/auth/switch-to-child', parentToken, { childId: child.id })
const childToken = switched.token
console.log('child token ok')

const sets = []
for (let round = 1; round <= 4; round++) {
  const session = await call('/student/practice/sessions', childToken, { mode: 'unit', unitId: UNIT, limit: 10 })
  const words = session.questions.map((q) => q.wordSpelling)
  sets.push(words)
  console.log(`第 ${round} 局:`, JSON.stringify(words))
  for (const q of session.questions) {
    await call('/student/practice/answer', childToken, {
      sessionId: session.sessionId, wordId: q.wordId, type: q.type, answer: q.wordSpelling, durationMs: 100,
    })
  }
  await call(`/student/practice/sessions/${session.sessionId}/finish`, childToken, {})
}
const [s1, s2, s3, s4] = sets
const overlap12 = s1.filter((w) => s2.includes(w))
const overlap13 = s1.filter((w) => s3.includes(w))
const overlap23 = s2.filter((w) => s3.includes(w))
const allCovered = new Set([...s1, ...s2, ...s3]).size
console.log('---')
console.log('1/2局重合:', JSON.stringify(overlap12), '| 1/3局重合:', JSON.stringify(overlap13), '| 2/3局重合:', JSON.stringify(overlap23))
console.log('前3局覆盖词数:', allCovered, '(期望 30)')
console.log('第4局与第1局相同:', JSON.stringify(s4) === JSON.stringify(s1), '(轮完一圈应为 true)')
console.log('parent:', EMAIL, 'child:', child.id)
