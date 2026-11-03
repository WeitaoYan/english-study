import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv, Env } from '../types'

const COOKIE_NAME = 'es_token'
const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const actualSalt = salt || toHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(actualSalt), iterations: 120000, hash: 'SHA-256' },
    key,
    256,
  )
  return `pbkdf2$120000$${actualSalt}$${toHex(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: Number(iterations), hash: 'SHA-256' },
    key,
    256,
  )
  const computed = fromHex(toHex(bits))
  const expected = fromHex(hash)
  if (computed.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) diff |= computed[i]! ^ expected[i]!
  return diff === 0
}

export function getRequestToken(c: Parameters<MiddlewareHandler<AppEnv>>[0]): string | null {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return getCookie(c, COOKIE_NAME) || null
}

export async function createToken(env: Env, user: { id: string; role: string; nickname: string }): Promise<string> {
  return sign(
    {
      sub: user.id,
      role: user.role,
      name: user.nickname,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
    env.JWT_SECRET || 'dev-only-change-me-please-32-characters',
    'HS256',
  )
}

export function setAuthCookie(c: Parameters<MiddlewareHandler<AppEnv>>[0], env: Env, token: string): void {
  const options: Parameters<typeof setCookie>[3] = {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    secure: env.APP_ENV === 'production',
  }
  if (env.COOKIE_DOMAIN) options.domain = env.COOKIE_DOMAIN
  setCookie(c, COOKIE_NAME, token, options)
}

export function clearAuthCookie(c: Parameters<MiddlewareHandler<AppEnv>>[0], env: Env): void {
  const options: Parameters<typeof deleteCookie>[2] = { path: '/' }
  if (env.COOKIE_DOMAIN) options.domain = env.COOKIE_DOMAIN
  deleteCookie(c, COOKIE_NAME, options)
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getRequestToken(c)
  if (!token) throw new HTTPException(401, { message: '请先登录' })
  let payload: Record<string, unknown>
  try {
    payload = await verify(token, c.env.JWT_SECRET || 'dev-only-change-me-please-32-characters', 'HS256')
  } catch {
    throw new HTTPException(401, { message: '登录已过期，请重新登录' })
  }
  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  if (!sub) throw new HTTPException(401, { message: '登录状态无效' })
  const user = await c.env.DB.prepare(
    'SELECT id, role, nickname, phone, enabled FROM user WHERE id = ?',
  ).bind(sub).first<{
    id: string
    role: 'student' | 'parent' | 'admin'
    nickname: string
    phone: string
    enabled: number
  }>()
  if (!user || !user.enabled) throw new HTTPException(403, { message: '账号不可用，请联系管理员' })
  c.set('user', {
    id: user.id,
    role: user.role,
    nickname: user.nickname,
    phone: user.phone,
    enabled: Boolean(user.enabled),
  })
  await next()
}

export function requireRole(...roles: Array<'student' | 'parent' | 'admin'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user || !roles.includes(user.role)) {
      throw new HTTPException(403, { message: '没有访问权限' })
    }
    await next()
  }
}

export const authCookieName = COOKIE_NAME
