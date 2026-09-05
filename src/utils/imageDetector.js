/**
 * imageDetector.js - 图片 URL、Base64 图片数据及通用 URL 智能识别与跳转工具
 */

// 常见图片扩展名（忽略大小写）
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?)(?:[?#].*)?$/i

// Base64 图片 Data URI 规则
const BASE64_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico|avif);base64,[A-Za-z0-9+/=]+/i

// 常见图床及图片直链特征模式
const IMAGE_SERVICE_RE = /(?:images\.unsplash\.com|cdn\.pixabay\.com|img\.alicdn\.com|qlogo\.cn|sinaimg\.cn|hdslb\.com|oss-[a-z0-9-]+\.aliyuncs\.com|cos\.[a-z0-9-]+\.myqcloud\.com)/i

/**
 * 判断一个字符串是否是图片 URL 或 Base64 图片
 * @param {any} val
 * @returns {boolean}
 */
export function isImageUrl(val) {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed || trimmed.length < 5) return false

  // 1. 优先检测 Base64 图片
  if (BASE64_IMAGE_RE.test(trimmed)) return true

  // 2. 检测 URL 协议头 (http://, https://, //, /, blob:)
  const isUrlLike = /^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('blob:') || trimmed.startsWith('/')
  if (!isUrlLike) return false

  // 3. 匹配常见图片扩展名
  if (IMAGE_EXT_RE.test(trimmed)) return true

  // 4. 匹配已知图片服务 CDN 域名且路径非空
  if (IMAGE_SERVICE_RE.test(trimmed)) return true

  return false
}

// 常见颜色格式识别 (Hex, RGB, RGBA, HSL, HSLA)
const COLOR_HEX_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const COLOR_FUNC_RE = /^(rgba?|hsla?)\(\s*[\d.%\s,/-]+\s*\)$/i

/**
 * 判断一个字符串是否是有效的 CSS 颜色值 (Hex, rgb, rgba, hsl, hsla)
 * @param {any} val
 * @returns {boolean}
 */
export function isColorValue(val) {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (trimmed.length < 4 || trimmed.length > 40) return false
  return COLOR_HEX_RE.test(trimmed) || COLOR_FUNC_RE.test(trimmed)
}

/**
 * 判断是否为非图片的通用 HTTP/HTTPS 链接（如文件下载、API、网页链接等）
 * @param {any} val
 * @returns {boolean}
 */
export function isHttpUrl(val) {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed || trimmed.length < 8) return false
  return /^https?:\/\/[^\s]+$/i.test(trimmed)
}

/**
 * 在系统默认浏览器或新标签页中安全打开链接（全面兼容 Tauri 桌面端 / uTools / VSCode / Web）
 * @param {string} url
 */
export async function openExternalUrl(url) {
  if (!url || typeof url !== 'string') return
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return

  // 1. uTools 插件环境
  if (typeof window !== 'undefined' && window.utools && typeof window.utools.shellOpenExternal === 'function') {
    try {
      window.utools.shellOpenExternal(trimmed)
      return
    } catch (e) {
      console.warn('[openExternalUrl] utools open failed:', e)
    }
  }

  // 2. VSCode 插件 Webview 环境
  if (typeof window !== 'undefined' && window.__VSCODE_API__ && typeof window.__VSCODE_API__.postMessage === 'function') {
    try {
      window.__VSCODE_API__.postMessage({ command: 'openExternal', url: trimmed })
      return
    } catch (e) {
      console.warn('[openExternalUrl] vscode open failed:', e)
    }
  }

  // 3. Tauri 客户端环境 (调用系统默认浏览器打开)
  const isTauri = typeof window !== 'undefined' && (
    !!window.__TAURI__ ||
    !!window.__TAURI_INTERNALS__ ||
    navigator.userAgent.includes('Tauri')
  )

  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      if (typeof invoke === 'function') {
        await invoke('open_url', { url: trimmed })
        return
      }
    } catch (_) {}

    try {
      const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke
      if (typeof invoke === 'function') {
        await invoke('open_url', { url: trimmed })
        return
      }
    } catch (_) {}
  }

  // 4. 标准浏览器 / Web / Chrome 扩展环境
  try {
    window.open(trimmed, '_blank', 'noopener,noreferrer')
  } catch (e) {
    console.error('[openExternalUrl] window.open failed:', e)
  }
}

/**
 * 获取图片的大致类型标签 (如 'PNG', 'JPG', 'WEBP', 'SVG', 'GIF', 'BASE64', 'IMG')
 * @param {string} url
 * @returns {string}
 */
export function getImageType(url) {
  if (!url || typeof url !== 'string') return 'IMG'
  const trimmed = url.trim()

  const b64Match = trimmed.match(/^data:image\/([a-zA-Z+]+);base64,/i)
  if (b64Match) {
    const subtype = b64Match[1].replace('+xml', '').toUpperCase()
    return subtype || 'BASE64'
  }

  const extMatch = trimmed.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/)
  if (extMatch) {
    const ext = extMatch[1].toUpperCase()
    if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'BMP', 'ICO', 'AVIF'].includes(ext)) {
      return ext === 'JPEG' ? 'JPG' : ext
    }
  }

  return 'IMG'
}
