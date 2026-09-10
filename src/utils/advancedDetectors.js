/**
 * advancedDetectors.js - 音视频、JWT、Base64文本、URL编码、Cron表达式、Markdown/HTML等智能检测工具
 */

// ── 1. 音视频检测 ──
const AUDIO_EXT_RE = /\.(mp3|aac|wav|ogg|m4a|flac|wma|opus|mid|midi|amr|aiff|ape|weba|alac)(?:[?#].*)?$/i
const VIDEO_EXT_RE = /\.(mp4|webm|ogv|mov|mkv|avi|flv|wmv|m4v|3gp|3g2|ts|mts|m2ts|f4v|rmvb|rm|asf|vob|m3u8|mpd)(?:[?#].*)?$/i
const MEDIA_PREFIX_RE = /^(?:(?:https?:)?\/\/|blob:|data:(?:audio|video)\/)/i

export function detectMedia(val) {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (trimmed.length < 8 || !MEDIA_PREFIX_RE.test(trimmed)) return null

  if (trimmed.startsWith('data:audio/')) {
    return { isMedia: true, mediaType: 'audio', url: trimmed }
  }
  if (trimmed.startsWith('data:video/')) {
    return { isMedia: true, mediaType: 'video', url: trimmed }
  }

  if (AUDIO_EXT_RE.test(trimmed)) {
    return { isMedia: true, mediaType: 'audio', url: trimmed }
  }
  if (VIDEO_EXT_RE.test(trimmed)) {
    return { isMedia: true, mediaType: 'video', url: trimmed }
  }
  return null
}

// ── 2. JWT (JSON Web Token) 检测 ──
const JWT_RE = /^eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_+/=]*$/

function b64UrlDecode(str) {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch (e) {
    return null
  }
}

export function detectJwt(val) {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (!JWT_RE.test(trimmed)) return null

  const parts = trimmed.split('.')
  if (parts.length !== 3) return null

  const headerStr = b64UrlDecode(parts[0])
  const payloadStr = b64UrlDecode(parts[1])
  if (!headerStr || !payloadStr) return null

  try {
    const header = JSON.parse(headerStr)
    const payload = JSON.parse(payloadStr)
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') return null

    // 检查是否有 JWT 核心标准字段
    const nowSec = Math.floor(Date.now() / 1000)
    let isExpired = false
    let expireDateStr = ''
    let remainingTimeStr = ''

    if (payload.exp && typeof payload.exp === 'number') {
      const expSec = payload.exp
      const expDate = new Date(expSec * 1000)
      const pad = (n) => String(n).padStart(2, '0')
      expireDateStr = `${expDate.getFullYear()}-${pad(expDate.getMonth() + 1)}-${pad(expDate.getDate())} ${pad(expDate.getHours())}:${pad(expDate.getMinutes())}:${pad(expDate.getSeconds())}`
      if (nowSec >= expSec) {
        isExpired = true
        const diff = nowSec - expSec
        remainingTimeStr = diff < 60 ? `${diff}秒前` : (diff < 3600 ? `${Math.floor(diff / 60)}分钟前` : `${Math.floor(diff / 3600)}小时前`)
      } else {
        isExpired = false
        const diff = expSec - nowSec
        remainingTimeStr = diff < 60 ? `${diff}秒后到期` : (diff < 3600 ? `${Math.floor(diff / 60)}分钟后到期` : `${Math.floor(diff / 3600)}小时后到期`)
      }
    }

    return {
      isJwt: true,
      header,
      payload,
      headerStr: JSON.stringify(header, null, 2),
      payloadStr: JSON.stringify(payload, null, 2),
      isExpired,
      expireDateStr,
      remainingTimeStr,
      hasExp: typeof payload.exp === 'number'
    }
  } catch (e) {
    return null
  }
}

// ── 3. Base64 纯文本检测 ──
const BASE64_TEXT_RE = /^[A-Za-z0-9+/=]{8,}$/

export function detectBase64Text(val) {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (trimmed.length < 8 || trimmed.length > 50000) return null
  // 排除已知的 Data URI 图片、JWT、或含有空格/其他标点的普通字符串
  if (trimmed.startsWith('data:') || JWT_RE.test(trimmed)) return null
  if (!BASE64_TEXT_RE.test(trimmed) || trimmed.length % 4 !== 0) return null

  // 排除纯字母单个英文单词（如 "Supercalifragilisticexpialidocious" 或纯大写）
  if (/^[A-Za-z]+$/.test(trimmed) && trimmed.length < 24) return null

  try {
    const binary = atob(trimmed)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)

    // 检查可打印字符比例，过滤乱码二进制流
    if (!decoded || decoded.length === 0) return null
    let printableCount = 0
    for (let i = 0; i < decoded.length; i++) {
      const code = decoded.charCodeAt(i)
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
        printableCount++
      }
    }
    const printableRatio = printableCount / decoded.length
    if (printableRatio < 0.9) return null

    // 如果解码后内容与原串一模一样，排除
    if (decoded.trim() === trimmed) return null

    return {
      isBase64Text: true,
      decoded
    }
  } catch (e) {
    return null
  }
}

// ── 4. URL 编码字符串检测 ──
const URL_ENCODED_RE = /%[0-9a-fA-F]{2}/

export function detectUrlEncoded(val) {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (trimmed.length < 6 || !URL_ENCODED_RE.test(trimmed)) return null

  try {
    const decoded = decodeURIComponent(trimmed)
    // 解码后如果完全相同，说明只是普通文本
    if (decoded === trimmed) return null

    // 如果本身是标准的完整 http 链接，且解码后仅仅只是 URL 本身，通常不需要独立当成纯编码文本预览
    return {
      isUrlEncoded: true,
      decoded
    }
  } catch (e) {
    return null
  }
}

// ── 5. Cron 表达式检测与自然语言翻译 ──
const CRON_FIELD_RE = /^[A-Za-z0-9,\-*/?LW#]+$/i

export function detectCron(val) {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length < 5 || parts.length > 7) return null

  // 必须所有字段都符合 cron 字符规范
  for (const p of parts) {
    if (!CRON_FIELD_RE.test(p)) return null
  }

  // 至少包含常见的 cron 标识符 *、/、? 或特定组合，避免纯数字误判
  const hasCronSpec = /[*?/\-]/.test(trimmed)
  if (!hasCronSpec) return null

  const translation = translateCronToChinese(parts)
  if (!translation) return null

  return {
    isCron: true,
    expression: trimmed,
    parts,
    translation
  }
}

function translateCronToChinese(parts) {
  try {
    // 5位 (Linux): 分 时 日 月 周
    // 6位 (Spring/Quartz): 秒 分 时 日 月 周
    // 7位 (Quartz带年): 秒 分 时 日 月 周 年
    let sec = null, min = '', hour = '', day = '', month = '', week = '', year = ''
    if (parts.length === 5) {
      ;[min, hour, day, month, week] = parts
    } else if (parts.length === 6) {
      ;[sec, min, hour, day, month, week] = parts
    } else if (parts.length === 7) {
      ;[sec, min, hour, day, month, week, year] = parts
    }

    // 1. 每隔 N 秒/分钟/小时的典型表达
    if (sec && sec.startsWith('*/')) {
      return `每隔 ${sec.slice(2)} 秒执行一次`
    }
    if (min.startsWith('*/') && (hour === '*' || hour === '?') && (day === '*' || day === '?')) {
      return `每隔 ${min.slice(2)} 分钟执行一次`
    }
    if (min === '*' && (hour === '*' || hour === '?') && (day === '*' || day === '?')) {
      return `每分钟执行一次`
    }
    if (hour.startsWith('*/') && (day === '*' || day === '?')) {
      return `每隔 ${hour.slice(2)} 小时执行一次`
    }

    let desc = ''

    // 2. 周期范围判断（月、日、周）
    if (month !== '*' && month !== '?') {
      desc += `每年 ${month} 月 `
    }

    const weekUpper = (week || '').toUpperCase()
    if (weekUpper !== '*' && weekUpper !== '?') {
      const weekMap = { '1': '周日', '2': '周一', '3': '周二', '4': '周三', '5': '周四', '6': '周五', '7': '周六', 'MON': '周一', 'TUE': '周二', 'WED': '周三', 'THU': '周四', 'FRI': '周五', 'SAT': '周六', 'SUN': '周日' }
      if (weekUpper === '1-5' || weekUpper === 'MON-FRI' || weekUpper === '2-6') {
        desc += `每个工作日 `
      } else if (weekMap[weekUpper]) {
        desc += `每周 ${weekMap[weekUpper]} `
      } else {
        desc += `每周(${weekUpper}) `
      }
    } else if (day !== '*' && day !== '?') {
      if (day === 'L') {
        desc += `每月最后一天 `
      } else {
        desc += `每月 ${day} 号 `
      }
    } else {
      desc += `每天 `
    }

    // 3. 时间点（时、分、秒）
    if (hour !== '*' && hour !== '?') {
      const pad = (n) => String(n).padStart(2, '0')
      const hStr = pad(hour)
      const mStr = min !== '*' && min !== '?' ? pad(min) : '00'
      const sStr = sec && sec !== '*' && sec !== '?' ? `:${pad(sec)}` : ''
      desc += `${hStr}:${mStr}${sStr} 执行`
    } else if (min !== '*' && min !== '?') {
      desc += `每小时的第 ${min} 分钟执行`
    } else {
      desc += `整点执行`
    }

    return desc.trim()
  } catch (e) {
    return '标准 Cron 定时表达式'
  }
}

// ── 6. HTML 代码片段检测 ──
const HTML_TAG_RE = /<(p|div|span|h[1-6]|ul|ol|li|table|tr|td|th|strong|em|b|i|a|button|section|article|blockquote|header|footer)(?:\s+[^>]*?)?>([\s\S]*?)<\/\1>/i
const HTML_SELF_CLOSING_RE = /<(img|br|hr|input)(?:\s+[^>]*?)\/?>/i

export function detectHtml(val) {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (trimmed.length < 8) return null

  // 必须包含标准 html 标签且成对闭合或自闭合
  if (HTML_TAG_RE.test(trimmed) || HTML_SELF_CLOSING_RE.test(trimmed)) {
    return {
      isHtml: true,
      raw: trimmed
    }
  }
  return null
}
