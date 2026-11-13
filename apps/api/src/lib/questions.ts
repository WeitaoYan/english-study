import type { QuestionPayload, QuestionType, Word } from '@english-study/shared'
import { QUESTION_TYPE_LABELS } from '@english-study/shared'
import type { WordRow } from '../types'
import { mapWord } from './mappers'
import { safeJson } from './utils'

// 听音放在第 5 位（与看图题相邻）：若放在原来的第 7 位，6 词的单元一局永远轮不到听音题。
// 轮换仍保证一局内题型多样。
// 搭配题已暂停（2026-11-04）：模板置换的干扰项本身就是错误句子，孩子看多了反而加深错误印象，
// 故先取消该题型：轮换与可用题型里都不再出它，人工题入口也一并关闭；
// 底层生成函数（buildQuestions 分支、模板置换）保留，日后若恢复只需加回轮换与可用题型。
const TYPE_ROTATION: QuestionType[] = [
  'definition_choice',
  'letter_fill',
  'sentence_fill',
  'image_choice',
  'audio_choice',
  'pronunciation_choice',
  'definition_choice',
]

function shuffle<T>(values: T[]): T[] {
  const copy = [...values]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

function availableTypes(word: Word): QuestionType[] {
  const types: QuestionType[] = []
  if (word.chineseDef.trim()) types.push('definition_choice')
  if (word.spelling.replace(/[^a-zA-Z]/g, '').length >= 3) types.push('letter_fill')
  if (word.examples.length > 0) types.push('sentence_fill')
  if (word.imageUrl && word.imageStatus === 'approved') types.push('image_choice')
  // 听音题只放真人录音：没有录音的词不出听音题（TTS 已移除）。
  if (word.audioUrl) types.push('audio_choice')
  // 听词选音同样只认真人录音：目标词与干扰项都必须有录音。
  if (word.audioUrl) types.push('pronunciation_choice')
  return types.length ? types : ['definition_choice']
}

function chooseType(word: Word, index: number): QuestionType {
  const available = availableTypes(word)
  for (let offset = 0; offset < TYPE_ROTATION.length; offset++) {
    const candidate = TYPE_ROTATION[(index + offset) % TYPE_ROTATION.length]!
    if (available.includes(candidate)) return candidate
  }
  return 'definition_choice'
}

/** 释义拆成多个意思：按中文分隔符切（如“他们；她们；它们”→三段）。 */
function defTokens(chineseDef: string): string[] {
  return chineseDef
    .split(/[；;、，,／/]+/)
    .map((part) => part.trim().replace(/[。！!？?~～…]+$/g, '').trim())
    .filter(Boolean)
}

/**
 * 两个词的释义是否重叠：任一意思相同，或一方的释义包含另一方。
 * 同义词/近义词（如 hi/hello、big/large、tour/travel/trip）不能同时出现在
 * 释义选词、看图选词的选项里，否则两个选项都算对、题目本身就有歧义。
 * 注意：释义写法不同但意思相近的（如“旅行”vs“旅游”）这层拦不住，
 * 真要根治得靠人工同义词表或语义比对。
 */
function sameMeaning(a: Word, b: Word): boolean {
  const aDef = a.chineseDef.trim()
  const bDef = b.chineseDef.trim()
  if (!aDef || !bDef) return false
  if (aDef === bDef) return true
  if (aDef.includes(bDef) || bDef.includes(aDef)) return true
  const aTokens = defTokens(aDef)
  const bTokens = defTokens(bDef)
  return aTokens.some((token) => bTokens.includes(token))
}

/**
 * 两个词发音是否相同（同音词，如 right/write）：音标只留发音字母后比较。
 * 同音词不能同时出现在听音选词、听词选音的选项里，否则两个选项听起来一样。
 * 任一方没音标时不判（判不了，不拦）。
 */
function sameSound(a: Word, b: Word): boolean {
  const aPhonetic = phoneticLetters(a.phonetic)
  const bPhonetic = phoneticLetters(b.phonetic)
  return aPhonetic !== '' && aPhonetic === bPhonetic
}

function optionPool(
  correct: Word,
  allWords: Word[],
  type: QuestionType,
): Array<{ value: string; pos: string | null }> {
  if (type === 'image_choice') {
    return allWords
      .filter((word) => word.id !== correct.id && word.enabled && word.imageUrl && word.imageStatus === 'approved'
        && !sameMeaning(word, correct))
      .map((word) => ({ value: word.spelling, pos: word.pos }))
  }
  if (type === 'collocation_choice') {
    // 干扰项 = 其他词的搭配模板（把该词挖空）填上目标词：这样每个选项都含目标词一次、
    // 且没有任何空位，孩子既不能靠“含不含目标词”排除，也不能靠“有没有空位”排除，
    // 只能靠搭配本身判断。短语里没有该词的单词进不了模板池（挖不出模板）。
    return allWords
      .filter((word) => word.id !== correct.id && word.enabled && word.collocations.length > 0
        && maskWordInPhrase(word.collocations[0]!.phrase, word.spelling) !== word.collocations[0]!.phrase)
      .map((word) => ({
        value: fillCollocationTemplate(maskWordInPhrase(word.collocations[0]!.phrase, word.spelling), correct.spelling),
        pos: word.pos,
      }))
  }
  return allWords
    .filter((word) => {
      if (word.id === correct.id || !word.enabled) return false
      // 释义选词：同义词不能当干扰项；听音选词：同音词不能当干扰项。
      if (type === 'definition_choice' && sameMeaning(word, correct)) return false
      if (type === 'audio_choice' && sameSound(word, correct)) return false
      return true
    })
    .map((word) => ({ value: word.spelling, pos: word.pos }))
}

function pickOptions(
  correctValue: string,
  correctPos: string | null,
  pool: Array<{ value: string; pos: string | null }>,
  count = 4,
): string[] {
  const seen = new Set([correctValue.toLowerCase()])
  const unique = pool.filter((item) => {
    const key = item.value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const samePos = shuffle(unique.filter((item) => correctPos && item.pos === correctPos))
  const otherPos = shuffle(unique.filter((item) => !correctPos || item.pos !== correctPos))
  const picked = [...samePos, ...otherPos].slice(0, count - 1).map((item) => item.value)
  return shuffle([correctValue, ...picked])
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let carry = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]!
      prev[j] = Math.min(
        prev[j]! + 1,
        prev[j - 1]! + 1,
        carry + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      carry = temp
    }
  }
  return prev[b.length]!
}

/** 音标只留发音字母（去掉 /ˈˌ· 等标记），便于比较读音是否相近。 */
function phoneticLetters(phonetic: string | null): string {
  return (phonetic || '').replace(/[^a-zA-Zæəɪʊɔɛʌɒŋθðʃʒ]/g, '')
}

/**
 * 听词选音的干扰项相似度：发音越像分越高。首字母相同、词长相近、
 * 拼写与音标的编辑距离小，都说明两个词听起来容易混淆。
 * （随机抓三个词当干扰项太好排除，起不到练听力的作用。）
 */
function pronunciationScore(target: Word, candidate: Word): number {
  const t = target.spelling.toLowerCase()
  const c = candidate.spelling.toLowerCase()
  let score = 0
  if (t[0] === c[0]) score += 3
  const lenDiff = Math.abs(t.length - c.length)
  if (lenDiff === 0) score += 2
  else if (lenDiff === 1) score += 1
  const spellingDistance = levenshtein(t, c)
  if (spellingDistance <= 2) score += 3
  else if (spellingDistance <= 3) score += 1
  if (t[t.length - 1] === c[c.length - 1]) score += 1
  const targetPhonetic = phoneticLetters(target.phonetic)
  const candidatePhonetic = phoneticLetters(candidate.phonetic)
  if (targetPhonetic && candidatePhonetic) {
    const phoneticDistance = levenshtein(targetPhonetic, candidatePhonetic)
    if (phoneticDistance <= 2) score += 3
    else if (phoneticDistance <= 3) score += 1
  }
  return score
}

/**
 * 听词选音的选项：目标词录音 + 3 个发音最像的同单元词录音，打乱顺序。
 * 干扰项必须是别的词的真人录音（不是错误发音），且拼写不同——
 * 同词不同大小写（如 Ms/ms）读音完全相同，不能当干扰项。
 */
function pickPronunciationOptions(correct: Word, allWords: Word[]): string[] {
  if (!correct.audioUrl) return []
  const seen = new Set([correct.spelling.toLowerCase()])
  const ranked = allWords
    .filter((word) => {
      if (word.id === correct.id || !word.enabled || !word.audioUrl) return false
      if (sameSound(word, correct)) return false
      const key = word.spelling.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((word) => ({ url: word.audioUrl!, score: pronunciationScore(correct, word) }))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
  const picked = ranked.slice(0, 3).map((item) => item.url)
  return shuffle([correct.audioUrl, ...picked])
}

function maskSpelling(spelling: string): string {
  const letters = spelling.split('')
  const reveal = new Set<number>([0, letters.length - 1])
  if (letters.length >= 6) reveal.add(Math.floor(letters.length / 2))
  else if (letters.length >= 5) reveal.add(2)
  return letters
    .map((letter, index) => {
      if (!/[a-zA-Z]/.test(letter)) return letter
      return reveal.has(index) ? letter : '_'
    })
    .join(' ')
}

/** 搭配题模板：把短语里的目标单词挖空成 ___，得到该词的搭配模板
 *  （如 walk the dog → walk the ___）。只挖完整单词（含复数 s/es），
 *  不挖它作为别的词一部分的情况（如 cat 不挖 catch）。 */
export function maskWordInPhrase(phrase: string, spelling: string): string {
  const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return phrase.replace(new RegExp(`\\b${escaped}(s|es)?\\b`, 'gi'), '___')
}

/** 把搭配模板的空位填上目标词，并顺手修正空位前的冠词
 *  （an ___ + 辅音开头 → a ___；a ___ + 元音开头 → an ___，如 an ___ tree + dog → a dog tree），
 *  避免干扰项因冠词错误一眼被排除。 */
export function fillCollocationTemplate(template: string, spelling: string): string {
  const withArticle = template.replace(/\b(a|an) ___/gi, (match) => {
    const article = /^[aeiouAEIOU]/.test(spelling) ? 'an' : 'a'
    return /^[A-Z]/.test(match) ? article[0]!.toUpperCase() + article.slice(1) + ' ___' : `${article} ___`
  })
  return withArticle.replace(/___/g, spelling)
}

function sentenceWithBlank(word: Word): string | null {
  const escaped = word.spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(`\\b${escaped}\\w*\\b`, 'i')
  for (const example of word.examples) {
    if (matcher.test(example.en)) {
      return example.en.replace(matcher, '_____')
    }
  }
  return null
}

function explanationFor(word: Word): string {
  const bits: string[] = [`${word.spelling} ${word.phonetic || ''} ${word.pos || ''}`.trim(), word.chineseDef]
  if (word.examples[0]) bits.push(`例句：${word.examples[0].en}${word.examples[0].zh ? `（${word.examples[0].zh}）` : ''}`)
  if (word.collocations[0]) bits.push(`搭配：${word.collocations[0].phrase}${word.collocations[0].zh ? `（${word.collocations[0].zh}）` : ''}`)
  return bits.join(' · ')
}

export function buildQuestions(
  selectedRows: WordRow[],
  unitRows: WordRow[],
  startIndex = 0,
): QuestionPayload[] {
  const allWords = unitRows.map(mapWord)
  const selected = selectedRows.map(mapWord)
  const questions: QuestionPayload[] = []

  selected.forEach((word, index) => {
    const sequence = startIndex + index
    let type = chooseType(word, sequence)
    let options: string[] | null = null
    let stem: string | null = null
    let prompt = ''
    let hint: string | null = null

    if (type === 'definition_choice') {
      prompt = '根据中文释义，选择对应的英文单词'
      stem = word.chineseDef
      hint = null
      options = pickOptions(
        word.spelling,
        word.pos,
        optionPool(word, allWords, 'definition_choice'),
      )
    } else if (type === 'letter_fill') {
      prompt = '在空里填上缺少的字母'
      stem = maskSpelling(word.spelling)
      hint = word.chineseDef
    } else if (type === 'sentence_fill') {
      const sentence = sentenceWithBlank(word)
      if (sentence) {
        prompt = '读句子，填写缺少的单词'
        stem = sentence
        hint = word.chineseDef
      } else {
        type = 'letter_fill'
        prompt = '在空里填上缺少的字母'
        stem = maskSpelling(word.spelling)
        hint = word.chineseDef
      }
    } else if (type === 'image_choice') {
      const imageOptions = pickOptions(
        word.spelling,
        word.pos,
        optionPool(word, allWords, 'image_choice'),
      )
      if (imageOptions.length < 2 || !word.imageUrl) {
        type = 'definition_choice'
        prompt = '根据中文释义，选择对应的英文单词'
        stem = word.chineseDef
        options = pickOptions(word.spelling, word.pos, optionPool(word, allWords, 'definition_choice'))
      } else {
        prompt = '看图，选择对应的英文单词'
        options = imageOptions
      }
    } else if (type === 'audio_choice') {
      prompt = '听发音，选择对应的英文单词'
      options = pickOptions(word.spelling, word.pos, optionPool(word, allWords, 'audio_choice'))
    } else if (type === 'pronunciation_choice') {
      // 题面给单词，4 个选项全是录音：干扰项是别的词的真人录音，
      // 选出目标词的正确读音。options 里放录音地址，audioUrl 字段不放
      // （那是听音选词的单段录音，放了会泄题）。
      const audioOptions = pickPronunciationOptions(word, allWords)
      if (audioOptions.length < 2 || !word.audioUrl) {
        type = 'definition_choice'
        prompt = '根据中文释义，选择对应的英文单词'
        stem = word.chineseDef
        hint = null
        options = pickOptions(word.spelling, word.pos, optionPool(word, allWords, 'definition_choice'))
      } else {
        prompt = `听下面四个发音，选出 “${word.spelling}” 的正确读音`
        stem = word.spelling
        hint = word.chineseDef
        options = audioOptions
      }
    } else if (type === 'collocation_choice') {
      const correctPhrase = word.collocations[0]!.phrase
      prompt = `为 “${word.spelling}” 选择正确的词组搭配`
      options = pickOptions(
        correctPhrase,
        word.pos,
        optionPool(word, allWords, 'collocation_choice'),
      )
      hint = word.chineseDef
    }

    if (options && options.length < 2) {
      type = 'letter_fill'
      prompt = '在空里填上缺少的字母'
      stem = maskSpelling(word.spelling)
      hint = word.chineseDef
      options = null
    }

    if (type === 'definition_choice') {
      if (!prompt) prompt = '根据中文释义，选择对应的英文单词'
      if (!stem) stem = word.chineseDef
    }

    const finalType = type
    questions.push({
      key: `${word.id}:${finalType}:${sequence}`,
      wordId: word.id,
      type: finalType,
      typeLabel: QUESTION_TYPE_LABELS[finalType],
      prompt,
      wordSpelling: word.spelling,
      phonetic: word.phonetic,
      pos: word.pos,
      stem,
      options,
      imageUrl: finalType === 'image_choice' ? word.imageUrl : null,
      imageAttribution: finalType === 'image_choice' ? word.imageAttribution : null,
      audioUrl: finalType === 'audio_choice' ? word.audioUrl : null,
      hint,
      questionId: null,
    })
  })

  return questions
}

export interface ManualQuestion {
  id: string
  type: QuestionType
  stem: string
  options: string[]
  correctAnswer: string
  explanation: string | null
}

const TYPE_PROMPTS: Record<QuestionType, string> = {
  definition_choice: '根据中文释义，选择对应的英文单词',
  letter_fill: '在空里填上缺少的字母',
  sentence_fill: '读句子，填写缺少的单词',
  image_choice: '看图，选择对应的英文单词',
  audio_choice: '听发音，选择对应的英文单词',
  pronunciation_choice: '听四个发音，选出正确读音',
  collocation_choice: '选择正确的词组搭配',
}

/** 用人工校对题替换自动生成的题目；数据不满足题型依赖时返回 null。 */
export function applyManualQuestion(
  payload: QuestionPayload,
  word: Word,
  manual: ManualQuestion,
): QuestionPayload | null {
  // 搭配题已暂停：人工题也不再出该题型，返回 null 回落到自动生成题。
  if (manual.type === 'collocation_choice') return null
  // 听词选音不开放人工题：人工题的选项是文字，没法写 4 段录音。
  if (manual.type === 'pronunciation_choice') return null
  const type = manual.type
  if (type === 'image_choice' && !(word.imageUrl && word.imageStatus === 'approved')) return null
  if (type === 'audio_choice' && !word.audioUrl) return null

  let options: string[] | null = null
  if (manual.options.length) {
    const hasAnswer = manual.options.some(
      (option) => option.trim().toLowerCase() === manual.correctAnswer.trim().toLowerCase(),
    )
    options = hasAnswer ? [...manual.options] : [...manual.options, manual.correctAnswer]
  }

  return {
    ...payload,
    key: `${payload.wordId}:${type}:manual:${manual.id}`,
    type,
    typeLabel: QUESTION_TYPE_LABELS[type],
    prompt: TYPE_PROMPTS[type],
    stem: type === 'definition_choice' ? manual.stem || word.chineseDef : manual.stem,
    options,
    imageUrl: type === 'image_choice' ? word.imageUrl : null,
    imageAttribution: type === 'image_choice' ? word.imageAttribution : null,
    audioUrl: type === 'audio_choice' ? word.audioUrl : null,
    hint: null,
    questionId: manual.id,
  }
}

export function expectedAnswer(row: WordRow, type: QuestionType): string {
  const word = mapWord(row)
  if (type === 'collocation_choice') return word.collocations[0]?.phrase || word.spelling
  // 听词选音的答案是目标词的录音地址：提交的也是选中的录音地址。
  if (type === 'pronunciation_choice') return word.audioUrl || ''
  return word.spelling
}

export function explanationForRow(row: WordRow): string {
  return explanationFor(mapWord(row))
}

export function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  return safeJson<T>(value, fallback)
}
