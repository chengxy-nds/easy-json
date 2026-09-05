<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick, inject } from 'vue'
import {
  Split, ArrowRightLeft, RefreshCw, Copy, SlidersHorizontal,
  FileJson, Check, AlertTriangle, Plus, Minus, FileCode, X, Trash2,
  Pencil, ArrowLeft, ArrowRight, Wand2, Braces, ChevronUp, ChevronDown,
  Eye, Columns2
} from 'lucide-vue-next'
import * as diff from 'diff'
import { useTabsDrag } from '../composables/useTabsDrag'
import { extractJsonFromText } from '../utils/jsonExtractor.js'
import { safeParse, safeStringify } from '../utils/jsonBigInt.js'

const showToast = inject('showToast')

const sortKeys = inject('sortKeys', ref(0))
const ignoreWhitespace = inject('ignoreWhitespace', ref(false))
const autoFormat = inject('autoFormat', ref(false))
const autoCopy = inject('autoCopy', ref(false))
const autoPaste = inject('autoPaste', ref(false))
const autoExtract = inject('autoExtract', ref(true))
const incomingCompareText = inject('incomingCompareText', ref(null))
const caseInsensitive = ref(false)

const editorFontSize = inject('editorFontSize', ref(13))
const showLineNumbers = inject('showLineNumbers', ref(true))
const editorWordWrap = inject('editorWordWrap', ref('wrap'))

const editorLineHeight = computed(() => {
  const size = Number(editorFontSize.value) || 13
  const map = { 10: 16, 11: 18, 12: 20, 13: 20, 14: 22, 15: 23, 16: 24, 18: 26, 20: 28, 22: 30, 24: 32 }
  return map[size] || Math.round(size * 1.6)
})


const copySuccessLeft = ref(false)
const copySuccessRight = ref(false)

const leftPaneRef = ref(null)
const rightPaneRef = ref(null)
const leftTextareaRef = ref(null)
const rightTextareaRef = ref(null)
const leftGutterRef = ref(null)
const rightGutterRef = ref(null)
const leftGutterInnerRef = ref(null)
const rightGutterInnerRef = ref(null)
const leftHighlightRef = ref(null)
const rightHighlightRef = ref(null)

const leftEditing = ref(false)
const rightEditing = ref(false)
const leftFocused = ref(false)
const rightFocused = ref(false)

const activeScrollTarget = ref(null)

const DEMO_LEFT = `{
  "name": "easyJSON",
  "version": "1.0.0",
  "description": "简洁大气的 JSON 格式化与对比工具",
  "tags": [
    "formatting",
    "validation",
    "diff"
  ],
  "settings": {
    "theme": "dark",
    "fontSize": 14,
    "tabSize": 2
  },
  "active": true
}`

const DEMO_RIGHT = `{
  "name": "easyJSON Pro",
  "version": "1.1.0",
  "description": "简洁大气且没有 AI 味道 spacing",
  "tags": [
    "formatting",
    "validation",
    "comparison",
    "speed"
  ],
  "settings": {
    "theme": "system",
    "fontSize": 13,
    "tabSize": 4,
    "autoSave": true
  },
  "active": false
}`

// Comparison Multi-Tabs State
const tabs = ref([
  {
    id: 1,
    title: '对比 1',
    leftText: '',
    rightText: '',
    leftError: null,
    leftErrorLine: null,
    rightError: null,
    rightErrorLine: null
  }
])
const activeTabId = ref(1)
const { tabsListRef, tabsOverflow, onMouseDown: onTabsMouseDown, onWheel: onTabsWheel, scrollToEnd: scrollTabsToEnd, scrollToActive: scrollTabsToActive, checkOverflow: checkTabsOverflow } = useTabsDrag(activeTabId)

const activeTab = computed(() => {
  return tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]
})

let nextTabId = 2

const addTab = () => {
  const newId = nextTabId++
  tabs.value.push({
    id: newId,
    title: `对比 ${newId}`,
    leftText: '',
    rightText: '',
    leftError: null,
    leftErrorLine: null,
    rightError: null,
    rightErrorLine: null
  })
  activeTabId.value = newId
  scrollTabsToEnd()
}

let canSave = false
const saveComparerState = () => {
  if (!canSave) return
  try {
    const snapshot = tabs.value.map(t => ({
      id: t.id,
      title: t.title,
      leftText: t.leftText,
      rightText: t.rightText
    }))
    localStorage.setItem('ej_cmp_tabs', JSON.stringify(snapshot))
    localStorage.setItem('ej_cmp_active', String(activeTabId.value))
  } catch (e) {}
}

const closeTab = (id) => {
  const index = tabs.value.findIndex(t => t.id === id)
  if (index === -1) return

  if (activeTabId.value === id) {
    if (index > 0) {
      activeTabId.value = tabs.value[index - 1].id
    } else if (tabs.value.length > 1) {
      activeTabId.value = tabs.value[index + 1].id
    }
  }
  tabs.value.splice(index, 1)
  nextTick(checkTabsOverflow)
}

// 监听来自扩展的无刷新推送文本（右键"直接对比"）
watch(incomingCompareText, (text) => {
  if (!text) return
  const newId = nextTabId++
  tabs.value.push({
    id: newId,
    title: `对比 ${newId}`,
    leftText: text,
    rightText: '',
    leftError: null,
    leftErrorLine: null,
    rightError: null,
    rightErrorLine: null
  })
  activeTabId.value = newId
  scrollTabsToEnd()
  incomingCompareText.value = null
})

const editingTabId = ref(null)

const startEditTab = (tabId) => {
  editingTabId.value = tabId
  nextTick(() => {
    const input = tabsListRef.value?.querySelector('.tab-edit-input')
    if (input) {
      input.focus()
      input.select()
    }
  })
}

const finishEditTab = (tab, e) => {
  const val = (e?.target?.value || '').trim()
  if (val) tab.title = val
  editingTabId.value = null
  saveComparerState()
}

const tabContextMenu = ref({ visible: false, x: 0, y: 0, tabId: null })

const showTabContextMenu = (e, tabId) => {
  e.preventDefault()
  tabContextMenu.value = { visible: true, x: e.clientX, y: e.clientY, tabId }
  const hide = () => { tabContextMenu.value.visible = false; document.removeEventListener('click', hide) }
  setTimeout(() => document.addEventListener('click', hide), 0)
}

const closeLeftTabs = () => {
  const idx = tabs.value.findIndex(t => t.id === tabContextMenu.value.tabId)
  if (idx <= 0) return
  const removed = tabs.value.splice(0, idx)
  if (removed.some(t => t.id === activeTabId.value)) {
    activeTabId.value = tabs.value[0].id
  }
  saveComparerState()
  nextTick(checkTabsOverflow)
}

const closeRightTabs = () => {
  const idx = tabs.value.findIndex(t => t.id === tabContextMenu.value.tabId)
  if (idx === -1 || idx >= tabs.value.length - 1) return
  const removed = tabs.value.splice(idx + 1)
  if (removed.some(t => t.id === activeTabId.value)) {
    activeTabId.value = tabs.value[tabs.value.length - 1].id
  }
  saveComparerState()
  nextTick(checkTabsOverflow)
}

const closeOtherTabs = () => {
  const targetId = tabContextMenu.value.tabId
  if (tabs.value.length <= 1) return
  tabs.value = tabs.value.filter(t => t.id === targetId)
  activeTabId.value = targetId
  saveComparerState()
  nextTick(checkTabsOverflow)
}

const closeAllTabs = () => {
  tabs.value = [{
    id: tabs.value[0].id,
    title: '对比 1',
    leftText: '',
    rightText: '',
    leftError: null,
    leftErrorLine: null,
    rightError: null,
    rightErrorLine: null
  }]
  activeTabId.value = tabs.value[0].id
  saveComparerState()
  nextTick(checkTabsOverflow)
}

// 🚀 macOS WebKit/Safari 专用的 JSON 语法解析器定位器（用于提取错误行列号）
const locateJsonError = (text) => {
  let pos = 0
  const skipWhitespace = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++
  }
  const parseValue = () => {
    skipWhitespace()
    if (pos >= text.length) throw new Error()
    const char = text[pos]
    if (char === '{') { parseObject(); return }
    if (char === '[') { parseArray(); return }
    if (char === '"') { parseString(); return }
    if (char === '-' || (char >= '0' && char <= '9')) { parseNumber(); return }
    if (text.startsWith("true", pos)) { pos += 4; return }
    if (text.startsWith("false", pos)) { pos += 5; return }
    if (text.startsWith("null", pos)) { pos += 4; return }
    throw new Error()
  }
  const parseString = () => {
    pos++
    while (pos < text.length) {
      const char = text[pos]
      if (char === '"') { pos++; return }
      if (char === '\\') pos += 2
      else pos++
    }
    throw new Error()
  }
  const parseNumber = () => {
    const start = pos
    if (text[pos] === '-') pos++
    while (pos < text.length && /[0-9.eE+-]/.test(text[pos])) pos++
    if (pos === start) throw new Error()
  }
  const parseObject = () => {
    pos++
    skipWhitespace()
    if (text[pos] === '}') { pos++; return }
    while (pos < text.length) {
      skipWhitespace()
      if (text[pos] !== '"') throw new Error()
      parseString()
      skipWhitespace()
      if (text[pos] !== ':') throw new Error()
      pos++
      parseValue()
      skipWhitespace()
      if (text[pos] === '}') { pos++; return }
      if (text[pos] !== ',') throw new Error()
      pos++
      const savePos = pos
      skipWhitespace()
      if (text[pos] === '}') { pos = savePos; throw new Error() }
    }
    throw new Error()
  }
  const parseArray = () => {
    pos++
    skipWhitespace()
    if (text[pos] === ']') { pos++; return }
    while (pos < text.length) {
      parseValue()
      skipWhitespace()
      if (text[pos] === ']') { pos++; return }
      if (text[pos] !== ',') throw new Error()
      pos++
      const savePos = pos
      skipWhitespace()
      if (text[pos] === ']') { pos = savePos; throw new Error() }
    }
    throw new Error()
  }
  try {
    parseValue()
    skipWhitespace()
    if (pos < text.length) throw new Error()
  } catch (err) {
    return pos
  }
  return null
}

// 从 JSON.parse 错误中提取行列号并修正（优先扫描原始文本定位，兼容 Chrome/V8、Firefox 和 macOS Safari）
const getErrorLineAndColumn = (error, text) => {
  const rawMsg = error?.message || ''
  const cleanMsg = rawMsg
    .replace(/\s+in\s+JSON\s+at\s+position\s+\d+.*$/i, '')
    .replace(/\s+\(line\s+\d+\s+column\s+\d+\).*$/i, '')
    .replace(/\s+at\s+line\s+\d+\s+column\s+\d+.*$/i, '')
    .replace(/\s+at\s+position\s+\d+.*$/i, '')
    .trim() || rawMsg

  if (!text) return { line: null, column: null, message: cleanMsg }

  let line = null
  let col = null

  // 1. 优先使用精确定位器扫描原始输入文本
  const precisePos = locateJsonError(text)
  if (precisePos !== null && precisePos >= 0) {
    line = 1
    col = 1
    for (let i = 0; i < precisePos && i < text.length; i++) {
      if (text[i] === '\n') {
        line++
        col = 1
      } else {
        col++
      }
    }
  }

  // 2. 备用：从原生 JSON.parse(text) 的 position 索引计算
  if (!line) {
    try {
      JSON.parse(text)
    } catch (nativeErr) {
      const pm = (nativeErr?.message || '').match(/position\s+(\d+)/i)
      if (pm) {
        const p = parseInt(pm[1], 10)
        line = 1
        col = 1
        for (let i = 0; i < p && i < text.length; i++) {
          if (text[i] === '\n') {
            line++
            col = 1
          } else {
            col++
          }
        }
      }
    }
  }

  // 3. 备用：正则匹配 Firefox 等浏览器的 line X column Y
  if (!line) {
    const lc = rawMsg.match(/line\s+(\d+)(?:\s+column\s+(\d+))?/i)
    if (lc) {
      line = parseInt(lc[1], 10)
      col = lc[2] ? parseInt(lc[2], 10) : 1
    }
  }

  if (!line) return { line: null, column: null, message: cleanMsg }

  // 4. 启发式修正：缺逗号导致报错偏移
  const lines = text.split('\n')
  if (line > 1) {
    const errLine = (lines[line - 1] || '').trim()
    const prev = (lines[line - 2] || '').trim()
    const isKey = /^".*"\s*:/.test(errLine)
    const isArrayElement = /^(?:["[{]|\b(?:true|false|null)\b|\d)/.test(errLine)
    
    if (isKey || isArrayElement) {
      const prevEndsWithVal = /[}\d\]"'\w]\s*$/.test(prev)
      const prevHasComma = /,\s*$/.test(prev)
      const prevEndsWithBracket = /[\[{]\s*$/.test(prev)
      if (prevEndsWithVal && !prevHasComma && !prevEndsWithBracket) {
        line = line - 1
      }
    }
  }

  return { line, column: col, message: cleanMsg }
}

// JSON Validation Watchers to avoid side-effects in computed
const validateJson = (text, isLeft) => {
  const tab = activeTab.value
  if (!tab) return
  if (!text || !text.trim()) {
    if (isLeft) {
      tab.leftError = null
      tab.leftErrorLine = null
    } else {
      tab.rightError = null
      tab.rightErrorLine = null
    }
    return
  }
  try {
    safeParse(text)
    if (isLeft) {
      tab.leftError = null
      tab.leftErrorLine = null
    } else {
      tab.rightError = null
      tab.rightErrorLine = null
    }
  } catch (err) {
    const { line, message } = getErrorLineAndColumn(err, text)
    if (isLeft) {
      tab.leftError = message ? `无效的 JSON: ${message}` : `无效的 JSON`
      tab.leftErrorLine = line
    } else {
      tab.rightError = message ? `无效的 JSON: ${message}` : `无效的 JSON`
      tab.rightErrorLine = line
    }
  }
}

// Validate on text change (immediate so validation shows on load)
watch(() => activeTab.value?.leftText, (newVal) => {
  validateJson(newVal || '', true)
}, { immediate: true })

watch(() => activeTab.value?.rightText, (newVal) => {
  validateJson(newVal || '', false)
}, { immediate: true })

// Persist on text/tab changes (NOT immediate — avoid overwriting saved data before onMounted)
watch(() => activeTab.value?.leftText, () => {
  saveComparerState()
})

watch(() => activeTab.value?.rightText, () => {
  saveComparerState()
})

watch(activeTabId, () => {
  saveComparerState()
  updateEditingModeForTab()
})

watch(() => tabs.value.length, () => {
  saveComparerState()
})

const writeToClipboard = async (text) => {
  if (!text) return false
  
  // 1. uTools environment
  if (window.utools && typeof window.utools.copyText === 'function') {
    try {
      window.utools.copyText(text)
      return true
    } catch (_) {}
  }
  
  // 2. Tauri environment
  if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('write_clipboard', { text })
      return true
    } catch (_) {}
  }
  
  // 3. Modern Navigator Clipboard API
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (_) {}
  }
  
  // 4. Fallback: document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.top = '-9999px'
    textArea.style.left = '-9999px'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    if (successful) return true
  } catch (_) {}
  
  return false
}

const autoCopyResult = (text, isLeft) => {
  if (!autoCopy.value || !text) return
  writeToClipboard(text)
}

// Debounced auto-format and key-sorting on text changes in active textareas
let leftFormatTimer = null
watch(() => activeTab.value?.leftText, (newVal) => {
  if ((!autoFormat.value && !sortKeys.value) || !newVal) return
  clearTimeout(leftFormatTimer)
  leftFormatTimer = setTimeout(() => {
    const tab = activeTab.value
    if (!tab) return
    try {
      const parsed = safeParse(newVal)
      if (sortKeys.value && !tab._unsortedLeftText) {
        tab._unsortedLeftText = newVal
      }
      const formatted = safeStringify(sortKeys.value ? sortJSONKeys(parsed, sortKeys.value === 2) : parsed, null, 2)
      if (newVal.trim() !== formatted.trim()) {
        const el = leftTextareaRef.value
        const isFocused = document.activeElement === el
        const start = el ? el.selectionStart : 0
        const end = el ? el.selectionEnd : 0
        
        tab.leftText = formatted
        tab.leftError = null
        tab.leftErrorLine = null
        
        if (isFocused && el) {
          nextTick(() => { el.setSelectionRange(start, end) })
        }
        autoCopyResult(formatted, true)
      }
    } catch (_) {}
  }, 1000)
})

let rightFormatTimer = null
watch(() => activeTab.value?.rightText, (newVal) => {
  if ((!autoFormat.value && !sortKeys.value) || !newVal) return
  clearTimeout(rightFormatTimer)
  rightFormatTimer = setTimeout(() => {
    const tab = activeTab.value
    if (!tab) return
    try {
      const parsed = safeParse(newVal)
      if (sortKeys.value && !tab._unsortedRightText) {
        tab._unsortedRightText = newVal
      }
      const formatted = safeStringify(sortKeys.value ? sortJSONKeys(parsed, sortKeys.value === 2) : parsed, null, 2)
      if (newVal.trim() !== formatted.trim()) {
        const el = rightTextareaRef.value
        const isFocused = document.activeElement === el
        const start = el ? el.selectionStart : 0
        const end = el ? el.selectionEnd : 0
        
        tab.rightText = formatted
        tab.rightError = null
        tab.rightErrorLine = null
        
        if (isFocused && el) {
          nextTick(() => { el.setSelectionRange(start, end) })
        }
        autoCopyResult(formatted, false)
      }
    } catch (_) {}
  }, 1000)
})

// Automatically re-format and sort textareas when key sorting settings change
watch(sortKeys, (newVal) => {
  const tab = activeTab.value
  if (!tab) return
  
  if (tab.leftText && tab.leftText.trim()) {
    try {
      let parsed = safeParse(tab.leftText)
      if (newVal) {
        if (!tab._unsortedLeftText) {
          tab._unsortedLeftText = tab.leftText
        }
        parsed = sortJSONKeys(parsed, newVal === 2)
        tab.leftText = safeStringify(parsed, null, 2)
      } else {
        if (tab._unsortedLeftText) {
          tab.leftText = tab._unsortedLeftText
          tab._unsortedLeftText = null
        }
      }
      tab.leftError = null
      tab.leftErrorLine = null
    } catch (_) {}
  }
  
  if (tab.rightText && tab.rightText.trim()) {
    try {
      let parsed = safeParse(tab.rightText)
      if (newVal) {
        if (!tab._unsortedRightText) {
          tab._unsortedRightText = tab.rightText
        }
        parsed = sortJSONKeys(parsed, newVal === 2)
        tab.rightText = safeStringify(parsed, null, 2)
      } else {
        if (tab._unsortedRightText) {
          tab.rightText = tab._unsortedRightText
          tab._unsortedRightText = null
        }
      }
      tab.rightError = null
      tab.rightErrorLine = null
    } catch (_) {}
  }
})

// Helper to check and format JSON strings
const getFormattedText = (rawText) => {
  if (!rawText || !rawText.trim()) return ''
  try {
    let parsed = safeParse(rawText)
    if (sortKeys.value) {
      parsed = sortJSONKeys(parsed, sortKeys.value === 2)
    }
    return safeStringify(parsed, null, 2)
  } catch (err) {
    return rawText
  }
}

// Recursively sort object keys alphabetically
const sortJSONKeys = (obj, desc = false) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sortJSONKeys(item, desc));
  }
  const sortedKeys = Object.keys(obj).sort();
  if (desc) sortedKeys.reverse();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortJSONKeys(obj[key], desc);
  }
  return sortedObj;
}

const convertJsObjectToJson = (text) => {
  let cleaned = text.trim()
  const jsonpRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(\s*([\s\S]*)\s*\);?$/
  const jsonpMatch = cleaned.match(jsonpRegex)
  if (jsonpMatch) {
    cleaned = jsonpMatch[1].trim()
  }
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim()
  }
  const code = cleaned.startsWith('{') && !cleaned.startsWith('({')
    ? `return (${cleaned})`
    : `return ${cleaned}`
  const evaluator = new Function(code)
  const obj = evaluator()
  if (obj === null || typeof obj !== 'object') {
    throw new Error('求值结果不是有效的对象或数组。')
  }
  return safeStringify(obj, null, 2)
}

const checkEscapedJson = (text) => {
  let current = text.trim()
  if (!current) return null
  
  // If it's already valid standard JSON or JS object, it's NOT escaped JSON
  try {
    const parsed = safeParse(current)
    if (parsed !== null && typeof parsed === 'object') {
      return null
    }
  } catch (e) {
    try {
      const jsonStr = convertJsObjectToJson(current)
      const parsed = safeParse(jsonStr)
      if (parsed !== null && typeof parsed === 'object') {
        return null
      }
    } catch (e2) {}
  }
  
  if (!current.includes('"') && !current.includes('\\')) {
    return null
  }
  for (let depth = 1; depth <= 5; depth++) {
    let unescaped = current
    if (unescaped.startsWith('"') && unescaped.endsWith('"')) {
      try {
        unescaped = safeParse(unescaped)
      } catch (e) {}
    }
    unescaped = unescaped.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    try {
      let obj
      try {
        obj = safeParse(unescaped)
      } catch (e) {
        const jsonStr = convertJsObjectToJson(unescaped)
        obj = safeParse(jsonStr)
      }
      if (obj !== null && typeof obj === 'object') {
        return { valid: true, parsedObj: obj, depth: depth }
      }
    } catch (e) {
      current = unescaped
    }
  }
  return null
}

// In-place Format and Minify Actions
const formatInputs = () => {
  const tab = activeTab.value
  if (!tab) return
  
  let success = false
  if (tab.leftText && tab.leftText.trim()) {
    try {
      let parsed = safeParse(tab.leftText)
      if (sortKeys.value) {
        if (!tab._unsortedLeftText) {
          tab._unsortedLeftText = tab.leftText
        }
        parsed = sortJSONKeys(parsed, sortKeys.value === 2)
      } else {
        if (tab._unsortedLeftText) {
          tab.leftText = tab._unsortedLeftText
          tab._unsortedLeftText = null
          parsed = safeParse(tab.leftText)
        }
      }
      const formatted = safeStringify(parsed, null, 2)
      tab.leftText = formatted
      tab.leftError = null
      tab.leftErrorLine = null
      success = true
      autoCopyResult(formatted, true)
    } catch (err) {
      const { line, message } = getErrorLineAndColumn(err, tab.leftText)
      tab.leftError = `格式化左侧失败: ${message || err.message}`
      tab.leftErrorLine = line
    }
  }
  if (tab.rightText && tab.rightText.trim()) {
    try {
      let parsed = safeParse(tab.rightText)
      if (sortKeys.value) {
        if (!tab._unsortedRightText) {
          tab._unsortedRightText = tab.rightText
        }
        parsed = sortJSONKeys(parsed, sortKeys.value === 2)
      } else {
        if (tab._unsortedRightText) {
          tab.rightText = tab._unsortedRightText
          tab._unsortedRightText = null
          parsed = safeParse(tab.rightText)
        }
      }
      const formatted = safeStringify(parsed, null, 2)
      tab.rightText = formatted
      tab.rightError = null
      tab.rightErrorLine = null
      success = true
      autoCopyResult(formatted, false)
    } catch (err) {
      const { line, message } = getErrorLineAndColumn(err, tab.rightText)
      tab.rightError = `格式化右侧失败: ${message || err.message}`
      tab.rightErrorLine = line
    }
  }
  if (success && showToast) {
    showToast('格式化成功')
  }
}

const minifyInputs = () => {
  const tab = activeTab.value
  if (!tab) return
  
  let success = false
  if (tab.leftText && tab.leftText.trim()) {
    try {
      tab.leftText = safeStringify(safeParse(tab.leftText))
      tab.leftError = null
      tab.leftErrorLine = null
      success = true
    } catch (err) {
      const { line, message } = getErrorLineAndColumn(err, tab.leftText)
      tab.leftError = `压缩左侧失败: ${message || err.message}`
      tab.leftErrorLine = line
    }
  }
  if (tab.rightText && tab.rightText.trim()) {
    try {
      tab.rightText = safeStringify(safeParse(tab.rightText))
      tab.rightError = null
      tab.rightErrorLine = null
      success = true
    } catch (err) {
      const { line, message } = getErrorLineAndColumn(err, tab.rightText)
      tab.rightError = `压缩右侧失败: ${message || err.message}`
      tab.rightErrorLine = line
    }
  }
  if (success && showToast) {
    showToast('压缩成功')
  }
}

// Synchronized scrolling logic for diff panes
const handleLeftScroll = () => {
  if (leftPaneRef.value) {
    const scrollTop = leftPaneRef.value.scrollTop
    const scrollLeft = leftPaneRef.value.scrollLeft
    savedComparerScrollState.leftTop = scrollTop
    savedComparerScrollState.leftLeft = scrollLeft

    if (activeScrollTarget.value === 'left') {
      if (rightEditing.value && rightTextareaRef.value) {
        rightTextareaRef.value.scrollTop = scrollTop
        rightTextareaRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.rightTop = scrollTop
        savedComparerScrollState.rightLeft = scrollLeft
        applyGutterAndHighlightScroll(false, scrollTop, scrollLeft)
      } else if (rightPaneRef.value) {
        rightPaneRef.value.scrollTop = scrollTop
        rightPaneRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.rightTop = scrollTop
        savedComparerScrollState.rightLeft = scrollLeft
      }
    }
  }
}

const handleRightScroll = () => {
  if (rightPaneRef.value) {
    const scrollTop = rightPaneRef.value.scrollTop
    const scrollLeft = rightPaneRef.value.scrollLeft
    savedComparerScrollState.rightTop = scrollTop
    savedComparerScrollState.rightLeft = scrollLeft

    if (activeScrollTarget.value === 'right') {
      if (leftEditing.value && leftTextareaRef.value) {
        leftTextareaRef.value.scrollTop = scrollTop
        leftTextareaRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.leftTop = scrollTop
        savedComparerScrollState.leftLeft = scrollLeft
        applyGutterAndHighlightScroll(true, scrollTop, scrollLeft)
      } else if (leftPaneRef.value) {
        leftPaneRef.value.scrollTop = scrollTop
        leftPaneRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.leftTop = scrollTop
        savedComparerScrollState.leftLeft = scrollLeft
      }
    }
  }
}

// Shared JSON syntax highlighter
const applyJsonHighlight = (text) => {
  if (!text) return ''
  const safeStr = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  const escapedCheck = checkEscapedJson(text)
  const isEscaped = !!escapedCheck
  const depth = escapedCheck ? escapedCheck.depth : 0
  
  let regex
  let escapedQ = '"'
  
  if (isEscaped) {
    const slashCount = (1 << depth) - 1
    const slashes = '\\'.repeat(slashCount)
    const Q = slashes + '"'
    escapedQ = Q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    regex = new RegExp(`(${escapedQ}(?:[^\\\\"]|\\\\.)*?${escapedQ}(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?|[{}[\\]])`, 'g')
  } else {
    regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\\d+)?|[{}[\]])/g
  }
  
  return safeStr.replace(regex, (match) => {
    if (match.endsWith(':')) {
      const colonIndex = match.lastIndexOf(':')
      const keyPart = match.substring(0, colonIndex)
      const colonPart = match.substring(colonIndex)
      return `<span class="json-key">${keyPart}</span><span class="json-colon">${colonPart}</span>`
    }
    let cls = 'json-number'
    const isString = isEscaped 
      ? match.startsWith('\\'.repeat((1 << depth) - 1) + '"')
      : match.startsWith('"')
      
    if (isString) cls = 'json-string'
    else if (/true|false/.test(match)) cls = 'json-boolean'
    else if (/null/.test(match)) cls = 'json-null'
    else if (/[{}[\]]/.test(match)) cls = 'json-bracket'
    return `<span class="${cls}">${match}</span>`
  })
}

const escapeHtml = (str) => {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Token-aware JSON line diff highlighter to preserve string grammar and prevent broken number highlights
const highlightJsonDiffLine = (lLine, rLine, options) => {
  // Pattern for JSON Key-Value line: indentation, "key", colon, and value
  const kvRegex = /^(\s*)"((?:[^"\\]|\\.)*)"(\s*:\s*)(.*)$/
  const lMatch = lLine.match(kvRegex)
  const rMatch = rLine.match(kvRegex)

  if (lMatch && rMatch) {
    const lIndent = lMatch[1]
    const lKey = lMatch[2]
    const lColon = lMatch[3]
    const lVal = lMatch[4]

    const rIndent = rMatch[1]
    const rKey = rMatch[2]
    const rColon = rMatch[3]
    const rVal = rMatch[4]

    // 1. Process Key Diff
    let leftKeyHtml = ''
    let rightKeyHtml = ''

    if (lKey === rKey) {
      leftKeyHtml = `${escapeHtml(lIndent)}<span class="json-key">"${escapeHtml(lKey)}"</span><span class="json-colon">${escapeHtml(lColon)}</span>`
      rightKeyHtml = `${escapeHtml(rIndent)}<span class="json-key">"${escapeHtml(rKey)}"</span><span class="json-colon">${escapeHtml(rColon)}</span>`
    } else {
      const kDiff = diff.diffChars(lKey, rKey, options)
      const lKeyInner = kDiff
        .filter(d => !d.added)
        .map(d => d.removed ? `<span class="word-removed">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
        .join('')
      const rKeyInner = kDiff
        .filter(d => !d.removed)
        .map(d => d.added ? `<span class="word-added">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
        .join('')

      leftKeyHtml = `${escapeHtml(lIndent)}<span class="json-key">"${lKeyInner}"</span><span class="json-colon">${escapeHtml(lColon)}</span>`
      rightKeyHtml = `${escapeHtml(rIndent)}<span class="json-key">"${rKeyInner}"</span><span class="json-colon">${escapeHtml(rColon)}</span>`
    }

    // 2. Process Value Diff
    let leftValHtml = ''
    let rightValHtml = ''

    if (lVal === rVal) {
      leftValHtml = applyJsonHighlight(lVal)
      rightValHtml = applyJsonHighlight(rVal)
    } else {
      // Check if both values are string literals: "..." or "...",
      const strRegex = /^"((?:[^"\\]|\\.)*)"(,?)$/
      const lStrMatch = lVal.match(strRegex)
      const rStrMatch = rVal.match(strRegex)

      if (lStrMatch && rStrMatch) {
        const lStrContent = lStrMatch[1]
        const lComma = lStrMatch[2]
        const rStrContent = rStrMatch[1]
        const rComma = rStrMatch[2]

        const vDiff = diff.diffChars(lStrContent, rStrContent, options)
        const lValInner = vDiff
          .filter(d => !d.added)
          .map(d => d.removed ? `<span class="word-removed">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
          .join('')
        const rValInner = vDiff
          .filter(d => !d.removed)
          .map(d => d.added ? `<span class="word-added">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
          .join('')

        leftValHtml = `<span class="json-string">"${lValInner}"</span>${escapeHtml(lComma)}`
        rightValHtml = `<span class="json-string">"${rValInner}"</span>${escapeHtml(rComma)}`
      } else {
        // Fallback for non-string / mixed values
        const vDiff = diff.diffChars(lVal, rVal, options)
        leftValHtml = vDiff
          .filter(d => !d.added)
          .map(d => d.removed ? `<span class="word-removed">${escapeHtml(d.value)}</span>` : applyJsonHighlight(d.value))
          .join('')
        rightValHtml = vDiff
          .filter(d => !d.removed)
          .map(d => d.added ? `<span class="word-added">${escapeHtml(d.value)}</span>` : applyJsonHighlight(d.value))
          .join('')
      }
    }

    return {
      leftHtml: leftKeyHtml + leftValHtml,
      rightHtml: rightKeyHtml + rightValHtml
    }
  }

  // Fallback for string array items: e.g. "item",
  const arrStrRegex = /^(\s*)"((?:[^"\\]|\\.)*)"(,?)$/
  const lArrStrMatch = lLine.match(arrStrRegex)
  const rArrStrMatch = rLine.match(arrStrRegex)

  if (lArrStrMatch && rArrStrMatch) {
    const lIndent = lArrStrMatch[1]
    const lStr = lArrStrMatch[2]
    const lComma = lArrStrMatch[3]
    const rIndent = rArrStrMatch[1]
    const rStr = rArrStrMatch[2]
    const rComma = rArrStrMatch[3]

    const strDiff = diff.diffChars(lStr, rStr, options)
    const lInner = strDiff
      .filter(d => !d.added)
      .map(d => d.removed ? `<span class="word-removed">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
      .join('')
    const rInner = strDiff
      .filter(d => !d.removed)
      .map(d => d.added ? `<span class="word-added">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
      .join('')

    return {
      leftHtml: `${escapeHtml(lIndent)}<span class="json-string">"${lInner}"</span>${escapeHtml(lComma)}`,
      rightHtml: `${escapeHtml(rIndent)}<span class="json-string">"${rInner}"</span>${escapeHtml(rComma)}`
    }
  }

  // Generic fallback
  const charDiffs = diff.diffChars(lLine, rLine, options)
  const leftHtml = charDiffs
    .filter(d => !d.added)
    .map(d => d.removed ? `<span class="word-removed">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
    .join('')
  const rightHtml = charDiffs
    .filter(d => !d.removed)
    .map(d => d.added ? `<span class="word-added">${escapeHtml(d.value)}</span>` : escapeHtml(d.value))
    .join('')

  return { leftHtml, rightHtml }
}

const wrapLinesWithHighlight = (html, errorLine, lineClasses = []) => {
  if (!html) return ''
  const lines = html.replace(/\r/g, '').split('\n')
  const mapped = lines.map((line, index) => {
    const lineNum = index + 1
    const isError = errorLine === lineNum
    let cls = 'editor-line'
    if (isError) cls += ' has-error'
    if (lineClasses[index]) cls += ' ' + lineClasses[index]
    return `<div class="${cls}">${line || ' '}</div>`
  })
  return mapped.join('')
}

// 计算两行文本的相似度（0 ~ 1），避免不相关的两行被强行碎片化 Diff
const calculateLineSimilarity = (a, b) => {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const tA = a.trim()
  const tB = b.trim()
  if (tA === tB) return 1

  const maxLen = Math.max(tA.length, tB.length)
  if (maxLen === 0) return 1

  try {
    const charDiffs = diff.diffChars(tA, tB)
    let commonChars = 0
    for (const d of charDiffs) {
      if (!d.added && !d.removed) {
        const significant = d.value.replace(/[\s,:,"'{}[\]]/g, '').length
        commonChars += significant * 1.5 + (d.value.length - significant) * 0.5
      }
    }
    const score = commonChars / maxLen
    return Math.min(1, Math.max(0, score))
  } catch (e) {
    return 0
  }
}

const diffAnalysis = computed(() => {
  const tab = activeTab.value
  if (!tab) return { left: [], right: [] }
  const leftText = tab.leftText || ''
  const rightText = tab.rightText || ''
  
  const leftLines = leftText.split('\n')
  const rightLines = rightText.split('\n')
  
  const left = Array.from({ length: leftLines.length }, () => ({ type: 'normal', partnerIdx: null }))
  const right = Array.from({ length: rightLines.length }, () => ({ type: 'normal', partnerIdx: null }))
  
  const options = {
    ignoreCase: caseInsensitive.value,
    ignoreWhitespace: ignoreWhitespace.value
  }
  
  try {
    const diffChunks = diff.diffLines(leftText, rightText, options)
    
    let leftIdx = 0
    let rightIdx = 0
    
    for (let i = 0; i < diffChunks.length; i++) {
      const chunk = diffChunks[i]
      const count = chunk.count || chunk.value.replace(/\n$/, '').split('\n').length
      
      if (!chunk.added && !chunk.removed) {
        for (let k = 0; k < count; k++) {
          if (leftIdx + k < left.length) {
            left[leftIdx + k] = { type: 'normal', partnerIdx: rightIdx + k }
          }
          if (rightIdx + k < right.length) {
            right[rightIdx + k] = { type: 'normal', partnerIdx: leftIdx + k }
          }
        }
        leftIdx += count
        rightIdx += count
      } else if (chunk.removed) {
        const nextChunk = diffChunks[i + 1]
        if (nextChunk && nextChunk.added) {
          const nextCount = nextChunk.count || nextChunk.value.replace(/\n$/, '').split('\n').length
          const minLines = Math.min(count, nextCount)
          
          for (let k = 0; k < minLines; k++) {
            const lText = leftLines[leftIdx + k] || ''
            const rText = rightLines[rightIdx + k] || ''
            const sim = calculateLineSimilarity(lText, rText)

            if (sim >= 0.4) {
              if (leftIdx + k < left.length) {
                left[leftIdx + k] = { type: 'modified', partnerIdx: rightIdx + k }
              }
              if (rightIdx + k < right.length) {
                right[rightIdx + k] = { type: 'modified', partnerIdx: leftIdx + k }
              }
            } else {
              if (leftIdx + k < left.length) {
                left[leftIdx + k] = { type: 'removed', partnerIdx: null }
              }
              if (rightIdx + k < right.length) {
                right[rightIdx + k] = { type: 'added', partnerIdx: null }
              }
            }
          }
          for (let k = minLines; k < count; k++) {
            if (leftIdx + k < left.length) {
              left[leftIdx + k] = { type: 'removed', partnerIdx: null }
            }
          }
          for (let k = minLines; k < nextCount; k++) {
            if (rightIdx + k < right.length) {
              right[rightIdx + k] = { type: 'added', partnerIdx: null }
            }
          }
          leftIdx += count
          rightIdx += nextCount
          i++
        } else {
          for (let k = 0; k < count; k++) {
            if (leftIdx + k < left.length) {
              left[leftIdx + k] = { type: 'removed', partnerIdx: null }
            }
          }
          leftIdx += count
        }
      } else if (chunk.added) {
        for (let k = 0; k < count; k++) {
          if (rightIdx + k < right.length) {
            right[rightIdx + k] = { type: 'added', partnerIdx: null }
          }
        }
        rightIdx += count
      }
    }
  } catch (_) {}
  
  return { left, right }
})

const leftLineClasses = computed(() => {
  return diffAnalysis.value.left.map(line => {
    if (line.type === 'removed') return 'diff-removed-line'
    if (line.type === 'modified') return 'diff-modified-line'
    return ''
  })
})

const rightLineClasses = computed(() => {
  return diffAnalysis.value.right.map(line => {
    if (line.type === 'added') return 'diff-added-line'
    if (line.type === 'modified') return 'diff-modified-line'
    return ''
  })
})

const highlightedLeft = computed(() => {
  const tab = activeTab.value
  if (!tab) return ''
  const leftText = tab.leftText || ''
  const rightText = tab.rightText || ''
  const leftLines = leftText.split('\n')
  const rightLines = rightText.split('\n')
  
  const options = {
    ignoreCase: caseInsensitive.value,
    ignoreWhitespace: ignoreWhitespace.value
  }
  
  const linesHtml = leftLines.map((lineText, idx) => {
    const analysis = diffAnalysis.value.left[idx]
    if (!analysis) return applyJsonHighlight(lineText)
    
    if (analysis.type === 'normal' || analysis.type === 'removed') {
      return applyJsonHighlight(lineText)
    } else if (analysis.type === 'modified') {
      const partnerText = rightLines[analysis.partnerIdx] || ''
      const sim = calculateLineSimilarity(lineText, partnerText)
      if (sim < 0.4) {
        return applyJsonHighlight(lineText)
      }
      const { leftHtml } = highlightJsonDiffLine(lineText, partnerText, options)
      return leftHtml
    }
    return ''
  })
  
  return wrapLinesWithHighlight(linesHtml.join('\n'), tab.leftErrorLine, leftLineClasses.value)
})

const highlightedRight = computed(() => {
  const tab = activeTab.value
  if (!tab) return ''
  const leftText = tab.leftText || ''
  const rightText = tab.rightText || ''
  const leftLines = leftText.split('\n')
  const rightLines = rightText.split('\n')
  
  const options = {
    ignoreCase: caseInsensitive.value,
    ignoreWhitespace: ignoreWhitespace.value
  }
  
  const linesHtml = rightLines.map((lineText, idx) => {
    const analysis = diffAnalysis.value.right[idx]
    if (!analysis) return applyJsonHighlight(lineText)
    
    if (analysis.type === 'normal' || analysis.type === 'added') {
      return applyJsonHighlight(lineText)
    } else if (analysis.type === 'modified') {
      const partnerText = leftLines[analysis.partnerIdx] || ''
      const sim = calculateLineSimilarity(partnerText, lineText)
      if (sim < 0.4) {
        return applyJsonHighlight(lineText)
      }
      const { rightHtml } = highlightJsonDiffLine(partnerText, lineText, options)
      return rightHtml
    }
    return ''
  })
  
  return wrapLinesWithHighlight(linesHtml.join('\n'), tab.rightErrorLine, rightLineClasses.value)
})

const isLeftMinified = computed(() => {
  const text = activeTab.value?.leftText || ''
  return !!text.trim() && !text.includes('\n')
})

const isRightMinified = computed(() => {
  const text = activeTab.value?.rightText || ''
  return !!text.trim() && !text.includes('\n')
})

// Auto extract JSON helper
const applyAutoExtract = (isLeft) => {
  const tab = activeTab.value
  if (!tab) return
  
  const text = isLeft ? tab.leftText : tab.rightText
  if (!text || !text.trim()) return
  
  // If already valid JSON, format if enabled
  try {
    const parsed = safeParse(text)
    if (autoFormat.value || sortKeys.value) {
      if (sortKeys.value && (isLeft ? !tab._unsortedLeftText : !tab._unsortedRightText)) {
        if (isLeft) tab._unsortedLeftText = text
        else tab._unsortedRightText = text
      }
      const formatted = safeStringify(sortKeys.value ? sortJSONKeys(parsed, sortKeys.value === 2) : parsed, null, 2)
      if (text.trim() !== formatted.trim()) {
        if (isLeft) tab.leftText = formatted
        else tab.rightText = formatted
        autoCopyResult(formatted, isLeft)
      }
    }
    return
  } catch (e) {}
  
  if (!autoExtract.value) return
  
  try {
    const result = extractJsonFromText(text)
    if (result && result.json !== text) {
      if (isLeft) {
        tab.leftText = result.json
        tab.leftError = null
        tab.leftErrorLine = null
      } else {
        tab.rightText = result.json
        tab.rightError = null
        tab.rightErrorLine = null
      }
      
      if (showToast) {
        showToast(result.format !== 'JSON' ? `已从 ${result.format} 提取 JSON` : '已自动提取 JSON')
      }
      
      if (autoFormat.value || sortKeys.value) {
        try {
          const obj = safeParse(result.json)
          if (sortKeys.value && (isLeft ? !tab._unsortedLeftText : !tab._unsortedRightText)) {
            if (isLeft) tab._unsortedLeftText = result.json
            else tab._unsortedRightText = result.json
          }
          const formatted = safeStringify(sortKeys.value ? sortJSONKeys(obj, sortKeys.value === 2) : obj, null, 2)
          if (isLeft) tab.leftText = formatted
          else tab.rightText = formatted
          
          autoCopyResult(formatted, isLeft)
        } catch (_) {}
      }
    }
  } catch (_) {}
}

const handleExtractLeft = () => {
  const tab = activeTab.value
  if (!tab || !tab.leftText) return
  try {
    const result = extractJsonFromText(tab.leftText)
    if (result && result.json !== tab.leftText) {
      tab.leftText = result.json
      tab.leftError = null
      tab.leftErrorLine = null
      if (showToast) {
        showToast(result.format !== 'JSON' ? `已从 ${result.format} 提取 JSON` : '已提取 JSON')
      }
    } else {
      if (showToast) showToast('未发现可提取的 JSON')
    }
  } catch (err) {
    if (showToast) showToast('提取失败，请检查输入')
  }
}

const handleExtractRight = () => {
  const tab = activeTab.value
  if (!tab || !tab.rightText) return
  try {
    const result = extractJsonFromText(tab.rightText)
    if (result && result.json !== tab.rightText) {
      tab.rightText = result.json
      tab.rightError = null
      tab.rightErrorLine = null
      if (showToast) {
        showToast(result.format !== 'JSON' ? `已从 ${result.format} 提取 JSON` : '已提取 JSON')
      }
    } else {
      if (showToast) showToast('未发现可提取的 JSON')
    }
  } catch (err) {
    if (showToast) showToast('提取失败，请检查输入')
  }
}

const handleFormatLeft = () => {
  const tab = activeTab.value
  if (!tab || !tab.leftText) return
  try {
    const parsed = safeParse(tab.leftText)
    if (sortKeys.value && !tab._unsortedLeftText) {
      tab._unsortedLeftText = tab.leftText
    }
    const formatted = safeStringify(sortKeys.value ? sortJSONKeys(parsed, sortKeys.value === 2) : parsed, null, 2)
    tab.leftText = formatted
    tab.leftError = null
    tab.leftErrorLine = null
    if (showToast) showToast('左侧格式化成功')
    autoCopyResult(formatted, true)
  } catch (err) {
    if (showToast) showToast(`左侧格式化失败: ${err.message}`)
  }
}

const handleFormatRight = () => {
  const tab = activeTab.value
  if (!tab || !tab.rightText) return
  try {
    const parsed = safeParse(tab.rightText)
    if (sortKeys.value && !tab._unsortedRightText) {
      tab._unsortedRightText = tab.rightText
    }
    const formatted = safeStringify(sortKeys.value ? sortJSONKeys(parsed, sortKeys.value === 2) : parsed, null, 2)
    tab.rightText = formatted
    tab.rightError = null
    tab.rightErrorLine = null
    if (showToast) showToast('右侧格式化成功')
    autoCopyResult(formatted, false)
  } catch (err) {
    if (showToast) showToast(`右侧格式化失败: ${err.message}`)
  }
}

const handlePasteLeft = () => {
  const tab = activeTab.value
  if (tab) {
    tab._unsortedLeftText = null
  }
  setTimeout(() => {
    applyAutoExtract(true)
  }, 50)
}

const handlePasteRight = () => {
  const tab = activeTab.value
  if (tab) {
    tab._unsortedRightText = null
  }
  setTimeout(() => {
    applyAutoExtract(false)
  }, 50)
}

const handleDiffPanePaste = (e, isLeft) => {
  const tab = activeTab.value
  if (!tab) return
  const pastedText = e.clipboardData?.getData('text')
  if (pastedText) {
    e.preventDefault()
    if (isLeft) {
      tab.leftText = pastedText
      tab._unsortedLeftText = null
      tab.leftError = null
      tab.leftErrorLine = null
    } else {
      tab.rightText = pastedText
      tab._unsortedRightText = null
      tab.rightError = null
      tab.rightErrorLine = null
    }
    applyAutoExtract(isLeft)
    if (showToast) {
      showToast(isLeft ? '已粘贴至左侧' : '已粘贴至右侧')
    }
  }
}



// Focus helper (auto-paste removed for Comparison Page in Option 2)
const handleFocus = (isLeft) => {
  activeScrollTarget.value = isLeft ? 'left' : 'right'
}

const applyGutterAndHighlightScroll = (isLeft, scrollTop, scrollLeft) => {
  if (isLeft) {
    if (leftGutterInnerRef.value) {
      leftGutterInnerRef.value.style.transform = `translate3d(0, -${scrollTop}px, 0)`
    }
    if (leftHighlightRef.value) {
      leftHighlightRef.value.scrollTop = 0
      leftHighlightRef.value.scrollLeft = 0
      leftHighlightRef.value.style.transform = `translate3d(-${scrollLeft}px, -${scrollTop}px, 0)`
    }
  } else {
    if (rightGutterInnerRef.value) {
      rightGutterInnerRef.value.style.transform = `translate3d(0, -${scrollTop}px, 0)`
    }
    if (rightHighlightRef.value) {
      rightHighlightRef.value.scrollTop = 0
      rightHighlightRef.value.scrollLeft = 0
      rightHighlightRef.value.style.transform = `translate3d(-${scrollLeft}px, -${scrollTop}px, 0)`
    }
  }
}

// Synchronized scrolling logic for gutters inside textareas
const handleLeftTextareaScroll = () => {
  if (leftTextareaRef.value) {
    const scrollTop = leftTextareaRef.value.scrollTop
    const scrollLeft = leftTextareaRef.value.scrollLeft
    savedComparerScrollState.leftTop = scrollTop
    savedComparerScrollState.leftLeft = scrollLeft
    applyGutterAndHighlightScroll(true, scrollTop, scrollLeft)

    // Also scroll sync right diff pane or right textarea if left is active scroll target
    if (activeScrollTarget.value === 'left') {
      if (rightEditing.value && rightTextareaRef.value) {
        rightTextareaRef.value.scrollTop = scrollTop
        rightTextareaRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.rightTop = scrollTop
        savedComparerScrollState.rightLeft = scrollLeft
        applyGutterAndHighlightScroll(false, scrollTop, scrollLeft)
      } else if (rightPaneRef.value) {
        rightPaneRef.value.scrollTop = scrollTop
        rightPaneRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.rightTop = scrollTop
        savedComparerScrollState.rightLeft = scrollLeft
      }
    }
  }
}

const handleRightTextareaScroll = () => {
  if (rightTextareaRef.value) {
    const scrollTop = rightTextareaRef.value.scrollTop
    const scrollLeft = rightTextareaRef.value.scrollLeft
    savedComparerScrollState.rightTop = scrollTop
    savedComparerScrollState.rightLeft = scrollLeft
    applyGutterAndHighlightScroll(false, scrollTop, scrollLeft)

    // Also scroll sync left diff pane or left textarea if right is active scroll target
    if (activeScrollTarget.value === 'right') {
      if (leftEditing.value && leftTextareaRef.value) {
        leftTextareaRef.value.scrollTop = scrollTop
        leftTextareaRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.leftTop = scrollTop
        savedComparerScrollState.leftLeft = scrollLeft
        applyGutterAndHighlightScroll(true, scrollTop, scrollLeft)
      } else if (leftPaneRef.value) {
        leftPaneRef.value.scrollTop = scrollTop
        leftPaneRef.value.scrollLeft = scrollLeft
        savedComparerScrollState.leftTop = scrollTop
        savedComparerScrollState.leftLeft = scrollLeft
      }
    }
  }
}

let cmpGutterSyncRaf = null
const requestSyncComparerGutterHeights = () => {
  if (cmpGutterSyncRaf) cancelAnimationFrame(cmpGutterSyncRaf)
  cmpGutterSyncRaf = requestAnimationFrame(() => {
    syncComparerGutterHeights()
    if (leftEditing.value && leftTextareaRef.value) {
      applyGutterAndHighlightScroll(true, leftTextareaRef.value.scrollTop, leftTextareaRef.value.scrollLeft)
    }
    if (rightEditing.value && rightTextareaRef.value) {
      applyGutterAndHighlightScroll(false, rightTextareaRef.value.scrollTop, rightTextareaRef.value.scrollLeft)
    }
    cmpGutterSyncRaf = null
  })
}

const syncComparerGutterHeights = () => {
  const isWrap = editorWordWrap.value === 'wrap'
  
  // 1. 同步双栏编辑模式（Edit Mode）下的左右行高与行号高度
  const leftHighlight = leftHighlightRef.value
  const rightHighlight = rightHighlightRef.value
  const leftGutter = leftGutterInnerRef.value
  const rightGutter = rightGutterInnerRef.value

  const leftHLines = leftHighlight ? Array.from(leftHighlight.children) : []
  const rightHLines = rightHighlight ? Array.from(rightHighlight.children) : []
  const leftGLines = leftGutter ? Array.from(leftGutter.children) : []
  const rightGLines = rightGutter ? Array.from(rightGutter.children) : []

  const maxLines = Math.max(leftHLines.length, rightHLines.length, leftGLines.length, rightGLines.length)

  if (!isWrap && !isLeftMinified.value && !isRightMinified.value) {
    // 平铺模式（Nowrap）恢复默认单行高度
    for (let i = 0; i < leftHLines.length; i++) {
      if (leftHLines[i].style.height) leftHLines[i].style.height = ''
    }
    for (let i = 0; i < leftGLines.length; i++) {
      if (leftGLines[i].style.height) leftGLines[i].style.height = ''
    }
    for (let i = 0; i < rightHLines.length; i++) {
      if (rightHLines[i].style.height) rightHLines[i].style.height = ''
    }
    for (let i = 0; i < rightGLines.length; i++) {
      if (rightGLines[i].style.height) rightGLines[i].style.height = ''
    }
  } else if (maxLines > 0) {
    // 换行模式（Wrap）：
    // Step 1: 必须先清空之前设置的固定高度，让左右两边根据自然折行计算真实 DOM 高度
    for (let i = 0; i < leftHLines.length; i++) {
      if (leftHLines[i].style.height) leftHLines[i].style.height = ''
    }
    for (let i = 0; i < rightHLines.length; i++) {
      if (rightHLines[i].style.height) rightHLines[i].style.height = ''
    }

    // Step 2: 逐行计算左右两边的最大行高，并同步赋予左右对应行及行号
    for (let i = 0; i < maxLines; i++) {
      const lh = (leftHLines[i] && leftHLines[i].offsetHeight) || 0
      const rh = (rightHLines[i] && rightHLines[i].offsetHeight) || 0
      const targetH = Math.max(lh, rh)

      if (targetH > 0) {
        const hStr = `${targetH}px`
        if (leftHLines[i] && leftHLines[i].style.height !== hStr) {
          leftHLines[i].style.height = hStr
        }
        if (leftGLines[i] && leftGLines[i].style.height !== hStr) {
          leftGLines[i].style.height = hStr
        }
        if (rightHLines[i] && rightHLines[i].style.height !== hStr) {
          rightHLines[i].style.height = hStr
        }
        if (rightGLines[i] && rightGLines[i].style.height !== hStr) {
          rightGLines[i].style.height = hStr
        }
      } else {
        if (leftHLines[i] && leftHLines[i].style.height) leftHLines[i].style.height = ''
        if (leftGLines[i] && leftGLines[i].style.height) leftGLines[i].style.height = ''
        if (rightHLines[i] && rightHLines[i].style.height) rightHLines[i].style.height = ''
        if (rightGLines[i] && rightGLines[i].style.height) rightGLines[i].style.height = ''
      }
    }
  }

  // 2. 同步只读对齐对比模式（Aligned Diff View Mode）下的行高
  if (!leftEditing.value || !rightEditing.value) {
    const leftPane = leftPaneRef.value
    const rightPane = rightPaneRef.value
    if (leftPane && rightPane) {
      const leftRows = leftPane.querySelectorAll('.diff-line-row')
      const rightRows = rightPane.querySelectorAll('.diff-line-row')
      const rowLen = Math.min(leftRows.length, rightRows.length)

      if (!isWrap) {
        for (let i = 0; i < rowLen; i++) {
          if (leftRows[i].style.height) leftRows[i].style.height = ''
          if (rightRows[i].style.height) rightRows[i].style.height = ''
        }
      } else {
        for (let i = 0; i < rowLen; i++) {
          if (leftRows[i].style.height) leftRows[i].style.height = ''
          if (rightRows[i].style.height) rightRows[i].style.height = ''
        }
        for (let i = 0; i < rowLen; i++) {
          const lh = leftRows[i].offsetHeight || 0
          const rh = rightRows[i].offsetHeight || 0
          const targetH = Math.max(lh, rh)
          if (targetH > 0) {
            const hStr = `${targetH}px`
            if (leftRows[i].style.height !== hStr) leftRows[i].style.height = hStr
            if (rightRows[i].style.height !== hStr) rightRows[i].style.height = hStr
          }
        }
      }
    }
  }
}

watch([
  editorFontSize,
  editorWordWrap,
  () => activeTab.value?.leftText,
  () => activeTab.value?.rightText,
  activeTabId,
  leftEditing,
  rightEditing
], () => {
  nextTick(() => {
    requestSyncComparerGutterHeights()
    if (leftEditing.value) handleLeftTextareaScroll()
    if (rightEditing.value) handleRightTextareaScroll()
  })
})

// KeepAlive 标签页切换时保存与恢复滚动位置
const savedComparerScrollState = {
  leftTop: 0,
  leftLeft: 0,
  rightTop: 0,
  rightLeft: 0
}

onDeactivated(() => {
  // 注意：DOM 分离时浏览器会将 scrollTop 重置为 0，滚动状态已在实时滚动事件中记录在 savedComparerScrollState 中，此处无需覆盖
})

onActivated(() => {
  nextTick(() => {
    const leftEl = leftEditing.value ? leftTextareaRef.value : leftPaneRef.value
    if (leftEl) {
      leftEl.scrollTop = savedComparerScrollState.leftTop
      leftEl.scrollLeft = savedComparerScrollState.leftLeft
    }
    const rightEl = rightEditing.value ? rightTextareaRef.value : rightPaneRef.value
    if (rightEl) {
      rightEl.scrollTop = savedComparerScrollState.rightTop
      rightEl.scrollLeft = savedComparerScrollState.rightLeft
    }
    if (leftEditing.value) handleLeftTextareaScroll()
    if (rightEditing.value) handleRightTextareaScroll()
    requestSyncComparerGutterHeights()
  })
})

const handleLeftGutterWheel = (e) => {
  activeScrollTarget.value = 'left'
  if (leftTextareaRef.value) {
    leftTextareaRef.value.scrollTop += e.deltaY
    leftTextareaRef.value.scrollLeft += e.deltaX
    handleLeftTextareaScroll()
  }
}

const handleRightGutterWheel = (e) => {
  activeScrollTarget.value = 'right'
  if (rightTextareaRef.value) {
    rightTextareaRef.value.scrollTop += e.deltaY
    rightTextareaRef.value.scrollLeft += e.deltaX
    handleRightTextareaScroll()
  }
}

const scrollLeftToTop = () => {
  activeScrollTarget.value = 'left'
  if (leftTextareaRef.value) {
    leftTextareaRef.value.scrollTop = 0
    handleLeftTextareaScroll()
  }
}

const scrollLeftToBottom = () => {
  activeScrollTarget.value = 'left'
  if (leftTextareaRef.value) {
    leftTextareaRef.value.scrollTop = leftTextareaRef.value.scrollHeight
    handleLeftTextareaScroll()
  }
}

const scrollRightToTop = () => {
  activeScrollTarget.value = 'right'
  if (rightTextareaRef.value) {
    rightTextareaRef.value.scrollTop = 0
    handleRightTextareaScroll()
  }
}

const scrollRightToBottom = () => {
  activeScrollTarget.value = 'right'
  if (rightTextareaRef.value) {
    rightTextareaRef.value.scrollTop = rightTextareaRef.value.scrollHeight
    handleRightTextareaScroll()
  }
}

const isSplitEditLocked = ref(false)
let blurExitTimer = null

const checkAutoExitEditMode = () => {
  if (isSplitEditLocked.value) return
  clearTimeout(blurExitTimer)
  blurExitTimer = setTimeout(() => {
    const activeEl = document.activeElement
    const isLeftActive = activeEl === leftTextareaRef.value
    const isRightActive = activeEl === rightTextareaRef.value
    if (!isLeftActive && !isRightActive) {
      const tab = activeTab.value
      if (tab && tab.leftText && tab.rightText) {
        leftEditing.value = false
        rightEditing.value = false
        stopEditingLeft()
        stopEditingRight()
      }
    }
  }, 200)
}

const handleLeftBlur = () => {
  leftFocused.value = false
  stopEditingLeft()
  checkAutoExitEditMode()
}

const handleRightBlur = () => {
  rightFocused.value = false
  stopEditingRight()
  checkAutoExitEditMode()
}

// Helper for calculating exact character index range of a line
const getLinePosInfo = (text, targetLineNum) => {
  if (!text) return { start: 0, end: 0, lineText: '', lineIdx: 0 }
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lineIdx = Math.max(0, Math.min((targetLineNum || 1) - 1, lines.length - 1))
  let start = 0
  for (let i = 0; i < lineIdx; i++) {
    start += lines[i].length + 1
  }
  const lineText = lines[lineIdx] || ''
  const end = start + lineText.length
  return { start, end, lineText, lineIdx }
}

// Calculate character offset inside .line-code DOM elements
const getOffsetInLineCode = (event, lineCodeEl) => {
  if (!event || !lineCodeEl) return null
  try {
    const target = event.target
    if (!target || target === lineCodeEl) return null
    let offset = 0
    const walker = document.createTreeWalker(lineCodeEl, NodeFilter.SHOW_TEXT, null, false)
    let currentNode
    while ((currentNode = walker.nextNode())) {
      if (currentNode === target || currentNode.parentNode === target) {
        const sel = window.getSelection ? window.getSelection() : null
        const anchorOffset = (sel && sel.anchorNode === currentNode) ? sel.anchorOffset : 0
        return offset + anchorOffset
      }
      offset += currentNode.textContent ? currentNode.textContent.length : 0
    }
  } catch (e) {}
  return null
}

// Resolve target cursor range (defaulting to end-of-line on row click, or selected word)
const resolveTargetCursor = (text, targetLineNum, event) => {
  if (!text) return { start: 0, end: 0 }
  const lineInfo = getLinePosInfo(text, targetLineNum)
  
  // Default: very end of that line (after all characters, quotes, commas, brackets)
  let targetStart = lineInfo.end
  let targetEnd = lineInfo.end

  if (event && event.target) {
    const rowEl = event.target.closest ? event.target.closest('.diff-line-row') : null
    const lineCodeEl = rowEl ? rowEl.querySelector('.line-code') : null
    if (lineCodeEl && lineCodeEl.contains(event.target) && event.target !== lineCodeEl) {
      const sel = window.getSelection ? window.getSelection() : null
      const selectedStr = sel ? sel.toString().trim() : ''
      if (selectedStr && lineInfo.lineText.includes(selectedStr)) {
        const charOffset = getOffsetInLineCode(event, lineCodeEl)
        if (charOffset !== null && charOffset >= 0 && charOffset <= lineInfo.lineText.length) {
          targetStart = lineInfo.start + charOffset
          targetEnd = targetStart + selectedStr.length
          return { start: targetStart, end: targetEnd }
        }
      }
    }
  }

  return { start: targetStart, end: targetEnd }
}

// Transition functions for editing state with scroll preservation and row-accurate cursor placement
const startEditingLeftRow = (event, lineNum, rowIdx) => {
  if (event && event.preventDefault) {
    event.preventDefault()
    event.stopPropagation()
  }
  clearTimeout(blurExitTimer)
  
  const tab = activeTab.value
  const leftText = tab ? (tab.leftText || '') : ''
  
  let resolvedLineNum = lineNum
  if (!resolvedLineNum && rowIdx !== undefined && alignedDiff.value) {
    for (let i = rowIdx - 1; i >= 0; i--) {
      if (alignedDiff.value[i]?.left?.lineNum) {
        resolvedLineNum = alignedDiff.value[i].left.lineNum
        break
      }
    }
    if (!resolvedLineNum) {
      for (let i = rowIdx + 1; i < alignedDiff.value.length; i++) {
        if (alignedDiff.value[i]?.left?.lineNum) {
          resolvedLineNum = alignedDiff.value[i].left.lineNum
          break
        }
      }
    }
  }

  const { start: cursorStart, end: cursorEnd } = resolveTargetCursor(leftText, resolvedLineNum, event)
  
  const scrollTop = leftPaneRef.value ? leftPaneRef.value.scrollTop : 0
  const scrollLeft = leftPaneRef.value ? leftPaneRef.value.scrollLeft : 0
  
  leftEditing.value = true
  activeScrollTarget.value = 'left'
  
  nextTick(() => {
    if (leftTextareaRef.value) {
      leftTextareaRef.value.scrollTop = scrollTop
      leftTextareaRef.value.scrollLeft = scrollLeft
      handleLeftTextareaScroll()
      leftTextareaRef.value.focus({ preventScroll: true })
      leftTextareaRef.value.setSelectionRange(cursorStart, cursorEnd)
    }
    requestSyncComparerGutterHeights()
    
    setTimeout(() => {
      if (leftTextareaRef.value) {
        leftTextareaRef.value.setSelectionRange(cursorStart, cursorEnd)
      }
    }, 25)
  })
}

const startEditingLeft = (event) => {
  if (leftEditing.value) return
  const tab = activeTab.value
  const leftText = tab ? (tab.leftText || '') : ''
  const lines = leftText.split('\n')
  startEditingLeftRow(event, lines.length)
}

const startEditingRightRow = (event, lineNum, rowIdx) => {
  if (event && event.preventDefault) {
    event.preventDefault()
    event.stopPropagation()
  }
  clearTimeout(blurExitTimer)
  
  const tab = activeTab.value
  const rightText = tab ? (tab.rightText || '') : ''
  
  let resolvedLineNum = lineNum
  if (!resolvedLineNum && rowIdx !== undefined && alignedDiff.value) {
    for (let i = rowIdx - 1; i >= 0; i--) {
      if (alignedDiff.value[i]?.right?.lineNum) {
        resolvedLineNum = alignedDiff.value[i].right.lineNum
        break
      }
    }
    if (!resolvedLineNum) {
      for (let i = rowIdx + 1; i < alignedDiff.value.length; i++) {
        if (alignedDiff.value[i]?.right?.lineNum) {
          resolvedLineNum = alignedDiff.value[i].right.lineNum
          break
        }
      }
    }
  }

  const { start: cursorStart, end: cursorEnd } = resolveTargetCursor(rightText, resolvedLineNum, event)
  
  const scrollTop = rightPaneRef.value ? rightPaneRef.value.scrollTop : 0
  const scrollLeft = rightPaneRef.value ? rightPaneRef.value.scrollLeft : 0
  
  rightEditing.value = true
  activeScrollTarget.value = 'right'
  
  nextTick(() => {
    if (rightTextareaRef.value) {
      rightTextareaRef.value.scrollTop = scrollTop
      rightTextareaRef.value.scrollLeft = scrollLeft
      handleRightTextareaScroll()
      rightTextareaRef.value.focus({ preventScroll: true })
      rightTextareaRef.value.setSelectionRange(cursorStart, cursorEnd)
    }
    requestSyncComparerGutterHeights()
    
    setTimeout(() => {
      if (rightTextareaRef.value) {
        rightTextareaRef.value.setSelectionRange(cursorStart, cursorEnd)
      }
    }, 25)
  })
}

const startEditingRight = (event) => {
  if (rightEditing.value) return
  const tab = activeTab.value
  const rightText = tab ? (tab.rightText || '') : ''
  const lines = rightText.split('\n')
  startEditingRightRow(event, lines.length)
}

const toggleDiffMode = (enableDiff) => {
  clearTimeout(blurExitTimer)
  if (enableDiff) {
    isSplitEditLocked.value = false
    leftEditing.value = false
    rightEditing.value = false
    stopEditingLeft()
    stopEditingRight()
  } else {
    isSplitEditLocked.value = true
    leftEditing.value = true
    rightEditing.value = true
    nextTick(() => {
      requestSyncComparerGutterHeights()
    })
  }
}

const toggleLeftEdit = () => {
  clearTimeout(blurExitTimer)
  if (leftEditing.value) {
    leftEditing.value = false
    stopEditingLeft()
  } else {
    startEditingLeft()
  }
}

const toggleRightEdit = () => {
  clearTimeout(blurExitTimer)
  if (rightEditing.value) {
    rightEditing.value = false
    stopEditingRight()
  } else {
    startEditingRight()
  }
}

const updateEditingModeForTab = () => {
  const tab = activeTab.value
  if (!tab) return
  if (tab.leftText && tab.rightText) {
    leftEditing.value = isSplitEditLocked.value
    rightEditing.value = isSplitEditLocked.value
  } else {
    leftEditing.value = !tab.leftText
    rightEditing.value = !tab.rightText
  }
}

// 错误定位锚点滚动
const scrollToLeftErrorLine = () => {
  const tab = activeTab.value
  if (!tab || !tab.leftErrorLine) return
  if (!leftEditing.value) {
    startEditingLeft()
  }
  nextTick(() => {
    const textarea = leftTextareaRef.value
    if (!textarea) return
    
    const targetLine = tab.leftErrorLine
    const lines = (tab.leftText || '').split('\n')
    const targetLineIdx = Math.max(0, Math.min(targetLine - 1, lines.length - 1))
    
    const targetTop = 8 + targetLineIdx * editorLineHeight.value
    const targetScrollTop = Math.max(0, targetTop - textarea.clientHeight / 2 + 10)
    
    textarea.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    })
    handleLeftTextareaScroll()

    let charIndex = 0
    for (let i = 0; i < targetLineIdx; i++) {
      charIndex += lines[i].length + 1
    }
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(charIndex, charIndex + (lines[targetLineIdx]?.length || 0))
  })
}

const scrollToRightErrorLine = () => {
  const tab = activeTab.value
  if (!tab || !tab.rightErrorLine) return
  if (!rightEditing.value) {
    startEditingRight()
  }
  nextTick(() => {
    const textarea = rightTextareaRef.value
    if (!textarea) return
    
    const targetLine = tab.rightErrorLine
    const lines = (tab.rightText || '').split('\n')
    const targetLineIdx = Math.max(0, Math.min(targetLine - 1, lines.length - 1))
    
    const targetTop = 8 + targetLineIdx * editorLineHeight.value
    const targetScrollTop = Math.max(0, targetTop - textarea.clientHeight / 2 + 10)
    
    textarea.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    })
    handleRightTextareaScroll()

    let charIndex = 0
    for (let i = 0; i < targetLineIdx; i++) {
      charIndex += lines[i].length + 1
    }
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(charIndex, charIndex + (lines[targetLineIdx]?.length || 0))
  })
}

const stopEditingLeft = () => {
  const tab = activeTab.value
  if (!tab || !tab.leftText) return
  if (autoFormat.value || sortKeys.value) {
    try {
      let parsed = safeParse(tab.leftText)
      if (sortKeys.value) {
        if (!tab._unsortedLeftText) {
          tab._unsortedLeftText = tab.leftText
        }
        parsed = sortJSONKeys(parsed, sortKeys.value === 2)
      }
      const formatted = safeStringify(parsed, null, 2)
      tab.leftText = formatted
      tab.leftError = null
      tab.leftErrorLine = null
      autoCopyResult(formatted, true)
    } catch (err) {
      validateJson(tab.leftText, true)
    }
  } else {
    validateJson(tab.leftText, true)
  }
}

const stopEditingRight = () => {
  const tab = activeTab.value
  if (!tab || !tab.rightText) return
  if (autoFormat.value || sortKeys.value) {
    try {
      let parsed = safeParse(tab.rightText)
      if (sortKeys.value) {
        if (!tab._unsortedRightText) {
          tab._unsortedRightText = tab.rightText
        }
        parsed = sortJSONKeys(parsed, sortKeys.value === 2)
      }
      const formatted = safeStringify(parsed, null, 2)
      tab.rightText = formatted
      tab.rightError = null
      tab.rightErrorLine = null
      autoCopyResult(formatted, false)
    } catch (err) {
      validateJson(tab.rightText, false)
    }
  } else {
    validateJson(tab.rightText, false)
  }
}

const leftLinesCount = computed(() => {
  return (activeTab.value?.leftText || '').split('\n').length
})

const rightLinesCount = computed(() => {
  return (activeTab.value?.rightText || '').split('\n').length
})

// Align diff calculation
const alignedDiff = computed(() => {
  const tab = activeTab.value
  if (!tab) return []
  const original = tab.leftText || ''
  const modified = tab.rightText || ''
  
  const options = {
    ignoreCase: caseInsensitive.value,
    ignoreWhitespace: ignoreWhitespace.value
  }
  
  const diffChunks = diff.diffLines(original, modified, options)
  
  const rows = []
  let leftLineNum = 1
  let rightLineNum = 1
  
  for (let i = 0; i < diffChunks.length; i++) {
    const chunk = diffChunks[i]
    
    if (!chunk.added && !chunk.removed) {
      const lines = chunk.value.replace(/\n$/, '').split('\n')
      for (const line of lines) {
        rows.push({
          left: { lineNum: leftLineNum++, text: line, type: 'normal' },
          right: { lineNum: rightLineNum++, text: line, type: 'normal' }
        })
      }
    } else if (chunk.removed) {
      const nextChunk = diffChunks[i + 1]
      if (nextChunk && nextChunk.added) {
        const leftLines = chunk.value.replace(/\n$/, '').split('\n')
        const rightLines = nextChunk.value.replace(/\n$/, '').split('\n')
        
        let jL = 0
        let jR = 0
        
        while (jL < leftLines.length && jR < rightLines.length) {
          const lLine = leftLines[jL]
          const rLine = rightLines[jR]
          const sim = calculateLineSimilarity(lLine, rLine)
          
          if (sim >= 0.4) {
            const { leftHtml, rightHtml } = highlightJsonDiffLine(lLine, rLine, options)
            
            rows.push({
              left: { lineNum: leftLineNum++, text: lLine, type: 'modified', html: leftHtml },
              right: { lineNum: rightLineNum++, text: rLine, type: 'modified', html: rightHtml }
            })
            jL++
            jR++
          } else {
            // Find lookahead match for nearest similar pair
            let nextMatchL = -1
            let nextMatchR = -1
            
            outerLookahead:
            for (let d = 1; d <= 4; d++) {
              for (let dl = 0; dl <= d; dl++) {
                const dr = d - dl
                if (jL + dl < leftLines.length && jR + dr < rightLines.length) {
                  if (calculateLineSimilarity(leftLines[jL + dl], rightLines[jR + dr]) >= 0.4) {
                    nextMatchL = jL + dl
                    nextMatchR = jR + dr
                    break outerLookahead
                  }
                }
              }
            }
            
            const endL = nextMatchL !== -1 ? nextMatchL : leftLines.length
            const endR = nextMatchR !== -1 ? nextMatchR : rightLines.length
            
            for (; jL < endL; jL++) {
              rows.push({
                left: { lineNum: leftLineNum++, text: leftLines[jL], type: 'removed' },
                right: { lineNum: '', text: '', type: 'empty' }
              })
            }
            for (; jR < endR; jR++) {
              rows.push({
                left: { lineNum: '', text: '', type: 'empty' },
                right: { lineNum: rightLineNum++, text: rightLines[jR], type: 'added' }
              })
            }
          }
        }
        
        while (jL < leftLines.length) {
          rows.push({
            left: { lineNum: leftLineNum++, text: leftLines[jL++], type: 'removed' },
            right: { lineNum: '', text: '', type: 'empty' }
          })
        }
        while (jR < rightLines.length) {
          rows.push({
            left: { lineNum: '', text: '', type: 'empty' },
            right: { lineNum: rightLineNum++, text: rightLines[jR++], type: 'added' }
          })
        }
        i++
      } else {
        const lines = chunk.value.replace(/\n$/, '').split('\n')
        for (const line of lines) {
          rows.push({
            left: { lineNum: leftLineNum++, text: line, type: 'removed' },
            right: { lineNum: '', text: '', type: 'empty' }
          })
        }
      }
    } else if (chunk.added) {
      const lines = chunk.value.replace(/\n$/, '').split('\n')
      for (const line of lines) {
        rows.push({
          left: { lineNum: '', text: '', type: 'empty' },
          right: { lineNum: rightLineNum++, text: line, type: 'added' }
        })
      }
    }
  }
  
  return rows
})

const stats = computed(() => {
  let additions = 0
  let deletions = 0
  let modifications = 0
  
  alignedDiff.value.forEach(row => {
    if (row.left.type === 'removed') deletions++
    else if (row.right.type === 'added') additions++
    else if (row.left.type === 'modified' || row.right.type === 'modified') modifications++
  })
  
  return { additions, deletions, modifications }
})

const loadDemo = () => {
  const tab = activeTab.value
  if (!tab) return
  let left = DEMO_LEFT
  let right = DEMO_RIGHT
  tab._unsortedLeftText = DEMO_LEFT
  tab._unsortedRightText = DEMO_RIGHT
  if (sortKeys.value) {
    try {
      left = safeStringify(sortJSONKeys(safeParse(left), sortKeys.value === 2), null, 2)
      right = safeStringify(sortJSONKeys(safeParse(right), sortKeys.value === 2), null, 2)
    } catch (_) {}
  }
  tab.leftText = left
  tab.rightText = right
  if (showToast) {
    showToast('示例加载成功')
  }
}

const clearAll = () => {
  const tab = activeTab.value
  if (!tab) return
  tab.leftText = ''
  tab.rightText = ''
  if (showToast) {
    showToast('已清空')
  }
}

const clearLeft = () => {
  const tab = activeTab.value
  if (!tab) return
  tab.leftText = ''
  if (showToast) {
    showToast('左侧已清空')
  }
}

const clearRight = () => {
  const tab = activeTab.value
  if (!tab) return
  tab.rightText = ''
  if (showToast) {
    showToast('右侧已清空')
  }
}

const swapInputs = () => {
  const tab = activeTab.value
  if (!tab) return
  const temp = tab.leftText
  tab.leftText = tab.rightText
  tab.rightText = temp
  if (showToast) {
    showToast('左右两侧内容已交换')
  }
}

const copyLeftText = async () => {
  const tab = activeTab.value
  if (!tab || !tab.leftText) return
  const ok = await writeToClipboard(tab.leftText)
  if (ok) {
    copySuccessLeft.value = true
    if (showToast) showToast('原始 JSON 已复制到剪贴板')
    setTimeout(() => { copySuccessLeft.value = false }, 2000)
  } else {
    if (showToast) showToast('复制失败', 'error')
  }
}

const copyRightText = async () => {
  const tab = activeTab.value
  if (!tab || !tab.rightText) return
  const ok = await writeToClipboard(tab.rightText)
  if (ok) {
    copySuccessRight.value = true
    if (showToast) showToast('对比 JSON 已复制到剪贴板')
    setTimeout(() => { copySuccessRight.value = false }, 2000)
  } else {
    if (showToast) showToast('复制失败', 'error')
  }
}

// 冷启动：从扩展的右键"直接对比"进入（首次打开无标签页时）
const checkCompareOnLoad = () => {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('action') !== 'compare') return
    if (!window.chrome?.storage?.local) return

    chrome.storage.local.get('ej_compare_text', (result) => {
      const text = result?.ej_compare_text
      if (!text) return

      const newId = nextTabId++
      tabs.value.push({
        id: newId,
        title: `对比 ${newId}`,
        leftText: text,
        rightText: '',
        leftError: null,
        leftErrorLine: null,
        rightError: null,
        rightErrorLine: null
      })
      activeTabId.value = newId
      scrollTabsToEnd()
      chrome.storage.local.remove('ej_compare_text')
    })
  } catch (e) {}
}

let cmpResizeObserver = null

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    cmpResizeObserver = new ResizeObserver(() => {
      requestSyncComparerGutterHeights()
    })
    if (leftPaneRef.value) cmpResizeObserver.observe(leftPaneRef.value)
    if (rightPaneRef.value) cmpResizeObserver.observe(rightPaneRef.value)
    if (leftTextareaRef.value) cmpResizeObserver.observe(leftTextareaRef.value)
    if (rightTextareaRef.value) cmpResizeObserver.observe(rightTextareaRef.value)
  }
  window.addEventListener('resize', requestSyncComparerGutterHeights)

  // Restore persisted tabs from localStorage
  try {
    const savedTabs = localStorage.getItem('ej_cmp_tabs')
    const savedActive = localStorage.getItem('ej_cmp_active')
    if (savedTabs) {
      const parsed = JSON.parse(savedTabs)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 如果所有保存的 tab 内容都为空，视为首次加载，展示示例数据
        const hasContent = parsed.some(t => (t.leftText && t.leftText.trim()) || (t.rightText && t.rightText.trim()))
        if (!hasContent) {
          // 退回到 loadDemo
        } else {
          tabs.value = parsed.map(t => ({
            id: t.id,
            title: t.title,
            leftText: t.leftText || '',
            rightText: t.rightText || '',
            leftError: null,
            rightError: null
          }))
          nextTabId = Math.max(...parsed.map(t => t.id)) + 1
          activeTabId.value = savedActive ? Number(savedActive) : tabs.value[0].id
          canSave = true
          scrollTabsToActive()
          updateEditingModeForTab()
          nextTick(syncComparerGutterHeights)
          return
        }
      }
    }
  } catch (e) {}
  canSave = true
  checkCompareOnLoad()
  updateEditingModeForTab()
  nextTick(syncComparerGutterHeights)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', requestSyncComparerGutterHeights)
  if (cmpResizeObserver) {
    cmpResizeObserver.disconnect()
    cmpResizeObserver = null
  }
})
</script>

<template>
  <div class="comparer-container">
    <!-- Comparison Tab bar -->
    <div class="compare-tabs-bar">
      <div class="tabs-list" ref="tabsListRef" @mousedown="onTabsMouseDown" @wheel.prevent="onTabsWheel">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="compare-tab"
          :class="{ active: tab.id === activeTabId }"
          @click="activeTabId = tab.id"
          @dblclick.stop="startEditTab(tab.id)"
          @contextmenu="showTabContextMenu($event, tab.id)"
        >
          <input
            v-if="editingTabId === tab.id"
            class="tab-edit-input"
            :value="tab.title"
            @blur="finishEditTab(tab, $event)"
            @keydown.enter="$event.target.blur()"
            @keydown.escape="editingTabId = null"
            @click.stop
            @mousedown.stop
          />
          <span v-else>{{ tab.title }}</span>
          <button
            v-if="tabs.length > 1"
            class="tab-close-btn"
            @click.stop="closeTab(tab.id)"
          >
            <X class="tab-close-icon" />
          </button>
        </div>
        <button v-if="!tabsOverflow" class="add-tab-btn" @click="addTab" data-tooltip-bottom="新建对比">
          <Plus class="add-tab-icon" />
          <span>新建对比</span>
        </button>
      </div>
      <button v-if="tabsOverflow" class="add-tab-btn add-tab-btn-fixed" @click="addTab" data-tooltip-bottom="新建对比">
        <Plus class="add-tab-icon" />
        <span>新建对比</span>
      </button>
    </div>

    <!-- Tab Context Menu -->
    <Teleport to="body">
      <div
        v-if="tabContextMenu?.visible"
        class="tab-context-menu"
        :style="{ left: (tabContextMenu?.x || 0) + 'px', top: (tabContextMenu?.y || 0) + 'px' }"
      >
        <button @click="closeTab(tabContextMenu?.tabId)" :disabled="tabs.length <= 1"><X class="ctx-icon" />关闭</button>
        <button @click="closeOtherTabs" :disabled="tabs.length <= 1"><X class="ctx-icon" />关闭其他</button>
        <button @click="closeLeftTabs" :disabled="tabs.findIndex(t => t.id === tabContextMenu?.tabId) === 0"><ArrowLeft class="ctx-icon" />关闭左侧</button>
        <button @click="closeRightTabs" :disabled="tabs.findIndex(t => t.id === tabContextMenu?.tabId) === tabs.length - 1"><ArrowRight class="ctx-icon" />关闭右侧</button>
        <button @click="closeAllTabs" :disabled="tabs.length <= 1"><Trash2 class="ctx-icon" />关闭全部</button>
        <div class="context-menu-divider"></div>
        <button @click="startEditTab(tabContextMenu?.tabId); if (tabContextMenu) tabContextMenu.visible = false"><Pencil class="ctx-icon" />重命名</button>
      </div>
    </Teleport>

    <!-- Workspace Area -->
    <div class="workspace-body vertical-layout">
      <div class="diff-grid-wrapper full-height">
        <div class="diff-grid">
          <!-- Left Pane (Original) -->
          <div
            class="diff-pane"
            :class="{ 'editing-pane': leftEditing }"
          >
            <div class="panel-header">
              <div class="panel-title">
                <FileJson class="panel-icon" />
                <span>原始 JSON</span>
              </div>
              <div class="header-actions-group" style="margin-left: auto; display: flex; gap: 6px; align-items: center;">
                <button 
                  class="action-btn outline icon-only" 
                  @click.stop="toggleLeftEdit" 
                  :data-tooltip-bottom="leftEditing ? '查看对齐对比' : '编辑左侧 JSON'"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Eye v-if="leftEditing" class="btn-icon" />
                  <Pencil v-else class="btn-icon" />
                </button>
                <!-- Left Extract Button -->
                <button 
                  v-if="activeTab.leftText" 
                  class="action-btn outline icon-only" 
                  @click.stop="handleExtractLeft" 
                  data-tooltip-bottom="提取 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Wand2 class="btn-icon" />
                </button>
                <!-- Left Format Button -->
                <button 
                  v-if="activeTab.leftText" 
                  class="action-btn outline icon-only" 
                  @click.stop="handleFormatLeft" 
                  data-tooltip-bottom="格式化 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Braces class="btn-icon" />
                </button>
                <button 
                  v-if="activeTab.leftText" 
                  class="action-btn outline icon-only" 
                  @click.stop="copyLeftText" 
                  data-tooltip-bottom="复制左侧 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Check v-if="copySuccessLeft" class="btn-icon success-color" />
                  <Copy v-else class="btn-icon" />
                </button>
                <button 
                  v-if="activeTab.leftText" 
                  class="action-btn danger icon-only" 
                  @click.stop="clearLeft" 
                  data-tooltip-bottom="清空左侧 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Trash2 class="btn-icon" />
                </button>
              </div>
            </div>

            <!-- Edit Mode -->
            <div v-if="leftEditing" class="edit-pane-container">
              <div v-show="showLineNumbers" class="edit-gutter" ref="leftGutterRef" @wheel.prevent="handleLeftGutterWheel">
                <div class="edit-gutter-inner" ref="leftGutterInnerRef">
                  <div v-for="n in leftLinesCount" :key="n" class="edit-line-number" :class="{ 'has-error': activeTab.leftErrorLine === n, 'diff-removed-line-number': leftLineClasses[n - 1] === 'diff-removed-line', 'diff-modified-line-number': leftLineClasses[n - 1] === 'diff-modified-line' }">{{ n }}</div>
                </div>
              </div>
              <div class="textarea-overlay-container" :class="{ 'minify-wrap': isLeftMinified }">
                <div
                  ref="leftHighlightRef"
                  class="editor-highlight"
                  aria-hidden="true"
                  v-html="highlightedLeft || (leftFocused ? '' : '<div class=\'editor-line placeholder\'>粘贴或输入左侧 JSON...</div>')"
                ></div>
                <textarea 
                  v-model="activeTab.leftText" 
                  class="edit-textarea" 
                  ref="leftTextareaRef"
                  @scroll="handleLeftTextareaScroll"
                  @mouseenter="activeScrollTarget = 'left'"
                  @touchstart="activeScrollTarget = 'left'"
                  @focus="leftFocused = true; handleFocus(true)"
                  @blur="handleLeftBlur"
                  @paste="handlePasteLeft"
                  @keydown.esc.prevent="toggleDiffMode(true)"
                  @keydown.enter.ctrl.prevent="toggleDiffMode(true)"
                  @keydown.enter.meta.prevent="toggleDiffMode(true)"
                  placeholder=""
                  spellcheck="false"
                ></textarea>
                
                <!-- Floating Scroll Buttons -->
                <div v-if="activeTab.leftText" class="textarea-scroll-controls">
                  <button class="scroll-control-btn" @click.stop="scrollLeftToTop" data-tooltip-left="回到顶部">
                    <ChevronUp class="scroll-control-icon" />
                  </button>
                  <button class="scroll-control-btn" @click.stop="scrollLeftToBottom" data-tooltip-left="回到底部">
                    <ChevronDown class="scroll-control-icon" />
                  </button>
                </div>
              </div>
            </div>

            <!-- View / Diff Mode -->
            <div 
              v-else 
              class="panel-body scroll-container clickable-pane" 
              ref="leftPaneRef" 
              tabindex="0"
              @scroll="handleLeftScroll"
              @mouseenter="activeScrollTarget = 'left'"
              @touchstart="activeScrollTarget = 'left'"
              @dblclick="startEditingLeft"
              @paste="handleDiffPanePaste($event, true)"
            >
              <!-- Empty state -->
              <div v-if="!activeTab.leftText" class="empty-placeholder" @click="startEditingLeft">
                <div class="placeholder-content">
                  <FileJson class="placeholder-icon" />
                  <span>点击此处输入/粘贴左侧 JSON</span>
                </div>
              </div>

              <!-- Lines wrapper -->
              <div v-else class="diff-lines-wrapper" :class="{ 'minify-wrap': isLeftMinified }">
                <div 
                  v-for="(row, idx) in alignedDiff" 
                  :key="'l-' + idx" 
                  class="diff-line-row" 
                  :class="row.left.type"
                  @dblclick.stop="startEditingLeftRow($event, row.left.lineNum, idx)"
                >
                  <div class="line-number">
                    <span v-if="row.left.type === 'removed'" class="line-marker-inline">-</span>
                    <span v-else-if="row.left.type === 'modified'" class="line-marker-inline">~</span>
                    <span class="line-num-val">{{ row.left.lineNum }}</span>
                  </div>
                  <div class="line-code">
                    <template v-if="row.left.type === 'empty'">
                      &nbsp;
                    </template>
                    <template v-else-if="row.left.html">
                      <span v-html="row.left.html"></span>
                    </template>
                    <template v-else>
                      <span v-html="applyJsonHighlight(row.left.text)"></span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error Banner -->
            <div 
              v-if="activeTab.leftError" 
              class="input-error-banner clickable-error-banner"
              @click="scrollToLeftErrorLine"
              :title="activeTab.leftErrorLine ? `点击定位到错误所在行 (第 ${activeTab.leftErrorLine} 行)` : '点击定位错误'"
            >
              <AlertTriangle class="banner-icon" />
              <span>{{ activeTab.leftError }} {{ activeTab.leftErrorLine ? `(第 ${activeTab.leftErrorLine} 行)` : '' }}</span>
              <span v-if="activeTab.leftErrorLine" class="error-banner-hint">点击定位</span>
            </div>
          </div>

          <!-- Right Pane (Modified) -->
          <div
            class="diff-pane"
            :class="{ 'editing-pane': rightEditing }"
          >
            <div class="panel-header">
              <div class="panel-title">
                <FileJson class="panel-icon" />
                <span>对比 JSON</span>
              </div>
              <div class="header-actions-group" style="margin-left: auto; display: flex; gap: 6px; align-items: center;">
                <button 
                  class="action-btn outline icon-only" 
                  @click.stop="toggleRightEdit" 
                  :data-tooltip-bottom="rightEditing ? '查看对齐对比' : '编辑右侧 JSON'"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Eye v-if="rightEditing" class="btn-icon" />
                  <Pencil v-else class="btn-icon" />
                </button>
                <button 
                  class="action-btn outline icon-only" 
                  @click.stop="swapInputs" 
                  data-tooltip-bottom="交换两侧 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <ArrowRightLeft class="btn-icon" />
                </button>
                <!-- Right Extract Button -->
                <button 
                  v-if="activeTab.rightText" 
                  class="action-btn outline icon-only" 
                  @click.stop="handleExtractRight" 
                  data-tooltip-bottom="提取 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Wand2 class="btn-icon" />
                </button>
                <!-- Right Format Button -->
                <button 
                  v-if="activeTab.rightText" 
                  class="action-btn outline icon-only" 
                  @click.stop="handleFormatRight" 
                  data-tooltip-bottom="格式化 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Braces class="btn-icon" />
                </button>
                <button 
                  v-if="activeTab.rightText" 
                  class="action-btn outline icon-only" 
                  @click.stop="copyRightText" 
                  data-tooltip-bottom="复制右侧 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Check v-if="copySuccessRight" class="btn-icon success-color" />
                  <Copy v-else class="btn-icon" />
                </button>
                <button
                  v-if="activeTab.rightText"
                  class="action-btn danger icon-only"
                  @click.stop="clearRight"
                  data-tooltip-bottom-right="清空右侧 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <Trash2 class="btn-icon" />
                </button>
              </div>
            </div>

            <!-- Edit Mode -->
            <div v-if="rightEditing" class="edit-pane-container">
              <div v-show="showLineNumbers" class="edit-gutter" ref="rightGutterRef" @wheel.prevent="handleRightGutterWheel">
                <div class="edit-gutter-inner" ref="rightGutterInnerRef">
                  <div v-for="n in rightLinesCount" :key="n" class="edit-line-number" :class="{ 'has-error': activeTab.rightErrorLine === n, 'diff-added-line-number': rightLineClasses[n - 1] === 'diff-added-line', 'diff-modified-line-number': rightLineClasses[n - 1] === 'diff-modified-line' }">{{ n }}</div>
                </div>
              </div>
              <div class="textarea-overlay-container" :class="{ 'minify-wrap': isRightMinified }">
                <div
                  ref="rightHighlightRef"
                  class="editor-highlight"
                  aria-hidden="true"
                  v-html="highlightedRight || (rightFocused ? '' : '<div class=\'editor-line placeholder\'>粘贴或输入右侧 JSON...</div>')"
                ></div>
                <textarea 
                  v-model="activeTab.rightText" 
                  class="edit-textarea" 
                  ref="rightTextareaRef"
                  @scroll="handleRightTextareaScroll"
                  @mouseenter="activeScrollTarget = 'right'"
                  @touchstart="activeScrollTarget = 'right'"
                  @focus="rightFocused = true; handleFocus(false)"
                  @blur="handleRightBlur"
                  @paste="handlePasteRight"
                  @keydown.esc.prevent="toggleDiffMode(true)"
                  @keydown.enter.ctrl.prevent="toggleDiffMode(true)"
                  @keydown.enter.meta.prevent="toggleDiffMode(true)"
                  placeholder=""
                  spellcheck="false"
                ></textarea>
                
                <!-- Floating Scroll Buttons -->
                <div v-if="activeTab.rightText" class="textarea-scroll-controls">
                  <button class="scroll-control-btn" @click.stop="scrollRightToTop" data-tooltip-left="回到顶部">
                    <ChevronUp class="scroll-control-icon" />
                  </button>
                  <button class="scroll-control-btn" @click.stop="scrollRightToBottom" data-tooltip-left="回到底部">
                    <ChevronDown class="scroll-control-icon" />
                  </button>
                </div>
              </div>
            </div>

            <!-- View / Diff Mode -->
            <div 
              v-else 
              class="panel-body scroll-container clickable-pane" 
              ref="rightPaneRef" 
              tabindex="0"
              @scroll="handleRightScroll"
              @mouseenter="activeScrollTarget = 'right'"
              @touchstart="activeScrollTarget = 'right'"
              @dblclick="startEditingRight"
              @paste="handleDiffPanePaste($event, false)"
            >
              <!-- Empty state -->
              <div v-if="!activeTab.rightText" class="empty-placeholder" @click="startEditingRight">
                <div class="placeholder-content">
                  <FileJson class="placeholder-icon" />
                  <span>点击此处输入/粘贴右侧 JSON</span>
                </div>
              </div>

              <!-- Lines wrapper -->
              <div v-else class="diff-lines-wrapper" :class="{ 'minify-wrap': isRightMinified }">
                <div 
                  v-for="(row, idx) in alignedDiff" 
                  :key="'r-' + idx" 
                  class="diff-line-row" 
                  :class="row.right.type"
                  @dblclick.stop="startEditingRightRow($event, row.right.lineNum, idx)"
                >
                  <div class="line-number">
                    <span v-if="row.right.type === 'added'" class="line-marker-inline">+</span>
                    <span v-else-if="row.right.type === 'modified'" class="line-marker-inline">~</span>
                    <span class="line-num-val">{{ row.right.lineNum }}</span>
                  </div>
                  <div class="line-code">
                    <template v-if="row.right.type === 'empty'">
                      &nbsp;
                    </template>
                    <template v-else-if="row.right.html">
                      <span v-html="row.right.html"></span>
                    </template>
                    <template v-else>
                      <span v-html="applyJsonHighlight(row.right.text)"></span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error Banner -->
            <div 
              v-if="activeTab.rightError" 
              class="input-error-banner clickable-error-banner"
              @click="scrollToRightErrorLine"
              :title="activeTab.rightErrorLine ? `点击定位到错误所在行 (第 ${activeTab.rightErrorLine} 行)` : '点击定位错误'"
            >
              <AlertTriangle class="banner-icon" />
              <span>{{ activeTab.rightError }} {{ activeTab.rightErrorLine ? `(第 ${activeTab.rightErrorLine} 行)` : '' }}</span>
              <span v-if="activeTab.rightErrorLine" class="error-banner-hint">点击定位</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Bottom Stats Bar -->
    <div class="comparer-status-bar">
      <div class="diff-stats">
        <span class="stat-badge addition">
          <Plus class="stat-icon" /> {{ stats.additions }} 增加
        </span>
        <span class="stat-badge deletion">
          <Minus class="stat-icon" /> {{ stats.deletions }} 删除
        </span>
        <span class="stat-badge modification">
          <RefreshCw class="stat-icon" /> {{ stats.modifications }} 修改
        </span>
      </div>

      <div class="comparer-mode-switch">
        <button 
          class="mode-toggle-btn" 
          :class="{ active: !leftEditing && !rightEditing }" 
          @click="toggleDiffMode(true)"
          data-tooltip-top="对齐对比视图（带空行对齐与词级高亮）"
        >
          <Columns2 class="mode-btn-icon" />
          <span>对齐对比</span>
        </button>
        <button 
          class="mode-toggle-btn" 
          :class="{ active: leftEditing || rightEditing }" 
          @click="toggleDiffMode(false)"
          data-tooltip-top="分栏编辑模式（直接编辑左右两侧 JSON）"
        >
          <Pencil class="mode-btn-icon" />
          <span>分栏编辑</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.success-color {
  color: var(--success-text) !important;
}

.comparer-container {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 0;
  gap: 0;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* Bottom Stats Bar */
.comparer-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-panel);
  border-top: 1px solid var(--border-color);
  padding: 0 16px;
  height: 28px;
  flex-shrink: 0;
  position: relative;
}

.diff-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1;
}

.comparer-status-bar .stat-badge {
  font-size: 11px;
  padding: 1px 6px;
}

.comparer-mode-switch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 2;
}

.mode-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-color);
  background-color: var(--bg-panel);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-toggle-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
  background-color: var(--bg-hover);
}

.mode-toggle-btn.active {
  color: var(--primary-color, #2563eb);
  border-color: var(--primary-color, #2563eb);
  background-color: rgba(37, 99, 235, 0.08);
  font-weight: 600;
}

:global(.dark-mode) .mode-toggle-btn.active {
  color: #38bdf8;
  border-color: #38bdf8;
  background-color: rgba(56, 189, 248, 0.12);
}

.mode-btn-icon {
  width: 12px;
  height: 12px;
}

.settings-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.divider {
  width: 1px;
  height: 20px;
  background-color: var(--border-color);
}

/* Segmented Control */
.segmented-control {
  display: flex;
  background-color: hsl(210 40% 96.1%);
  padding: 2px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  height: 24px;
  align-items: stretch;
}

.segment-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-sans);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.segment-btn:hover {
  color: var(--text-primary);
}

.segment-btn.active {
  background-color: var(--bg-panel);
  color: var(--primary-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* Diff Stats badges */
.diff-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
}

.stat-icon {
  width: 12px;
  height: 12px;
}

.stat-badge.addition {
  background-color: rgba(34, 197, 94, 0.1);
  color: var(--success-text);
}

.stat-badge.deletion {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--error-text);
}

.stat-badge.modification {
  background-color: rgba(234, 179, 8, 0.1);
  color: #d97706;
}

.dark-mode .stat-badge.modification {
  color: #fbbf24;
}

/* Styled checkbox */
.styled-checkbox {
  display: flex;
  align-items: center;
  position: relative;
  padding-left: 20px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans);
  color: var(--text-secondary);
  user-select: none;
}

.styled-checkbox input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  height: 14px;
  width: 14px;
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.styled-checkbox:hover input ~ .checkmark {
  border-color: var(--border-color-active);
}

.styled-checkbox input:checked ~ .checkmark {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

.checkmark:after {
  content: "";
  position: absolute;
  display: none;
}

.styled-checkbox input:checked ~ .checkmark:after {
  display: block;
}

.styled-checkbox .checkmark:after {
  left: 4px;
  top: 1px;
  width: 3px;
  height: 7px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  background-color: var(--action-btn-bg);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans);
  border-radius: 6px;
  cursor: pointer;
  height: 28px;
  min-width: fit-content;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transform: scale(1);
  transition: transform 0.1s ease, background-color 0.15s ease, color 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background-color: var(--bg-app);
  color: var(--text-primary);
}

.action-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.action-btn:disabled {
  pointer-events: none;
  opacity: 0.5;
}

.action-btn.outline {
  background-color: var(--action-btn-bg);
  color: var(--text-primary);
}

.action-btn.outline:hover:not(:disabled) {
  background-color: var(--bg-app);
}

.action-btn.icon-only {
  padding: 0 !important;
  width: 28px !important;
  height: 28px !important;
  justify-content: center;
  box-sizing: border-box !important;
}

.action-btn.danger {
  color: var(--text-primary);
}

.action-btn.danger:hover:not(:disabled) {
  background-color: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.btn-icon-s {
  width: clamp(12px, 1.3vw, 17px);
  height: clamp(12px, 1.3vw, 17px);
}

/* Workspace Area */
.workspace-body.vertical-layout {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  flex-grow: 1;
  min-height: 0;
}

/* Options Bar - Instruction Badge */
.instruction-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  background-color: var(--primary-light);
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: var(--font-sans);
}

.badge-icon {
  width: 12px;
  height: 12px;
}

.diff-grid-wrapper {
  flex-grow: 1;
  min-height: 0;
  display: flex;
}

.diff-grid-wrapper.full-height {
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  height: clamp(40px, 4vw, 44px) !important;
  min-height: clamp(40px, 4vw, 44px) !important;
  max-height: clamp(40px, 4vw, 44px) !important;
  padding: 0 1rem !important;
  border-bottom: 1px solid var(--border-color) !important;
  background-color: var(--bg-panel);
  user-select: none;
  box-sizing: border-box !important;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  overflow: visible;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.panel-icon {
  width: 13px;
  height: 13px;
  color: var(--text-muted);
}

.panel-body {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-input);
  position: relative;
  overflow: hidden;
}

.clickable-pane {
  cursor: text;
  transition: background-color 0.15s ease;
}

.clickable-pane:hover {
  background-color: rgba(255, 255, 255, 0.01);
}

.dark-mode .clickable-pane:hover {
  background-color: rgba(255, 255, 255, 0.005);
}

/* Empty Placeholder Styling */
.empty-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 250px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.empty-placeholder:hover {
  background-color: rgba(0, 0, 0, 0.01);
  color: var(--text-secondary);
}

.dark-mode .empty-placeholder:hover {
  background-color: rgba(255, 255, 255, 0.01);
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.placeholder-icon {
  width: 36px;
  height: 36px;
  stroke-width: 1.5;
}

/* In-place Editing Pane Styling */
.editing-pane {
  background-color: var(--bg-input) !important;
}

.edit-pane-container {
  display: flex;
  flex-grow: 1;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.edit-gutter {
  min-width: 42px;
  width: auto;
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 100%;
}

.edit-gutter-inner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 8px 0 24px 0;
  box-sizing: border-box;
  will-change: transform;
}

.edit-line-number {
  display: block;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: var(--editor-line-height, 20px);
  text-align: right;
  padding-right: 6px;
  color: var(--text-muted);
  height: var(--editor-line-height, 20px);
  box-sizing: border-box;
  flex-shrink: 0;
}

.edit-line-number.has-error {
  color: var(--error-text);
  background-color: var(--error-bg);
  font-weight: bold;
}

.edit-textarea {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 8px 12px 24px 12px;
  font-family: var(--font-mono);
  font-size: var(--editor-font-size, 12px);
  line-height: var(--editor-line-height, 20px);
  white-space: pre;
  word-break: normal;
  overflow-x: auto;
  overflow-y: auto;
  box-sizing: border-box;
  background-color: transparent !important;
  color: transparent !important;
  caret-color: var(--text-primary);
  border: none;
  outline: none;
  resize: none;
  text-align: left;
}

.input-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background-color: var(--error-bg);
  border-top: 1px solid rgba(239, 68, 68, 0.15);
  color: var(--error-text);
  font-size: 12px;
  font-weight: 500;
}

.clickable-error-banner {
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.clickable-error-banner:hover {
  background-color: rgba(239, 68, 68, 0.16);
}
.clickable-error-banner:hover span {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.error-banner-hint {
  margin-left: auto;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  background-color: rgba(239, 68, 68, 0.12);
  color: var(--error-text);
  border: 1px solid rgba(239, 68, 68, 0.25);
  flex-shrink: 0;
  line-height: 1.2;
}
.clickable-error-banner:hover .error-banner-hint {
  background-color: var(--error-text);
  color: #fff;
  border-color: var(--error-text);
  text-decoration: none !important;
}

.banner-icon {
  width: 14px;
  height: 14px;
}

/* Diff Grid Mode styling */
.diff-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  background-color: var(--border-color);
  border-top: 1px solid var(--border-color);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.diff-pane {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-panel);
  min-height: 0;
  min-width: 0;
}

.diff-pane:first-child {
  border-right: 1px solid var(--border-color);
}

.scroll-container {
  overflow: auto;
  flex-grow: 1;
  background-color: var(--bg-input);
}
.scroll-container:focus {
  outline: none;
}

.diff-lines-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 0 24px 0;
  box-sizing: border-box;
}

/* Aligned Diff line row styling - 100% pixel-perfect match with editor mode */
.diff-line-row {
  display: flex;
  font-family: var(--font-mono);
  font-size: var(--editor-font-size, 12px);
  line-height: var(--editor-line-height, 20px);
  min-height: var(--editor-line-height, 20px);
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

.diff-line-row .line-number {
  min-width: 42px;
  width: 42px;
  text-align: right;
  padding-right: 6px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: var(--editor-line-height, 20px);
  user-select: none;
  border-right: 1px solid var(--border-color);
  background-color: var(--bg-panel);
  flex-shrink: 0;
  box-sizing: border-box;
  position: relative;
  height: auto;
  min-height: var(--editor-line-height, 20px);
}

.line-marker-inline {
  position: absolute;
  left: 3px;
  top: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: var(--editor-line-height, 20px);
  user-select: none;
}

.diff-line-row .line-code {
  flex-grow: 1;
  white-space: pre;
  padding: 0 12px 0 12px;
  font-family: var(--font-mono);
  font-size: var(--editor-font-size, 12px);
  line-height: var(--editor-line-height, 20px);
  box-sizing: border-box;
  min-width: 0;
}

/* Diff Types Styling */
.diff-line-row.added {
  background-color: var(--diff-added-bg);
}
.diff-line-row.added .line-number {
  background-color: rgba(34, 197, 94, 0.08);
  color: var(--success-text);
  font-weight: 600;
}
.diff-line-row.added .line-marker-inline {
  color: var(--success-text);
}

.diff-line-row.removed {
  background-color: var(--diff-removed-bg);
}
.diff-line-row.removed .line-number {
  background-color: rgba(239, 68, 68, 0.08);
  color: var(--error-text);
  font-weight: 600;
}
.diff-line-row.removed .line-marker-inline {
  color: var(--error-text);
}

/* Split Diff - Modified rows use unified warm amber background on both left and right panes */
.diff-line-row.modified {
  background-color: var(--diff-modified-bg);
}
.diff-line-row.modified .line-number {
  background-color: rgba(234, 179, 8, 0.10);
  color: #d97706;
  font-weight: 600;
}
.diff-line-row.modified .line-marker-inline {
  color: #d97706;
}

:global(.dark-mode) .diff-line-row.modified .line-number,
.dark-mode .diff-line-row.modified .line-number {
  background-color: rgba(234, 179, 8, 0.14);
  color: #fbbf24;
}
:global(.dark-mode) .diff-line-row.modified .line-marker-inline,
.dark-mode .diff-line-row.modified .line-marker-inline {
  color: #fbbf24;
}

/* Empty spacer line - Crisp stripe pattern */
.diff-line-row.empty {
  background: repeating-linear-gradient(
    -45deg,
    rgba(148, 163, 184, 0.15),
    rgba(148, 163, 184, 0.15) 6px,
    transparent 6px,
    transparent 12px
  );
  background-color: rgba(241, 245, 249, 0.6);
  min-height: var(--editor-line-height, 20px);
  height: var(--editor-line-height, 20px);
  user-select: none;
  box-sizing: border-box;
}
:global(.dark-mode) .diff-line-row.empty,
.dark-mode .diff-line-row.empty {
  background: repeating-linear-gradient(
    -45deg,
    rgba(255, 255, 255, 0.04),
    rgba(255, 255, 255, 0.04) 6px,
    transparent 6px,
    transparent 12px
  );
  background-color: rgba(0, 0, 0, 0.22);
}
.diff-line-row.empty .line-number {
  border-right: 1px solid var(--border-color);
  background-color: transparent;
}

/* Character level word highlighting (VSCode / GitHub standard inline diff - 0 width expansion) */
:deep(.word-added), .word-added {
  background-color: var(--diff-added-word-bg);
  color: var(--diff-added-word-text) !important;
  border: none !important;
  border-radius: 2px;
  padding: 0 !important;
  margin: 0 !important;
  font-weight: inherit !important;
  box-sizing: border-box;
  display: inline;
}

:deep(.word-removed), .word-removed {
  background-color: var(--diff-removed-word-bg);
  color: var(--diff-removed-word-text) !important;
  border: none !important;
  border-radius: 2px;
  padding: 0 !important;
  margin: 0 !important;
  font-weight: inherit !important;
  text-decoration: none !important;
  box-sizing: border-box;
  display: inline;
}

:global(.dark-mode) :deep(.word-added),
:global(.dark-mode) .word-added,
.dark-mode :deep(.word-added),
.dark-mode .word-added {
  box-shadow: none;
}

:global(.dark-mode) :deep(.word-removed),
:global(.dark-mode) .word-removed,
.dark-mode :deep(.word-removed),
.dark-mode .word-removed {
  box-shadow: none;
}

/* Real-time Diff Highlight in Editor Mode */
:deep(.editor-line.diff-removed-line) {
  background-color: var(--diff-removed-bg);
}
:deep(.editor-line.diff-added-line) {
  background-color: var(--diff-added-bg);
}
:deep(.editor-line.diff-modified-line) {
  background-color: var(--diff-modified-bg);
}

.edit-line-number.diff-removed-line-number {
  background-color: rgba(239, 68, 68, 0.08);
  color: var(--error-text);
  font-weight: 600;
}
.edit-line-number.diff-added-line-number {
  background-color: rgba(34, 197, 94, 0.08);
  color: var(--success-text);
  font-weight: 600;
}
.edit-line-number.diff-modified-line-number {
  background-color: rgba(234, 179, 8, 0.10);
  color: #d97706;
  font-weight: 600;
}
:global(.dark-mode) .edit-line-number.diff-modified-line-number,
.dark-mode .edit-line-number.diff-modified-line-number {
  background-color: rgba(234, 179, 8, 0.14);
  color: #fbbf24;
}

@media (max-width: 600px) {
  .edit-grid, .diff-grid {
    grid-template-columns: 1fr;
  }
  
  .diff-grid {
    gap: 16px;
    background-color: transparent;
    border: none;
    box-shadow: none;
  }
  
  .diff-pane {
    border: 1px solid var(--border-color);
    border-radius: 6px;
    height: 400px;
  }
  
  .comparer-container {
    padding: 12px;
  }
  
  .options-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .options-left {
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .options-right {
    flex-wrap: wrap;
    gap: 8px;
  }
}

/* 文本框悬浮滚动控制按钮 */
.textarea-scroll-controls {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
  pointer-events: auto;
}

.scroll-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--border-color, #cbd5e1);
  background-color: var(--bg-panel, #ffffff);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  opacity: 0.85;
  transition: all 0.2s ease;
}

:global(.dark-mode) .scroll-control-btn {
  border-color: rgba(255, 255, 255, 0.25) !important;
  background-color: #242429;
  color: #abb2bf;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  opacity: 0.9;
}

.scroll-control-btn:hover {
  opacity: 1;
  color: var(--primary-color);
  border-color: var(--primary-color) !important;
  background-color: var(--bg-panel);
  box-shadow: 0 0 0 2px var(--primary-light), 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

:global(.dark-mode) .scroll-control-btn:hover {
  color: #38bdf8;
  border-color: #38bdf8 !important;
  background-color: #2a2a30;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25), 0 4px 12px rgba(0, 0, 0, 0.4);
}

.scroll-control-btn:active {
  transform: translateY(0) scale(0.95);
}

.scroll-control-icon {
  width: 14px;
  height: 14px;
}
</style>
