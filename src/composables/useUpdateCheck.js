import { ref, onMounted } from 'vue'
import pkg from '../../package.json'

const APP_VERSION = pkg.version

const GITHUB_API = 'https://api.github.com/repos/chengxy-nds/easy-json/releases/latest'
const FALLBACK_URL = 'https://github.com/repos/chengxy-nds/easy-json/releases/latest'

// 根据当前操作系统匹配对应的下载文件
const getPlatformAsset = (assets) => {
  if (!assets || assets.length === 0) return null

  // navigator.platform 在某些环境下可能为空，用 userAgent 兜底
  const platform = (navigator.platform || '').toUpperCase()
  const ua = (navigator.userAgent || '').toUpperCase()
  const isMac = platform.includes('MAC') || ua.includes('MAC OS')
  const isWin = platform.includes('WIN') || ua.includes('WINDOWS')
  const isLinux = platform.includes('LINUX') && !ua.includes('ANDROID') && !ua.includes('CRIOS')

  let pattern
  if (isMac) {
    // macOS: 优先 .dmg，其次 universal
    pattern = /\.dmg$/i
    const dmg = assets.find(a => pattern.test(a.name))
    return dmg || null
  }
  if (isWin) {
    // Windows: 优先 .exe
    pattern = /\.exe$/i
    const exe = assets.find(a => pattern.test(a.name))
    return exe || null
  }
  if (isLinux) {
    // Linux: AppImage > deb > rpm
    const appimg = assets.find(a => /\.AppImage$/i.test(a.name))
    if (appimg) return appimg
    const deb = assets.find(a => /\.deb$/i.test(a.name))
    if (deb) return deb
    return null
  }
  return null
}

export function useUpdateCheck() {
  const hasUpdate = ref(false)
  const latestVersion = ref('')
  const downloadUrl = ref(FALLBACK_URL)

  const buildDownloadUrl = (ver, assets = null) => {
    if (assets && assets.length > 0) {
      const asset = getPlatformAsset(assets)
      if (asset?.browser_download_url) return asset.browser_download_url
    }
    const platform = (navigator.platform || '').toUpperCase()
    const ua = (navigator.userAgent || '').toUpperCase()
    const isMac = platform.includes('MAC') || ua.includes('MAC OS')
    const isWin = platform.includes('WIN') || ua.includes('WINDOWS')

    if (isWin) {
      return `https://github.com/chengxy-nds/easy-json/releases/download/v${ver}/easyJSON_${ver}_x64-setup.exe`
    }
    if (isMac) {
      return `https://github.com/chengxy-nds/easy-json/releases/download/v${ver}/easyJSON_${ver}_universal.dmg`
    }
    return `https://github.com/chengxy-nds/easy-json/releases/tag/v${ver}`
  }

  const check = async () => {
    let remote = ''

    // 1. 优先通过 jsDelivr CDN 检查 (国内免翻墙、全球 CDN 加速、无 GitHub API 频次限制)
    try {
      const res = await fetch('https://cdn.jsdelivr.net/gh/chengxy-nds/easy-json@main/package.json', {
        headers: { 'Cache-Control': 'no-cache' }
      })
      if (res.ok) {
        const pkgData = await res.json()
        if (pkgData?.version) {
          remote = pkgData.version
          downloadUrl.value = buildDownloadUrl(remote)
        }
      }
    } catch (_) {}

    // 2. 备用：通过 GitHub releases/latest 跳转地址解析 tag
    if (!remote) {
      try {
        const res = await fetch('https://github.com/chengxy-nds/easy-json/releases/latest')
        const match = res.url?.match(/tag\/v?([0-9.]+)/i)
        if (match && match[1]) {
          remote = match[1]
          downloadUrl.value = buildDownloadUrl(remote)
        }
      } catch (_) {}
    }

    // 3. 备用：GitHub 官方 API
    if (!remote) {
      try {
        const res = await fetch(GITHUB_API, {
          headers: { Accept: 'application/vnd.github.v3+json' }
        })
        if (res.ok) {
          const release = await res.json()
          const tag = (release.tag_name || '').replace(/^v/, '')
          if (tag) {
            remote = tag
            downloadUrl.value = buildDownloadUrl(remote, release.assets)
          }
        }
      } catch (_) {}
    }

    if (remote) {
      latestVersion.value = remote
      hasUpdate.value = compareVersions(remote, APP_VERSION) > 0
    }
  }

  // 简单 semver 比较 (支持 x.y.z)
  const compareVersions = (a, b) => {
    const pa = String(a).split('.').map(Number)
    const pb = String(b).split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      const da = pa[i] || 0
      const db = pb[i] || 0
      if (da > db) return 1
      if (da < db) return -1
    }
    return 0
  }

  onMounted(() => {
    check()
  })

  return { hasUpdate, latestVersion, downloadUrl, check }
}
