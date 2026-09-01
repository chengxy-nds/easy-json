// ─── 安全 JSON 解析/序列化：保留大整数精度 ───
// JavaScript Number 类型只能安全表示 [-(2^53-1), 2^53-1] 范围内的整数
// (即 ±9,007,199,254,740,991，16 位数字)。
// 超过此范围的大整数（如 2086639615434764289）经过原生 JSON.parse 会丢失精度。
//
// 解决方案：
// 1. 解析时精准识别字符串外的裸大整数（>= 16 位），转为 BigInt 原生类型（不影响字符串内的任何内容）。
// 2. 序列化时将 BigInt 还原为无引号的裸数字，保持字符串（如 "09031098211943076652"）完整保留引号与类型。

const BIGINT_TAG = '__EJ_BIGINT__'

/**
 * 扫描 JSON 字符串，精确定位字符串字面量外的裸大整数（>= 16 位），
 * 用占位标记包裹，以便 JSON.parse 结合 reviver 精确转换为 BigInt。
 * 彻底跳过所有双引号字符串及转义字符，避免误伤字符串内容。
 */
export const protectBigInts = (jsonStr) => {
  let result = ''
  let i = 0
  const len = jsonStr.length

  while (i < len) {
    const ch = jsonStr[i]

    // 跳过双引号字符串
    if (ch === '"') {
      let j = i + 1
      while (j < len) {
        if (jsonStr[j] === '\\') {
          j += 2
        } else if (jsonStr[j] === '"') {
          j++
          break
        } else {
          j++
        }
      }
      result += jsonStr.slice(i, j)
      i = j
      continue
    }

    // 检测字符串外的数字：以数字或负号+数字开头
    if ((ch >= '0' && ch <= '9') || (ch === '-' && i + 1 < len && jsonStr[i + 1] >= '0' && jsonStr[i + 1] <= '9')) {
      let j = i
      if (jsonStr[j] === '-') j++
      const startDigits = j
      while (j < len && jsonStr[j] >= '0' && jsonStr[j] <= '9') {
        j++
      }
      const numDigits = j - startDigits
      // 判断是否跟随小数点或科学计数法指数（浮点数）
      const hasFractionOrExp = j < len && (jsonStr[j] === '.' || jsonStr[j] === 'e' || jsonStr[j] === 'E')

      if (numDigits >= 16 && !hasFractionOrExp) {
        const numStr = jsonStr.slice(i, j)
        result += `"${BIGINT_TAG}${numStr}"`
        i = j
        continue
      } else {
        // 普通数字或浮点数
        while (j < len && /[0-9.eE+-]/.test(jsonStr[j])) {
          j++
        }
        result += jsonStr.slice(i, j)
        i = j
        continue
      }
    }

    result += ch
    i++
  }

  return result
}

/**
 * 安全解析 JSON 字符串，将大整数转为 BigInt 保留精度。
 * @param {string} jsonStr - 原始 JSON 字符串
 * @returns {any} 解析后的对象（大整数以 BigInt 形式存在）
 */
export const safeParse = (jsonStr) => {
  if (typeof jsonStr !== 'string') return jsonStr
  // Fast path: 绝大多数 JSON 不含 16 位以上大整数，直接使用 V8 原生 JSON.parse，速度提升 10 倍以上
  if (!/\d{16,}/.test(jsonStr)) {
    return JSON.parse(jsonStr)
  }
  const protectedStr = protectBigInts(jsonStr)
  return JSON.parse(protectedStr, (k, v) => {
    if (typeof v === 'string' && v.startsWith(BIGINT_TAG)) {
      try {
        return BigInt(v.slice(BIGINT_TAG.length))
      } catch (e) {
        return v
      }
    }
    return v
  })
}

/**
 * 安全序列化对象为 JSON 字符串，将 BigInt 还原为裸数字。
 * @param {any} obj - 要序列化的对象
 * @param {function|array|null} replacer - 同 JSON.stringify 的 replacer
 * @param {number|string} space - 同 JSON.stringify 的 space
 * @returns {string} JSON 字符串（大整数以裸数字形式存在，字符串不变）
 */
export const safeStringify = (obj, replacer, space) => {
  const customReplacer = typeof replacer === 'function' ? replacer : null

  const wrappedReplacer = function (key, value) {
    if (customReplacer) {
      value = customReplacer.call(this, key, value)
    }
    if (typeof value === 'bigint') {
      return `${BIGINT_TAG}${value.toString()}`
    }
    return value
  }

  const json = JSON.stringify(obj, wrappedReplacer, space)
  if (!json || !json.includes(BIGINT_TAG)) {
    return json
  }
  return json.replace(new RegExp(`"${BIGINT_TAG}(-?\\d+)"`, 'g'), '$1')
}
