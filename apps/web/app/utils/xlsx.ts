/**
 * 零依赖的 .xlsx 解析：读取 zip 中的 sheet 与 sharedStrings，转换为 CSV 文本。
 * 仅依赖浏览器/Worker 原生 DecompressionStream，避免在 Worker 打包中引入额外依赖。
 */

const decoder = new TextDecoder()

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8)
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] || 0) |
    ((bytes[offset + 1] || 0) << 8) |
    ((bytes[offset + 2] || 0) << 16) |
    ((bytes[offset + 3] || 0) << 24)
  ) >>> 0
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  await writer.write(new Uint8Array(data))
  await writer.close()
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

/** 通过 central directory 读取 zip 条目，避免 local header 使用 data descriptor 时尺寸为 0。 */
async function readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('文件不是有效的 xlsx 压缩包')

  const count = u16(bytes, eocd + 10)
  let cursor = u32(bytes, eocd + 16)
  const files = new Map<string, Uint8Array>()
  for (let index = 0; index < count; index++) {
    if (u32(bytes, cursor) !== 0x02014b50) break
    const method = u16(bytes, cursor + 10)
    const compressedSize = u32(bytes, cursor + 20)
    const nameLen = u16(bytes, cursor + 28)
    const extraLen = u16(bytes, cursor + 30)
    const commentLen = u16(bytes, cursor + 32)
    const localOffset = u32(bytes, cursor + 42)
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLen))
    const dataStart = localOffset + 30 + u16(bytes, localOffset + 26) + u16(bytes, localOffset + 28)
    const raw = bytes.slice(dataStart, dataStart + compressedSize)
    if (method === 0) files.set(name, raw)
    else if (method === 8) files.set(name, await inflateRaw(raw))
    cursor += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function readSharedStrings(xml: string): string[] {
  const strings: string[] = []
  for (const item of xml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || []) {
    let text = ''
    for (const match of item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXml(match[1] || '')
    strings.push(text)
  }
  return strings
}

function columnIndex(ref: string | undefined, fallback: number): number {
  if (!ref) return fallback
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase()
  if (!letters) return fallback
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function readSheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = []
  for (const rowXml of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || []) {
    const cells: string[] = []
    for (const cell of rowXml.matchAll(/<c\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] || ''
      const body = cell[2] || ''
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const index = columnIndex(attrs.match(/\br="([A-Z]+\d+)"/i)?.[1], cells.length)
      let value = ''
      if (type === 'inlineStr') {
        for (const match of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) value += decodeXml(match[1] || '')
      } else {
        const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || ''
        const decoded = decodeXml(raw)
        value = type === 's' ? (strings[Number(decoded)] || '') : decoded
      }
      while (cells.length < index) cells.push('')
      cells[index] = value
    }
    rows.push(cells)
  }
  return rows
}

export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => csvCell(cell ?? '')).join(',')).join('\n')
}

/** 将 .xlsx 文件首个工作表转换为带表头的 CSV 文本。 */
export async function xlsxToCsv(file: File | Blob): Promise<string> {
  const files = await readZip(await file.arrayBuffer())
  const stringsName = [...files.keys()].find((name) => /xl\/sharedStrings\.xml$/i.test(name))
  const strings = stringsName ? readSharedStrings(decoder.decode(files.get(stringsName)!)) : []
  const sheetName = [...files.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()[0]
  if (!sheetName) throw new Error('xlsx 中没有找到工作表')
  const rows = readSheetRows(decoder.decode(files.get(sheetName)!), strings)
  return rowsToCsv(rows)
}
