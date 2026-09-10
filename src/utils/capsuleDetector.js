/**
 * capsuleDetector.js - 树形/表格视图智能胶囊识别与格式化工具
 * 支持：时间戳转换、Unicode 字符与转义互转、嵌套 JSON 字符串检测
 */

// 1. ── 时间戳识别与格式化 ──
const SEC_MIN = 1000000000        // 2001-09-09 01:46:40
const SEC_MAX = 2500000000        // 2049-03-22 09:46:40
const MS_MIN = 1000000000000
const MS_MAX = 2500000000000

// 支持如 "2026-09-09T03:20:31.123Z"、"2026-09-09T03:20:31Z"、"2026-09-09T11:20:31+08:00" 等标准 ISO 8601 时间串
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/i

export function getFormatNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function detectTimestamp(val) {
  if (val === null || val === undefined || val === '') return null
  
  let num = null
  let isFromStr = false
  let isIso = false
  let timeMs = null
  let type = ''
  let badgeLabel = '时间戳'

  if (typeof val === 'number' && Number.isFinite(val)) {
    num = val
  } else if (typeof val === 'string') {
    const trimmed = val.trim()
    if (/^\d{10}$/.test(trimmed) || /^\d{13}$/.test(trimmed)) {
      num = Number(trimmed)
      isFromStr = true
    } else if (ISO_DATE_RE.test(trimmed)) {
      const parsed = Date.parse(trimmed)
      if (!isNaN(parsed)) {
        timeMs = parsed
        isIso = true
        type = 'ISO 8601'
        badgeLabel = 'ISO 8601'
      }
    }
  }

  if (num !== null) {
    if (num >= SEC_MIN && num <= SEC_MAX) {
      timeMs = num * 1000
      type = '秒 (10位)'
      badgeLabel = '时间戳'
    } else if (num >= MS_MIN && num <= MS_MAX) {
      timeMs = num
      type = '毫秒 (13位)'
      badgeLabel = '时间戳'
    }
  }

  if (!timeMs) return null

  const d = new Date(timeMs)
  if (isNaN(d.getTime())) return null

  const pad = (n) => String(n).padStart(2, '0')
  const YYYY = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const DD = pad(d.getDate())
  const HH = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  const localStr = `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`

  const uYYYY = d.getUTCFullYear()
  const uMM = pad(d.getUTCMonth() + 1)
  const uDD = pad(d.getUTCDate())
  const uHH = pad(d.getUTCHours())
  const umm = pad(d.getUTCMinutes())
  const uss = pad(d.getUTCSeconds())
  const utcStr = `${uYYYY}-${uMM}-${uDD} ${uHH}:${umm}:${uss} UTC`

  // 相对时间（如“3分钟前”、“2小时前”）
  const diffSec = Math.round((Date.now() - timeMs) / 1000)
  let relativeStr = ''
  if (Math.abs(diffSec) < 60) {
    relativeStr = diffSec >= 0 ? '刚刚' : '不久后'
  } else if (diffSec > 0) {
    if (diffSec < 3600) {
      relativeStr = `${Math.floor(diffSec / 60)} 分钟前`
    } else if (diffSec < 86400) {
      relativeStr = `${Math.floor(diffSec / 3600)} 小时前`
    } else if (diffSec < 86400 * 30) {
      relativeStr = `${Math.floor(diffSec / 86400)} 天前`
    } else if (diffSec < 86400 * 365) {
      relativeStr = `${Math.floor(diffSec / (86400 * 30))} 个月前`
    } else {
      relativeStr = `${Math.floor(diffSec / (86400 * 365))} 年前`
    }
  } else {
    const futureSec = -diffSec
    if (futureSec < 3600) {
      relativeStr = `${Math.floor(futureSec / 60)} 分钟后`
    } else if (futureSec < 86400) {
      relativeStr = `${Math.floor(futureSec / 3600)} 小时后`
    } else {
      relativeStr = `${Math.floor(futureSec / 86400)} 天后`
    }
  }

  // 准确计算东八区时间 (UTC+8)
  const beijingMs = timeMs + (8 * 60 + d.getTimezoneOffset()) * 60 * 1000
  const bd = new Date(beijingMs)
  const bYYYY = bd.getFullYear()
  const bMM = pad(bd.getMonth() + 1)
  const bDD = pad(bd.getDate())
  const bHH = pad(bd.getHours())
  const bmm = pad(bd.getMinutes())
  const bss = pad(bd.getSeconds())
  const beijingStr = `${bYYYY}-${bMM}-${bDD} ${bHH}:${bmm}:${bss}`

  return {
    isTimestamp: true,
    isIso,
    badgeLabel,
    type,
    timeMs,
    timeMsStr: String(timeMs),
    beijingStr,
    localStr,
    utcStr,
    relativeStr,
    rawStr: String(val)
  }
}

// 2. ── Unicode 转义字符检测与转换 ──
export const HAS_UNICODE_ESCAPE_RE = /(?:\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\})/i

/**
 * 将普通中文/宽字符/Emoji转为 \uXXXX 形式（支持辅助平面 Emoji 代理对）
 */
export function toUnicodeEscape(str) {
  if (typeof str !== 'string') return ''
  return Array.from(str).map(char => {
    const codePoint = char.codePointAt(0)
    if (codePoint > 0xffff) {
      // 拆分为 UTF-16 高低代理对
      const high = Math.floor((codePoint - 0x10000) / 0x400) + 0xd800
      const low = ((codePoint - 0x10000) % 0x400) + 0xdc00
      return '\\u' + high.toString(16).padStart(4, '0') + '\\u' + low.toString(16).padStart(4, '0')
    } else if (codePoint > 127) {
      return '\\u' + codePoint.toString(16).padStart(4, '0')
    }
    return char
  }).join('')
}

/**
 * 将包含 \uXXXX、Unicode 代理对（如 \uD83D\uDE80）或 \u{XXXX} 的转义字符串解码为正常文字与表情符号
 */
export function fromUnicodeEscape(str) {
  if (typeof str !== 'string' || !str) return ''
  try {
    // 1. 替换 ES6 格式 \u{XXXXX}
    let res = str.replace(/\\u\{([0-9a-fA-F]+)\}/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16))
      } catch (_) {
        return _
      }
    })
    // 2. 识别并合成 UTF-16 高低代理对（如 \uD83D\uDE80 -> 🚀）
    res = res.replace(/\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g, (_, highHex, lowHex) => {
      try {
        const high = parseInt(highHex, 16)
        const low = parseInt(lowHex, 16)
        const codePoint = (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
        return String.fromCodePoint(codePoint)
      } catch (_) {
        return _
      }
    })
    // 3. 替换标准 4 位十六进制 \uXXXX 字符
    res = res.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16))
      } catch (_) {
        return _
      }
    })
    return res
  } catch (_) {
    return str
  }
}

/**
 * 精确解析原始 JSON 文本中包含 \uXXXX 转义的属性路径集合
 */
export function extractUnicodePaths(jsonStr) {
  const result = new Map()
  if (!jsonStr || typeof jsonStr !== 'string') return result
  if (!HAS_UNICODE_ESCAPE_RE.test(jsonStr)) return result

  let i = 0
  const len = jsonStr.length

  function skipWhitespace() {
    while (i < len) {
      const ch = jsonStr.charCodeAt(i)
      if (ch === 32 || ch === 10 || ch === 13 || ch === 9) {
        i++
      } else {
        break
      }
    }
  }

  function readString() {
    if (jsonStr[i] !== '"') return null
    const start = i
    i++
    while (i < len) {
      const ch = jsonStr[i]
      if (ch === '\\') {
        i += 2
      } else if (ch === '"') {
        i++
        return jsonStr.slice(start, i)
      } else {
        i++
      }
    }
    return jsonStr.slice(start)
  }

  function parseValue(currentPath) {
    skipWhitespace()
    if (i >= len) return

    const ch = jsonStr[i]
    if (ch === '{') {
      i++
      skipWhitespace()
      while (i < len && jsonStr[i] !== '}') {
        skipWhitespace()
        if (jsonStr[i] === '}') break

        const rawKeyStr = readString()
        if (!rawKeyStr) break

        let key = ''
        try {
          key = JSON.parse(rawKeyStr)
        } catch (_) {
          key = rawKeyStr.slice(1, -1)
        }

        skipWhitespace()
        if (jsonStr[i] === ':') {
          i++
        }

        parseValue([...currentPath, key])

        skipWhitespace()
        if (jsonStr[i] === ',') {
          i++
        }
      }
      if (i < len && jsonStr[i] === '}') i++
    } else if (ch === '[') {
      i++
      let index = 0
      skipWhitespace()
      while (i < len && jsonStr[i] !== ']') {
        skipWhitespace()
        if (jsonStr[i] === ']') break

        parseValue([...currentPath, index])
        index++

        skipWhitespace()
        if (jsonStr[i] === ',') {
          i++
        }
      }
      if (i < len && jsonStr[i] === ']') i++
    } else if (ch === '"') {
      const rawValStr = readString()
      if (rawValStr && HAS_UNICODE_ESCAPE_RE.test(rawValStr)) {
        const pathKey = currentPath.join('.')
        result.set(pathKey, {
          raw: rawValStr.slice(1, -1)
        })
      }
    } else {
      while (i < len && jsonStr[i] !== ',' && jsonStr[i] !== '}' && jsonStr[i] !== ']' && jsonStr[i] !== ' ' && jsonStr[i] !== '\n') {
        i++
      }
    }
  }

  try {
    parseValue([])
  } catch (_) {}

  return result
}

let cachedRawInput = null
let cachedUnicodeMap = null

export function getUnicodePathsMap(rawInput) {
  if (!rawInput || typeof rawInput !== 'string' || !HAS_UNICODE_ESCAPE_RE.test(rawInput)) {
    return null
  }
  if (cachedRawInput === rawInput && cachedUnicodeMap) {
    return cachedUnicodeMap
  }
  cachedRawInput = rawInput
  cachedUnicodeMap = extractUnicodePaths(rawInput)
  return cachedUnicodeMap
}

/**
 * 检测当前值是否具有 Unicode 转义特征
 * - 场景1: 基于当前节点的精确路径 path，在左侧原始 JSON 中命中 \uXXXX
 * - 场景2: 字符串值本身直接包含字面 \uXXXX
 */
export function detectUnicode(val, rawInput = '', path = []) {
  if (typeof val !== 'string' || !val) return null

  // 场景 A: 字符串内部直接包含字面量 \uXXXX（如双重转义）
  if (HAS_UNICODE_ESCAPE_RE.test(val)) {
    const decoded = fromUnicodeEscape(val)
    if (decoded !== val) {
      return {
        isUnicode: true,
        originalUnicode: val,
        decodedText: decoded
      }
    }
  }

  // 场景 B: 基于当前节点具体属性路径，在原始输入中精确匹配该字段是否真正使用了 \u 转义
  if (rawInput && path && path.length > 0) {
    const map = getUnicodePathsMap(rawInput)
    if (map) {
      const pathKey = path.join('.')
      const hit = map.get(pathKey)
      if (hit) {
        return {
          isUnicode: true,
          originalUnicode: hit.raw,
          decodedText: val
        }
      }
    }
  }

  return null
}

// 3. ── 嵌套 JSON 字符串检测 ──
export function detectNestedJson(val) {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (trimmed.length < 2) return null
  const isObj = trimmed.startsWith('{') && trimmed.endsWith('}')
  const isArr = trimmed.startsWith('[') && trimmed.endsWith(']')
  if (!isObj && !isArr) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') {
      const keysCount = isArr ? parsed.length : Object.keys(parsed).length
      return {
        isNestedJson: true,
        isArray: isArr,
        itemCount: keysCount,
        parsed
      }
    }
  } catch (_) {}

  return null
}
