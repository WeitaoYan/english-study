import type { AppEnv } from '../types'

export interface WordEnrichment {
  phonetic: string | null
  pos: string | null
  chineseDef: string
  englishDef: string | null
  difficulty: number
  examples: Array<{ en: string; zh?: string }>
  collocations: Array<{ phrase: string; zh?: string }>
}

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

const PROMPT = [
  '你是小学英语教研老师，为中国小学生补充英语单词学习资料。',
  '只输出一个 JSON 对象，不要 markdown 代码块，不要任何多余文字。',
  'JSON 字段：',
  '{"phonetic":"美式音标，如 /ˈæpl/","pos":"词性缩写如 n. / v. / adj.","chineseDef":"简短中文释义",',
  '"englishDef":"小学生能懂的简单英文释义","difficulty":1到5的整数(1最简单),',
  '"examples":[{"en":"包含该单词的例句","zh":"例句中文翻译"}],',
  '"collocations":[{"phrase":"常用搭配","zh":"搭配中文"}]}',
  '要求：examples 1-3 条，例句要包含单词本身（允许屈折形式）；collocations 0-3 条；内容适合小学生。',
].join('\n')

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 返回的内容无法解析，请重试')
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    throw new Error('AI 返回的内容无法解析，请重试')
  }
}

function asString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, max) : null
}

type Pair<K extends string> = Record<K, string> & { zh?: string }

function asPairs<K extends 'en' | 'phrase'>(
  value: unknown,
  key: K,
  max: number,
  maxItems: number,
): Pair<K>[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const first = asString(item[key], max)
      const zh = asString(item.zh, max)
      if (!first) return null
      return (zh ? { [key]: first, zh } : { [key]: first }) as Pair<K>
    })
    .filter((item): item is Pair<K> => item !== null)
    .slice(0, maxItems)
}

/** 调用 Workers AI 为单词补充释义、音标、难度、例句与搭配。 */
export async function enrichWordWithAI(env: AppEnv['Bindings'], spelling: string): Promise<WordEnrichment> {
  if (!env.AI) throw new Error('AI 功能未启用：wrangler.jsonc 需要配置 AI 绑定')
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: `单词：${spelling}` },
    ],
    max_tokens: 900,
    temperature: 0.3,
  })
  // Workers AI 返回形状有两种：旧式 { response: string }，以及 OpenAI 兼容的
  // { choices: [{ message: { content: string } }] }（线上实测走后者），两种都接受。
  const raw = result as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> }
  const response = typeof raw?.response === 'string'
    ? raw.response
    : typeof raw?.choices?.[0]?.message?.content === 'string'
      ? raw.choices[0]!.message!.content as string
      : typeof result === 'string'
        ? result
        : null
  if (response === null) throw new Error('AI 没有返回内容，请重试')

  const data = extractJson(response) as Record<string, unknown>
  const chineseDef = asString(data.chineseDef, 300)
  if (!chineseDef) throw new Error('AI 补充的内容不完整，请重试或手动填写')

  const rawDifficulty = Number(data.difficulty)
  return {
    phonetic: asString(data.phonetic, 80),
    pos: asString(data.pos, 30),
    chineseDef,
    englishDef: asString(data.englishDef, 500),
    difficulty: Number.isFinite(rawDifficulty)
      ? Math.min(5, Math.max(1, Math.round(rawDifficulty)))
      : 1,
    examples: asPairs(data.examples, 'en', 300, 3),
    collocations: asPairs(data.collocations, 'phrase', 100, 3),
  }
}
