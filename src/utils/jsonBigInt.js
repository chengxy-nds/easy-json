// ─── 安全 JSON 解析/序列化：保留大整数与高精度浮点数精度 ───
// JavaScript Number 类型只能安全表示 [-(2^53-1), 2^53-1] 范围内的整数
// (即 ±9,007,199,254,740,991，16 位数字)。
// 超过此范围的大整数（如 2086639615434764289）或超出有效数字范围的长浮点数（如 385667554481374111.123456000000）
// 经过原生 JSON.parse 会丢失精度。
//
// 解决方案：
// 1. 纯大整数（>= 16 位）：转为 BigInt 原生类型。
// 2. 高精度浮点数 / 长小数（整数 >= 16 位或有效数字 > 15 位或保留小数末位零）：转为轻量无损数字对象 LosslessNumber。
// 3. 序列化时将 BigInt 与 LosslessNumber 还原为无引号的裸数字，保持原生数字格式与精度。

const BIGINT_TAG = '__EJ_BIGINT__'
const BIGDECIMAL_TAG = '__EJ_BIGDEC__'

/**
 * 轻量无损数值包装类，用于存储带小数或超长有效数字的高精度数值
 */
export class LosslessNumber {
  constructor(value) {
    this.value = String(value)
    this.__isLosslessNumber = true
  }

  toString() {
    return this.value
  }

  valueOf() {
    return this.value
  }

  toJSON() {
    return `${BIGDECIMAL_TAG}${this.value}`
  }

  [Symbol.toPrimitive](hint) {
    if (hint === 'number') {
      return Number(this.value)
    }
    return this.value
  }
}

/**
 * 判定目标是否为 LosslessNumber 实例
 */
export const isLosslessNumber = (val) => {
  return val != null && (val instanceof LosslessNumber || val.__isLosslessNumber === true)
}

/**
 * 扫描 JSON 字符串，精确定位字符串字面量外的裸大整数与高精度长浮点数，
 * 用占位标记包裹，以便 JSON.parse 结合 reviver 精确转换为 BigInt 或 LosslessNumber。
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
      const intStart = j
      while (j < len && jsonStr[j] >= '0' && jsonStr[j] <= '9') {
        j++
      }
      const intDigits = j - intStart

      let hasDecimal = false
      if (j < len && jsonStr[j] === '.') {
        hasDecimal = true
        j++
        while (j < len && jsonStr[j] >= '0' && jsonStr[j] <= '9') {
          j++
        }
      }

      let hasExp = false
      if (j < len && (jsonStr[j] === 'e' || jsonStr[j] === 'E')) {
        hasExp = true
        j++
        if (j < len && (jsonStr[j] === '+' || jsonStr[j] === '-')) {
          j++
        }
        while (j < len && jsonStr[j] >= '0' && jsonStr[j] <= '9') {
          j++
        }
      }

      const numStr = jsonStr.slice(i, j)

      if (!hasDecimal && !hasExp) {
        // 纯整数：>= 16 位转为 BigInt
        if (intDigits >= 16) {
          result += `"${BIGINT_TAG}${numStr}"`
        } else {
          result += numStr
        }
      } else {
        // 浮点数或科学计数法
        const digitsOnly = numStr.replace(/[^0-9]/g, '').replace(/^0+/, '')
        let hasTrailingZero = false
        if (hasDecimal) {
          const parts = numStr.split('.')
          const frac = parts[1] ? parts[1].split(/[eE]/)[0] : ''
          if (frac.length > 1 && frac.endsWith('0')) {
            hasTrailingZero = true
          }
        }

        // 整数部分 >= 16 位、有效数字 > 15 位或带有末尾定点小数零时，必须保护精度
        if (intDigits >= 16 || digitsOnly.length > 15 || hasTrailingZero) {
          result += `"${BIGDECIMAL_TAG}${numStr}"`
        } else {
          result += numStr
        }
      }

      i = j
      continue
    }

    result += ch
    i++
  }

  return result
}

/**
 * 安全解析 JSON 字符串，将大整数转为 BigInt，长浮点数转为 LosslessNumber 保留精度。
 * @param {string} jsonStr - 原始 JSON 字符串
 * @returns {any} 解析后的对象
 */
export const safeParse = (jsonStr) => {
  if (typeof jsonStr !== 'string') return jsonStr
  // Fast path: 绝大多数 JSON 不含 16 位以上大数字或 6 位以上小数，直接使用 V8 原生 JSON.parse，速度提升 10 倍以上
  if (!/(?:\d{16,}|\d+\.\d{6,})/.test(jsonStr)) {
    return JSON.parse(jsonStr)
  }
  const protectedStr = protectBigInts(jsonStr)
  return JSON.parse(protectedStr, (k, v) => {
    if (typeof v === 'string') {
      if (v.startsWith(BIGINT_TAG)) {
        try {
          return BigInt(v.slice(BIGINT_TAG.length))
        } catch (e) {
          return v
        }
      }
      if (v.startsWith(BIGDECIMAL_TAG)) {
        return new LosslessNumber(v.slice(BIGDECIMAL_TAG.length))
      }
    }
    return v
  })
}

/**
 * 安全序列化对象为 JSON 字符串，将 BigInt 和 LosslessNumber 还原为裸数字。
 * @param {any} obj - 要序列化的对象
 * @param {function|array|null} replacer - 同 JSON.stringify 的 replacer
 * @param {number|string} space - 同 JSON.stringify 的 space
 * @returns {string} JSON 字符串（大数以裸数字形式存在，字符串不变）
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
    if (isLosslessNumber(value)) {
      return `${BIGDECIMAL_TAG}${value.toString()}`
    }
    return value
  }

  const json = JSON.stringify(obj, wrappedReplacer, space)
  if (!json || (!json.includes(BIGINT_TAG) && !json.includes(BIGDECIMAL_TAG))) {
    return json
  }
  return json
    .replace(new RegExp(`"${BIGINT_TAG}(-?\\d+)"`, 'g'), '$1')
    .replace(new RegExp(`"${BIGDECIMAL_TAG}([^"]+)"`, 'g'), '$1')
}

