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
 * 在新标签页中直接安全打开链接
 * @param {string} url
 */
export function openExternalUrl(url) {
  if (!url || typeof url !== 'string') return
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    window.open(trimmed, '_blank', 'noopener,noreferrer')
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
