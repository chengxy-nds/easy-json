/**
 * jsonPathRange.js - 快速精确计算指定 JSON 路径在原始文本中的字符起止偏移量 [start, end]
 * 用于点击路径面包屑时自动在编辑器中选中整个对应的 JSON 区域
 */

export function getJsonPathRange(text, targetPath) {
  if (!text || typeof text !== 'string') return null
  if (!targetPath || !Array.isArray(targetPath) || targetPath.length === 0) {
    return { start: 0, end: text.length }
  }

  let i = 0
  const len = text.length

  function skipWhitespace() {
    while (i < len && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
      i++
    }
  }

  function readString() {
    const start = i
    i++ // skip open quote
    while (i < len) {
      if (text[i] === '\\') {
        i += 2
      } else if (text[i] === '"') {
        i++
        break
      } else {
        i++
      }
    }
    const raw = text.substring(start, i)
    let parsed = raw
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      parsed = raw.replace(/^"|"$/g, '')
    }
    return { start, end: i, value: parsed, raw }
  }

  function readPrimitive() {
    const start = i
    while (i < len && !/[,\s}\]]/.test(text[i])) {
      i++
    }
    return { start, end: i, raw: text.substring(start, i) }
  }

  function isPathEqual(p1, p2) {
    if (p1.length !== p2.length) return false
    for (let k = 0; k < p1.length; k++) {
      if (String(p1[k]) !== String(p2[k])) return false
    }
    return true
  }

  function parseValue(currentPath) {
    skipWhitespace()
    if (i >= len) return null

    const char = text[i]
    if (char === '{') {
      const objStart = i
      i++ // skip '{'
      skipWhitespace()

      let matchedResult = null
      let isFirst = true

      while (i < len && text[i] !== '}') {
        if (!isFirst) {
          if (text[i] === ',') {
            i++
            skipWhitespace()
          }
        }
        isFirst = false
        skipWhitespace()
        if (i >= len || text[i] === '}') break

        if (text[i] !== '"') {
          readPrimitive()
          continue
        }

        const keyInfo = readString()
        skipWhitespace()
        if (i < len && text[i] === ':') {
          i++ // skip ':'
        }
        skipWhitespace()

        const childPath = [...currentPath, keyInfo.value]
        const isTarget = isPathEqual(childPath, targetPath)
        const propStart = keyInfo.start

        const valInfo = parseValue(childPath)
        const propEnd = valInfo ? valInfo.end : i

        if (isTarget) {
          matchedResult = { start: propStart, end: propEnd }
        } else if (valInfo && valInfo.isMatch) {
          matchedResult = valInfo
        }

        skipWhitespace()
      }

      if (i < len && text[i] === '}') {
        i++
      }
      const objEnd = i

      if (matchedResult) return { ...matchedResult, isMatch: true }
      return { start: objStart, end: objEnd }
    } else if (char === '[') {
      const arrStart = i
      i++ // skip '['
      skipWhitespace()

      let matchedResult = null
      let elemIndex = 0
      let isFirst = true

      while (i < len && text[i] !== ']') {
        if (!isFirst) {
          if (text[i] === ',') {
            i++
            skipWhitespace()
          }
        }
        isFirst = false
        skipWhitespace()
        if (i >= len || text[i] === ']') break

        const childPath = [...currentPath, elemIndex]
        const isTarget = isPathEqual(childPath, targetPath)
        const elemStart = i

        const valInfo = parseValue(childPath)
        const elemEnd = valInfo ? valInfo.end : i

        if (isTarget) {
          matchedResult = { start: elemStart, end: elemEnd }
        } else if (valInfo && valInfo.isMatch) {
          matchedResult = valInfo
        }

        elemIndex++
        skipWhitespace()
      }

      if (i < len && text[i] === ']') {
        i++
      }
      const arrEnd = i

      if (matchedResult) return { ...matchedResult, isMatch: true }
      return { start: arrStart, end: arrEnd }
    } else if (char === '"') {
      const strInfo = readString()
      return { start: strInfo.start, end: strInfo.end }
    } else {
      const primInfo = readPrimitive()
      return { start: primInfo.start, end: primInfo.end }
    }
  }

  try {
    const res = parseValue([])
    if (res && res.isMatch) {
      return { start: res.start, end: res.end }
    }
  } catch (err) {
    console.error('getJsonPathRange error:', err)
  }
  return null
}
