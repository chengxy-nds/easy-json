<script setup>
import { ref, onMounted, provide, watch } from 'vue'
import JsonFormatter from './components/JsonFormatter.vue'
import JsonComparer from './components/JsonComparer.vue'
import HomeView from './components/HomeView.vue'
import TestView from './components/TestView.vue'
import { Sun, Moon, Split, Braces, CheckCircle, AlertTriangle, Palette, ArrowUpDown, Space, Zap, ClipboardCheck, Search, Home, Maximize, Clipboard, FlaskConical } from 'lucide-vue-next'

const currentView = ref('home') // 'home' | 'editor' | 'test'
const isPopup = ref(false)

const openInTab = () => {
  const url = chrome.runtime.getURL('index.html?mode=tab')
  chrome.tabs.create({ url })
  window.close()
}

const goToApp = () => {
  currentView.value = 'editor'
  localStorage.setItem('ej_view', 'editor')
}

const goToHome = () => {
  currentView.value = 'home'
  localStorage.setItem('ej_view', 'home')
}

const goToTest = () => {
  currentView.value = 'test'
}

const currentTab = ref('format') // 'format' | 'compare'

const setTab = (tab) => {
  currentTab.value = tab
  localStorage.setItem('ej_tab', tab)
}
const isDark = ref(true)
const isPremiumTheme = ref(true)
const sortKeys = ref(false)
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

watch(sortKeys, (newVal) => {
  localStorage.setItem('ej_global_sort_keys', newVal ? '1' : '0')
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
  isDark.value = !isDark.value
  updateThemeClass()
  localStorage.setItem('ej_dark', isDark.value ? '1' : '0')
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

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const isTab = urlParams.get('mode') === 'tab'
  const isExtract = urlParams.get('action') === 'extract'

  // Right-click extract: force editor view + format tab
  if (isExtract) {
    currentView.value = 'editor'
    currentTab.value = 'format'
  } else if (isTab) {
    // 插件图标点击（全屏标签页）→ 直接进入格式化页面
    currentView.value = 'editor'
  } else {
    // Restore view preference (home / editor) — default to home on first launch
    const savedView = localStorage.getItem('ej_view')
    if (savedView === 'editor') {
      currentView.value = 'editor'
    }

    // Restore last active panel (format / compare)
    const savedTab = localStorage.getItem('ej_tab')
    if (savedTab === 'format' || savedTab === 'compare') {
      currentTab.value = savedTab
    }
  }

  // Detect if running as a Chrome extension popup (not a full tab)
  const isExtension = window.chrome && window.chrome.runtime && window.chrome.runtime.id
  if (isExtension && !isTab && !isExtract) {
    document.documentElement.classList.add('popup-mode')
    isPopup.value = true
  }
  
  // Restore dark/light preference (localStorage first, then system preference)
  const savedDark = localStorage.getItem('ej_dark')
  if (savedDark !== null) {
    isDark.value = savedDark === '1'
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
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
    sortKeys.value = savedGlobalSort === '1'
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
</script>

<template>
  <!-- Home Page View -->
  <HomeView v-if="currentView === 'home'" @go-to-app="goToApp" />

  <TestView v-else-if="currentView === 'test'" @go-back="goToHome" />

  <!-- Editor View -->
  <div v-else class="app-layout">
    <!-- Left Sidebar -->
    <aside class="app-sidebar">
      <div class="sidebar-top">
        <div class="sidebar-logo" data-tooltip-right="easyJSON" @click="goToHome" style="cursor: pointer;">
          <img src="/images/logo.png" class="sidebar-logo-icon" alt="easyJSON" />
        </div>
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
        <button class="sidebar-btn" :class="{ active: sortKeys }" @click="sortKeys = !sortKeys" :data-tooltip-right="sortKeys ? '关闭全局按 Key 排序' : '开启全局按 Key 排序'">
          <ArrowUpDown class="sidebar-btn-icon" />
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
        <button class="sidebar-btn" @click="toggleTheme" :data-tooltip-right="isDark ? '切换至浅色' : '切换至深色'">
          <Sun v-if="isDark" class="sidebar-btn-icon" />
          <Moon v-else class="sidebar-btn-icon" />
        </button>
        <button v-if="isPopup" class="sidebar-btn" @click="openInTab" data-tooltip-right="在新标签页中打开（全屏）">
          <Maximize class="sidebar-btn-icon" />
        </button>
       <!-- <button class="sidebar-btn" @click="goToTest" data-tooltip-right="提取测试">
          <FlaskConical class="sidebar-btn-icon" />
        </button>-->
        <button class="sidebar-btn" @click="goToHome" data-tooltip-right="返回主页">
          <Home class="sidebar-btn-icon" />
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
  padding: 12px 24px;
  min-width: 280px;
  border-radius: 6px;
  background-color: var(--bg-panel);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.02);
  z-index: 9999;
  font-family: var(--font-sans);
  font-size: clamp(11px, 1vw, 13px);
  font-weight: 500;
  color: var(--text-primary);
  pointer-events: none;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, z-index 0.35s ease;
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
</style>
