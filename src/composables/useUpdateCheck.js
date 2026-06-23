import { ref, onMounted } from 'vue'

const APP_VERSION = '1.0.0'

const GITHUB_API = 'https://api.github.com/repos/chengxy-nds/easy-json/releases/latest'
const FALLBACK_URL = 'https://github.com/repos/chengxy-nds/easy-json/releases/latest'

// 根据当前操作系统匹配对应的下载文件
const getPlatformAsset = (assets) => {
  if (!assets || assets.length === 0) return null

  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const isWin = navigator.platform.toUpperCase().includes('WIN')
  const isLinux = navigator.platform.toUpperCase().includes('LINUX')

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

  const check = async () => {
    try {
      const res = await fetch(GITHUB_API, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      })
      if (!res.ok) return
      const release = await res.json()
      const tag = release.tag_name || ''
      // 去掉 v 前缀: v1.0.1 → 1.0.1
      const remote = tag.replace(/^v/, '')
      if (!remote) return

      // 根据当前操作系统匹配对应安装包
      const asset = getPlatformAsset(release.assets)
      if (asset?.browser_download_url) {
        downloadUrl.value = asset.browser_download_url
      }

      hasUpdate.value = compareVersions(remote, APP_VERSION) > 0
      latestVersion.value = remote
    } catch (_) {
      // 静默失败
    }
  }

  // 简单 semver 比较 (支持 x.y.z)
  const compareVersions = (a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      const da = pa[i] || 0
      const db = pb[i] || 0
      if (da > db) return 1
      if (da < db) return -1
    }
    return 0
  }

  onMounted(check)

  return { hasUpdate, latestVersion, downloadUrl, check }
}
