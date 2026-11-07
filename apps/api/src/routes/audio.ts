// 单词真人发音播放：按 word_id 查 word_audio 表，从 R2 流式输出 MP3。
// 与 images.ts 同款做法：文件在 R2 里，audio_url 存的是这条接口的完整地址，
// 前端直接拿它当 <audio> 的 src。录音来自 Wiktionary（CC BY-SA），无需人工审核、直接放行。
import { Hono } from 'hono'
import type { AppEnv } from '../types'

const audio = new Hono<AppEnv>()

audio.get('/:wordId', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT wa.pronunciation_type AS type FROM word_audio wa
     WHERE wa.word_id = ? ORDER BY wa.created_at DESC LIMIT 1`,
  )
    .bind(c.req.param('wordId'))
    .first<{ type: string }>()
  if (!row || !c.env.IMAGES) return c.json({ error: '音频不存在' }, 404)

  const object = await c.env.IMAGES.get(`audio/${c.req.param('wordId')}.mp3`)
  if (!object) return c.json({ error: '音频文件不存在' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('Content-Type', 'audio/mpeg')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  return new Response(object.body, { headers })
})

export default audio
