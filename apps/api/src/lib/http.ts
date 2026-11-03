import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ZodType } from 'zod'

export async function parseBody<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: '请求内容格式不正确' })
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new HTTPException(400, { message: issue?.message || '请求参数不正确' })
  }
  return result.data
}

export function queryInt(value: string | undefined, fallback: number, min = 0, max = 100): number {
  const parsed = Number.parseInt(value || '', 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function paged(c: Context, data: unknown) {
  return c.json({ data })
}
