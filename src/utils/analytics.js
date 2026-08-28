// 统计脚本模块化加载（仅在 Web 生产环境加载，避免 Chrome 扩展 CSP 违规及桌面端白屏）

export function initAnalytics() {
  if (typeof window === 'undefined') return

  // 仅在真实 Web 环境（http/https 且不是 Chrome 扩展页面、不是 Tauri/uTools/VSCode）加载统计脚本
  const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:'
  const isExtension = window.location.protocol === 'chrome-extension:' || (window.chrome?.runtime?.id && !isHttp)
  const isDesktop = window.__TAURI__ || window.__TAURI_INTERNALS__ || window.__UTOOLS__ || window.__VSCODE_INIT_TEXT__

  if (!isHttp || isExtension || isDesktop) return

  // 百度统计 — 异步加载，不阻塞页面渲染
  try {
    window._hmt = window._hmt || []
    const hm = document.createElement('script')
    hm.src = 'https://hm.baidu.com/hm.js?72974e6b27b07a0605f7c191b891dda7'
    hm.async = true
    document.head.appendChild(hm)
  } catch (e) {}

  // 51.la 统计 — 异步加载
  try {
    const laScript = document.createElement('script')
    laScript.id = 'LA_COLLECT'
    laScript.charset = 'UTF-8'
    laScript.src = 'https://sdk.51.la/js-sdk-pro.min.js'
    laScript.async = true
    laScript.onload = function () {
      try {
        if (window.LA) {
          window.LA.init({ id: '3QNVDQ3GGTAYi7LM', ck: '3QNVDQ3GGTAYi7LM', autoTrack: true })
        }
      } catch (e) {}
    }
    document.head.appendChild(laScript)
  } catch (e) {}
}
