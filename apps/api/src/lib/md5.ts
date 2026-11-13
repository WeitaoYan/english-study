// MD5（纯 JS 实现）：Workers 的 WebCrypto 不支持 MD5，但 Commons 音频转码直链
// 的路径要按文件名的 MD5 算，所以这里自带一个。K 表按定义现算
//（floor(abs(sin(i+1)) * 2^32)），避免手抄 64 个常量抄错。

function utf8Bytes(input: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      // 代理对（surrogate pair）
      i++
      code = 0x10000 + (((code & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff))
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return bytes
}

function rotateLeft(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n))
}

export function md5Hex(input: string): string {
  const bytes = utf8Bytes(input)
  const bitLen = bytes.length * 8
  // 填充：0x80 后补 0，直到长度 ≡ 56 (mod 64)，再补 8 字节小端位长度。
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 0; i < 8; i++) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const m: number[] = []
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      m.push(bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24))
    }
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      const round = Math.floor(i / 16)
      if (round === 0) {
        f = (b & c) | (~b & d)
        g = i
      } else if (round === 1) {
        f = (b & d) | (c & ~d)
        g = (5 * i + 1) % 16
      } else if (round === 2) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const k = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)
      const s = shifts[round * 4 + (i % 4)]
      const tmp = d
      d = c
      c = b
      b = (b + rotateLeft((a + f + k + m[g]) | 0, s)) | 0
      a = tmp
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const hex = (n: number): string => {
    let out = ''
    for (let i = 0; i < 4; i++) out += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0')
    return out
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0)
}
