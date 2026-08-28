<script setup>
import { ref, onMounted, provide, watch, onBeforeUnmount, defineAsyncComponent } from 'vue'
import JsonFormatter from './components/JsonFormatter.vue'
import JsonComparer from './components/JsonComparer.vue'
const HomeView = defineAsyncComponent(() => import('./components/HomeView.vue'))
const TestView = defineAsyncComponent(() => import('./components/TestView.vue'))
const CommentView = defineAsyncComponent(() => import('./components/Comment.vue'))
const ChangelogView = defineAsyncComponent(() => import('./components/ChangelogView.vue'))
import { Sun, Moon, Split, Braces, CheckCircle, AlertTriangle, Palette, ArrowUpDown, ArrowUp, ArrowDown, Space, Zap, ClipboardCheck, Search, Home, Maximize, Clipboard, FlaskConical, Download, X, MessageCircle, Check } from 'lucide-vue-next'
import { useUpdateCheck } from './composables/useUpdateCheck.js'
import { useInstallCheck } from './composables/useInstallCheck.js'

const currentView = ref('home') // 'home' | 'editor' | 'test' | 'comment' | 'changelog'
const isPopup = ref(false)
const isUtools = ref(false)
const isVscode = ref(false)
const isTauri = ref(false)

// ── 版本更新检查 ──
const { hasUpdate, latestVersion, downloadUrl } = useUpdateCheck()
const updateDismissed = ref(false)

// ── 首次安装检查（DMG 直接运行 vs 已拖入 Applications） ──
const { needsInstall } = useInstallCheck()
const installDismissed = ref(false)

// ── 来自 Chrome 扩展的传入文本（通过 storage.onChanged 无刷新推送） ──
const incomingExtractText = ref(null)
const incomingCompareText = ref(null)

const openInTab = () => {
  const url = chrome.runtime.getURL('index.html?mode=tab')
  chrome.tabs.create({ url })
  window.close()
}

const goToApp = () => {
  currentView.value = 'editor'
  localStorage.setItem('ej_view', 'editor')
  if (window.location.pathname !== '/') {
    window.history.pushState(null, '', '/')
  }
}

const goToHome = () => {
  currentView.value = 'home'
  localStorage.setItem('ej_view', 'home')
  if (window.location.pathname !== '/') {
    window.history.pushState(null, '', '/')
  }
}

const goToTest = () => {
  currentView.value = 'test'
  if (window.location.pathname.replace(/\/$/, '') !== '/test') {
    window.history.pushState(null, '', '/test')
  }
}

const goToComment = () => {
  currentView.value = 'comment'
  if (window.location.pathname.replace(/\/$/, '') !== '/comment') {
    window.history.pushState(null, '', '/comment')
  }
}

const goToChangelog = () => {
  currentView.value = 'changelog'
  if (window.location.pathname.replace(/\/$/, '') !== '/changelog') {
    window.history.pushState(null, '', '/changelog')
  }
}

const currentTab = ref('format') // 'format' | 'compare'

const setTab = (tab) => {
  currentTab.value = tab
  localStorage.setItem('ej_tab', tab)
}
const isDark = ref(true)
const isPremiumTheme = ref(true)
// sortKeys: 0 = off, 1 = asc (A→Z), 2 = desc (Z→A)
const sortKeys = ref(0)
const ignoreWhitespace = ref(true)
const autoFormat = ref(true)
const autoCopy = ref(true)
const autoExtract = ref(true)
const autoPaste = ref(true)

provide('sortKeys', sortKeys)
provide('ignoreWhitespace', ignoreWhitespace)
provide('autoFormat', autoFormat)
provide('autoCopy', autoCopy)
provide('autoExtract', autoExtract)
provide('autoPaste', autoPaste)
provide('incomingExtractText', incomingExtractText)
provide('incomingCompareText', incomingCompareText)

watch(sortKeys, (newVal) => {
  localStorage.setItem('ej_global_sort_keys', String(newVal))
})

watch(ignoreWhitespace, (newVal) => {
  localStorage.setItem('ej_global_ignore_whitespace', newVal ? '1' : '0')
})

watch(autoFormat, (newVal) => {
  localStorage.setItem('ej_auto_format', newVal ? '1' : '0')
})

watch(autoCopy, (newVal) => {
  localStorage.setItem('ej_auto_copy', newVal ? '1' : '0')
})

watch(autoExtract, (newVal) => {
  localStorage.setItem('ej_auto_extract', newVal ? '1' : '0')
})

watch(autoPaste, (newVal) => {
  localStorage.setItem('ej_auto_paste', newVal ? '1' : '0')
})

// Toast System (Stacked Sonner-like notifications)
const toasts = ref([])

const showToast = (message, type = 'success') => {
  const id = Date.now() + Math.random().toString(36).substr(2, 9)
  toasts.value.push({ id, message, type })
  
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 2500)
}

provide('showToast', showToast)

const getToastStyle = (index) => {
  const reverseIndex = toasts.value.length - 1 - index
  if (reverseIndex === 0) {
    return {
      transform: 'scale(1) translateY(0)',
      opacity: 1,
      zIndex: 10000 + index
    }
  } else if (reverseIndex === 1) {
    return {
      transform: 'scale(0.94) translateY(-10px)',
      opacity: 0.85,
      zIndex: 10000 + index
    }
  } else if (reverseIndex === 2) {
    return {
      transform: 'scale(0.88) translateY(-20px)',
      opacity: 0.6,
      zIndex: 10000 + index
    }
  }
  return {
    transform: 'scale(0.82) translateY(-30px)',
    opacity: 0,
    zIndex: 10000 + index,
    pointerEvents: 'none'
  }
}

const toggleTheme = () => {
  // 切换瞬间禁用全局 transition，避免背景色/文字色闪动
  document.documentElement.classList.add('no-transition')
  isDark.value = !isDark.value
  updateThemeClass()
  localStorage.setItem('ej_dark', isDark.value ? '1' : '0')
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transition')
    })
  })
}

const updateThemeClass = () => {
  if (isDark.value) {
    document.documentElement.classList.add('dark-mode')
    document.documentElement.style.colorScheme = 'dark'
  } else {
    document.documentElement.classList.remove('dark-mode')
    document.documentElement.style.colorScheme = 'light'
  }
}

const toggleSyntaxTheme = () => {
  isPremiumTheme.value = !isPremiumTheme.value
  updateSyntaxThemeClass()
  localStorage.setItem('ej_premium_syntax', isPremiumTheme.value ? '1' : '0')
  showToast(isPremiumTheme.value ? '已切换为 Premium 配色' : '已切换为 One Dark 配色')
}

const updateSyntaxThemeClass = () => {
  if (isPremiumTheme.value) {
    document.documentElement.classList.remove('one-dark-syntax')
  } else {
    document.documentElement.classList.add('one-dark-syntax')
  }
}

provide('isDark', isDark)
provide('toggleTheme', toggleTheme)

const handlePopState = () => {
  const path = window.location.pathname.replace(/\/$/, '')
  if (path === '/test' || path.endsWith('/test')) {
    currentView.value = 'test'
  } else if (path === '/comment' || path.endsWith('/comment')) {
    currentView.value = 'comment'
  } else if (path === '/changelog' || path.endsWith('/changelog')) {
    currentView.value = 'changelog'
  } else {
    const savedView = localStorage.getItem('ej_view')
    currentView.value = savedView === 'editor' ? 'editor' : 'home'
  }
}

onMounted(() => {
  window.addEventListener('popstate', handlePopState)

  // VS Code Webview 环境：直接进入编辑器
  const inVsCode = typeof acquireVsCodeApi === 'function' || (typeof window !== 'undefined' && (window.__VSCODE__ || window.vscodeApi))
  if (inVsCode) {
    isVscode.value = true
    document.body.classList.add('vscode-mode')
    currentView.value = 'editor'
    if (window.__VSCODE_INIT_TEXT__) {
      incomingExtractText.value = window.__VSCODE_INIT_TEXT__
    }

    // 动态同步组件 Vue 响应式状态（例如代码高亮与语法树）
    const checkVscodeDark = () => {
      const bodyClass = document.body.className || ''
      const themeKind = document.body.getAttribute('data-vscode-theme-kind') || ''
      let isLight = bodyClass.includes('vscode-light') || themeKind.includes('vscode-light')
      try {
        const bg = window.getComputedStyle(document.body).backgroundColor
        const match = bg.match(/\d+/g)
        if (match && match.length >= 3) {
          const r = parseInt(match[0]), g = parseInt(match[1]), b = parseInt(match[2])
          const brightness = (r * 299 + g * 587 + b * 114) / 1000
          if (brightness > 140) {
            isLight = true
          }
        }
      } catch (e) {}
      isDark.value = !isLight
      updateThemeClass()
    }
    checkVscodeDark()

    const themeObserver = new MutationObserver(() => checkVscodeDark())
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-vscode-theme-kind'] })

    try {
      const vscodeApi = window.vscodeApi || (typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null)
      if (vscodeApi && typeof vscodeApi.postMessage === 'function') {
        vscodeApi.postMessage({ type: 'ready' })
      }
    } catch(e) {}
  }

  // 监听来自 VS Code postMessage 消息
  if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
      const data = event.data
      if (data && data.type === 'extractText' && data.text) {
        isVscode.value = true
        document.body.classList.add('vscode-mode')
        currentView.value = 'editor'
        incomingExtractText.value = data.text
      }
    })
  }

  // Tauri 桌面端环境：直接进入编辑器，跳过官网首页
  const inTauri = typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__)
  if (inTauri) {
    isTauri.value = true
    document.body.classList.add('tauri-mode')
    currentView.value = 'editor'
    const savedTab = localStorage.getItem('ej_tab')
    if (savedTab === 'format' || savedTab === 'compare') {
      currentTab.value = savedTab
    }
  } else if (window.__UTOOLS__) {
    // uTools 环境：直接进入编辑器，跳过首页
    isUtools.value = true
    document.body.classList.add('utools-mode')
    currentView.value = 'editor'
    const savedTab = localStorage.getItem('ej_tab')
    if (savedTab === 'format' || savedTab === 'compare') {
      currentTab.value = savedTab
    }

    // 监听 uTools 自动匹配：剪贴板 / 输入框 / 选中文本匹配时自动打开并导入
    if (window.utools && typeof window.utools.onPluginEnter === 'function') {
      const cmdKeywords = ['easyjson', 'json', 'json格式化', 'json对比', 'json校验', 'json提取', '格式化', '对比']
      window.utools.onPluginEnter(({ code, type, payload }) => {
        if (payload && typeof payload === 'string') {
          const trimmed = payload.trim()
          const lower = trimmed.toLowerCase()
          // 只要不是纯指令关键字（例如只敲了 "json"），就把匹配到的 JSON 文本直接作为数据导入
          if (!cmdKeywords.includes(lower)) {
            setTimeout(() => {
              incomingExtractText.value = payload
            }, 300)
          }
        }
      })
    }
  } else {
    const urlParams = new URLSearchParams(window.location.search)
    const isTab = urlParams.get('mode') === 'tab'
    const isExtract = urlParams.get('action') === 'extract'
    const isCompare = urlParams.get('action') === 'compare'

    const path = window.location.pathname.replace(/\/$/, '')
    if (path === '/test' || path.endsWith('/test')) {
      currentView.value = 'test'
    } else if (path === '/comment' || path.endsWith('/comment')) {
      currentView.value = 'comment'
    } else if (path === '/changelog' || path.endsWith('/changelog')) {
      currentView.value = 'changelog'
    } else {
      // Right-click extract: force editor view + format tab
      if (isExtract) {
        currentView.value = 'editor'
        currentTab.value = 'format'
      } else if (isCompare) {
        currentView.value = 'editor'
        currentTab.value = 'compare'
      } else if (isTab) {
        currentView.value = 'editor'
      } else {
        const savedView = localStorage.getItem('ej_view')
        if (savedView === 'editor') {
          currentView.value = 'editor'
        }

        const savedTab = localStorage.getItem('ej_tab')
        if (savedTab === 'format' || savedTab === 'compare') {
          currentTab.value = savedTab
        }
      }
    }

    // Detect if running as a Chrome extension popup (not a full tab)
    const isExtension = window.chrome && window.chrome.runtime && window.chrome.runtime.id
    if (isExtension && !isTab && !isExtract && !isCompare) {
      document.documentElement.classList.add('popup-mode')
      isPopup.value = true
    }

    // Chrome 扩展无刷新通信：监听 storage 变化（不重载页面）
    if (window.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return
        if (changes.ej_extract_text?.newValue) {
          incomingExtractText.value = changes.ej_extract_text.newValue
          chrome.storage.local.remove('ej_extract_text')
          currentView.value = 'editor'
          currentTab.value = 'format'
          if (window.focus) window.focus()
        }
        if (changes.ej_compare_text?.newValue) {
          incomingCompareText.value = changes.ej_compare_text.newValue
          chrome.storage.local.remove('ej_compare_text')
          currentView.value = 'editor'
          currentTab.value = 'compare'
          if (window.focus) window.focus()
        }
      })
    }
  }
  
  // Restore dark/light preference (localStorage first, then default to dark mode)
  const savedDark = localStorage.getItem('ej_dark')
  if (savedDark !== null) {
    isDark.value = savedDark === '1'
  } else {
    isDark.value = true // Default to dark mode
  }
  updateThemeClass()
  
  // Restore syntax color theme preference
  const savedSyntax = localStorage.getItem('ej_premium_syntax')
  if (savedSyntax !== null) {
    isPremiumTheme.value = savedSyntax === '1'
  }
  updateSyntaxThemeClass()

  // Restore global sortKeys preference
  const savedGlobalSort = localStorage.getItem('ej_global_sort_keys')
  if (savedGlobalSort !== null) {
    sortKeys.value = parseInt(savedGlobalSort) || 0
  }

  // Restore global ignoreWhitespace preference
  const savedGlobalIgnore = localStorage.getItem('ej_global_ignore_whitespace')
  if (savedGlobalIgnore !== null) {
    ignoreWhitespace.value = savedGlobalIgnore === '1'
  }

  // Restore auto-format preference
  const savedAutoFormat = localStorage.getItem('ej_auto_format')
  if (savedAutoFormat !== null) {
    autoFormat.value = savedAutoFormat === '1'
  }

  // Restore auto-copy preference
  const savedAutoCopy = localStorage.getItem('ej_auto_copy')
  if (savedAutoCopy !== null) {
    autoCopy.value = savedAutoCopy === '1'
  }

  // Restore auto-extract preference
  const savedAutoExtract = localStorage.getItem('ej_auto_extract')
  if (savedAutoExtract !== null) {
    autoExtract.value = savedAutoExtract === '1'
  }

  // Restore auto-paste preference
  const savedAutoPaste = localStorage.getItem('ej_auto_paste')
  if (savedAutoPaste !== null) {
    autoPaste.value = savedAutoPaste === '1'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <!-- 首次安装提示：从 DMG 运行时提醒拖入 Applications -->
  <Transition name="slide-down">
    <div v-if="needsInstall && !installDismissed" class="install-banner">
      <div class="install-banner-content">
        <AlertTriangle class="update-banner-icon" />
        <span>你正在从安装包直接运行 easyJSON，请将 easyJSON.app 拖入 Applications 文件夹完成安装</span>
      </div>
      <div class="update-banner-actions">
        <button class="install-banner-btn" @click="installDismissed = true">
          <X class="update-btn-icon" />
          <span>知道了</span>
        </button>
      </div>
    </div>
  </Transition>

  <!-- 版本更新提示 -->
  <Transition name="slide-down">
    <div v-if="hasUpdate && !updateDismissed" class="update-banner">
      <div class="update-banner-content">
        <AlertTriangle class="update-banner-icon" />
        <span>发现新版本 v{{ latestVersion }}，建议更新</span>
      </div>
      <div class="update-banner-actions">
        <a :href="downloadUrl" target="_blank" class="update-banner-btn">
          <Download class="update-btn-icon" />
          <span>下载</span>
        </a>
        <button class="update-banner-close" @click="updateDismissed = true">
          <X class="update-close-icon" />
        </button>
      </div>
    </div>
  </Transition>

  <!-- Home Page View -->
  <HomeView v-if="currentView === 'home'" @go-to-app="goToApp" @go-to-test="goToTest" @go-to-comment="goToComment" @go-to-changelog="goToChangelog" />

  <TestView v-else-if="currentView === 'test'" @go-back="goToHome" />

  <CommentView v-else-if="currentView === 'comment'" @go-back="goToHome" />

  <ChangelogView v-else-if="currentView === 'changelog'" @go-back="goToHome" />

  <!-- Editor View -->
  <div v-else class="app-layout">
    <!-- Left Sidebar -->
    <aside class="app-sidebar">
      <div class="sidebar-top">
        <div class="sidebar-logo" data-tooltip-right="easyJSON" @click="goToHome" style="cursor: pointer;">
          <img src="/images/logo.png" class="sidebar-logo-icon" alt="easyJSON" />
        </div>
        <button v-if="!isUtools && !isVscode && !isTauri" class="sidebar-btn" @click="goToHome" data-tooltip-right="返回主页">
          <Home class="sidebar-btn-icon" />
        </button>
        <button
          class="sidebar-btn sidebar-nav-btn"
          :class="{ active: currentTab === 'format' }"
          @click="setTab('format')"
        >
          <Braces class="sidebar-btn-icon" />
          <span class="sidebar-btn-label">格式化</span>
        </button>
        <button
          class="sidebar-btn sidebar-nav-btn"
          :class="{ active: currentTab === 'compare' }"
          @click="setTab('compare')"
        >
          <Split class="sidebar-btn-icon" />
          <span class="sidebar-btn-label">对比</span>
        </button>
      </div>
      
      <div class="sidebar-bottom">
        <button
          class="sidebar-btn"
          :class="{ active: sortKeys !== 0 }"
          @click="sortKeys = sortKeys === 0 ? 1 : sortKeys === 1 ? 2 : 0"
          :data-tooltip-right="sortKeys === 0 ? '开启 Key 升序 A→Z' : sortKeys === 1 ? '切换为降序 Z→A' : '关闭 Key 排序'"
        >
          <ArrowUpDown v-if="sortKeys === 0" class="sidebar-btn-icon" />
          <ArrowUp v-else-if="sortKeys === 1" class="sidebar-btn-icon" />
          <ArrowDown v-else class="sidebar-btn-icon" />
        </button>
        <button class="sidebar-btn" :class="{ active: ignoreWhitespace }" @click="ignoreWhitespace = !ignoreWhitespace" :data-tooltip-right="ignoreWhitespace ? '关闭忽略空格' : '开启忽略空格'">
          <Space class="sidebar-btn-icon" />
        </button>
        <button class="sidebar-btn" :class="{ active: autoFormat }" @click="autoFormat = !autoFormat" :data-tooltip-right="autoFormat ? '关闭自动格式化' : '开启自动格式化'">
          <Zap class="sidebar-btn-icon" />
        </button>
        <button class="sidebar-btn" :class="{ active: autoCopy }" @click="autoCopy = !autoCopy" :data-tooltip-right="autoCopy ? '关闭操作后自动复制' : '开启操作后自动复制'">
          <ClipboardCheck class="sidebar-btn-icon" />
        </button>
        <button class="sidebar-btn" :class="{ active: autoExtract }" @click="autoExtract = !autoExtract" :data-tooltip-right="autoExtract ? '关闭粘贴自动提取' : '开启粘贴自动提取'">
          <Search class="sidebar-btn-icon" />
        </button>
        <button class="sidebar-btn" :class="{ active: autoPaste }" @click="autoPaste = !autoPaste" :data-tooltip-right="autoPaste ? '关闭自动粘贴' : '开启自动粘贴'">
          <Clipboard class="sidebar-btn-icon" />
        </button>
        <button class="sidebar-btn" @click="toggleSyntaxTheme" :data-tooltip-right="isPremiumTheme ? '切换至 One Dark' : '切换至 Premium'">
          <Palette class="sidebar-btn-icon" />
        </button>
        <button v-if="!isVscode" class="sidebar-btn" @click="toggleTheme" :data-tooltip-right="isDark ? '切换至浅色' : '切换至深色'">
          <Sun v-if="isDark" class="sidebar-btn-icon" />
          <Moon v-else class="sidebar-btn-icon" />
        </button>
        <button v-if="isPopup" class="sidebar-btn" @click="openInTab" data-tooltip-right="在新标签页中打开（全屏）">
          <Maximize class="sidebar-btn-icon" />
        </button>
        
        <!-- Neon Breathing Feedback Button -->
        <button
          class="sidebar-btn sidebar-btn-neon"
          @click="goToComment"
          data-tooltip-right="留言反馈"
        >
          <MessageCircle class="sidebar-btn-icon" />
        </button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="app-main-content">
      <KeepAlive>
        <component :is="currentTab === 'format' ? JsonFormatter : JsonComparer" class="fade-in" />
      </KeepAlive>
    </main>

    <!-- Global Toast Notification Stack -->
    <div class="toast-stack-container">
      <TransitionGroup name="toast-slide">
        <div 
          v-for="t in toasts" 
          :key="t.id" 
          class="global-toast" 
          :class="t.type"
          :style="getToastStyle(toasts.indexOf(t))"
        >
          <CheckCircle v-if="t.type === 'success'" class="toast-icon success" />
          <AlertTriangle v-else class="toast-icon error" />
          <span>{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.fade-in {
  animation: fadeIn 0.15s ease forwards;
}

/* Toast Styles */
.global-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  max-width: 360px;
  border-radius: 6px;
  background-color: var(--bg-panel);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.02);
  z-index: 9999;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  pointer-events: none;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, z-index 0.35s ease;
}
/* 小屏适配 */
@media (max-width: 480px) {
  .global-toast {
    bottom: 16px;
    right: 12px;
    left: 12px;
    max-width: none;
    padding: 10px 14px;
    gap: 6px;
    font-size: 12px;
    border-radius: 8px;
  }
}

.toast-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.toast-icon.success {
  color: #22c55e;
}

.toast-icon.error {
  color: #ef4444;
}

/* Toast Vue Transitions - 弹簧弹跳动画 */
.toast-slide-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.toast-slide-enter-from {
  opacity: 0 !important;
  transform: translateX(80px) scale(0.85) !important;
}

.toast-slide-leave-active {
  transition: all 0.35s ease-in !important;
}

.toast-slide-leave-to {
  opacity: 0 !important;
  transform: translateX(80px) scale(0.85) !important;
}

.toast-slide-move {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── 版本更新提示横幅 ── */
.update-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #d97706, #f59e0b);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  position: relative;
  z-index: 999;
}
.update-banner-content {
  display: flex;
  align-items: center;
  gap: 6px;
}
.update-banner-icon {
  width: 16px;
  height: 16px;
}
.update-banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.update-banner-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 12px;
  border-radius: 4px;
  background: rgba(255,255,255,0.22);
  color: #fff;
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
  transition: background 0.15s;
}
.update-banner-btn:hover {
  background: rgba(255,255,255,0.35);
}
.update-btn-icon {
  width: 13px;
  height: 13px;
}
.update-banner-close {
  display: flex;
  align-items: center;
  padding: 2px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.8);
  cursor: pointer;
  border-radius: 4px;
}
.update-banner-close:hover {
  color: #fff;
  background: rgba(255,255,255,0.15);
}
.update-close-icon {
  width: 14px;
  height: 14px;
}

/* ── 安装提示横幅 ── */
.install-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  position: relative;
  z-index: 999;
}
.install-banner-content {
  display: flex;
  align-items: center;
  gap: 6px;
}
.install-banner-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 12px;
  border-radius: 4px;
  border: none;
  background: rgba(255,255,255,0.22);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}
.install-banner-btn:hover {
  background: rgba(255,255,255,0.35);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

</style>
