<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import {
  History, X, Search, Trash2, Copy, Check, Plus, ArrowRightToLine, FilterX, Clock, FileJson, ChevronRight, Eye, ArrowLeft, Split
} from 'lucide-vue-next'
import CodeMirrorEditor from './CodeMirrorEditor.vue'
import * as Diff from 'diff'
import {
  getAllHistoryRecords,
  getHistoryRecordsByTabId,
  deleteHistoryRecord,
  deleteOtherHistoryRecords,
  clearTabHistoryRecords,
  clearAllHistoryRecords,
  keepLatestRecords
} from '../utils/historyStorage.js'
import { safeParse, safeStringify } from '../utils/jsonBigInt.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  currentTabId: {
    type: [Number, String],
    default: null
  },
  currentTabTitle: {
    type: String,
    default: ''
  },
  getCurrentContent: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'open-new-tab', 'load-to-current', 'toast'])

// 注入与主页面左侧编辑器完全一致的主题与排版偏好
const isDark = inject('isDark', ref(true))
const isPremiumTheme = inject('isPremiumTheme', ref(true))
const editorFontSize = inject('editorFontSize', ref(13))
const showLineNumbers = inject('showLineNumbers', ref(true))
const editorWordWrap = inject('editorWordWrap', ref('wrap'))
const editorFontFamily = inject('editorFontFamily', ref(''))

const editorLineHeight = computed(() => {
  const size = Number(editorFontSize.value) || 13
  const map = { 10: 16, 11: 18, 12: 20, 13: 20, 14: 22, 15: 23, 16: 24, 18: 26, 20: 28, 22: 30, 24: 32 }
  return map[size] || Math.round(size * 1.6)
})

const historyList = ref([])
const searchQuery = ref('')
const selectedRecord = ref(null)
const copiedId = ref(null)
const confirmClear = ref(false)
const previewMode = ref('content') // 'content' | 'diff'
const currentTabContent = ref('')

// 动态相对时间自刷新心跳 (每 30 秒触发响应式时间更新)
const nowTick = ref(Date.now())
let timeTickTimer = null

const startTickTimer = () => {
  stopTickTimer()
  nowTick.value = Date.now()
  timeTickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 30000)
}

const stopTickTimer = () => {
  if (timeTickTimer) {
    clearInterval(timeTickTimer)
    timeTickTimer = null
  }
}

const refreshCurrentTabContent = () => {
  if (typeof props.getCurrentContent === 'function') {
    currentTabContent.value = props.getCurrentContent() || ''
  }
}

const loadRecords = async () => {
  if (props.currentTabId != null) {
    const list = await getHistoryRecordsByTabId(props.currentTabId)
    historyList.value = list
  } else {
    const list = await getAllHistoryRecords()
    historyList.value = list
  }
  // 若当前选中的记录已被删除，清除选中
  if (selectedRecord.value && !historyList.value.some(item => item.id === selectedRecord.value.id)) {
    selectedRecord.value = null
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    startTickTimer()
    loadRecords()
    refreshCurrentTabContent()
    confirmClear.value = false
    searchQuery.value = ''
    selectedRecord.value = null
  } else {
    stopTickTimer()
  }
})

watch(() => props.currentTabId, () => {
  if (props.visible) {
    loadRecords()
    refreshCurrentTabContent()
    selectedRecord.value = null
    searchQuery.value = ''
  }
})

// 过滤后的列表 (仅限当前激活 Tab 下的记录，配合关键字搜索)
const filteredList = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return historyList.value

  return historyList.value.filter(item => {
    const titleMatch = item.title && item.title.toLowerCase().includes(query)
    const contentMatch = item.content && item.content.toLowerCase().includes(query)
    return titleMatch || contentMatch
  })
})

// 历史记录版本号映射（优先使用持久化不可变版本号，旧记录时序补齐，彻底避免删除导致其他版本号漂移）
const itemVersionMap = computed(() => {
  const map = new Map()
  const total = historyList.value.length
  historyList.value.forEach((item, index) => {
    if (typeof item.versionNumber === 'number') {
      map.set(item.id, `v${item.versionNumber}`)
    } else {
      const vNum = total - index
      map.set(item.id, `v${vNum}`)
    }
  })
  return map
})

const getVersionTag = (id) => {
  return itemVersionMap.value.get(id) || 'v1'
}

const isLatestRecord = (id) => {
  return historyList.value.length > 0 && historyList.value[0]?.id === id
}

// 选中的历史记录美化展示 (基准原版本 / Old)
const formattedSelectedContent = computed(() => {
  if (!selectedRecord.value?.content) return ''
  try {
    const obj = safeParse(selectedRecord.value.content)
    return safeStringify(obj, null, 2)
  } catch (e) {
    return selectedRecord.value.content
  }
})

// 当前激活 Tab 正编辑的内容美化展示 (最新版本 / New)
const formattedCurrentContent = computed(() => {
  if (!currentTabContent.value) return ''
  try {
    const obj = safeParse(currentTabContent.value)
    return safeStringify(obj, null, 2)
  } catch (e) {
    return currentTabContent.value
  }
})

// 🚀 核心：Git 风格差异计算 (历史版本 vs 当前编辑内容)
const computedDiff = computed(() => {
  const oldText = formattedSelectedContent.value || ''
  const newText = formattedCurrentContent.value || ''
  if (!oldText && !newText) {
    return { lines: [], addCount: 0, delCount: 0, isIdentical: true }
  }

  const rawChunks = Diff.diffLines(oldText, newText)
  let oldLine = 1
  let newLine = 1
  let addCount = 0
  let delCount = 0
  const lines = []

  rawChunks.forEach(chunk => {
    const chunkLines = chunk.value.replace(/\r\n/g, '\n').split('\n')
    if (chunkLines.length > 1 && chunkLines[chunkLines.length - 1] === '') {
      chunkLines.pop()
    }

    chunkLines.forEach(lineStr => {
      if (chunk.added) {
        addCount++
        lines.push({
          type: 'add',
          sign: '+',
          oldLine: null,
          newLine: newLine++,
          text: lineStr
        })
      } else if (chunk.removed) {
        delCount++
        lines.push({
          type: 'del',
          sign: '-',
          oldLine: oldLine++,
          newLine: null,
          text: lineStr
        })
      } else {
        lines.push({
          type: 'normal',
          sign: ' ',
          oldLine: oldLine++,
          newLine: newLine++,
          text: lineStr
        })
      }
    })
  })

  const isIdentical = addCount === 0 && delCount === 0 && oldText === newText

  // ── 第二阶段：行内字符/单词级微差异精准配对分析 (Word-level Inline Diff)
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]
    const next = lines[i + 1]
    // 识别相邻成对的改动行：当前行是 del(-)，紧接下一行是 add(+)
    if (current.type === 'del' && next && next.type === 'add' && !current.html && !next.html) {
      const { delHtml, addHtml } = computePairWordDiff(current.text, next.text)
      current.html = delHtml
      next.html = addHtml
      i++ // 跳过下一行
    } else if (!current.html) {
      current.html = highlightTokens(current.text)
    }
  }

  return { lines, addCount, delCount, isIdentical }
})

const diffEditorStyle = computed(() => ({
  fontFamily: editorFontFamily.value || "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace",
  fontSize: (Number(editorFontSize.value) || 13) + 'px',
  lineHeight: (editorLineHeight.value || 20) + 'px'
}))

// JSON 语法词法着色
const highlightTokens = (text) => {
  if (!text) return '&nbsp;'
  const safeStr = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\]:,])/g

  return safeStr.replace(regex, (match) => {
    if (match.endsWith(':')) {
      const colonIndex = match.lastIndexOf(':')
      const keyPart = match.substring(0, colonIndex)
      const colonPart = match.substring(colonIndex)
      return `<span class="json-key">${keyPart}</span><span class="json-colon">${colonPart}</span>`
    }
    if (match.startsWith('"')) {
      return `<span class="json-string">${match}</span>`
    }
    if (/true|false/.test(match)) {
      return `<span class="json-bool">${match}</span>`
    }
    if (/null/.test(match)) {
      return `<span class="json-null">${match}</span>`
    }
    if (/[{}[\]]/.test(match)) {
      return `<span class="json-bracket">${match}</span>`
    }
    if (/[:,]/.test(match)) {
      return `<span class="json-colon">${match}</span>`
    }
    return `<span class="json-number">${match}</span>`
  })
}

// 相邻成对修改行：计算行内字符/单词级细粒度微差异 (Word-level Inline Diff)
const computePairWordDiff = (oldText, newText) => {
  try {
    const parts = Diff.diffWordsWithSpace(oldText, newText)
    let delHtml = ''
    let addHtml = ''
    parts.forEach(part => {
      if (part.removed) {
        delHtml += `<span class="word-removed">${highlightTokens(part.value)}</span>`
      } else if (part.added) {
        addHtml += `<span class="word-added">${highlightTokens(part.value)}</span>`
      } else {
        delHtml += highlightTokens(part.value)
        addHtml += highlightTokens(part.value)
      }
    })
    return { delHtml, addHtml }
  } catch (e) {
    return { delHtml: highlightTokens(oldText), addHtml: highlightTokens(newText) }
  }
}

// 提取搜索内容命中的代码片段并高亮
const getMatchSnippet = (content, query) => {
  if (!content || !query) return ''
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return ''

  const index = lowerContent.indexOf(lowerQuery)
  if (index === -1) return ''

  const start = Math.max(0, index - 20)
  const end = Math.min(content.length, index + lowerQuery.length + 25)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < content.length ? '...' : ''

  const rawSnippet = content.slice(start, end).replace(/\s+/g, ' ')
  const safeSnippet = rawSnippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const safeQuery = lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const highlighted = safeSnippet.replace(new RegExp(`(${safeQuery})`, 'gi'), '<mark class="search-snippet-mark">$1</mark>')
  return prefix + highlighted + suffix
}

// 为已生成的 HTML 代码安全地注入搜索词高亮 (避免破坏 HTML 标签内部结构)
const applySearchHighlight = (html, query) => {
  if (!html || !query) return html
  const q = query.trim()
  if (!q) return html
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = html.split(/(<[^>]+>)/g)
  return parts.map(part => {
    if (part.startsWith('<') && part.endsWith('>')) {
      return part
    }
    return part.replace(new RegExp(`(${safeQ})`, 'gi'), '<mark class="search-snippet-mark">$1</mark>')
  }).join('')
}

// 当前选中的版本在搜索关键字下的命中次数
const currentRecordMatchCount = computed(() => {
  if (!searchQuery.value || !selectedRecord.value?.content) return 0
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return 0
  const content = selectedRecord.value.content.toLowerCase()
  let count = 0
  let pos = 0
  while ((pos = content.indexOf(q, pos)) !== -1) {
    count++
    pos += q.length
  }
  return count
})

const handleKeepLatest = async (count = 5) => {
  await keepLatestRecords(count, props.currentTabId)
  await loadRecords()
  emit('toast', `已保留最近 ${count} 条历史记录，清理其余旧版本`)
}

const closeDrawer = () => {
  emit('update:visible', false)
  selectedRecord.value = null
}

const selectRecord = (item) => {
  if (selectedRecord.value?.id === item.id) {
    // 再次点击同一行可收起预览
    selectedRecord.value = null
  } else {
    selectedRecord.value = item
    previewMode.value = 'content' // 默认进入完整内容模式
    refreshCurrentTabContent()
  }
}

const handleOpenNewTab = (item) => {
  const versionTag = getVersionTag(item.id)
  emit('open-new-tab', { ...item, versionTag })
  closeDrawer()
}

const handleLoadToCurrent = (item) => {
  emit('load-to-current', item)
  closeDrawer()
}

// 切换对比当前状态：选中即比对，取消选中恢复默认的完整内容
const toggleCompareMode = () => {
  if (previewMode.value === 'diff') {
    previewMode.value = 'content'
  } else {
    previewMode.value = 'diff'
    refreshCurrentTabContent()
  }
}

// 在抽屉内就地开启 Git 风格差异对比（已是比对状态再次点击则恢复完整内容）
const handleCompareWithCurrent = (item) => {
  if (selectedRecord.value?.id === item.id && previewMode.value === 'diff') {
    previewMode.value = 'content'
  } else {
    selectedRecord.value = item
    previewMode.value = 'diff'
    refreshCurrentTabContent()
  }
}

const handleCopy = (item) => {
  if (!item.content) return
  if (window.utools && typeof window.utools.copyText === 'function') {
    window.utools.copyText(item.content)
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(item.content).catch(() => {})
  }
  copiedId.value = item.id
  emit('toast', '已复制历史记录内容')
  setTimeout(() => {
    if (copiedId.value === item.id) {
      copiedId.value = null
    }
  }, 1500)
}

const handleDeleteOne = async (id) => {
  if (selectedRecord.value?.id === id) {
    selectedRecord.value = null
  }
  await deleteHistoryRecord(id)
  historyList.value = historyList.value.filter(item => item.id !== id)
  emit('toast', '已删除该条历史')
}

const handleDeleteOthers = async (keepId) => {
  await deleteOtherHistoryRecords(keepId, props.currentTabId)
  historyList.value = historyList.value.filter(item => item.id === keepId)
  if (selectedRecord.value && selectedRecord.value.id !== keepId) {
    selectedRecord.value = filteredList.value[0] || null
  }
  emit('toast', '已删除其他历史记录')
}

const handleClearAll = async () => {
  if (!confirmClear.value) {
    confirmClear.value = true
    setTimeout(() => {
      confirmClear.value = false
    }, 3000)
    return
  }
  if (props.currentTabId != null) {
    await clearTabHistoryRecords(props.currentTabId)
    historyList.value = []
    emit('toast', `已清空「${props.currentTabTitle || '当前Tab'}」的历史记录`)
  } else {
    await clearAllHistoryRecords()
    historyList.value = []
    emit('toast', '已清空历史记录')
  }
  selectedRecord.value = null
  confirmClear.value = false
}

// 友好时间显示
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const now = Date.now()
  const diffSec = Math.floor((now - timestamp) / 1000)
  if (diffSec < 60) return '刚刚'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const d = new Date(timestamp)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hours}:${mins}`
}

// 完整日期时间 (用于底部状态栏)
const formatFullDate = (timestamp) => {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  const secs = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${hours}:${mins}:${secs}`
}

// 提取单行/前几行预览
const getPreviewText = (content, maxLines = 3) => {
  if (!content) return ''
  const lines = content.split('\n')
  return lines.slice(0, maxLines).join('\n')
}

// 按 ESC 键关闭
const onKeyDown = (e) => {
  if (e.key === 'Escape' && props.visible) {
    if (selectedRecord.value) {
      selectedRecord.value = null
    } else {
      closeDrawer()
    }
  }
}

const onHistoryUpdated = (e) => {
  if (!props.visible) return
  const eventTabId = e.detail?.tabId
  if (!props.currentTabId || !eventTabId || String(props.currentTabId) === String(eventTabId)) {
    loadRecords()
    refreshCurrentTabContent()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('easy-json-history-updated', onHistoryUpdated)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('easy-json-history-updated', onHistoryUpdated)
})

defineExpose({
  loadRecords
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="history-drawer-wrapper">
      <!-- 遮罩层 -->
      <Transition name="fade">
        <div class="drawer-backdrop" @click="closeDrawer"></div>
      </Transition>

      <!-- 抽屉本体：支持选中有内容时自适应向右扩展预览窗 -->
      <Transition name="slide-drawer">
        <div
          class="drawer-panel"
          :class="{ 'has-preview': !!selectedRecord, 'is-dark': isDark }"
          @click.stop
        >
          <!-- 左栏：历史列表区 -->
          <div class="drawer-list-column">
            <!-- 头部：极简扁平 -->
            <div class="drawer-header">
              <div class="header-title-group">
                <History class="header-icon" />
                <span class="header-title">历史记录</span>
                <span v-if="currentTabTitle" class="header-tab-badge" :title="`当前激活标签：${currentTabTitle}`">{{ currentTabTitle }}</span>
                <span class="header-count-badge">
                  {{ searchQuery ? `${filteredList.length}/${historyList.length}` : `${filteredList.length}个版本` }}
                </span>
              </div>
              <div class="header-actions">
                <button
                  v-if="filteredList.length > 0"
                  class="header-btn-ghost danger"
                  :class="{ 'confirming': confirmClear }"
                  @click="handleClearAll"
                  :title="confirmClear ? '确认清空当前标签历史' : '清空当前标签历史'"
                >
                  <Trash2 class="btn-icon-xs" />
                  <span>{{ confirmClear ? '确认清空' : '清空' }}</span>
                </button>
                <button class="header-close-btn" @click="closeDrawer" title="关闭 (Esc)">
                  <X class="btn-icon-sm" />
                </button>
              </div>
            </div>

            <!-- 搜索过滤栏：沉浸式纯平无边框 -->
            <div class="drawer-search-bar">
              <Search class="search-icon" />
              <input
                v-model="searchQuery"
                type="text"
                class="search-input"
                placeholder="搜索当前标签历史记录..."
              />
              <button v-if="searchQuery" class="search-clear-btn" @click="searchQuery = ''">
                <X class="clear-icon" />
              </button>
            </div>

            <!-- 列表区：纯平行式列表 -->
            <div class="drawer-content">
              <div v-if="filteredList.length === 0" class="drawer-empty">
                <div class="empty-icon-wrap">
                  <FileJson class="empty-icon" />
                </div>
                <p class="empty-text">
                  {{ searchQuery ? '未找到匹配的历史记录' : (currentTabTitle ? `「${currentTabTitle}」暂无历史版本` : '当前标签页暂无历史版本') }}
                </p>
                <span class="empty-hint">
                  {{ searchQuery ? '请尝试更换搜索关键字' : '在此标签页格式化或导入 JSON 后将自动记录于此' }}
                </span>
              </div>

              <div v-else class="records-timeline">
                <div
                  v-for="(item, idx) in filteredList"
                  :key="item.id"
                  class="timeline-item"
                  :class="{
                    'is-selected': selectedRecord?.id === item.id,
                    'is-latest': isLatestRecord(item.id),
                    'is-first': idx === 0,
                    'is-last': idx === filteredList.length - 1
                  }"
                  @click="selectRecord(item)"
                >
                  <!-- 左侧时间线轴与节点圆点 -->
                  <div class="timeline-axis">
                    <div class="timeline-line"></div>
                    <div class="timeline-dot" :class="{ 'dot-latest': isLatestRecord(item.id) }"></div>
                  </div>

                  <!-- 右侧时间线卡片 -->
                  <div class="timeline-card">
                    <!-- 单行首部：左侧版本号(v1 + 最新) ──── 右侧统一收拢(大小 · 行数 · 相对时间) -->
                    <div class="timeline-header">
                      <div class="timeline-header-left">
                        <span class="version-tag" :class="{ 'is-latest': isLatestRecord(item.id) }">
                          {{ getVersionTag(item.id) }}
                        </span>
                        <span v-if="isLatestRecord(item.id)" class="latest-badge">最新</span>
                        <span class="version-size-lines">
                          <span>{{ item.sizeText || '未知大小' }}</span>
                          <span class="meta-dot">·</span>
                          <span>{{ item.lines || 1 }} 行</span>
                        </span>
                      </div>
                      <div class="timeline-header-right">
                        <!-- 常态右侧元信息：仅展示相对时间 -->
                        <div class="meta-info-wrap">
                          <span class="version-time">{{ formatTime(item.createdAt) }}</span>
                        </div>
                        <!-- 未选中时 hover 原地浮现的轻量单行微工具条 (高度 0 改变，彻底消除抖动) -->
                        <div v-if="selectedRecord?.id !== item.id" class="header-hover-actions" @click.stop>
                          <button
                            class="hover-mini-btn"
                            @click.stop="handleCompareWithCurrent(item)"
                            title="与当前编辑版本对比"
                          >
                            <Split :size="11" />
                          </button>
                          <button
                            class="hover-mini-btn"
                            @click.stop="handleLoadToCurrent(item)"
                            title="将此版本载入覆盖当前Tab"
                          >
                            <ArrowRightToLine :size="11" />
                          </button>
                          <button
                            class="hover-mini-btn"
                            @click.stop="handleOpenNewTab(item)"
                            title="在新Tab中打开此版本"
                          >
                            <Plus :size="11" />
                          </button>
                          <button
                            class="hover-mini-btn"
                            :class="{ 'copied': copiedId === item.id }"
                            @click.stop="handleCopy(item)"
                            title="复制此条 JSON"
                          >
                            <Check v-if="copiedId === item.id" :size="11" class="success-color" />
                            <Copy v-else :size="11" />
                          </button>
                          <button
                            class="hover-mini-btn danger"
                            @click.stop="handleDeleteOne(item.id)"
                            title="删除此条记录"
                          >
                            <Trash2 :size="11" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- 搜索命中上下文代码片段 (Snippet) -->
                    <div
                      v-if="searchQuery && getMatchSnippet(item.content, searchQuery)"
                      class="timeline-search-snippet"
                    >
                      <span class="snippet-label">命中</span>
                      <span class="snippet-code" v-html="getMatchSnippet(item.content, searchQuery)"></span>
                    </div>

                    <!-- 第三行：悬停/选中浮现的快捷操作条 -->
                    <div class="timeline-actions" @click.stop>
                      <div class="actions-group-left">
                        <button
                          class="timeline-btn"
                          :class="{ active: selectedRecord?.id === item.id && previewMode === 'diff' }"
                          @click.stop="handleCompareWithCurrent(item)"
                          :title="selectedRecord?.id === item.id && previewMode === 'diff' ? '取消对比，恢复完整内容' : '与当前编辑版本进行对比'"
                        >
                          <Split :size="12" class="action-icon" />
                          <span>对比</span>
                        </button>
                        <button
                          class="timeline-btn"
                          @click.stop="handleLoadToCurrent(item)"
                          title="将此版本载入覆盖当前Tab"
                        >
                          <ArrowRightToLine :size="12" class="action-icon" />
                          <span>覆盖</span>
                        </button>
                        <button
                          class="timeline-btn primary"
                          @click.stop="handleOpenNewTab(item)"
                          title="在新Tab中打开此版本"
                        >
                          <Plus :size="12" class="action-icon" />
                          <span>新建Tab</span>
                        </button>
                      </div>

                      <div class="actions-group-right">
                        <button
                          class="timeline-icon-btn"
                          :class="{ 'copied': copiedId === item.id }"
                          @click.stop="handleCopy(item)"
                          title="复制此条 JSON"
                        >
                          <Check v-if="copiedId === item.id" :size="12" class="action-icon success-color" />
                          <Copy v-else :size="12" class="action-icon" />
                        </button>
                        <button
                          class="timeline-icon-btn danger"
                          @click.stop="handleDeleteOne(item.id)"
                          title="删除此条记录"
                        >
                          <Trash2 :size="12" class="action-icon" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 右栏：右侧完整 JSON 预览区 (点击任意行即时展示) -->
          <Transition name="fade-preview">
            <div v-if="selectedRecord" class="drawer-preview-column">
              <!-- 预览头部工具栏 -->
              <div class="preview-header">
                <div class="preview-header-info">
                  <button
                    class="preview-back-btn"
                    @click="selectedRecord = null"
                    title="返回列表"
                  >
                    <ArrowLeft class="btn-icon-sm" />
                    <span class="back-text">返回</span>
                  </button>

                  <div class="preview-title-wrap">
                    <span class="preview-version-tag">{{ getVersionTag(selectedRecord?.id) }}</span>
                    <span class="preview-meta">{{ formatTime(selectedRecord?.createdAt) }}</span>
                    <span
                      v-if="searchQuery && currentRecordMatchCount > 0"
                      class="preview-search-badge"
                      :title="`在此版本正文中匹配到 ${currentRecordMatchCount} 处`"
                    >
                      命中 {{ currentRecordMatchCount }} 处
                    </span>
                  </div>
                </div>

                <div class="preview-header-actions">
                  <!-- 视图模式切换：对比当前 -->
                  <button
                    class="compare-toggle-btn"
                    :class="{ active: previewMode === 'diff' }"
                    @click="toggleCompareMode"
                    :title="previewMode === 'diff' ? '取消对比，恢复完整内容' : '与当前编辑版本进行对比'"
                  >
                    <Split :size="12" class="action-icon" />
                    <span>对比当前</span>
                    <span v-if="previewMode === 'diff' && !computedDiff.isIdentical && (computedDiff.addCount > 0 || computedDiff.delCount > 0)" class="diff-stat-pill">
                      <span v-if="computedDiff.addCount > 0" class="stat-add">+{{ computedDiff.addCount }}</span>
                      <span v-if="computedDiff.delCount > 0" class="stat-del">-{{ computedDiff.delCount }}</span>
                    </span>
                  </button>

                  <!-- 业务动作：新建Tab、覆盖当前、复制 -->
                  <button
                    class="flat-action-btn primary"
                    @click="handleOpenNewTab(selectedRecord)"
                    title="在新建Tab中打开"
                  >
                    <Plus class="action-icon" />
                    <span>新建Tab</span>
                  </button>
                  <button
                    class="flat-action-btn"
                    @click="handleLoadToCurrent(selectedRecord)"
                    title="用此历史版本覆盖当前激活 Tab"
                  >
                    <ArrowRightToLine class="action-icon" />
                    <span>覆盖当前</span>
                  </button>
                  <button
                    class="flat-icon-btn"
                    :class="{ 'copied': copiedId === selectedRecord.id }"
                    @click="handleCopy(selectedRecord)"
                    title="复制完整 JSON"
                  >
                    <Check v-if="copiedId === selectedRecord.id" class="action-icon success-color" />
                    <Copy v-else class="action-icon" />
                  </button>

                  <!-- 微细分割线 -->
                  <div class="header-action-divider"></div>

                  <!-- 窗口控制：关闭 -->
                  <button
                    class="header-close-btn"
                    @click="selectedRecord = null"
                    title="关闭预览面板"
                  >
                    <X class="btn-icon-sm" />
                  </button>
                </div>
              </div>

              <!-- 主体展示区：支持 Git 差异视图与 CodeMirror 代码预览自由切换 -->
              <div class="preview-body">
                <!-- 1. Git 差异对比模式 (Git Diff View) -->
                <div v-if="previewMode === 'diff'" class="git-diff-container" :class="{ 'is-dark': isDark }">
                  <!-- 完全一致无差异提示 -->
                  <div v-if="computedDiff.isIdentical" class="diff-identical-panel">
                    <div class="identical-icon-wrap">
                      <Check :size="16" class="identical-check-icon" />
                    </div>
                    <div class="identical-title">当前内容与此历史版本完全一致</div>
                    <div class="identical-sub">两者数据完全相同，未发生任何字段增删变更。</div>
                    <button class="identical-btn" @click="previewMode = 'content'">
                      <Eye :size="12" class="identical-btn-icon" />
                      <span>查看完整内容</span>
                    </button>
                  </div>

                  <!-- Git Diff 行式代码流 -->
                  <div v-else class="git-diff-scrollable" :style="diffEditorStyle">
                    <div
                      v-for="(row, idx) in computedDiff.lines"
                      :key="idx"
                      class="git-diff-row"
                      :class="row.type"
                    >
                      <div class="diff-gutter-cell">{{ row.newLine || row.oldLine }}</div>
                      <div class="diff-marker-cell">{{ row.sign }}</div>
                      <div class="diff-content-cell">
                        <pre class="diff-line-text" v-html="applySearchHighlight(row.html || highlightTokens(row.text), searchQuery)"></pre>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 2. 原版 CodeMirror 完整代码预览模式 (直接展示存储的真实文本形态：压缩存单行即展示单行，格式化存多行即展示多行) -->
                <div v-else class="preview-editor-wrapper">
                  <CodeMirrorEditor
                    :model-value="selectedRecord?.content || ''"
                    :search-query="searchQuery"
                    :read-only="true"
                    :word-wrap="editorWordWrap === 'wrap'"
                    :show-line-numbers="showLineNumbers"
                    :dark-mode="isDark"
                    :is-premium="isPremiumTheme"
                    :font-size="Number(editorFontSize) || 13"
                    :line-height="editorLineHeight"
                    :font-family="editorFontFamily"
                  />
                </div>
              </div>

              <!-- 3. 底部状态栏 Footer：展示体量、行数、字符数与完整时间戳 -->
              <div class="preview-footer">
                <div class="footer-meta-left">
                  <span class="footer-meta-item">{{ selectedRecord?.sizeText || '未知大小' }}</span>
                  <span class="footer-meta-dot">·</span>
                  <span class="footer-meta-item">{{ selectedRecord?.lines || 1 }} 行</span>
                  <span v-if="selectedRecord?.content" class="footer-meta-dot">·</span>
                  <span v-if="selectedRecord?.content" class="footer-meta-item">{{ selectedRecord.content.length.toLocaleString() }} 字符</span>
                </div>
                <div class="footer-meta-right">
                  <span class="footer-meta-item">{{ formatFullDate(selectedRecord?.createdAt) }}</span>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.history-drawer-wrapper {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  pointer-events: auto;
}

.drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}

/* 抽屉主体：支持自适应平滑扩展为双栏与全分辨率兼容 */
.drawer-panel {
  position: relative;
  width: 380px;
  max-width: 100vw;
  height: 100%;
  background: var(--bg-panel, #ffffff);
  border-right: 1px solid var(--border-color, #e2e8f0);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: row;
  z-index: 10;
  overflow: hidden;
  user-select: none;
  transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 展开右侧预览时：抽屉整体向右平滑展开 */
.drawer-panel.has-preview {
  width: min(1200px, 75vw);
  min-width: 720px;
}

/* 左侧列表栏：宽度绝对恒定，无论展开还是收起预览都绝不发生任何尺寸变化，彻底根除晃动 */
.drawer-list-column {
  width: 380px;
  flex: 0 0 380px;
  min-width: 380px;
  max-width: 380px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* 右侧预览栏：展开时通过左边框与列表栏形成精致分割线，不影响左侧列表的真实可用宽度 */
.drawer-preview-column {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel, #ffffff);
  border-left: 1px solid var(--border-color, #e2e8f0);
  min-width: 0;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

/* 头部：与右侧完整预览区头部高度严格保持一致（48px 像素级齐平） */
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  min-height: 48px;
  max-height: 48px;
  padding: 0 16px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  flex-shrink: 0;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.header-icon {
  width: 16px;
  height: 16px;
  color: var(--primary-color, #3b82f6);
  flex-shrink: 0;
}

.header-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary, #0f1729);
  white-space: nowrap;
  flex-shrink: 0;
}

.header-count-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  line-height: 18px;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
  background: rgba(148, 163, 184, 0.14);
  border-radius: 9px;
  white-space: nowrap;
  letter-spacing: 0.2px;
  flex-shrink: 0;
}

:global(.dark-mode) .header-count-badge {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
}

.header-tab-badge {
  display: inline-flex;
  align-items: center;
  max-width: 90px;
  height: 19px;
  line-height: 19px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 500;
  color: var(--primary-color, #3b82f6);
  background: var(--primary-light, rgba(59, 130, 246, 0.08));
  border: none;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}

:global(.dark-mode) .header-tab-badge {
  background: rgba(59, 130, 246, 0.16);
  border: none;
  color: #60a5fa;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  font-size: 11px;
  font-weight: 500;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  transition: all 0.12s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.header-btn-ghost:hover {
  background: var(--bg-app, #f1f5f9);
  color: var(--text-primary, #0f1729);
}

.header-btn-ghost.danger:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.header-btn-ghost.confirming {
  background: #ef4444 !important;
  color: #ffffff !important;
  font-weight: 600;
}

.header-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  border-radius: 4px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.12s ease;
}

.header-close-btn:hover {
  background: var(--bg-app, #f1f5f9);
  color: var(--text-primary, #0f1729);
}

.btn-icon-xs {
  width: 12px;
  height: 12px;
}

.btn-icon-sm {
  width: 14px;
  height: 14px;
}

/* 搜索栏：纯平底线无外框 */
.drawer-search-bar {
  position: relative;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 24px;
  width: 13px;
  height: 13px;
  color: var(--text-secondary, #94a3b8);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 28px;
  padding: 0 24px 0 26px;
  border: none;
  background: var(--bg-app, #f8fafc);
  border-radius: 4px;
  font-size: 11.5px;
  color: var(--text-primary, #0f1729);
  outline: none;
  transition: background 0.15s ease;
}

.search-input:focus {
  background: var(--border-color, #f1f5f9);
}

.search-clear-btn {
  position: absolute;
  right: 22px;
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-secondary, #94a3b8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.search-clear-btn:hover {
  color: var(--text-primary, #0f1729);
}

.clear-icon {
  width: 11px;
  height: 11px;
}

/* 列表区：移除强制占位 gutter，采用悬浮纤细滚动条，完全消除右侧空隙 */
.drawer-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
}

.drawer-content::-webkit-scrollbar {
  width: 5px;
}

.drawer-content::-webkit-scrollbar-track {
  background: transparent;
}

.drawer-content::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 4px;
}

.drawer-content::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.45);
}

:global(.dark-mode) .drawer-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
}

:global(.dark-mode) .drawer-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.22);
}

/* 空状态 */
.drawer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 220px;
  color: var(--text-secondary, #94a3b8);
}

.empty-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--bg-app, #f1f5f9);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.empty-icon {
  width: 20px;
  height: 20px;
  color: var(--text-secondary, #94a3b8);
}

.empty-text {
  font-size: 12.5px;
  font-weight: 500;
  margin: 0 0 3px 0;
  color: var(--text-primary, #0f1729);
}

.empty-hint {
  font-size: 11px;
}

/* ─── 方案 A：极简 Git 时间线样式 ─── */
.records-timeline {
  display: flex;
  flex-direction: column;
  padding: 6px 12px 16px 10px;
}

.timeline-item {
  position: relative;
  display: flex;
  align-items: stretch;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 4px 2px 0;
  transition: background-color 0.15s ease;
}

.timeline-item:hover {
  background: var(--bg-app, #f8fafc);
}

.timeline-item.is-selected {
  background: var(--primary-light, rgba(59, 130, 246, 0.08));
}

:global(.dark-mode) .timeline-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

:global(.dark-mode) .timeline-item.is-selected {
  background: rgba(59, 130, 246, 0.12);
}

/* 时间轴部分 (轴线 + 节点圆点) */
.timeline-axis {
  position: relative;
  width: 22px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.timeline-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: var(--border-color, #e2e8f0);
  transform: translateX(-50%);
}

.timeline-item.is-first .timeline-line {
  top: 14px; /* 第一项从圆点中心往下连接 */
}

.timeline-item.is-last .timeline-line {
  bottom: calc(100% - 14px); /* 最后一项连接到圆点中心 */
}

.timeline-item.is-first.is-last .timeline-line {
  display: none;
}

.timeline-dot {
  position: relative;
  width: 7px;
  height: 7px;
  margin-top: 11px;
  border-radius: 50%;
  background: var(--text-secondary, #94a3b8);
  border: 2px solid var(--bg-panel, #ffffff);
  box-sizing: content-box;
  z-index: 1;
  transition: all 0.15s ease;
}

:global(.dark-mode) .timeline-dot {
  border-color: var(--bg-panel, #1e293b);
  background: #64748b;
}

.timeline-item:hover .timeline-dot {
  background: var(--primary-color, #3b82f6);
  transform: scale(1.15);
}

.timeline-dot.dot-latest {
  background: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2);
}

.timeline-item.is-selected .timeline-dot {
  background: var(--primary-color, #3b82f6);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(59, 130, 246, 0.25));
}

/* 时间线卡片内容 */
.timeline-card {
  flex: 1;
  min-width: 0;
  padding: 6px 8px 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  gap: 8px;
}

.timeline-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.timeline-header-right {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 20px;
}

.meta-info-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  transition: opacity 0.12s ease;
}

/* 未选中的行：hover 时原地元信息淡出，微型快捷工具条淡入，高度严格 0 变化 */
.timeline-item:not(.is-selected):hover .meta-info-wrap {
  opacity: 0;
  pointer-events: none;
}

.header-hover-actions {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.timeline-item:not(.is-selected):hover .header-hover-actions {
  opacity: 1;
  pointer-events: auto;
}

.hover-mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  padding: 0;
  transition: all 0.1s ease;
}

.hover-mini-btn:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--text-primary, #0f1729);
}

.hover-mini-btn.danger:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

:global(.dark-mode) .hover-mini-btn {
  color: #94a3b8;
}

:global(.dark-mode) .hover-mini-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

:global(.dark-mode) .hover-mini-btn.danger:hover {
  background: rgba(239, 68, 68, 0.18);
  color: #f87171;
}

.version-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 6px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.16);
  color: var(--text-primary, #0f1729);
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.version-tag.is-latest {
  background: var(--primary-light, rgba(59, 130, 246, 0.12));
  color: var(--primary-color, #3b82f6);
}

.latest-badge {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 4px;
  font-size: 9.5px;
  font-weight: 600;
  border-radius: 3px;
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  flex-shrink: 0;
}

.version-size-lines {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  font-weight: 400; /* 严格常规字重，不加粗 */
  color: var(--text-tertiary, #94a3b8);
  white-space: nowrap;
  letter-spacing: 0.1px;
}

:global(.dark-mode) .version-size-lines,
.is-dark .version-size-lines {
  color: #71717a;
}

.version-time {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--text-tertiary, #94a3b8);
}

:global(.dark-mode) .version-time,
.is-dark .version-time {
  color: #71717a;
}

.meta-dot {
  opacity: 0.45;
  font-size: 9.5px;
}

/* 仅在选中项稳定展开第二行完整操作条，杜绝划过列表时的手风琴上下抖动 */
.timeline-actions {
  display: none;
  align-items: center;
  justify-content: space-between;
  margin-top: 5px;
  height: 28px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.timeline-item.is-selected .timeline-actions {
  display: flex;
  opacity: 1;
}

.actions-group-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.actions-group-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.timeline-btn,
.flat-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.12s ease;
  user-select: none;
}

.timeline-btn:hover,
.flat-action-btn:hover {
  background: var(--border-color, #e2e8f0);
  color: var(--text-primary, #0f1729);
}

.timeline-btn.primary,
.flat-action-btn.primary {
  color: var(--primary-color, #3b82f6);
}

.timeline-btn.primary:hover,
.flat-action-btn.primary:hover {
  background: var(--primary-light, rgba(59, 130, 246, 0.1));
}

.timeline-btn.active,
.flat-action-btn.active {
  color: var(--primary-color, #3b82f6);
  background: var(--primary-light, rgba(59, 130, 246, 0.12));
  font-weight: 600;
}

:global(.dark-mode) .timeline-btn.active,
:global(.dark-mode) .flat-action-btn.active {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.2);
}

.timeline-icon-btn,
.flat-icon-btn,
.header-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.12s ease;
}

.timeline-icon-btn:hover,
.flat-icon-btn:hover,
.header-close-btn:hover {
  background: var(--border-color, #e2e8f0);
  color: var(--text-primary, #0f1729);
}

.timeline-icon-btn.copied,
.flat-icon-btn.copied {
  color: #16a34a;
}

.timeline-icon-btn.danger:hover,
.flat-icon-btn.danger:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.header-close-btn:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.action-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.btn-icon-sm {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.success-color {
  color: #16a34a;
}

.preview-version-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 6px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  background: var(--primary-light, rgba(59, 130, 246, 0.12));
  color: var(--primary-color, #3b82f6);
  letter-spacing: 0.3px;
}

/* ─── 右侧完整预览区样式 ─── */
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  min-height: 48px;
  max-height: 48px;
  padding: 0 16px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  flex-shrink: 0;
}

.preview-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #0f1729);
}

.preview-meta {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  margin-left: 2px;
}

.preview-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-action-divider {
  width: 1px;
  height: 14px;
  background: var(--border-color, #e2e8f0);
  margin: 0 2px;
  flex-shrink: 0;
  opacity: 0.8;
}

:global(.dark-mode) .header-action-divider {
  background: rgba(255, 255, 255, 0.12);
}

.preview-body {
  flex: 1;
  height: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  background: var(--bg-panel, #ffffff);
  position: relative;
}

.preview-editor-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.preview-editor-wrapper :deep(.codemirror-editor-wrapper),
.preview-editor-wrapper :deep(.cm-editor) {
  height: 100% !important;
}

.preview-editor-wrapper :deep(.cm-scroller) {
  height: 100% !important;
  overflow: auto !important;
}

/* ─── 预览区底部状态栏 Footer ─── */
.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  min-height: 28px;
  max-height: 28px;
  padding: 0 16px;
  box-sizing: border-box;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-panel, #ffffff);
  color: var(--text-secondary, #94a3b8);
  font-size: 0.7rem;
  flex-shrink: 0;
  user-select: none;
}

:global(.dark-mode) .preview-footer {
  background: var(--bg-panel, #1e293b);
  border-top-color: var(--border-color, rgba(255, 255, 255, 0.08));
  color: #64748b;
}

.footer-meta-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-meta-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.footer-meta-item {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.footer-meta-dot {
  opacity: 0.45;
  font-size: 10px;
}

/* 抽屉过渡动画 */
.slide-drawer-enter-active,
.slide-drawer-leave-active {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-drawer-enter-from,
.slide-drawer-leave-to {
  transform: translateX(-100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-preview-enter-active,
.fade-preview-leave-active {
  transition: opacity 0.16s ease;
}

.fade-preview-enter-from,
.fade-preview-leave-to {
  opacity: 0;
}

/* ── 移动端专属“返回列表”按钮 ── */
.preview-back-btn {
  display: none;
  align-items: center;
  gap: 3px;
  padding: 3px 7px;
  font-size: 11.5px;
  font-weight: 500;
  border: none;
  background: var(--bg-app, #f1f5f9);
  color: var(--text-primary, #0f1729);
  border-radius: 4px;
  cursor: pointer;
  margin-right: 2px;
  transition: all 0.12s ease;
}

.preview-back-btn:hover {
  background: var(--border-color, #e2e8f0);
}

/* ── 响应式设计：屏幕分辨率自适应（列表栏尺寸在各断点内严格锁定恒定） ── */

/* 1. 中等屏幕 / 笔记本 / 窗口半屏 (<= 1100px) */
@media (max-width: 1100px) {
  .drawer-panel {
    width: 340px;
  }
  .drawer-panel.has-preview {
    width: min(95vw, 920px);
    min-width: 600px;
  }
  .drawer-list-column,
  .drawer-panel.has-preview .drawer-list-column {
    width: 340px;
    flex: 0 0 340px;
    min-width: 340px;
    max-width: 340px;
  }
}

/* 2. 紧凑屏 / 平板垂直方向 (<= 768px) */
@media (max-width: 768px) {
  .drawer-panel {
    width: min(100vw, 300px);
  }
  .drawer-panel.has-preview {
    width: 100vw;
    min-width: unset;
  }
  .drawer-list-column,
  .drawer-panel.has-preview .drawer-list-column {
    width: min(100vw, 300px);
    flex: 0 0 min(100vw, 300px);
    min-width: min(100vw, 300px);
    max-width: min(100vw, 300px);
  }
  .preview-title {
    font-size: 12px;
  }
  .preview-meta {
    display: none;
  }
}

/* 3. 超窄屏 / 手机端 (< 640px) */
@media (max-width: 640px) {
  .drawer-panel {
    width: 100vw;
  }
  .drawer-panel.has-preview {
    width: 100vw;
  }
  .drawer-list-column,
  .drawer-panel.has-preview .drawer-list-column {
    width: 100vw;
    flex: 0 0 100vw;
    min-width: 100vw;
    max-width: 100vw;
  }
  /* 在超窄屏下，右侧预览层以全屏绝对定位覆盖，支持返回按钮无缝切回 */
  .drawer-panel.has-preview .drawer-preview-column {
    position: absolute;
    inset: 0;
    z-index: 20;
    width: 100%;
  }
  .preview-back-btn {
    display: inline-flex;
  }
  .flat-action-btn span {
    display: none;
  }
  .flat-action-btn {
    padding: 3px 6px;
  }
}

/* 4. 垂直方向矮屏兼容 (高度 <= 600px) */
@media (max-height: 600px) {
  .drawer-header,
  .preview-header {
    height: 42px;
    min-height: 42px;
    max-height: 42px;
    padding: 0 12px;
  }
  .drawer-search-bar {
    padding: 5px 12px;
  }
  .record-item {
    padding: 7px 12px;
  }
}

/* ── 暗黑模式深度融合适配 ── */
:global(.dark-mode) .drawer-panel {
  background: var(--bg-panel, #18181b);
  border-right-color: var(--border-color, #27272a);
}
:global(.dark-mode) .drawer-preview-column {
  background: var(--bg-panel, #18181b);
  border-left-color: var(--border-color, #27272a);
}
:global(.dark-mode) .preview-header {
  background: var(--bg-app, #121214);
  border-bottom-color: var(--border-color, #27272a);
}
:global(.dark-mode) .preview-title {
  color: var(--text-primary, #f1f5f9);
}
:global(.dark-mode) .preview-back-btn {
  background: var(--bg-app, #27272a);
  color: var(--text-primary, #f1f5f9);
}
:global(.dark-mode) .preview-back-btn:hover {
  background: #3f3f46;
}
:global(.dark-mode) .header-title {
  color: var(--text-primary, #f1f5f9);
}
:global(.dark-mode) .header-btn-ghost:hover {
  background: var(--bg-app, #27272a);
  color: var(--text-primary, #f1f5f9);
}
:global(.dark-mode) .header-close-btn:hover {
  background: var(--bg-app, #27272a);
  color: var(--text-primary, #f1f5f9);
}
:global(.dark-mode) .search-input {
  background: var(--bg-app, #121214);
  color: var(--text-primary, #f1f5f9);
}
:global(.dark-mode) .search-input:focus {
  background: #27272a;
}
:global(.dark-mode) .record-item {
  border-bottom-color: var(--border-color, #27272a);
}
:global(.dark-mode) .record-item:hover {
  background: var(--bg-app, #1f1f23);
}
:global(.dark-mode) .item-version-tag {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}
:global(.dark-mode) .item-version-tag.is-latest {
  background: rgba(59, 130, 246, 0.22);
  color: #60a5fa;
}
:global(.dark-mode) .item-latest-badge {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}
:global(.dark-mode) .empty-icon-wrap {
  background: var(--bg-app, #27272a);
}
:global(.dark-mode) .empty-text {
  color: var(--text-primary, #f1f5f9);
}
:global(.dark-mode) .flat-action-btn:hover,
:global(.dark-mode) .flat-icon-btn:hover {
  background: var(--border-color, #27272a);
  color: var(--text-primary, #f1f5f9);
}

/* ── Tab 视角切换栏样式 ── */
.drawer-scope-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--bg-app, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.scope-pill-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.scope-pill-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-primary, #0f1729);
}

.scope-pill-btn.active {
  background: var(--bg-panel, #ffffff);
  color: var(--primary-color, #3b82f6);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.scope-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.2);
  color: inherit;
}

.empty-switch-btn {
  margin-top: 10px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--primary-color, #3b82f6);
  background: var(--primary-light, rgba(59, 130, 246, 0.08));
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.empty-switch-btn:hover {
  background: rgba(59, 130, 246, 0.15);
}

:global(.dark-mode) .drawer-scope-bar {
  background: var(--bg-app, #121214);
  border-bottom-color: var(--border-color, #27272a);
}

:global(.dark-mode) .scope-pill-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

:global(.dark-mode) .scope-pill-btn.active {
  background: var(--bg-panel, #242427);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

/* ── 右侧头部版本标题与模式切换分段控制器 ── */
.preview-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

.preview-search-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 10px;
  background: rgba(234, 179, 8, 0.18);
  color: #b45309;
  border: 1px solid rgba(234, 179, 8, 0.35);
  white-space: nowrap;
}

:global(.dark-mode) .preview-search-badge {
  background: rgba(234, 179, 8, 0.22);
  color: #fde047;
  border-color: rgba(234, 179, 8, 0.4);
}

.compare-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  line-height: 24px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
  user-select: none;
}

.compare-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-primary, #0f1729);
}

.compare-toggle-btn.active {
  background: var(--primary-light, rgba(59, 130, 246, 0.1));
  color: var(--primary-color, #3b82f6);
  font-weight: 600;
  box-shadow: none;
}

.switch-icon {
  width: 13px !important;
  height: 13px !important;
  min-width: 13px;
  min-height: 13px;
  stroke-width: 2.2;
  flex-shrink: 0;
}

.diff-stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 2px;
  font-size: 10px;
  font-weight: 600;
}

.stat-add {
  color: #16a34a;
}

.stat-del {
  color: #dc2626;
}

:global(.dark-mode) .compare-toggle-btn {
  color: var(--text-secondary, #94a3b8);
}

:global(.dark-mode) .compare-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary, #f1f5f9);
}

:global(.dark-mode) .compare-toggle-btn.active {
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  box-shadow: none;
}

:global(.dark-mode) .stat-add {
  color: #4ade80;
}

:global(.dark-mode) .stat-del {
  color: #f87171;
}

/* ── Git Diff 行级对比区域样式 ── */
.git-diff-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;

  /* 默认明亮主题配色 (GitHub Light Diff) */
  --diff-bg: var(--bg-panel, #ffffff);
  --diff-gutter-bg: transparent;
  --diff-gutter-color: var(--text-tertiary, #94a3b8);
  --diff-gutter-border: rgba(148, 163, 184, 0.15);
  --diff-text-color: var(--text-primary, #1e293b);

  --diff-add-bg: rgba(34, 197, 94, 0.12);
  --diff-add-gutter: #16a34a;
  --diff-add-marker: #16a34a;
  --diff-add-word-bg: rgba(34, 197, 94, 0.28);
  --diff-add-word-color: #15803d;

  --diff-del-bg: rgba(239, 68, 68, 0.12);
  --diff-del-gutter: #dc2626;
  --diff-del-marker: #dc2626;
  --diff-del-word-bg: rgba(239, 68, 68, 0.28);
  --diff-del-word-color: #b91c1c;

  /* JSON 语法词法着色 (明亮模式) */
  --diff-json-key: #0969da;
  --diff-json-string: #0a3069;
  --diff-json-number: #098658;
  --diff-json-bool: #0000ff;
  --diff-json-null: #64748b;
  --diff-json-bracket: #16a34a;
  --diff-json-colon: #64748b;

  background: var(--diff-bg);
}

/* 高级暗黑主题配色 (VS Code Dark+ & GitHub Dark Pro) */
:global(.dark-mode) .git-diff-container,
.drawer-panel.is-dark .git-diff-container,
.git-diff-container.is-dark {
  --diff-bg: var(--bg-panel, #18181b);
  --diff-gutter-bg: rgba(0, 0, 0, 0.2);
  --diff-gutter-color: #71717a;
  --diff-gutter-border: rgba(255, 255, 255, 0.08);
  --diff-text-color: #e4e4e7;

  /* 柔和透亮的红绿色块，绝不发脏 */
  --diff-add-bg: rgba(34, 197, 94, 0.15);
  --diff-add-gutter: #4ade80;
  --diff-add-marker: #4ade80;
  --diff-add-word-bg: rgba(34, 197, 94, 0.38);
  --diff-add-word-color: #86efac;

  --diff-del-bg: rgba(239, 68, 68, 0.15);
  --diff-del-gutter: #f87171;
  --diff-del-marker: #f87171;
  --diff-del-word-bg: rgba(239, 68, 68, 0.38);
  --diff-del-word-color: #fca5a5;

  /* VS Code Dark+ 经典神仙语法着色（告别深红与深蓝） */
  --diff-json-key: #9cdcfe;      /* 清新天蓝属性名 */
  --diff-json-string: #ce9178;   /* 温暖橘棕字符串 */
  --diff-json-number: #b5cea8;   /* 柔润薄荷淡绿数字 */
  --diff-json-bool: #569cd6;     /* 亮湖蓝布尔值 */
  --diff-json-null: #569cd6;     /* 亮湖蓝 null */
  --diff-json-bracket: #ffd700;  /* 金色花括号 */
  --diff-json-colon: #94a3b8;    /* 浅灰冒号 */
}

.git-diff-scrollable {
  flex: 1;
  overflow: auto;
  user-select: text;
  padding: 6px 0;
  background: var(--diff-bg);
}

.git-diff-row {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: fit-content;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  box-sizing: border-box;
  color: var(--diff-text-color);
  transition: filter 0.1s ease;
}

.git-diff-row:hover {
  filter: brightness(0.97);
}

.is-dark .git-diff-row:hover,
:global(.dark-mode) .git-diff-row:hover {
  filter: brightness(1.12);
}

.diff-gutter-cell {
  width: 42px;
  min-width: 42px;
  text-align: right;
  padding-right: 8px;
  user-select: none;
  color: var(--diff-gutter-color);
  font-size: 11px;
  opacity: 0.75;
  background: var(--diff-gutter-bg);
  border-right: 1px solid var(--diff-gutter-border);
}

.diff-marker-cell {
  width: 22px;
  min-width: 22px;
  text-align: center;
  user-select: none;
  font-weight: 700;
  font-size: 12px;
  font-family: inherit;
}

.diff-content-cell {
  flex: 1;
  padding: 0 10px;
  white-space: pre;
}

.diff-line-text {
  margin: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: pre;
  color: inherit;
}

/* 绿色新增行 */
.git-diff-row.add {
  background-color: var(--diff-add-bg);
}

.git-diff-row.add .diff-marker-cell {
  color: var(--diff-add-marker);
}

.git-diff-row.add .diff-gutter-cell {
  color: var(--diff-add-gutter);
  opacity: 0.95;
}

/* 红色删除行 */
.git-diff-row.del {
  background-color: var(--diff-del-bg);
}

.git-diff-row.del .diff-marker-cell {
  color: var(--diff-del-marker);
}

.git-diff-row.del .diff-gutter-cell {
  color: var(--diff-del-gutter);
  opacity: 0.95;
}

/* 普通无变更行 */
.git-diff-row.normal {
  color: var(--diff-text-color);
}

/* ── JSON 语法高亮 (Git Diff 内部，继承主题变量) ── */
.git-diff-row :deep(.json-key) {
  color: var(--diff-json-key);
  font-weight: 500;
}

.git-diff-row :deep(.json-string) {
  color: var(--diff-json-string);
}

.git-diff-row :deep(.json-number) {
  color: var(--diff-json-number);
}

.git-diff-row :deep(.json-bool) {
  color: var(--diff-json-bool);
}

.git-diff-row :deep(.json-null) {
  color: var(--diff-json-null);
}

.git-diff-row :deep(.json-bracket) {
  color: var(--diff-json-bracket);
}

.git-diff-row :deep(.json-colon) {
  color: var(--diff-json-colon);
}

/* ── 行内单词/字符级微差异高亮 (消除红绿撞色，统一继承高亮前景色) ── */
.git-diff-row :deep(.word-removed) {
  background-color: var(--diff-del-word-bg);
  color: var(--diff-del-word-color) !important;
  border-radius: 3px;
  padding: 1px 3px;
  font-weight: 600;
}

.git-diff-row :deep(.word-added) {
  background-color: var(--diff-add-word-bg);
  color: var(--diff-add-word-color) !important;
  border-radius: 3px;
  padding: 1px 3px;
  font-weight: 600;
}

.git-diff-row :deep(.word-removed *) {
  color: var(--diff-del-word-color) !important;
}

.git-diff-row :deep(.word-added *) {
  color: var(--diff-add-word-color) !important;
}

/* ── Git Diff 完全一致（无差异）状态 ── */
.diff-identical-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  text-align: center;
}

.identical-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.identical-check-icon {
  width: 16px !important;
  height: 16px !important;
  color: #16a34a;
}

:global(.dark-mode) .identical-check-icon {
  color: #4ade80;
}

.identical-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary, #0f1729);
  margin-bottom: 4px;
}

:global(.dark-mode) .identical-title {
  color: #f1f5f9;
}

.identical-sub {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  max-width: 280px;
  line-height: 1.5;
  margin-bottom: 14px;
}

.identical-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  line-height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--primary-color, #3b82f6);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.identical-btn:hover {
  background: var(--primary-light, rgba(59, 130, 246, 0.1));
}

:global(.dark-mode) .identical-btn {
  color: #60a5fa;
  background: transparent;
}

:global(.dark-mode) .identical-btn:hover {
  background: rgba(59, 130, 246, 0.18);
}

.identical-btn-icon {
  width: 12px !important;
  height: 12px !important;
  stroke-width: 2.2;
  flex-shrink: 0;
}


/* ── 列表卡片搜索命中摘要 ── */
.timeline-search-snippet {
  margin: 6px 0 2px 0;
  padding: 4px 8px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  border-left: 2px solid var(--primary-color, #3b82f6);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
}

:global(.dark-mode) .timeline-search-snippet {
  background: rgba(255, 255, 255, 0.04);
  border-left-color: #60a5fa;
}

.snippet-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--primary-color, #3b82f6);
  flex-shrink: 0;
  text-transform: uppercase;
}

:global(.dark-mode) .snippet-label {
  color: #60a5fa;
}

.snippet-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark-mode) .snippet-code {
  color: #94a3b8;
}

.snippet-code :deep(mark.search-snippet-mark) {
  background: rgba(234, 179, 8, 0.35);
  color: inherit;
  font-weight: 600;
  padding: 0 2px;
  border-radius: 2px;
}

:global(.dark-mode) .snippet-code :deep(mark.search-snippet-mark) {
  background: rgba(234, 179, 8, 0.45);
  color: #fef08a;
}
</style>
