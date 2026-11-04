import type { QuestionPayload, QuestionType, Word } from '@english-study/shared'
import { QUESTION_TYPE_LABELS } from '@english-study/shared'
import type { WordRow } from '../types'
import { mapWord } from './mappers'
import { safeJson } from './utils'

// 听音放在第 5 位（与看图题相邻）：若放在原来的第 7 位，6 词的单元一局永远轮不到听音题，
// 发音审核通过了也出不来题，审核就白做了。轮换仍保证一局内题型多样。
const TYPE_ROTATION: QuestionType[] = [
  'definition_choice',
  'letter_fill',
  'sentence_fill',
  'image_choice',
  'audio_choice',
  'collocation_choice',
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
  if (word.collocations.length > 0) types.push('collocation_choice')
  // 听音题不依赖音频文件，改用浏览器 TTS：只有管理员试听审核通过的单词才可出题，
  // 与“看图题只有已审核图片才可出题”同款门禁。audioUrl 只是历史字段，前端并不播放它。
  if (word.ttsStatus === 'approved') types.push('audio_choice')
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

function optionPool(
  correct: Word,
  allWords: Word[],
  type: QuestionType,
): Array<{ value: string; pos: string | null }> {
  if (type === 'image_choice') {
    return allWords
      .filter((word) => word.id !== correct.id && word.enabled && word.imageUrl && word.imageStatus === 'approved')
      .map((word) => ({ value: word.spelling, pos: word.pos }))
  }
  if (type === 'collocation_choice') {
    return allWords
      .filter((word) => word.id !== correct.id && word.enabled && word.collocations.length > 0)
      .map((word) => ({ value: word.collocations[0]!.phrase, pos: word.pos }))
  }
  return allWords
    .filter((word) => word.id !== correct.id && word.enabled)
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
  collocation_choice: '选择正确的词组搭配',
}

/** 用人工校对题替换自动生成的题目；数据不满足题型依赖时返回 null。 */
export function applyManualQuestion(
  payload: QuestionPayload,
  word: Word,
  manual: ManualQuestion,
): QuestionPayload | null {
  const type = manual.type
  if (type === 'image_choice' && !(word.imageUrl && word.imageStatus === 'approved')) return null
  if (type === 'audio_choice' && word.ttsStatus !== 'approved') return null

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
    audioUrl: type === 'audio_choice' ? word.audioUrl : null,
    hint: null,
    questionId: manual.id,
  }
}

export function expectedAnswer(row: WordRow, type: QuestionType): string {
  const word = mapWord(row)
  if (type === 'collocation_choice') return word.collocations[0]?.phrase || word.spelling
  return word.spelling
}

export function explanationForRow(row: WordRow): string {
  return explanationFor(mapWord(row))
}

export function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  return safeJson<T>(value, fallback)
}
