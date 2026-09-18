// src/utils/jsonValueDecoder.js
// 格式化时自动解码 URL 编码（如中文 URL、查询参数）与 Unicode 转义序列

import { HAS_UNICODE_ESCAPE_RE, fromUnicodeEscape } from './capsuleDetector.js'

const URL_ENCODED_RE = /%[0-9a-fA-F]{2}/

/**
 * 安全解码包含 URL 百分号编码的字符串
 * 针对含有孤立 % 字符（如 "100% discount"）的场景不会抛出 URIError 异常
 * @param {string} str
 * @returns {string}
 */
export function safeDecodeUrlString(str) {
  if (typeof str !== 'string' || !str) return str
  if (!URL_ENCODED_RE.test(str)) return str

  try {
    return decodeURIComponent(str)
  } catch (_) {
    // 若整串 decodeURIComponent 失败，安全识别并逐段替换有效的 UTF-8 连续百分号编码块
    return str.replace(/(%[0-9a-fA-F]{2})+/g, (match) => {
      try {
        return decodeURIComponent(match)
      } catch (__) {
        return match
      }
    })
  }
}

/**
 * 安全解码包含 Unicode 转义的字符串（支持 \uXXXX、\\uXXXX 与辅助平面 Emoji 代理对）
 * @param {string} str
 * @returns {string}
 */
export function safeDecodeUnicodeString(str) {
  if (typeof str !== 'string' || !str) return str
  if (!HAS_UNICODE_ESCAPE_RE.test(str)) return str
  return fromUnicodeEscape(str)
}

/**
 * 文本级极速 Unicode 解码流水线（基于 V8 原生 C++ 正则引擎）
 * 专为 20万行+ 海量数据设计，避免在主线程中深度递归遍历数十万个 JS 对象
 * 针对双引号(0x22)、反斜杠(0x5c)、控制字符(0x00-0x1f)实施严格语法保护，严防破坏 JSON 结构
 * @param {string} text
 * @returns {string}
 */
export function fastDecodeUnicodeText(text) {
  if (typeof text !== 'string' || !text.includes('\\u')) return text

  return text.replace(/\\\\u([dD][89abAB][0-9a-fA-F]{2})\\\\u([dD][c-fC-F][0-9a-fA-F]{2})|\\\\u([0-9a-fA-F]{4})|\\\\u\{([0-9a-fA-F]+)\}/g, (match, highHex, lowHex, hex4, hexVar) => {
    try {
      if (highHex && lowHex) {
        const high = parseInt(highHex, 16)
        const low = parseInt(lowHex, 16)
        const cp = (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
        return String.fromCodePoint(cp)
      }
      const hex = hex4 || hexVar
      const cp = parseInt(hex, 16)
      // 特殊保留字符保护：双引号(0x22)、反斜杠(0x5c)、控制字符(0x00-0x1f) 不能直接还原为裸字符
      if (cp === 0x22 || cp === 0x5c || cp < 0x20) {
        return match
      }
      return String.fromCodePoint(cp)
    } catch (_) {
      return match
    }
  })
}

/**
 * 递归处理 JSON 解析后的对象/数组，按配置执行 URL 解码和 Unicode 解码
 * 保留 LosslessNumber、BigInt 等大数结构完整无损
 * @param {any} obj - 目标对象
 * @param {Object} options
 * @param {boolean} [options.urlDecode=false] - 是否开启 URL 自动解码
 * @param {boolean} [options.unicodeDecode=false] - 是否开启 Unicode 自动解码
 * @returns {any} 处理后的全新对象
 */
export function transformJsonValues(obj, { urlDecode = false, unicodeDecode = false, rawText = '' } = {}) {
  if (!urlDecode && !unicodeDecode) return obj
  if (obj === null || obj === undefined) return obj

  // 快速前置检查：若传入了原始文本，且既不包含 % 也不包含 \u，则不可能存在需要解码的内容，直接瞬返
  if (rawText && typeof rawText === 'string') {
    const hasPercent = urlDecode && rawText.includes('%')
    const hasUnicode = unicodeDecode && rawText.includes('\\u')
    if (!hasPercent && !hasUnicode) return obj

    // 若原始文本超过 50,000 字符且仅需 Unicode 解码，则不需要遍历对象树，由 fastDecodeUnicodeText 文本流水线全权处理
    if (rawText.length > 50_000 && unicodeDecode && !hasPercent) {
      return obj
    }
  }

  let nodeCount = 0
  const MAX_NODES = 100_000

  function walk(val) {
    if (val === null || val === undefined) {
      return val
    }
    if (++nodeCount > MAX_NODES) {
      return val
    }

    if (typeof val === 'string') {
      let res = val
      if (unicodeDecode && HAS_UNICODE_ESCAPE_RE.test(res)) {
        res = safeDecodeUnicodeString(res)
      }
      if (urlDecode && URL_ENCODED_RE.test(res)) {
        res = safeDecodeUrlString(res)
      }
      return res
    }

    if (Array.isArray(val)) {
      let changed = false
      const len = val.length
      const newArr = new Array(len)
      for (let i = 0; i < len; i++) {
        const item = val[i]
        const newItem = walk(item)
        newArr[i] = newItem
        if (newItem !== item) changed = true
      }
      return changed ? newArr : val
    }

    if (typeof val === 'object') {
      // 保持 LosslessNumber 等数值包装对象原样返回
      if (val.__isLosslessNumber) return val

      let changed = false
      const keys = Object.keys(val)
      const newObj = {}
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        let newKey = key
        if (unicodeDecode && HAS_UNICODE_ESCAPE_RE.test(newKey)) {
          newKey = safeDecodeUnicodeString(newKey)
        }
        if (urlDecode && URL_ENCODED_RE.test(newKey)) {
          newKey = safeDecodeUrlString(newKey)
        }
        if (newKey !== key) changed = true

        const item = val[key]
        const newItem = walk(item)
        if (newItem !== item) changed = true
        newObj[newKey] = newItem
      }
      return changed ? newObj : val
    }

    return val
  }

  return walk(obj)
}
