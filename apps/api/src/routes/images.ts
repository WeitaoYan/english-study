import { Hono } from 'hono'
import type { AppEnv } from '../types'

const images = new Hono<AppEnv>()

images.get('/:id', async (c) => {
  const image = await c.env.DB.prepare(
    'SELECT id, image_url, r2_key FROM word_image WHERE id = ?',
  ).bind(c.req.param('id')).first<{
    id: string
    image_url: string
    r2_key: string | null
  }>()
  if (!image) return c.json({ error: '图片不存在' }, 404)

  if (image.r2_key && c.env.IMAGES) {
    const object = await c.env.IMAGES.get(image.r2_key)
    if (!object) return c.json({ error: '图片文件不存在' }, 404)
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    return new Response(object.body, { headers })
  }

  return c.redirect(image.image_url, 302)
})

export default images
