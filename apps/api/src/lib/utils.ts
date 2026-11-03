export function nowIso(): string {
  return new Date().toISOString()
}

export function uuid(prefix = ''): string {
  const value = crypto.randomUUID()
  return prefix ? `${prefix}_${value}` : value
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function bool(value: number | boolean | null | undefined): boolean {
  return value === 1 || value === true
}

export function dateKeyInCN(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function weekKeyInCN(date = new Date()): string {
  const day = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  const [year, month, monthDay] = day.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, monthDay))
  const dayNum = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000)
}

export function startOfCNWeek(date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const local = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)))
  const dow = local.getUTCDay() || 7
  local.setUTCDate(local.getUTCDate() - dow + 1)
  local.setUTCHours(local.getUTCHours() - 8)
  return local
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`
}
