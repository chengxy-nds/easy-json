/**
 * dataMasker.js - 智能数据脱敏工具（支持内置规则与自定义指定 Key）
 */

// 1. 正则表达式规则定义
const PHONE_RE = /(?<!\d)(1[3-9]\d)(\d{4})(\d{4})(?!\d)/g
const ID_CARD_RE = /(?<!\d)([1-9]\d{5})(?:\d{4}|\d{8})(\d{3}[\dXx])(?!\w)/g

// 邮箱正则：必须以合法顶级域名（.com, .cn 等）结尾，且排除 URL 协议及 DSN 路径内部的干扰
const EMAIL_RE = /(?<![a-zA-Z0-9_.+:/])([a-zA-Z0-9_.+-]+)(@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,63})(?![a-zA-Z0-9._-])/g

// IPv4 正则：精准匹配 0-255 四段地址
const IPV4_RE = /(?<![\d.])((?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){2})(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.)(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])/g
const IPV6_RE = /(?<![a-fA-F0-9:])((?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}|(?:[a-fA-F0-9]{1,4}:){1,7}:|[a-fA-F0-9]{1,4}:(?::[a-fA-F0-9]{1,4}){1,6}|:(?:(?::[a-fA-F0-9]{1,4}){1,7}|:))(?![a-fA-F0-9:])/g
// 银行卡正则（捕获 15 ~ 19 位连续纯数字序列）
const BANK_CARD_RE = /(?<!\d)(\d{15,19})(?!\d)/g

/**
 * 校验是否为合法银行卡号（结合主流卡组织发卡行 BIN 码前缀与国际标准 Luhn 模 10 校验和算法）
 * @param {string|number|bigint} str 待校验银行卡号
 * @returns {boolean}
 */
export function isValidBankCard(str) {
  if (!str) return false
  const digits = String(str).replace(/\s+/g, '')
  if (!/^\d{15,19}$/.test(digits)) return false

  // 1. 发卡行标识代码（BIN 码）前缀及长度综合校验
  // - 中国银联 (UnionPay): 62 (16-19位), 60 (16-19位), 81 (16-19位), 95588/95599/95566/95533/95555 (大行老卡)
  // - Visa: 4 开头 (16位，含极少数13位)
  // - MasterCard: 51-55 (16位), 2221-2720 (16位)
  // - American Express: 34, 37 (15位)
  // - JCB: 3528-3589 (16-19位)
  // - Discover: 6011, 65, 644-649 (16-19位)
  const isKnownBin =
    /^(62\d{14,17}|60\d{14,17}|81\d{14,17}|955[35689]\d{11,14}|4\d{12}(\d{3})?|5[1-5]\d{14}|2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[0-1]\d|720)\d{12}|3[47]\d{13}|35(2[89]|[3-8]\d)\d{12,15}|6(011|5\d{2}|4[4-9]\d)\d{12,15})$/.test(digits)

  if (!isKnownBin) return false

  // 2. 国际标准 Luhn 模 10 校验和算法（Luhn Algorithm）
  let sum = 0
  let shouldDouble = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10)
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

// 车牌号码（传统燃油车牌 7 位 + 新能源车牌 8 位）
const LICENSE_PLATE_RE = /([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][·\s]?[A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳])/g

// 统一社会信用代码（18 位，如 91110108MA002A3456）
const USCI_RE = /(?<![A-Z0-9])([159Y][1239]\d{6}[0-9A-HJ-NP-RT-UW-Y]{10})(?![A-Z0-9])/g

// 中国护照号（G/E/P/D/S/C 开头 8 位数字，或 EA 开头 7 位数字）
const PASSPORT_RE = /(?<![A-Z0-9])([GEPDSC]\d{8}|EA\d{7})(?![A-Z0-9])/g

// 数据库连接串 DSN 密码脱敏：
// 1. URI 风格 (mysql://root:pass@host:3306/db, redis://:pass@host)
const URI_DSN_RE = /((?:jdbc:)?[a-zA-Z0-9_+.-]+:\/\/)([^:\s\/]*):([^@\s\/]+)@/g

// 2. Go-MySQL / GORM 驱动风格 (root:123456@tcp(127.0.0.1:3306)/db, root:pass@/db, root:pass@unix(...)/db)
const GO_DSN_RE = /(?<![a-zA-Z0-9_.+:/])([a-zA-Z0-9_.-]+):([^@\s\/]+)(@(tcp|unix)?\s*(?:\([^)]*\)|\/))/g

// 3. 键值对风格连接串 (Server=...;Uid=...;Pwd=123456; 或 Password=...)
const KV_DSN_RE = /(?<=\b(?:password|pwd|secret)\s*=\s*)([^;,\s"']+)/gi

// 4. Oracle 经典风格 (user/password@127.0.0.1:1521/orcl, jdbc:oracle:thin:user/password@host:port:sid)
const ORACLE_DSN_RE = /((?:jdbc:oracle:[a-zA-Z0-9_-]+:)?(?<![a-zA-Z0-9_.+/]))([a-zA-Z0-9_.-]+)\/([^@\s\/]+)(@(?:\/\/)?(?:[a-zA-Z0-9_.-]+|\[[a-fA-F0-9:]+\]|\([A-Za-z0-9_=.\s-]+\)))/g

/**
 * 按原字符串长度严格 1:1 等长脱敏（保持总位数不变，隐藏中间字符）
 * @param {string} str
 * @returns {string}
 */
export function maskKeepLength(str) {
  if (typeof str !== 'string') str = String(str)
  const len = str.length
  if (len <= 1) return '*'
  if (len === 2) return str[0] + '*'
  if (len === 3) return str[0] + '*' + str[2]
  if (len === 4) return str[0] + '**' + str[3]
  if (len <= 7) return str.slice(0, 1) + '*'.repeat(len - 2) + str.slice(-1)
  // >= 8 位（如 developer_alpha 15 位 -> de***********ha 同样 15 位）
  return str.slice(0, 2) + '*'.repeat(len - 4) + str.slice(-2)
}

/**
 * 智能 URL 1:1 等长脱敏（保留协议与域名，对路径和参数执行严格等长脱敏）
 * @param {string} url
 * @returns {string}
 */
export function maskUrlKeepLength(url) {
  if (typeof url !== 'string') return url
  const trimmed = url.trim()
  try {
    // 匹配协议+域名 (如 https://images.unsplash.com) 与 后续路径/查询参 (/photo-15797839... )
    const match = trimmed.match(/^(https?:\/\/[^\/\s?#]+)(\/.*)?$/i)
    if (match) {
      const origin = match[1]
      const rest = match[2]
      if (!rest || rest === '/') {
        return trimmed
      }
      // 去掉开头的 '/'，对后续路径内容进行 1:1 等长脱敏
      const pathContent = rest.slice(1)
      return `${origin}/${maskKeepLength(pathContent)}`
    }
  } catch (e) {}
  return maskKeepLength(trimmed)
}

/**
 * 自定义字段专用智能等长脱敏（自动适配 URL、邮箱、通用文本）
 * @param {string} str
 * @returns {string}
 */
export function maskCustomValue(str) {
  if (typeof str !== 'string') str = String(str)
  const trimmed = str.trim()
  // 1. 如果是 HTTP / HTTPS 链接，保留协议与域名，对路径等长脱敏
  if (/^https?:\/\//i.test(trimmed)) {
    return maskUrlKeepLength(trimmed)
  }
  // 2. 如果是 邮箱，保留 @域名，对用户名等长脱敏
  if (EMAIL_RE.test(trimmed)) {
    return trimmed.replace(EMAIL_RE, (_, username, domain) => `${maskKeepLength(username)}${domain}`)
  }
  // 3. 通用字符串等长脱敏
  return maskKeepLength(str)
}

/**
 * 递归脱敏 JSON 数据
 * @param {any} data 任意解析后的 JSON 数据
 * @param {Object} options 配置选项
 * @param {boolean} [options.maskPhone=true] 脱敏手机号
 * @param {boolean} [options.maskIdCard=true] 脱敏身份证
 * @param {boolean} [options.maskEmail=true] 脱敏邮箱
 * @param {boolean} [options.maskBankCard=true] 脱敏银行卡
 * @param {boolean} [options.maskIp=true] 脱敏 IP 地址 (IPv4 / IPv6)
 * @param {boolean} [options.maskLicensePlate=true] 脱敏车牌号码
 * @param {boolean} [options.maskUsci=true] 脱敏统一社会信用代码
 * @param {boolean} [options.maskPassport=true] 脱敏中国护照号
 * @param {boolean} [options.maskDsn=true] 脱敏数据库连接串 (DSN)
 * @param {string[]} [options.customKeys=[]] 用户指定的自定义 Key 列表
 * @returns {{ maskedData: any, count: number }} 脱敏后的数据及统计次数
 */
export function maskJsonData(data, options = {}) {
  const {
    maskPhone = true,
    maskIdCard = true,
    maskEmail = true,
    maskBankCard = true,
    maskIp = true,
    maskLicensePlate = true,
    maskUsci = true,
    maskPassport = true,
    maskDsn = true,
    customKeys = []
  } = options

  // 整理自定义 key 集合（忽略大小写）
  const customKeySet = new Set(customKeys.map(k => String(k).trim().toLowerCase()).filter(Boolean))

  let count = 0

  function maskString(str, key = '') {
    if (typeof str !== 'string' || !str) return str
    const lowerKey = key ? key.toLowerCase() : ''

    // 1. 用户自定义指定的 Key 脱敏（智能识别 URL/邮箱/通用字符串，严格 1:1 保持原长度）
    if (key && customKeySet.has(lowerKey)) {
      count++
      return maskCustomValue(str)
    }

    let result = str

    // 2. 数据库连接串 (DSN) 密码脱敏
    if (maskDsn) {
      if (URI_DSN_RE.test(result)) {
        result = result.replace(URI_DSN_RE, (_, scheme, user) => {
          count++
          return `${scheme}${user}:******@`
        })
      }
      if (GO_DSN_RE.test(result)) {
        result = result.replace(GO_DSN_RE, (_, user, pass, tail) => {
          count++
          return `${user}:******${tail}`
        })
      }
      if (ORACLE_DSN_RE.test(result)) {
        result = result.replace(ORACLE_DSN_RE, (_, prefix, user, pass, tail) => {
          count++
          return `${prefix}${user}/******${tail}`
        })
      }
      if (KV_DSN_RE.test(result)) {
        result = result.replace(KV_DSN_RE, () => {
          count++
          return '******'
        })
      }
    }

    // 3. 手机号脱敏: 13812345678 -> 138****5678 (11位等长)
    if (maskPhone && PHONE_RE.test(result)) {
      result = result.replace(PHONE_RE, (_, p1, p2, p3) => {
        count++
        return `${p1}****${p3}`
      })
    }

    // 4. 身份证脱敏: 110101199003072345 -> 110101********2345 (18位等长)
    if (maskIdCard && ID_CARD_RE.test(result)) {
      result = result.replace(ID_CARD_RE, (_, p1, p2) => {
        count++
        return `${p1}********${p2}`
      })
    }

    // 5. 统一社会信用代码: 91110108MA002A3456 -> 911101********3456 (18位等长)
    if (maskUsci && USCI_RE.test(result)) {
      result = result.replace(USCI_RE, (m) => {
        count++
        return m.slice(0, 6) + '********' + m.slice(-4)
      })
    }

    // 6. 邮箱脱敏: developer@easyjson.com -> de*****er@easyjson.com (严格 1:1 等长脱敏)
    if (maskEmail && EMAIL_RE.test(result)) {
      result = result.replace(EMAIL_RE, (_, username, domain) => {
        count++
        return `${maskKeepLength(username)}${domain}`
      })
    }

    // 7. 中国护照号: E12345678 -> E12****78 (等长脱敏)
    if (maskPassport && PASSPORT_RE.test(result)) {
      result = result.replace(PASSPORT_RE, (m) => {
        count++
        return m.slice(0, 2) + '*'.repeat(m.length - 4) + m.slice(-2)
      })
    }

    // 8. 车牌号码: 京A88888 -> 京A***88, 粤B·D12345 -> 粤B·****45 (等长脱敏)
    if (maskLicensePlate && LICENSE_PLATE_RE.test(result)) {
      result = result.replace(LICENSE_PLATE_RE, (m) => {
        count++
        const prefixLen = m.includes('·') || m.includes(' ') ? 3 : 2
        return m.slice(0, prefixLen) + '*'.repeat(m.length - prefixLen - 2) + m.slice(-2)
      })
    }

    // 9. 银行卡号脱敏（严格结合 BIN 码与 Luhn 模 10 算法，1:1 等长脱敏）
    if (maskBankCard && BANK_CARD_RE.test(result)) {
      result = result.replace(BANK_CARD_RE, (match) => {
        if (isValidBankCard(match)) {
          count++
          return match.slice(0, 4) + '*'.repeat(match.length - 8) + match.slice(-4)
        }
        return match
      })
    }

    // 10. IP 地址脱敏 (IPv4 与 IPv6)
    if (maskIp) {
      if (IPV4_RE.test(result)) {
        result = result.replace(IPV4_RE, (_, p1) => {
          count++
          return `${p1}*.*`
        })
      }
      if (IPV6_RE.test(result)) {
        result = result.replace(IPV6_RE, (m) => {
          count++
          const parts = m.split(':')
          if (parts.length >= 4) {
            return parts.slice(0, 2).join(':') + ':****:****:****:' + parts.slice(-1)
          }
          return m.slice(0, 4) + ':****'
        })
      }
    }

    return result
  }

  function walk(node, parentKey = '') {
    if (node === null || node === undefined) return node

    const lowerParentKey = parentKey ? parentKey.toLowerCase() : ''

    // 如果该字段是指定的自定义 Key 且不是对象，直接进行智能等长脱敏
    if (parentKey && customKeySet.has(lowerParentKey) && typeof node !== 'object') {
      count++
      return maskCustomValue(String(node))
    }

    if (typeof node === 'string') {
      return maskString(node, parentKey)
    }

    if (typeof node === 'number' || typeof node === 'bigint') {
      const numStr = String(node)
      // 纯数字形式的手机号 (11位等长)
      if (maskPhone && /^1[3-9]\d{10}$/.test(numStr)) {
        count++
        return `${numStr.slice(0, 3)}****${numStr.slice(7)}`
      }
      // 纯数字形式的银行卡（严格结合 BIN 码与 Luhn 模 10 算法，1:1 等长脱敏）
      if (maskBankCard && /^\d{15,19}$/.test(numStr) && isValidBankCard(numStr)) {
        count++
        return `${numStr.slice(0, 4)}${'*'.repeat(numStr.length - 8)}${numStr.slice(-4)}`
      }
      return node
    }

    if (Array.isArray(node)) {
      return node.map(item => walk(item, parentKey))
    }

    if (typeof node === 'object') {
      const result = {}
      for (const k of Object.keys(node)) {
        result[k] = walk(node[k], k)
      }
      return result
    }

    return node
  }

  const maskedData = walk(data)
  return { maskedData, count }
}

/**
 * 提取 JSON 中所有的 Key 名集合
 * @param {any} data
 * @returns {string[]}
 */
export function extractAllKeys(data) {
  const keys = new Set()
  function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
    } else {
      for (const k of Object.keys(node)) {
        keys.add(k)
        walk(node[k])
      }
    }
  }
  walk(data)
  return Array.from(keys)
}
