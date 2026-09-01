/**
 * dataMasker.js - 智能数据脱敏工具（支持内置规则与自定义指定 Key）
 */

// 1. 正则表达式规则定义
const PHONE_RE = /(?<!\d)(1[3-9]\d)(\d{4})(\d{4})(?!\d)/g
const ID_CARD_RE = /(?<!\d)([1-9]\d{5})(?:\d{4}|\d{8})(\d{3}[\dXx])(?!\w)/g

// 邮箱正则：必须以合法顶级域名（.com, .cn 等）结尾，且排除 URL 协议及 DSN 路径内部的干扰
const EMAIL_RE = /(?<![a-zA-Z0-9_.+:/])([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*(@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,63})(?![a-zA-Z0-9._-])/g

// IPv4 正则：精准匹配 0-255 四段地址
const IPV4_RE = /(?<![\d.])((?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){2})(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.)(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])/g
const IPV6_RE = /(?<![a-fA-F0-9:])((?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}|(?:[a-fA-F0-9]{1,4}:){1,7}:|[a-fA-F0-9]{1,4}:(?::[a-fA-F0-9]{1,4}){1,6}|:(?:(?::[a-fA-F0-9]{1,4}){1,7}|:))(?![a-fA-F0-9:])/g
const BANK_CARD_RE = /(?<!\d)(\d{4})\d{8,11}(\d{4})(?!\d)/g

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

    // 1. 用户自定义指定的 Key 脱敏
    if (key && customKeySet.has(lowerKey)) {
      count++
      if (str.length <= 4) return '******'
      return str.slice(0, 2) + '****' + str.slice(-2)
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

    // 3. 手机号脱敏: 13812345678 -> 138****5678
    if (maskPhone && PHONE_RE.test(result)) {
      result = result.replace(PHONE_RE, (_, p1, p2, p3) => {
        count++
        return `${p1}****${p3}`
      })
    }

    // 4. 身份证脱敏: 110101199003072345 -> 110101********2345
    if (maskIdCard && ID_CARD_RE.test(result)) {
      result = result.replace(ID_CARD_RE, (_, p1, p2) => {
        count++
        return `${p1}********${p2}`
      })
    }

    // 5. 统一社会信用代码: 91110108MA002A3456 -> 911101********3456
    if (maskUsci && USCI_RE.test(result)) {
      result = result.replace(USCI_RE, (m) => {
        count++
        return m.slice(0, 6) + '********' + m.slice(-4)
      })
    }

    // 6. 邮箱脱敏: test@qq.com -> t***@qq.com
    if (maskEmail && EMAIL_RE.test(result)) {
      result = result.replace(EMAIL_RE, (_, p1, p2) => {
        count++
        return `${p1}***${p2}`
      })
    }

    // 7. 中国护照号: E12345678 -> E12****78
    if (maskPassport && PASSPORT_RE.test(result)) {
      result = result.replace(PASSPORT_RE, (m) => {
        count++
        return m.slice(0, 2) + '****' + m.slice(-2)
      })
    }

    // 8. 车牌号码: 京A88888 -> 京A***88, 粤B·D12345 -> 粤B·***45
    if (maskLicensePlate && LICENSE_PLATE_RE.test(result)) {
      result = result.replace(LICENSE_PLATE_RE, (m) => {
        count++
        const prefixLen = m.includes('·') || m.includes(' ') ? 3 : 2
        return m.slice(0, prefixLen) + '***' + m.slice(-2)
      })
    }

    // 9. 银行卡号脱敏
    if (maskBankCard && BANK_CARD_RE.test(result)) {
      result = result.replace(BANK_CARD_RE, (_, p1, p2) => {
        count++
        return `${p1}********${p2}`
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

    // 如果该字段是指定的自定义 Key 且不是对象，直接脱敏
    if (parentKey && customKeySet.has(lowerParentKey) && typeof node !== 'object') {
      count++
      const strVal = String(node)
      if (strVal.length <= 4) return '******'
      return strVal.slice(0, 2) + '****' + strVal.slice(-2)
    }

    if (typeof node === 'string') {
      return maskString(node, parentKey)
    }

    if (typeof node === 'number' || typeof node === 'bigint') {
      const numStr = String(node)
      // 纯数字形式的手机号
      if (maskPhone && /^1[3-9]\d{10}$/.test(numStr)) {
        count++
        return `${numStr.slice(0, 3)}****${numStr.slice(7)}`
      }
      // 纯数字形式的银行卡
      if (maskBankCard && /^\d{16,19}$/.test(numStr)) {
        count++
        return `${numStr.slice(0, 4)}********${numStr.slice(-4)}`
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
