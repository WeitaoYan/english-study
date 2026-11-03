export interface CsvRow {
  [key: string]: string
}

export function parseCsv(input: string): CsvRow[] {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  if (rows.length < 2) return []

  const headers = rows[0]!.map((header) => header.trim())
  return rows.slice(1).map((cells) => {
    const record: CsvRow = {}
    headers.forEach((header, index) => {
      record[header] = (cells[index] || '').trim()
    })
    return record
  })
}

export function parseListCell(value: string): string[] {
  if (!value) return []
  const trimmed = value.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return trimmed.split(/[|；;]/).map((item) => item.trim()).filter(Boolean)
}
