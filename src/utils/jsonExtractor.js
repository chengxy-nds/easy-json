// ─── Shared JSON Extraction & Parsing Utilities ───

import { safeParse, safeStringify } from './jsonBigInt.js'

// ═══ JSONC / JSON5 注释剥离 ═══
// 移除 // 单行注释和 /* */ 块注释，同时正确保留字符串内容
export const stripJsonComments = (text) => {
  let result = ''
  let inDouble = false
  let inSingle = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    // 处理字符串内的转义
    if (ch === '\\' && (inDouble || inSingle)) {
      result += ch
      if (i + 1 < text.length) { result += text[i + 1]; i += 2 } else { i++ }
      continue
    }

    if (ch === '"' && !inSingle) { inDouble = !inDouble; result += ch; i++; continue }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; result += ch; i++; continue }

    // 块注释 /* ... */
    if (!inDouble && !inSingle && ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }

    // 行注释 // ...（排除 https:// 等 URL）
    if (!inDouble && !inSingle && ch === '/' && text[i + 1] === '/') {
      const before = i > 0 ? text[i - 1] : ' '
      if (before !== ':') {
        i += 2
        while (i < text.length && text[i] !== '\n') i++
        continue
      }
    }

    result += ch
    i++
  }

  return result
}

// ═══ MongoDB Shell 类型 → 标准 JSON ═══
// 将 MongoDB Shell 输出中的特殊类型转为标准 JSON 值
export const tryMongoShellToJson = (text) => {
  const trimmed = text.trim()
  // 检测 MongoDB 类型特征
  const mongoTypes = /\b(ObjectId|ISODate|NumberLong|NumberInt|NumberDecimal|BinData|Timestamp|DBRef|UUID|MinKey|MaxKey)\(/g
  if (!mongoTypes.test(trimmed)) return null
  mongoTypes.lastIndex = 0

  try {
    let cleaned = trimmed

    // ObjectId("...") → "..."
    cleaned = cleaned.replace(/ObjectId\("([^"]*)"\)/g, '"$1"')
    // ISODate("...") → "..."
    cleaned = cleaned.replace(/ISODate\("([^"]*)"\)/g, '"$1"')
    // NumberLong(123) → 123  (also handles "123" arg)
    cleaned = cleaned.replace(/NumberLong\("?(\d+)"?\)/g, '$1')
    // NumberInt(123) → 123
    cleaned = cleaned.replace(/NumberInt\("?(\d+)"?\)/g, '$1')
    // NumberDecimal("99.99") → 99.99
    cleaned = cleaned.replace(/NumberDecimal\("?([\d.]+)"?\)/g, '$1')
    // BinData(0, "...") → "..."
    cleaned = cleaned.replace(/BinData\(\d+,\s*"([^"]*)"\)/g, '"$1"')
    // Timestamp(123, 456) → 123  (取第一个参数)
    cleaned = cleaned.replace(/Timestamp\((\d+),\s*\d+\)/g, '$1')
    // DBRef("col", "id") → "id"
    cleaned = cleaned.replace(/DBRef\("[^"]*",\s*"([^"]*)"\)/g, '"$1"')
    // UUID("...") → "..."
    cleaned = cleaned.replace(/UUID\("([^"]*)"\)/g, '"$1"')
    // MinKey → null, MaxKey → null
    cleaned = cleaned.replace(/\bMinKey\b/g, 'null')
    cleaned = cleaned.replace(/\bMaxKey\b/g, 'null')

    // 尝试解析
    safeParse(cleaned)
    return cleaned
  } catch (e) { return null }
}

// ═══ 转义 JSON 字符串 → 标准 JSON ═══
// Path 1: "{\"key\":\"value\"}" → 标准转义 → {"key":"value"}
// Path 2: "{"key":"value"}"   → 无转义拷贝 → {"key":"value"}
export const tryUnescapeJsonString = (text) => {
  const trimmed = text.trim()
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return null
  if (trimmed.length < 4) return null

  // Path 1: Properly escaped JSON string (\" → literal ")
  try {
    const outer = safeParse(trimmed)
    if (typeof outer === 'string') {
      const inner = safeParse(outer)
      if (inner && typeof inner === 'object') {
        return safeStringify(inner, null, 2)
      }
    }
  } catch (_) {
    // Path 2: Unescaped quotes — JSON.parse fails on outer,
    // but inner after stripping outer quotes is valid JSON
    const inner = trimmed.slice(1, -1)
    try {
      const parsed = safeParse(inner)
      if (parsed && typeof parsed === 'object') {
        return safeStringify(parsed, null, 2)
      }
    } catch (_2) { /* fall through */ }
  }

  return null
}

// ═══ Go map[string]any → JSON ═══
// map[string]any{"code":200,"data":nil,"ok":true} → {"code":200,"data":null,"ok":true}
// 支持嵌套: map[string]any{"user":map[string]any{"id":1}}
export const tryGoMapToJson = (text) => {
  const trimmed = text.trim()
  // 必须以 map[ 开头
  const prefixRe = /^map\[[^\]]+\][\w.{}[\]]*\s*\{/
  if (!prefixRe.test(trimmed)) return null

  try {
    // 全局剥离所有 map[K]V{ 前缀 → { （处理嵌套 Go map）
    const mapPrefixGlobal = /map\[[^\]]+\][\w.{}[\]]*\s*\{/g
    let cleaned = trimmed.replace(mapPrefixGlobal, '{')

    // nil → null
    cleaned = cleaned.replace(/\bnil\b/g, 'null')

    const parsed = safeParse(cleaned)
    if (parsed && typeof parsed === 'object') {
      return safeStringify(parsed, null, 2)
    }
    return null
  } catch (e) { return null }
}

// ═══ Markdown Table → JSON 数组 ═══
export const tryMarkdownTableToJson = (text) => {
  const lines = text.trim().split('\n').map(l => l.trimEnd())
  if (lines.length < 3) return null

  // 找到分隔行（必须包含 | 和 ---）
  // 格式如: | --- | --- | 或 |:---|:---:| 等
  const sepRe = /^\|?\s*:?[-]{3,}:?\s*(\|\s*:?[-]{3,}:?\s*)*\|?\s*$/
  let sepIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (sepRe.test(lines[i])) { sepIdx = i; break }
  }
  if (sepIdx < 1) return null

  // 解析表头
  const headerLine = lines[sepIdx - 1]
  const parseRow = (line) => {
    let s = line.trim()
    if (s.startsWith('|')) s = s.slice(1)
    if (s.endsWith('|')) s = s.slice(0, -1)
    return s.split('|').map(c => c.trim())
  }

  const headers = parseRow(headerLine)
  if (headers.length === 0 || headers.some(h => !h)) return null

  // 解析数据行
  const result = []
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) continue
    if (sepRe.test(line)) continue // 跳过多余分隔行

    const cols = parseRow(line)
    if (cols.length !== headers.length) continue

    const row = {}
    for (let j = 0; j < headers.length; j++) {
      const v = cols[j]
      if (v === 'true') row[headers[j]] = true
      else if (v === 'false') row[headers[j]] = false
      else if (v === '' || v === 'null' || v === 'nil' || v === 'N/A') row[headers[j]] = null
      else if (/^-?\d+$/.test(v)) row[headers[j]] = parseInt(v, 10)
      else if (/^-?\d+\.\d+$/.test(v)) row[headers[j]] = parseFloat(v)
      else row[headers[j]] = v
    }
    result.push(row)
  }

  if (result.length === 0) return null
  return safeStringify(result, null, 2)
}

// ═══ Ruby Hash → JSON ═══
export const tryRubyHashToJson = (text) => {
  const trimmed = text.trim()
  // Ruby hash 特征: 包含 =>  或  包含 :symbol 且以 { 开头
  if (!trimmed.includes('=>') && !(trimmed.startsWith('{') && /[{,]\s*:\w+/.test(trimmed))) {
    return null
  }

  try {
    let cleaned = trimmed

    // 去掉外层大括号以便处理
    let wrapped = true
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      cleaned = cleaned.slice(1, -1).trim()
    } else {
      wrapped = false
    }

    // Step 1: => → :
    cleaned = cleaned.replace(/=>/g, ':')

    // Step 2: 将 Ruby symbol :word 转为 "word"（状态机，跳过字符串内部）
    let result = ''
    let inStr = false
    let strChar = ''
    let escape = false

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i]

      if (escape) { escape = false; result += ch; continue }
      if (ch === '\\') { escape = true; result += ch; continue }
      if ((ch === '"' || ch === "'") && !inStr) { inStr = true; strChar = ch; result += ch; continue }
      if (ch === strChar && inStr) { inStr = false; result += ch; continue }

      if (!inStr && ch === ':' && i + 1 < cleaned.length && /[a-zA-Z_]/.test(cleaned[i + 1])) {
        // 检查前一个字符：如果是 " 或数字或字母，则这是 JSON key 的分隔符，不是 Ruby symbol
        const before = i > 0 ? cleaned[i - 1] : ' '
        if (!/[a-zA-Z0-9"'}]/.test(before)) {
          // 这是 Ruby symbol :word
          result += '"'
          i++ // 跳过冒号
          // 读取 symbol 名（可包含 ? !）
          while (i < cleaned.length && /[\w?!]/.test(cleaned[i])) {
            result += cleaned[i]
            i++
          }
          result += '"'
          i-- // 循环会 ++
          continue
        }
      }

      result += ch
    }

    // Step 3: nil → null
    result = result.replace(/\bnil\b/g, 'null')

    // 重新包装
    const full = wrapped ? '{' + result + '}' : result

    // 用 safeParseJsLike 解析
    const parsed = safeParseJsLike(full)
    if (parsed && typeof parsed === 'object') {
      return safeStringify(parsed, null, 2)
    }
    return null
  } catch (e) { return null }
}

// ═══ PHP print_r / var_export → JSON ═══
// 基于行递归下降解析器，正确处理嵌套 Array 结构和中文等裸字符串值
// 支持多行和单行两种格式：Array(\n[key]=>val\n) 与 Array([key]=>val [key]=>val)
export const tryPhpPrintRToJson = (text) => {
  let trimmed = text.trim()
  if (!/^(?:Array|array)\s*\(/i.test(trimmed)) return null

  // ── 单行格式规范化：按 [key] 边界拆成多行 ──
  // Array ( [id] => 1 [name] => test ) → 拆为多行
  if (!trimmed.includes('\n')) {
    // 递归拆分单行 Array：按最外层 [...] 边界切割，保留嵌套 Array(...)
    const expandInline = (str) => {
      const m = str.match(/^Array\s*\(\s*(.+)\)$/i)
      if (!m) return str
      let inner = m[1]
      const parts = []
      let depth = 0, segStart = 0
      for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '(') depth++
        else if (inner[i] === ')') depth--
        else if (inner[i] === '[' && depth === 0) {
          if (segStart < i) {
            const seg = inner.slice(segStart, i).trim()
            if (seg) parts.push(seg)
          }
          segStart = i
        }
      }
      const last = inner.slice(segStart).trim()
      if (last) parts.push(last)
      // 重建为多行格式，嵌套 Array(...) 递归展开
      const rebuilt = parts.map(p => {
        const ai = p.indexOf('=>')
        if (ai === -1) return '    ' + p
        let key = p.slice(0, ai).trim()
        let val = p.slice(ai + 2).trim()
        if (/^Array\s*\(/i.test(val)) val = expandInline(val)
        return '    ' + key + ' => ' + val
      }).join('\n')
      return 'Array\n(\n' + rebuilt + '\n)'
    }
    trimmed = expandInline(trimmed)
  }

  try {
    const lines = trimmed.split('\n')
    let idx = 0

    // 取下一行非空内容，自动跳过空行
    const advance = () => {
      while (idx < lines.length) {
        const line = lines[idx].trim()
        idx++
        if (line) return line
      }
      return ''
    }

    // 解析标量值
    const parseScalar = (v) => {
      v = v.trim()
      if (v === 'true') return true
      if (v === 'false') return false
      if (v === 'null' || v === 'NULL') return null
      if (/^-?\d+$/.test(v)) return parseInt(v, 10)
      if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v)
      // 去外层引号
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        return v.slice(1, -1)
      }
      return v
    }

    // 递归解析 Array 体：从当前行开始，遇到 ) 返回
    const parseEntries = () => {
      const result = {}

      while (idx < lines.length) {
        const line = advance()
        if (!line) continue
        if (line === ')') return result

        // 匹配 [key] => value
        const kvMatch = line.match(/^\[([^\]]+)\]\s*=>\s*(.*)$/)
        if (!kvMatch) continue

        let key = kvMatch[1].trim()
        if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
          key = key.slice(1, -1)
        }

        const val = kvMatch[2].trim()

        // 判断 value 是否是嵌套 Array
        const isNestedArray = /^Array\s*\(/i.test(val) || /^Array$/i.test(val) ||
          (!val && /^Array\s*\(/i.test(lines[idx]?.trim() || ''))

        if (isNestedArray) {
          // 消费 '(' — 可能在当前行 val 里，也可能在下一行
          if (/^Array\s*\(/i.test(val)) {
            // val 已包含 '('，直接进入递归
            result[key] = parseEntries()
          } else {
            // val 可能是 "Array" 或空，需要跳过到 '('
            if (/^Array$/i.test(val)) {
              // Array 关键字已消费，只需跳过 '('
            } else if (!val) {
              // val 为空，下一行可能是 Array 或 (
              const next = advance()
              if (/^Array$/i.test(next)) {
                // 跳过 Array，等待 '('
              } else if (next === '(' || /^Array\(/i.test(next)) {
                // 直接递归
                result[key] = parseEntries()
                continue
              } else {
                result[key] = next ? parseScalar(next) : null
                continue
              }
            }
            // 消费 '('
            const paren = advance()
            if (paren === '(' || /^Array\(/i.test(paren)) {
              result[key] = parseEntries()
            }
          }
        } else if (!val) {
          // 空值且下一行不是 Array
          const next = advance()
          if (next && next !== ')') {
            result[key] = parseScalar(next)
          } else {
            result[key] = null
            if (next === ')') return result // 提前遇到 )
          }
        } else {
          result[key] = parseScalar(val)
        }
      }

      return result
    }

    // ── 顶层入口：消费 "Array" 和 "(" ──
    let line = advance()
    if (!/^Array/i.test(line)) return null

    // "Array(" 合并在一行
    if (/^Array\s*\(/i.test(line)) {
      // 已含 '('，直接解析体
    } else {
      // 跳过到 '('
      line = advance()
      if (line !== '(') return null
    }

    const parsed = parseEntries()
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) return null
    return safeStringify(parsed, null, 2)
  } catch (e) { return null }
}

// 将单引号字符串转为双引号（状态机，正确处理转义）
export const convertSingleQuotesToDouble = (text) => {
  let result = ''
  let inDouble = false
  let inSingle = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '\\') {
      if (i + 1 < text.length) {
        const next = text[i + 1]
        if (inSingle && next === "'") {
          result += "'"
          i++
          continue
        }
        if (inSingle && next === '"') {
          result += '\\"'
          i++
          continue
        }
        result += '\\' + next
        i++
        continue
      }
      result += '\\'
      continue
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      result += '"'
      continue
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      result += ch
      continue
    }

    if (ch === '"' && inSingle) {
      result += '\\"'
      continue
    }

    if (ch === "'" && inDouble) {
      result += ch
      continue
    }

    result += ch
  }

  return result
}

// 将 JS/Python 宽松语法文本安全转为 JSON 对象（不依赖 eval）
export const safeParseJsLike = (text) => {
  let normalized = text.trim()

  // 1. 去除尾部逗号
  normalized = normalized.replace(/,(\s*[}\]])/g, '$1')

  // 2. 引号化无引号 key
  normalized = normalized.replace(/([{,]\s*)([a-zA-Z_$][\w.$]*)\s*:/g, '$1"$2":')

  // 3. 单引号 → 双引号
  normalized = convertSingleQuotesToDouble(normalized)

  // 4. JS 特有值 → JSON 兼容
  normalized = normalized.replace(/\bundefined\b/g, 'null')

  return safeParse(normalized)
}

export const convertJsObjectToJson = (text) => {
  let cleaned = text.trim()
  
  // JSONP wrapper stripping e.g. callbackName({ ... })
  const jsonpRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(\s*([\s\S]*)\s*\);?$/
  const jsonpMatch = cleaned.match(jsonpRegex)
  if (jsonpMatch) {
    cleaned = jsonpMatch[1].trim()
  }
  
  // Strip outer wrapping parentheses like ({ ... })
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim()
  }

  const obj = safeParseJsLike(cleaned)

  if (obj === null || typeof obj !== 'object') {
    throw new Error('求值结果不是有效的对象或数组。')
  }

  return safeStringify(obj, null, 2)
}

// ═══ Java flat key=value (Lombok @ToString / Kotlin data class) ───
// 继承溶化平铺算法：将 super=ClassName(...) 继承括号打散合入外层
export const tryJavaFlatKeyValueToJson = (text) => {
  if (!text || typeof text !== 'string') return null
  let s = text.trim()
  if (!s.includes('=')) return null

  // 排除 query string：包含 & 且没有 Java 嵌套对象特征
  if (/[?&]/.test(s) && !/[A-Z]\w{2,}[.([]/.test(s)) return null
  // 排除单行简单 key=value（无 Java 嵌套对象 + 少于 3 对）
  const kvPairs = (s.match(/\w[\w.]*\s*=/g) || []).length
  const hasNested = /[A-Z]\w{2,}[.([]/.test(s)
  if (!hasNested && kvPairs < 3) return null

  try {
    // 1. 单引号 → 双引号
    s = s.replace(/'/g, '"')

    // 去除首尾成对的外层括号（如果有）
    while (s.startsWith('(') && s.endsWith(')')) {
      let d = 0, ok = true
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i] === '(') d++
        else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) { ok = false; break } }
      }
      if (ok && d === 1) s = s.slice(1, -1).trim()
      else break
    }
    // 去除尾部未匹配的 )
    let openC = 0, closeC = 0
    for (const ch of s) { if (ch === '(') openC++; if (ch === ')') closeC++ }
    while (closeC > openC && s.endsWith(')')) { s = s.slice(0, -1); closeC-- }

    // 2. StatusEnum{...} → {...}
    s = s.replace(/([a-zA-Z0-9_]+)\{([^}]+)\}/g, '{$2}')

    // 3. 堆栈扫描：标记继承括号 + 删除 super=ClassName 前缀
    const chars = Array.from(s)
    const parenStack = []
    const skipIndices = new Set()

    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === '(') {
        let prefix = ''
        let ci = i - 1
        while (ci >= 0 && chars[ci] !== '(' && chars[ci] !== ',' && chars[ci] !== ' ') {
          prefix = chars[ci] + prefix
          ci--
        }
        const isInheritance = /super=[a-zA-Z0-9_]+/i.test(prefix) || /^[a-zA-Z0-9_]+Dto$/i.test(prefix)
        if (isInheritance) {
          const superMatch = prefix.match(/(super=)?([A-Z][a-zA-Z0-9_]*)$/)
          if (superMatch) {
            const startIdx = i - superMatch[0].length
            for (let j = startIdx; j < i; j++) skipIndices.add(j)
          }
        }
        parenStack.push({ index: i, isInheritance })
      } else if (chars[i] === ')') {
        if (parenStack.length > 0) {
          const lp = parenStack.pop()
          if (lp.isInheritance) {
            skipIndices.add(lp.index)
            skipIndices.add(i)
          }
        }
      }
    }

    // 4. 重建字符串
    let melted = ''
    for (let i = 0; i < chars.length; i++) {
      if (skipIndices.has(i)) continue
      melted += chars[i]
    }

    // 5. 包裹并转换剩余括号
    melted = '{' + melted.replace(/\(/g, '{').replace(/\)/g, '}') + '}'

    // 6. key= → "key":
    melted = melted.replace(/([{\s,])([a-zA-Z0-9_]+)\s*=/g, '$1"$2":')

    // 7. 空值补全
    melted = melted.replace(/:\s*,/g, ': null,')
    melted = melted.replace(/:\s*\}/g, ': null}')

    // 8. 裸字符串加引号（大数字保留字符串）
    melted = melted.replace(/:\s*([^"{}[\]\s,][^,}]*)/g, (match, val) => {
      val = val.trim()
      if (/^(true|false|null)$/i.test(val)) return ': ' + val.toLowerCase()
      if (/^-?\d+(\.\d+)?$/.test(val) && val.replace(/[.-]/g, '').length <= 15) return ': ' + val
      return ': "' + val + '"'
    })

    // 9. 解析并返回
    const obj = safeParse(melted)
    if (obj && typeof obj === 'object') return safeStringify(obj, null, 2)
    return null
  } catch (e) { return null }
}

// ═══ Java toString 递归解析器 ═══
export const parseJavaValue = (text, pos) => {
  let i = pos
  while (i < text.length && text[i] === ' ') i++
  if (i >= text.length) return [null, i]

  const ch = text[i]

  // null
  if (text.startsWith('null', i)) {
    const after = text[i + 4]
    if (!after || after === ',' || after === ')' || after === '}' || after === ']') {
      return [null, i + 4]
    }
  }

  // boolean
  if (text.startsWith('true', i)) {
    const after = text[i + 4]
    if (!after || after === ',' || after === ')' || after === '}' || after === ']') {
      return [true, i + 4]
    }
  }
  if (text.startsWith('false', i)) {
    const after = text[i + 5]
    if (!after || after === ',' || after === ')' || after === '}' || after === ']') {
      return [false, i + 5]
    }
  }

  // Optional.empty
  if (text.startsWith('Optional.empty', i)) {
    return [null, i + 14]
  }
  // Optional[val] or Optional(val)
  if (text.startsWith('Optional[', i) || text.startsWith('Optional(', i)) {
    const close = text.startsWith('Optional[', i) ? ']' : ')'
    const inner = i + 9
    const [val, end] = parseJavaValue(text, inner)
    let j = end
    while (j < text.length && text[j] !== close) j++
    return [val, j + 1]
  }

  // 数组: [A, B, C] 或 [Item{...}, Item{...}]
  if (ch === '[') {
    const arr = []
    let j = i + 1
    while (j < text.length && text[j] !== ']') {
      while (j < text.length && (text[j] === ' ' || text[j] === ',')) j++
      if (text[j] === ']') break
      // 找元素边界：扫描到深度 0 的 , 或 ]
      let elemEnd = j
      let d = 0
      while (elemEnd < text.length) {
        const ec = text[elemEnd]
        if (ec === '{' || ec === '[' || ec === '(') d++
        else if (ec === '}' || ec === ']' || ec === ')') {
          if (d === 0) break
          d--
        } else if (ec === ',' && d === 0) break
        elemEnd++
      }
      // 截取元素子串独立解析，避免裸字符串解析器跨元素边界
      const elemStr = text.substring(j, elemEnd).trim()
      if (elemStr) {
        const [val] = parseJavaValue(elemStr, 0)
        arr.push(val)
      }
      j = elemEnd
    }
    return [arr, j + 1]
  }

  // 嵌套对象: ClassName{...} or ClassName@hash{...} or ClassName(...) or ClassName[...]
  const objMatch = text.substring(i).match(/^([A-Z][\w.$]*(?:@[\da-fA-F]+)?)\s*([{(\[])/)
  if (objMatch) {
    const openCh = objMatch[2]
    const closeCh = openCh === '{' ? '}' : openCh === '(' ? ')' : ']'
    const start = i + objMatch[0].length
    return parseJavaObject(text, start, closeCh)
  }

  // 纯 {key=val} (HashMap)
  if (ch === '{') {
    return parseJavaObject(text, i + 1, '}')
  }

  // 引号字符串
  if (ch === '"' || ch === "'") {
    let j = i + 1
    while (j < text.length && text[j] !== ch) {
      if (text[j] === '\\') j++
      j++
    }
    return [text.substring(i + 1, j), j + 1]
  }

  // 数字（排除 ISO 日期 2024-01-15T09:30:00、IP 地址 0.0.0.0、版本号 1.2.3 等）
  const afterNum = text.substring(i)
  const numMatch = afterNum.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/)
  if (numMatch) {
    const after = afterNum.substring(numMatch[0].length)
    // 后面是 -数字 → ISO 日期；或 .数字 → IP/版本号。都当字符串处理
    if (!/^-\d/.test(after) && !/^\.\d/.test(after)) {
      // 超过 15 位数字保留字符串，避免大数精度丢失
      if (numMatch[0].replace(/[.-]/g, '').length > 15) {
        return [numMatch[0], i + numMatch[0].length]
      }
      const n = Number(numMatch[0])
      return [isNaN(n) ? numMatch[0] : n, i + numMatch[0].length]
    }
  }

  // 裸字符串值（到逗号或右括号为止）
  let j = i
  let depth = 0
  while (j < text.length) {
    const c = text[j]
    if (c === '{' || c === '[' || c === '(') depth++
    else if (c === '}' || c === ']' || c === ')') {
      if (depth === 0) break
      depth--
    } else if (c === ',' && depth === 0) {
      // 前瞻：逗号后到下一个逗号/右括号之间是否有 = 号？
      // 有 → 这是 key=value 分隔符；没有 → 逗号是值的一部分（如 v_sstime,v_setime）
      // 但如果逗号后紧跟的是 ] 或 }，说明是数组/对象元素分隔符
      let hasEquals = false
      let la = j + 1
      let laDepth = 0
      while (la < text.length) {
        const lc = text[la]
        if (lc === '{' || lc === '[' || lc === '(') laDepth++
        else if (lc === '}' || lc === ']' || lc === ')') {
          if (laDepth === 0) break
          laDepth--
        } else if (lc === '=' && laDepth === 0) { hasEquals = true; break }
        else if (lc === ',' && laDepth === 0) break
        la++
      }
      if (hasEquals) break
      // 逗号后是 ] 或 }，说明是数组/嵌套对象内的元素分隔符
      if (text[la] === ']' || text[la] === '}') break
    }
    j++
  }
  const raw = text.substring(i, j).trim()
  if (raw === 'null' || raw === '<null>') return [null, j]
  if (raw === 'true') return [true, j]
  if (raw === 'false') return [false, j]
  // 超过 15 位数字保持字符串，避免大数精度丢失（如银行账号）
  if (/^-?\d+(\.\d+)?$/.test(raw) && raw.replace(/[.-]/g, '').length <= 15) return [Number(raw), j]
  return [raw, j]
}

export const parseJavaObject = (text, pos, closeCh) => {
  const obj = {}
  let i = pos
  while (i < text.length && text[i] !== closeCh) {
    while (i < text.length && (text[i] === ' ' || text[i] === ',')) i++
    if (i >= text.length || text[i] === closeCh) break
    // 读取 key（到 = 号为止）
    let keyEnd = i
    while (keyEnd < text.length && text[keyEnd] !== '=') keyEnd++
    if (keyEnd >= text.length) break
    const key = text.substring(i, keyEnd).trim()
    i = keyEnd + 1
    // 读取 value
    const [val, end] = parseJavaValue(text, i)
    obj[key] = val
    i = end
  }
  return [obj, i + 1]
}

export const convertJavaToJson = (text) => {
  const trimmed = text.trim()
  // ClassName{...} / ClassName@hash{...} / ClassName(...) / ClassName[...]
  const match = trimmed.match(/^([A-Z][\w.$]*(?:@[\da-fA-F]+)?)\s*([{(\[])/)
  if (match) {
    const openCh = match[2]
    const closeCh = openCh === '{' ? '}' : openCh === '(' ? ')' : ']'
    const start = match[0].length
    // Guard: ClassName(...) with no '=' inside is likely Python
    // (OrderedDict/dataclass), not Java toString — let Python handle it
    if (openCh === '(') {
      const closeIdx = trimmed.indexOf(closeCh, start)
      const inner = closeIdx >= 0 ? trimmed.substring(start, closeIdx) : ''
      if (!inner.includes('=')) return null
      // Guard: [...] => ... is PHP print_r, not Java
      if (/\[[^\]]+\]\s*=>/.test(inner)) return null
      // Guard: 单引号值（如 username='zhangsan'）是 Python 特征，非 Java
      if (/=\s*'[^']*'/.test(inner) && !/Optional\[/.test(inner)) return null
    }
    const [obj] = parseJavaObject(trimmed, start, closeCh)
    return safeStringify(obj, null, 2)
  }
  // 纯 HashMap: {key=val, ...}
  // 用 key=value 的 = 号数量 vs JSON key:value 的 : 号数量来判断
  // 避免日期/URL 中的 : 造成误判
  if (trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.includes('=')) {
    const eqCount = (trimmed.match(/[{,]\s*\w[\w.]*\s*=/g) || []).length
    const colonCount = (trimmed.match(/[{,]\s*"?[a-zA-Z_$][\w.$]*"?\s*:/g) || []).length
    if (eqCount >= colonCount && eqCount > 0) {
      const [obj] = parseJavaObject(trimmed, 1, '}')
      return safeStringify(obj, null, 2)
    }
  }
  // Java 数组/List toString: [{key=val, ...}, {key=val, ...}] 或 [key=val, key=val]
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.includes('=')) {
    const eqCount = (trimmed.match(/[{,]\s*\w[\w.]*\s*=/g) || []).length
    const colonCount = (trimmed.match(/[{,]\s*"?[a-zA-Z_$][\w.$]*"?\s*:/g) || []).length
    if (eqCount >= colonCount && eqCount > 0) {
      const [result] = parseJavaValue(trimmed, 0)
      if (result !== null && typeof result === 'object') {
        // 如果数组所有元素都是 key=value 字符串 → 转成对象
        if (Array.isArray(result) && result.every(e => typeof e === 'string' && e.includes('='))) {
          const obj = {}
          for (const e of result) {
            const eqIdx = e.indexOf('=')
            const key = e.substring(0, eqIdx).trim()
            const [val] = parseJavaValue(e.substring(eqIdx + 1).trim(), 0)
            obj[key] = val
          }
          return safeStringify(obj, null, 2)
        }
        return safeStringify(result, null, 2)
      }
    }
  }
  return null
}

// ═══ Python dict / repr 解析 ═══
export const convertPythonToJson = (text) => {
  let cleaned = text.trim()

  // OrderedDict([('a', 1), ('b', 2)])
  const odMatch = cleaned.match(/^OrderedDict\(\[(.*)\]\)$/s)
  if (odMatch) {
    cleaned = '{' + odMatch[1].replace(/\(([^)]+)\)/g, (_, inner) => {
      const parts = inner.split(/,\s*(.+)/)
      return parts[0] + ': ' + (parts[1] || 'null')
    }) + '}'
  }

  // defaultdict(<class 'xxx'>, {...})
  const ddMatch = cleaned.match(/^defaultdict\([^,]+,\s*(\{.*\})\)$/s)
  if (ddMatch) {
    cleaned = ddMatch[1]
  }

  // Python dataclass / namedtuple: ClassName(key='val', key2=42)
  const dcMatch = cleaned.match(/^[A-Z]\w*\((.+)\)$/s)
  if (dcMatch && dcMatch[1].includes('=')) {
    const inner = dcMatch[1]
    // Convert key=val pairs to 'key': val
    cleaned = '{' + inner.replace(/(\w+)\s*=/g, "'$1':") + '}'
  }

  // 检测是否看起来像 Python 格式
  const hasPythonTraits = (cleaned.includes("'") && (cleaned.startsWith('{') || cleaned.startsWith('[') || cleaned.startsWith('(')))
    || /\bTrue\b|\bFalse\b|\bNone\b/.test(cleaned)
  // 如果只有单引号而没有 Python 关键字/结构，可能是 JS/TS 单引号写法，留给 JS 解析器
  const hasPythonKeywords = /\bTrue\b|\bFalse\b|\bNone\b/.test(cleaned)
  const hasPythonStruct = /OrderedDict|defaultdict/.test(cleaned) || /^[A-Z]\w*\(.+\)$/.test(cleaned)
  if (!hasPythonTraits) return null
  if (!hasPythonKeywords && !hasPythonStruct && !odMatch) return null

  try {
    // Python → JS 语法转换
    let js = cleaned
      // tuple (...) → array [...]  (但不转 key(...) 调用)
      .replace(/([A-Za-z_])?\(/g, (match, p1) => p1 ? match : '[')
      .replace(/([A-Za-z_])?\)/g, (match, p1) => p1 ? match : ']')
      // Python 常量
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')

    const parsed = safeParseJsLike(js)
    if (parsed && typeof parsed === 'object') {
      return safeStringify(parsed, null, 2)
    }
  } catch (e) {}
  return null
}

// ═══ JS / TS 对象解析 ═══
export const convertJsUnquotedKeys = (text) => {
  return text.replace(/([{,]\s*)([a-zA-Z_$][\w.$]*)\s*:/g, '$1"$2":')
}

// TypeScript: 去除 as const / satisfies Type / 类型断言 / 前缀 const x: Type = / export
export const convertTypescriptToJs = (text) => {
  let cleaned = text.trim()
  // 去掉 export / export default / const xxx: Type =
  cleaned = cleaned.replace(/^(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+\w+\s*(?::\s*[^=]+?)?\s*=\s*/s, '')
  // 去掉尾部 as const / satisfies Xxx
  cleaned = cleaned.replace(/\s+as\s+const\s*;?\s*$/, '').replace(/\s+satisfies\s+\w[^;]*;?\s*$/, '')
  // 去掉尾分号
  cleaned = cleaned.replace(/;\s*$/, '')
  return cleaned
}

// 尝试用多种方式解析候选文本，返回 JSON 字符串或 null
export const tryParseCandidate = (candidate) => {
  // 1) 标准 JSON
  try { safeParse(candidate); return candidate } catch (e) {}

  // 2) TypeScript 去类型后尝试
  const tsClean = convertTypescriptToJs(candidate)
  if (tsClean !== candidate) {
    try { safeParse(tsClean); return tsClean } catch (e) {}
  }

  // 3) JS 对象字面量（无引号 key）
  const jsTarget = tsClean !== candidate ? tsClean : candidate
  try {
    const converted = convertJsUnquotedKeys(jsTarget)
    safeParse(converted)
    return converted
  } catch (e) {}

  // 4) Java flat key=value (Lombok @ToString / Kotlin data class)
  try {
    const converted = tryJavaFlatKeyValueToJson(candidate)
    if (converted) { safeParse(converted); return converted }
  } catch (e) {}

  // 5) Java toString 递归解析
  try {
    const converted = convertJavaToJson(candidate)
    if (converted) { safeParse(converted); return converted }
  } catch (e) {}

  // 5) Python dict / repr
  try {
    const converted = convertPythonToJson(candidate)
    if (converted) { safeParse(converted); return converted }
  } catch (e) {}

  // 6) Ruby Hash（:key => "value" 或 {key: "value"} 带 Ruby 特征）
  try {
    const converted = tryRubyHashToJson(candidate)
    if (converted) { safeParse(converted); return converted }
  } catch (e) {}

  // 7) 安全解析 JS/TS 宽松语法（单引号字符串、尾逗号、无引号 key）
  try {
    const target = tsClean !== candidate ? tsClean : candidate
    const parsed = safeParseJsLike(target)
    if (parsed && typeof parsed === 'object') {
      return safeStringify(parsed)
    }
  } catch (e) {}

  return null
}

// 扫描文本中匹配的括号对，提取 JSON 结构
export const scanBraces = (text, openChar, closeChar) => {
  const matches = []
  let index = 0
  while (true) {
    const start = text.indexOf(openChar, index)
    if (start === -1) break

    let depth = 0, inString = false, inSingle = false, escape = false
    let end = -1

    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"' && !inSingle) { inString = !inString; continue }
      if (ch === "'" && !inString) { inSingle = !inSingle; continue }

      if (!inString && !inSingle) {
        if (ch === openChar) depth++
        else if (ch === closeChar) { depth--; if (depth === 0) { end = i; break } }
      }
    }

    if (end !== -1) {
      const candidate = text.substring(start, end + 1)
      const result = tryParseCandidate(candidate)
      if (result) matches.push({ text: result, start })
    }
    index = start + 1
  }
  return matches
}

// 尝试从 XML 文本中提取数据转 JSON
export const tryXmlToJson = (text) => {
  if (!/^\s*</.test(text) || !/>\s*$/.test(text.trim())) return null
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    if (doc.querySelector('parsererror')) return null

    const nodeToObj = (node) => {
      if (node.children.length === 0) return node.textContent?.trim() || ''
      const obj = {}
      for (const child of node.children) {
        const tag = child.tagName
        const val = nodeToObj(child)
        if (obj[tag] !== undefined) {
          if (!Array.isArray(obj[tag])) obj[tag] = [obj[tag]]
          obj[tag].push(val)
        } else {
          obj[tag] = val
        }
      }
      return obj
    }
    const result = { [doc.documentElement.tagName]: nodeToObj(doc.documentElement) }
    return safeStringify(result, null, 2)
  } catch (e) { return null }
}

// 尝试 YAML → JSON
export const tryYamlToJson = (text) => {
  const lines = text.split('\n')
  if (lines.length < 2) return null
  // 至少有两行含 `key: value` 或 `- item` 格式
  const yamlLineRe = /^(\s*)([\w][\w.-]*)\s*:\s*(.*)$|^(\s*)-\s+(.*)$/
  let yamlCount = 0
  for (const line of lines) {
    const trimmed = line.trimEnd()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (yamlLineRe.test(trimmed)) yamlCount++
  }
  if (yamlCount < 2) return null

  const parseValue = (v) => {
    if (v === '' || v === '~' || v === 'null') return null
    if (v === 'true') return true
    if (v === 'false') return false
    if (/^-?\d+$/.test(v)) return parseInt(v, 10)
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      return v.slice(1, -1)
    return v
  }

  try {
    const root = {}
    const stack = [{ obj: root, indent: -1 }]

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].replace(/\r$/, '')
      const trimmed = raw.trimEnd()
      if (!trimmed || trimmed.trimStart().startsWith('#')) continue

      const indent = raw.search(/\S/)
      // pop stack to parent level
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
      const parent = stack[stack.length - 1]

      const kvMatch = trimmed.match(/^(\s*)([\w][\w.-]*)\s*:\s*(.*)$/)
      if (kvMatch) {
        const key = kvMatch[2]
        const val = kvMatch[3].trimEnd()
        if (val === '' || val === '|' || val === '>') {
          // nested object or block scalar — treat as nested object for now
          const child = {}
          if (Array.isArray(parent.obj)) parent.obj.push({ [key]: child })
          else parent.obj[key] = child
          stack.push({ obj: child, indent: indent, key })
        } else {
          if (Array.isArray(parent.obj)) parent.obj.push({ [key]: parseValue(val) })
          else parent.obj[key] = parseValue(val)
        }
        continue
      }

      const listMatch = trimmed.match(/^(\s*)-\s+(.*)$/)
      if (listMatch) {
        const val = listMatch[2].trim()
        // ensure parent has an array
        const p = stack[stack.length - 1]
        if (!Array.isArray(p.obj) && p.key) {
          const arr = []
          const grandParent = stack.length > 1 ? stack[stack.length - 2] : stack[0]
          grandParent.obj[p.key] = arr
          p.obj = arr
        }
        if (Array.isArray(p.obj)) {
          const kvInList = val.match(/^([\w][\w.-]*)\s*:\s*(.*)$/)
          if (kvInList) {
            const child = { [kvInList[1]]: parseValue(kvInList[2]) }
            p.obj.push(child)
            stack.push({ obj: child, indent: indent + 2 })
          } else {
            p.obj.push(parseValue(val))
          }
        }
        continue
      }
    }

    const keys = Object.keys(root)
    if (keys.length === 0) return null
    return safeStringify(root, null, 2)
  } catch (e) { return null }
}

// 尝试 TOML → JSON
export const tryTomlToJson = (text) => {
  const lines = text.split('\n')
  const sectionRe = /^\s*\[([^\]]+)\]\s*$/
  const kvRe = /^\s*([\w][\w.-]*)\s*=\s*(.+)$/
  let tomlCount = 0
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    if (sectionRe.test(t) || kvRe.test(t)) tomlCount++
  }
  if (tomlCount < 2) return null

  try {
    const result = {}
    let current = result

    const parseVal = (v) => {
      v = v.trim()
      if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1)
      if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
      if (v === 'true') return true
      if (v === 'false') return false
      if (/^-?\d+$/.test(v)) return parseInt(v, 10)
      if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v)
      if (v.startsWith('[') && v.endsWith(']')) {
        try { return safeParse(v.replace(/'/g, '"')) } catch (e) { return v }
      }
      // 逗号分隔 → 数组（每项做类型推断）
      if (v.includes(',')) {
        return v.split(',').map(item => {
          const t = item.trim()
          if (t === 'true') return true
          if (t === 'false') return false
          if (t === '' || t === 'null') return null
          if (/^-?\d+$/.test(t)) return parseInt(t, 10)
          if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t)
          return t
        })
      }
      return v
    }

    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const secMatch = t.match(sectionRe)
      if (secMatch) {
        const path = secMatch[1].split('.')
        current = result
        for (const p of path) {
          if (!current[p]) current[p] = {}
          current = current[p]
        }
        continue
      }
      const kvMatch = t.match(kvRe)
      if (kvMatch) {
        setNestedValue(current, kvMatch[1], parseVal(kvMatch[2]))
      }
    }

    if (Object.keys(result).length === 0) return null
    return safeStringify(result, null, 2)
  } catch (e) { return null }
}

// 尝试 URL Query String → JSON
export const tryQueryStringToJson = (text) => {
  const trimmed = text.trim()
  let qs = trimmed
  const qIdx = trimmed.indexOf('?')
  if (qIdx !== -1) qs = trimmed.substring(qIdx + 1)
  const hIdx = qs.indexOf('#')
  if (hIdx !== -1) qs = qs.substring(0, hIdx)
  if (qs.includes('\n') || !qs.includes('=') || qs.includes(' ')) return null
  const pairs = qs.split('&')
  if (pairs.length < 1 || pairs.some(p => !p.includes('='))) return null

  try {
    const result = {}
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=')
      let key = decodeURIComponent(pair.substring(0, eqIdx))
      const val = decodeURIComponent(pair.substring(eqIdx + 1))
      const arrMatch = key.match(/^(.+)\[\d*\]$/)
      if (arrMatch) {
        key = arrMatch[1]
        if (!Array.isArray(result[key])) result[key] = result[key] !== undefined ? [result[key]] : []
        result[key].push(val)
      } else if (result[key] !== undefined) {
        if (!Array.isArray(result[key])) result[key] = [result[key]]
        result[key].push(val)
      } else {
        result[key] = val
      }
    }
    if (Object.keys(result).length === 0) return null
    return safeStringify(result, null, 2)
  } catch (e) { return null }
}

// 尝试 CSV/TSV → JSON (数组对象)
export const tryCsvToJson = (text) => {
  const lines = text.trim().split('\n').map(l => l.trimEnd())
  if (lines.length < 2) return null
  const sep = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''))
  if (headers.length < 2 || headers.some(h => !h)) return null
  let matchCount = 0
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = lines[i].split(sep)
    if (cols.length === headers.length) matchCount++
  }
  if (matchCount < 1) return null

  try {
    const result = []
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
      const row = {}
      for (let j = 0; j < headers.length; j++) {
        const v = cols[j] || ''
        if (v === 'true') row[headers[j]] = true
        else if (v === 'false') row[headers[j]] = false
        else if (v === '' || v === 'null') row[headers[j]] = null
        else if (/^-?\d+$/.test(v)) row[headers[j]] = parseInt(v, 10)
        else if (/^-?\d+\.\d+$/.test(v)) row[headers[j]] = parseFloat(v)
        else row[headers[j]] = v
      }
      result.push(row)
    }
    if (result.length === 0) return null
    return safeStringify(result, null, 2)
  } catch (e) { return null }
}

// 共享：点号路径写入嵌套对象  user.id → {user:{id:val}}
const setNestedValue = (obj, dottedKey, value) => {
  if (!dottedKey.includes('.')) { obj[dottedKey] = value; return }
  const parts = dottedKey.split('.')
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!current[p] || typeof current[p] !== 'object' || Array.isArray(current[p])) {
      current[p] = {}
    }
    current = current[p]
  }
  current[parts[parts.length - 1]] = value
}

// 尝试 Properties / .env / INI → JSON
export const tryPropertiesToJson = (text) => {
  const lines = text.split('\n')
  const sectionRe = /^\s*\[([^\]]+)\]\s*$/
  const kvRe = /^\s*([\w][\w.-]*)\s*[=:]\s*(.*)$/
  let kvCount = 0
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('!') || t.startsWith('//')) continue
    if (kvRe.test(t) || sectionRe.test(t)) kvCount++
  }
  if (kvCount < 2) return null
  const hasEquals = lines.some(l => /^\s*[\w][\w.-]*\s*=/.test(l.trim()))
  if (!hasEquals) return null

  // 区分 TOML：如果大部分值用引号包裹（如 key = "val"），则是 TOML 而非 Properties
  let quotedVals = 0, bareVals = 0
  for (const line of lines) {
    const m = line.trim().match(kvRe)
    if (m) {
      const v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) quotedVals++
      else if (v) bareVals++
    }
  }
  const hasSection = lines.some(l => sectionRe.test(l.trim()))
  if (hasSection && quotedVals > 0) return null  // 有 section + 引号值 → TOML
  if (quotedVals >= bareVals && quotedVals > 0) return null  // 大部分是引号值 → TOML

  try {
    const result = {}
    let current = result

    const parseVal = (v) => {
      v = v.trim()
      if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1)
      if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
      if (v === 'true') return true
      if (v === 'false') return false
      if (v === '' || v === 'null') return null
      // 逗号分隔列表 → 数组（每项做类型推断）
      if (v.includes(',')) {
        return v.split(',').map(item => {
          const t = item.trim()
          if (t === 'true') return true
          if (t === 'false') return false
          if (t === '' || t === 'null') return null
          if (/^-?\d+$/.test(t)) return parseInt(t, 10)
          if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t)
          return t
        })
      }
      if (/^-?\d+$/.test(v)) return parseInt(v, 10)
      if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v)
      return v
    }

    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#') || t.startsWith('!') || t.startsWith('//')) continue
      const secMatch = t.match(sectionRe)
      if (secMatch) {
        const name = secMatch[1].trim()
        // 支持 [a.b.c] 嵌套 section
        const parts = name.split('.')
        current = result
        for (const p of parts) {
          if (!current[p] || typeof current[p] !== 'object') current[p] = {}
          current = current[p]
        }
        continue
      }
      const kvMatch = t.match(kvRe)
      if (kvMatch) {
        setNestedValue(current, kvMatch[1], parseVal(kvMatch[2]))
      }
    }
    if (Object.keys(result).length === 0) return null
    return safeStringify(result, null, 2)
  } catch (e) { return null }
}

// ═══ 残缺 JSON 自动修复 ═══
// 补全缺失的 closing brackets / braces / quotes，使截断的 JSON 可解析
export const tryRepairJson = (text) => {
  const trimmed = text.trim()
  if (!trimmed) return null

  let start = -1
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{' || trimmed[i] === '[') { start = i; break }
  }
  if (start === -1) return null

  const input = trimmed.substring(start)
  const stack = []
  let result = ''
  let inString = false
  let escape = false
  let repaired = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (escape) { escape = false; result += ch; continue }
    if (ch === '\\' && inString) { escape = true; result += ch; continue }

    if (inString) {
      if (ch === '"') inString = false
      result += ch
      continue
    }

    if (ch === '"') { inString = true; result += ch; continue }

    if (ch === '{') { stack.push('}'); result += ch; continue }
    if (ch === '[') { stack.push(']'); result += ch; continue }

    if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop()
        result += ch
      } else {
        const idx = stack.lastIndexOf(ch)
        if (idx >= 0) {
          for (let j = stack.length - 1; j > idx; j--) { result += stack.pop(); repaired = true }
          stack.pop()
          result += ch
        }
      }
      continue
    }

    result += ch
  }

  if (!inString && stack.length === 0 && !repaired) return null

  if (inString) result += '"'

  result = result.replace(/,\s*$/, '')
  result = result.replace(/,\s*"[^"]*"\s*:\s*$/, '')
  result = result.replace(/:\s*$/, ': null')

  while (stack.length > 0) result += stack.pop()

  try {
    const parsed = safeParse(result)
    if (parsed && typeof parsed === 'object') {
      return safeStringify(parsed, null, 2)
    }
  } catch (_) {}

  try {
    const parsed = safeParseJsLike(result)
    if (parsed && typeof parsed === 'object') {
      return safeStringify(parsed, null, 2)
    }
  } catch (_) {}

  return null
}

// 主提取函数，返回 { json, format } 或抛异常
export const extractJsonFromText = (text) => {
  let trimmed = text.trim()

  // ── Pre-process: 剥离 Markdown 代码围栏 ``` ... ``` ──
  // 标准格式：围栏独占一行（有换行分隔）
  if (/^```[\w-]*\s*\r?\n/.test(trimmed) && /\r?\n```\s*$/.test(trimmed)) {
    let s = trimmed
    s = s.replace(/^```[\w-]*\s*\r?\n/, '')
    s = s.replace(/\r?\n```\s*$/, '')
    if (s.trim()) trimmed = s.trim()
  }
  // 内联格式：围栏和内容在同一行，如 ```ClassName{...}```（不加语言标识，否则走标准分支）
  const inlineFence = trimmed.match(/^```\s*([\s\S]+?)\s*```\s*$/)
  if (inlineFence) {
    const inner = inlineFence[1].trim()
    // 确保内容不是语言标识（如 ```java```）
    if (inner && !/^[\w-]+$/.test(inner)) trimmed = inner
  }

  // ── Pre-process: MongoDB Shell 类型 → 标准 JSON ──
  const mongoResult = tryMongoShellToJson(trimmed)
  if (mongoResult) return { json: mongoResult, format: 'MongoDB Shell' }

  // ── Pre-process: 转义 JSON 字符串（"{\"key\":\"val\"}"）→ 内层 JSON ──
  const unescapeResult = tryUnescapeJsonString(trimmed)
  if (unescapeResult) return { json: unescapeResult, format: '转义 JSON' }

  // ── Pre-process: Go map 语法 → 标准 JSON ──
  const goMapResult = tryGoMapToJson(trimmed)
  if (goMapResult) return { json: goMapResult, format: 'Go map' }

  // ── Pre-process: JSONP 回调包裹剥离（jQuery1123({...}) 等） ──
  // 注意：OrderedDict(...)/defaultdict(...) 不是 JSONP，是 Python
  const jsonpRe = /^[a-zA-Z_$][\w.$]*\s*\(\s*([\s\S]*)\s*\);?\s*$/
  const jsonpMatch = trimmed.match(jsonpRe)
  const isPythonWrapper = /^(OrderedDict|defaultdict)\s*\(/i.test(trimmed)
  if (jsonpMatch && !isPythonWrapper) {
    const inner = jsonpMatch[1].trim()
    const jsonpResult = tryParseCandidate(inner)
    if (jsonpResult) return { json: jsonpResult, format: 'JS 对象' }
  }

  // ── Pre-process: JSONC/JSON5 注释剥离后再解析 ──
  // 排除 URL 中的 :// 误判为注释
  const hasRealComment = /(^|[^:])\/\//.test(trimmed) || /\/\*/.test(trimmed)
  if (hasRealComment) {
    const noComment = stripJsonComments(trimmed)
    const commentResult = tryParseCandidate(noComment)
    if (commentResult) return { json: commentResult, format: 'JSONC' }
  }

  // ── 先尝试整体解析 ──
  const directResult = tryParseCandidate(trimmed)
  if (directResult) {
    try { safeParse(trimmed); return { json: directResult, format: 'JSON' } } catch (e) {}
    const tsClean = convertTypescriptToJs(trimmed)
    if (tsClean !== trimmed) {
      try { safeParse(tsClean); return { json: directResult, format: 'TypeScript' } } catch (e) {}
    }
    try { if (tryJavaFlatKeyValueToJson(trimmed)) return { json: directResult, format: 'Java flat KV' } } catch (e) {}
    try { if (convertJavaToJson(trimmed)) return { json: directResult, format: 'Java toString' } } catch (e) {}
    try { if (convertPythonToJson(trimmed)) return { json: directResult, format: 'Python dict' } } catch (e) {}
    try { if (tryRubyHashToJson(trimmed)) return { json: directResult, format: 'Ruby Hash' } } catch (e) {}
    return { json: directResult, format: 'JS 对象' }
  }

  // ── 再尝试 XML ──
  const xmlResult = tryXmlToJson(text)
  if (xmlResult) return { json: xmlResult, format: 'XML' }

  // ── YAML ──
  const yamlResult = tryYamlToJson(text)
  if (yamlResult) return { json: yamlResult, format: 'YAML' }

  // ── Properties / .env / INI (before TOML to avoid misdetection) ──
  const propsResult = tryPropertiesToJson(text)
  if (propsResult) return { json: propsResult, format: 'Properties' }

  // ── TOML ──
  const tomlResult = tryTomlToJson(text)
  if (tomlResult) return { json: tomlResult, format: 'TOML' }

  // ── URL Query String ──
  const qsResult = tryQueryStringToJson(text)
  if (qsResult) return { json: qsResult, format: 'Query String' }

  // ── CSV / TSV ──
  const csvResult = tryCsvToJson(text)
  if (csvResult) return { json: csvResult, format: 'CSV' }

  // ── Markdown Table ──
  const mdResult = tryMarkdownTableToJson(text)
  if (mdResult) return { json: mdResult, format: 'Markdown Table' }

  // ── PHP print_r / var_export ──
  const phpResult = tryPhpPrintRToJson(text)
  if (phpResult) return { json: phpResult, format: 'PHP print_r' }

  // ── 尝试自动修复残缺 JSON（缺少闭合括号/引号） ──
  const repaired = tryRepairJson(trimmed)
  if (repaired) return { json: repaired, format: 'JSON (自动修复)' }

  // 如果输入看起来已经是完整的 JSON 结构（以 {/[ 开头，}/] 结尾），
  // 但前面所有整体解析和修复都失败了，说明这确实是一个包含语法错误的 JSON。
  // 此时不应提取其内部的局部子对象，否则会导致用户输入被截断/篡改。
  const looksLikeJson = /^\s*[{\[]/.test(trimmed) && /[}\]]\s*$/.test(trimmed)
  if (looksLikeJson) {
    throw new Error('JSON 解析失败。')
  }

  // ── 扫描所有 {...}、[...] 和 (...) ──
  const all = [
    ...scanBraces(text, '{', '}'),
    ...scanBraces(text, '[', ']'),
    ...scanBraces(text, '(', ')'),
  ]

  if (all.length > 0) {
    all.sort((a, b) => b.text.length - a.text.length)
    return { json: all[0].text, format: '混合文本' }
  }

  throw new Error('未能在文本中定位到任何有效的 JSON / JS / TS / Java / Python / Ruby / Go map / XML / YAML / TOML / Markdown Table / CSV / Query String / Properties / PHP / MongoDB / 转义 JSON 结构。')
}
