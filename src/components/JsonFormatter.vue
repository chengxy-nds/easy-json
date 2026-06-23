<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, inject, provide, nextTick } from 'vue'
import { useTabsDrag } from '../composables/useTabsDrag'
import {
  Copy, Download, UploadCloud, Check, Trash2,
  AlertTriangle, Braces, Eye, FileJson, ArrowRightLeft, Shuffle,
  ChevronDown, ChevronRight, ChevronUp, HelpCircle, Minimize2, Code, Search, Plus, X,
  Network, Table2, Menu, FileCode, Maximize2, Strikethrough, ListTree
} from 'lucide-vue-next'
import JsonTreeNode   from './JsonTreeNode.vue'
import JsonGraphView  from './JsonGraphView.vue'
import JsonTableView  from './JsonTableView.vue'
import { extractJsonFromText, convertJsObjectToJson, safeParseJsLike, tryParseCandidate } from '../utils/jsonExtractor.js';
import { convertJson, formatLabels, getFormatExtension } from '../utils/jsonConverter.js';

const showToast = inject('showToast')

const indentSize = ref('2') // '2' | '4' | 'tab' | 'minify'
const sortKeys = inject('sortKeys', ref(false))
const autoFormat = inject('autoFormat', ref(false))
const autoCopy = inject('autoCopy', ref(false))
const autoExtract = inject('autoExtract', ref(true))
const autoPaste = inject('autoPaste', ref(false))

const copySuccess = ref(false)
const gutterRef = ref(null)
const textareaRef = ref(null)
const inputHighlightRef = ref(null)
const outputPreRef = ref(null)
const outputGutterRef = ref(null)
const hoveredPath = ref(null)
const searchQuery = ref('')
const searchExpanded = ref(false)
const searchInputRef = ref(null)
const replaceText = ref('')
const replaceExpanded = ref(false)
const replaceInputRef = ref(null)
const currentMatchIndex = ref(0)
const totalMatches = ref(0)
// ─── 转换状态 ───
const showConvertMenu = ref(false)
const copyConvertedSuccess = ref(false)
// convertFormat 是每个 tab 独立的转换状态（存储在 tab.convertFormat 上）
const convertFormat = computed({
  get: () => activeTab.value?.convertFormat || null,
  set: (val) => { if (activeTab.value) activeTab.value.convertFormat = val }
})
provide('searchQuery', searchQuery)

const expandSearch = () => {
  searchExpanded.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

const collapseSearch = () => {
  searchQuery.value = ''
  replaceText.value = ''
  searchExpanded.value = false
  replaceExpanded.value = false
  currentMatchIndex.value = 0
  totalMatches.value = 0
}

const toggleSearch = () => {
  if (searchExpanded.value) {
    collapseSearch()
  } else {
    expandSearch()
  }
}

const toggleReplace = () => {
  replaceExpanded.value = !replaceExpanded.value
  if (replaceExpanded.value) {
    nextTick(() => replaceInputRef.value?.focus())
  }
}

const goNextMatch = () => {
  if (totalMatches.value === 0) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % totalMatches.value
  scrollToCurrentMatch()
}

const goPrevMatch = () => {
  if (totalMatches.value === 0) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + totalMatches.value) % totalMatches.value
  scrollToCurrentMatch()
}

const scrollToCurrentMatch = () => {
  nextTick(() => {
    const el = outputPreRef.value?.querySelector('.search-match-current')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

const buildSearchRegex = () => {
  if (!searchQuery.value) return null
  const escaped = searchQuery.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  return new RegExp(escaped, 'gi')
}

const replaceCurrent = () => {
  const regex = buildSearchRegex()
  if (!regex) return
  const tab = activeTab.value
  const text = tab.inputText
  const matches = [...text.matchAll(new RegExp(regex.source, 'gi'))]
  if (matches.length === 0) return

  const idx = currentMatchIndex.value % matches.length
  const m = matches[idx]
  tab.inputText = text.substring(0, m.index) + replaceText.value + text.substring(m.index + m[0].length)
  if (currentMatchIndex.value >= matches.length - 1) {
    currentMatchIndex.value = 0
  }
}

const replaceAllMatches = () => {
  const regex = buildSearchRegex()
  if (!regex) return
  const tab = activeTab.value
  const matches = tab.inputText.match(regex)
  if (!matches || matches.length === 0) return
  const count = matches.length
  tab.inputText = tab.inputText.replace(regex, replaceText.value)
  currentMatchIndex.value = 0
  showToast(`已替换 ${count} 处`)
}

const handleSearchKeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) goPrevMatch()
    else goNextMatch()
  }
}

const handleReplaceKeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    replaceCurrent()
  }
}

watch(searchQuery, () => {
  currentMatchIndex.value = 0
})

const setHoveredPath = (path) => {
  hoveredPath.value = path
}

const DEMO_JSON = `{
  "name": "easyJSON",
  "version": "1.0.0",
  "description": "简洁大气且无 AI 味道的专业级 JSON 格式化、校验与对比工具",
  "repository": {
    "type": "git",
    "url": "https://github.com/xiaofucode/easy-json"
  },
  "features": [
    "实时 JSON 校验，支持行数错误高亮",
    "多种缩进格式化（2空格、4空格、制表符、压缩）",
    "属性键自动按字母排序（Sort Keys）",
    "交互式折叠树形视图（Collapsible Tree View）",
    "左右分栏同步滚动，字符级字段差异对比",
    "暗黑/亮色主题适配"
  ],
  "performance": {
    "parsingSpeed": "extremely fast",
    "uiFeel": "premium & smooth"
  },
  "author": {
    "name": "Antigravity",
    "role": "AI Engineer",
    "active": true
  }
}`

// Formatter Multi-Tabs State
const tabs = ref([
  {
    id: 1,
    title: '格式化 1',
    inputText: DEMO_JSON,
    outputText: '',
    parsedObj: null,
    validationError: null,
    errorLine: null,
    duplicateLines: [],
    viewMode: 'text',
    convertFormat: null,
    extractedFormat: null
  }
])
const activeTabId = ref(1)
const { tabsListRef, tabsOverflow, onMouseDown: onTabsMouseDown, onWheel: onTabsWheel, scrollToEnd: scrollTabsToEnd, scrollToActive: scrollTabsToActive, checkOverflow: checkTabsOverflow } = useTabsDrag(activeTabId)

const activeTab = computed(() => {
  return tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]
})

const activeIndex = computed(() => {
  switch (activeTab.value?.viewMode) {
    case 'text': return 0
    case 'tree': return 1
    case 'graph': return 2
    case 'table': return 3
    default: return 0
  }
})

const segmentedRef = ref(null)
const indicatorStyle = ref({})

const updateIndicator = () => {
  nextTick(() => {
    if (!segmentedRef.value) return
    const btns = segmentedRef.value.querySelectorAll('.segment-btn')
    const btn = btns[activeIndex.value]
    if (!btn) return
    indicatorStyle.value = {
      left: btn.offsetLeft + 'px',
      width: btn.offsetWidth + 'px'
    }
  })
}

watch(activeIndex, updateIndicator)
onMounted(updateIndicator)

let nextTabId = 2

const nextDisplayNumber = () => {
  const used = new Set(tabs.value.map(t => {
    const m = t.title.match(/^格式化 (\d+)$/)
    return m ? parseInt(m[1]) : 0
  }))
  let n = 1
  while (used.has(n)) n++
  return n
}

const addTab = () => {
  const newId = nextTabId++
  const num = nextDisplayNumber()
  tabs.value.push({
    id: newId,
    title: `格式化 ${num}`,
    inputText: '',
    outputText: '',
    parsedObj: null,
    validationError: null,
    errorLine: null,
    duplicateLines: [],
    viewMode: 'text',
    convertFormat: null,
    extractedFormat: null
  })
  activeTabId.value = newId
  scrollTabsToEnd()
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

let canSave = false
const saveFormatterState = () => {
  if (!canSave) return
  try {
    const snapshot = tabs.value.map(t => ({
      id: t.id,
      title: t.title,
      inputText: t.inputText,
      viewMode: t.viewMode
    }))
    localStorage.setItem('ej_fmt_tabs', JSON.stringify(snapshot))
    localStorage.setItem('ej_fmt_active', String(activeTabId.value))
  } catch (e) {}
}

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
  saveFormatterState()
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
  saveFormatterState()
  nextTick(checkTabsOverflow)
}

const closeRightTabs = () => {
  const idx = tabs.value.findIndex(t => t.id === tabContextMenu.value.tabId)
  if (idx === -1 || idx >= tabs.value.length - 1) return
  const removed = tabs.value.splice(idx + 1)
  if (removed.some(t => t.id === activeTabId.value)) {
    activeTabId.value = tabs.value[tabs.value.length - 1].id
  }
  saveFormatterState()
  nextTick(checkTabsOverflow)
}

const closeAllTabs = () => {
  tabs.value = [{
    id: tabs.value[0].id,
    title: '格式化 1',
    inputText: getFormattedJsonString(DEMO_JSON),
    outputText: '',
    parsedObj: null,
    validationError: null,
    errorLine: null,
    duplicateLines: [],
    viewMode: 'text',
    convertFormat: null,
    extractedFormat: null
  }]
  activeTabId.value = tabs.value[0].id
  saveFormatterState()
  nextTick(checkTabsOverflow)
}


// 从 JSON.parse 错误中提取行列号（兼容 Chrome/V8 和 Firefox）
// 并自动修正"缺逗号导致报错偏移一行"的常见误报
const getErrorLineAndColumn = (error, text) => {
  const msg = error.message

  // Firefox 格式: "line X column Y"
  const lc = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  let line = null, col = null
  if (lc) {
    line = parseInt(lc[1])
    col  = parseInt(lc[2])
  }

  // Chrome/V8 格式: "position X"（X 是 0-based 字符索引）
  const pm = msg.match(/position\s+(\d+)/i)
  if (!line && pm) {
    const pos = parseInt(pm[1])
    line = 1; col = 1
    for (let i = 0; i < pos && i < text.length; i++) {
      if (text[i] === '\n') { line++; col = 1 }
      else { col++ }
    }
  }

  if (!line) return { line: null, column: null }

  // ── 启发式修正：报错行是 key 但上一行缺逗号 ──
  const lines = text.split('\n')
  const errLine = (lines[line - 1] || '').trim()
  if (line > 1 && /^".*"\s*:/.test(errLine)) {
    const prev = (lines[line - 2] || '').trim()
    // 上一行以 value 结尾但没有逗号 → 真正的错误在上一行
    if (/[}\d\]"'\w]\s*$/.test(prev) && !/,\s*$/.test(prev)) {
      line = line - 1
    }
  }

  return { line, column: col }
}

// Recursively sort object keys alphabetically
const sortJSONKeys = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortJSONKeys);
  }
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortJSONKeys(obj[key]);
  }
  return sortedObj;
}

// Check if input is a valid escaped JSON string (or JS object)
const checkEscapedJson = (text) => {
  let current = text.trim()
  if (!current) return null
  
  // If it's already valid standard JSON or JS object, it's NOT escaped JSON
  try {
    const parsed = JSON.parse(current)
    if (parsed !== null && typeof parsed === 'object') {
      return null
    }
  } catch (e) {
    try {
      const jsonStr = convertJsObjectToJson(current)
      const parsed = JSON.parse(jsonStr)
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
        unescaped = JSON.parse(unescaped)
      } catch (e) {
        // fallback
      }
    }
    
    unescaped = unescaped.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    
    try {
      let obj
      try {
        obj = JSON.parse(unescaped)
      } catch (e) {
        const jsonStr = convertJsObjectToJson(unescaped)
        obj = JSON.parse(jsonStr)
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

// 检测 JSON 文本中的重复 key（同一对象层级内）
const detectDuplicateKeys = (text) => {
  const dups = [] // { key, firstLine, dupLine }
  const scopeStack = [] // Map<key, lineNum> for each object scope
  let inStr = false, escape = false
  let lineNum = 1, keyStart = -1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') lineNum++

    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"' && !escape) {
      if (!inStr) { inStr = true; keyStart = i }
      else {
        inStr = false
        // 检查后面是否跟 ':'（说明这是一个 key）
        let j = i + 1
        while (j < text.length && /\s/.test(text[j])) j++
        if (text[j] === ':' && scopeStack.length > 0) {
          const key = text.substring(keyStart + 1, i)
          const scope = scopeStack[scopeStack.length - 1]
          if (scope.has(key)) {
            dups.push({ key, firstLine: scope.get(key), dupLine: lineNum })
          } else {
            scope.set(key, lineNum)
          }
        }
      }
      continue
    }
    if (inStr) continue
    if (ch === '{') scopeStack.push(new Map())
    else if (ch === '}') scopeStack.pop()
  }
  return dups
}

// Perform formatting and validation
let formatGuard = false // prevents re-entry when formatJSON updates inputText
const formatJSON = () => {
  if (formatGuard) return
  const tab = activeTab.value
  if (!tab.inputText.trim()) {
    tab.outputText = ''
    tab.parsedObj = null
    tab.validationError = null
    tab.errorLine = null
    tab.duplicateLines = []
    tab.extractedFormat = null
    return
  }

  // 检测重复 key
  const dups = detectDuplicateKeys(tab.inputText)
  tab.duplicateLines = dups.map(d => d.dupLine)
  if (dups.length > 0) {
    showToast(`检测到 ${dups.length} 个重复 key: ${dups.map(d => `"${d.key}"`).join(', ')}`, 'error')
  }

  try {
    let obj = JSON.parse(tab.inputText)
    tab.validationError = null
    tab.errorLine = null
    tab.extractedFormat = null
    tab.parsedObj = obj

    if (sortKeys.value) {
      obj = sortJSONKeys(obj)
    }

    if (indentSize.value === 'minify') {
      tab.outputText = JSON.stringify(obj)
    } else {
      const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value)
      tab.outputText = JSON.stringify(obj, null, space)
    }
  } catch (err) {
    const escapedCheck = checkEscapedJson(tab.inputText)
    if (escapedCheck) {
      tab.validationError = null
      tab.errorLine = null
      tab.extractedFormat = null
      let obj = escapedCheck.parsedObj
      tab.parsedObj = obj

      if (sortKeys.value) {
        obj = sortJSONKeys(obj)
      }

      if (indentSize.value === 'minify') {
        tab.outputText = JSON.stringify(obj)
      } else {
        const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value)
        tab.outputText = JSON.stringify(obj, null, space)
      }
    } else {
      // 智能提取：尝试从非 JSON 格式中提取
      let extracted = false
      try {
        const result = extractJsonFromText(tab.inputText)
        if (result) {
          let obj = JSON.parse(result.json)
          tab.validationError = null
          tab.errorLine = null
          tab.extractedFormat = result.format !== 'JSON' ? result.format : null
          tab.parsedObj = obj

          if (sortKeys.value) {
            obj = sortJSONKeys(obj)
          }

          if (indentSize.value === 'minify') {
            tab.outputText = JSON.stringify(obj)
          } else {
            const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value)
            tab.outputText = JSON.stringify(obj, null, space)
          }
          extracted = true
        }
      } catch (e2) {}

      if (!extracted) {
        tab.parsedObj = null
        tab.outputText = ''
        tab.extractedFormat = null
        tab.validationError = err.message

        const { line } = getErrorLineAndColumn(err, tab.inputText)
        tab.errorLine = line
      }
    }
  }

  // 自动格式化：将格式化结果回填到输入面板
  // 但如果用户正在编辑（textarea 聚焦时），不替换，避免光标跳到末尾
  if (autoFormat.value && tab.outputText && tab.inputText !== tab.outputText
    && document.activeElement !== textareaRef.value) {
    formatGuard = true
    tab.inputText = tab.outputText
    formatGuard = false
  }
}

// Watch inputs and format; save only input-derived fields (NOT tabs deeply — avoids infinite loop
// because formatJSON() mutates tab.outputText/parsedObj which are inside tabs)
watch(
  [() => activeTab.value?.inputText, indentSize, sortKeys, activeTabId],
  () => {
    formatJSON()
    saveFormatterState()
  }
)

// 粘贴时立即尝试智能提取（需开启自动提取）
const handlePaste = () => {
  if (!autoExtract.value) return
  // setTimeout 确保 v-model 已更新（比 nextTick 更可靠）
  setTimeout(() => {
    const tab = activeTab.value
    const text = textareaRef.value?.value || tab.inputText
    if (!text.trim()) return
    // 如果已经是有效 JSON 则跳过提取
    try { JSON.parse(text); return } catch (e) {}
    try {
      const result = extractJsonFromText(text)
      if (result && result.json !== text) {
        tab.inputText = result.json
        tab.validationError = null
        tab.errorLine = null
        showToast(result.format !== 'JSON' ? `已从 ${result.format} 提取 JSON` : '已自动提取 JSON')
        if (autoFormat.value) {
          try {
            const obj = JSON.parse(result.json)
            const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
            tab.inputText = JSON.stringify(obj, null, space)
          } catch (e2) {}
        }
      }
    } catch (e2) {}
  }, 50)
}

// 自动格式化：输入后延迟 500ms 自动格式化输入内容（非粘贴时）
let autoFormatTimer = null
watch(() => activeTab.value?.inputText, (newVal) => {
  if (!autoFormat.value || !newVal) return
  clearTimeout(autoFormatTimer)
  autoFormatTimer = setTimeout(() => {
    // 如果用户正在编辑（textarea 聚焦），不替换，避免光标跳到末尾
    if (document.activeElement === textareaRef.value) return
    const tab = activeTab.value
    try {
      const obj = JSON.parse(tab.inputText)
      const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
      const formatted = JSON.stringify(obj, null, space)
      if (formatted !== tab.inputText) {
        tab.inputText = formatted
      }
    } catch (e) { /* JSON 无效时忽略 */ }
  }, 500)
})

// 操作后自动复制
const autoCopyResult = (text) => {
  if (!autoCopy.value || !text) return
  navigator.clipboard.writeText(text).then(() => {
    showToast('已自动复制到剪贴板')
  })
}

// Total lines in input text
const inputLinesCount = computed(() => {
  return activeTab.value.inputText.split('\n').length || 1
})

// Total lines in output text
const outputLinesCount = computed(() => {
  if (convertFormat.value && convertedOutput.value) return convertedOutput.value.split('\n').length
  return activeTab.value.outputText ? activeTab.value.outputText.split('\n').length : 1
})

const activeScrollTarget = ref(null)

const syncGutterScroll = () => {
  const scrollTop = textareaRef.value ? textareaRef.value.scrollTop : 0
  const scrollLeft = textareaRef.value ? textareaRef.value.scrollLeft : 0
  
  // Sync Gutter
  if (gutterRef.value) {
    gutterRef.value.scrollTop = scrollTop
  }
  
  // Sync highlight overlay
  if (inputHighlightRef.value) {
    inputHighlightRef.value.scrollTop = scrollTop
    inputHighlightRef.value.scrollLeft = scrollLeft
  }
  
  // Sync Output Pane
  if (activeScrollTarget.value === 'left' && outputPreRef.value) {
    outputPreRef.value.scrollTop = scrollTop
    outputPreRef.value.scrollLeft = scrollLeft
    if (outputGutterRef.value) outputGutterRef.value.scrollTop = scrollTop
  }
}

const handleOutputScroll = () => {
  if (activeScrollTarget.value === 'right') {
    const scrollTop = outputPreRef.value ? outputPreRef.value.scrollTop : 0
    const scrollLeft = outputPreRef.value ? outputPreRef.value.scrollLeft : 0
    
    // Sync Input Pane
    if (textareaRef.value) {
      textareaRef.value.scrollTop = scrollTop
      textareaRef.value.scrollLeft = scrollLeft
    }
    
    // Sync Gutter (left)
    if (gutterRef.value) {
      gutterRef.value.scrollTop = scrollTop
    }
    
    // Sync output gutter
    if (outputGutterRef.value) {
      outputGutterRef.value.scrollTop = scrollTop
    }
  }
}


const getFormattedJsonString = (rawText) => {
  try {
    let obj = JSON.parse(rawText)
    if (sortKeys.value) {
      obj = sortJSONKeys(obj)
    }
    const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value === 'minify' ? '2' : (indentSize.value || '2'))
    return JSON.stringify(obj, null, space)
  } catch (err) {
    return rawText
  }
}

// Load Demo
const loadDemo = () => {
  activeTab.value.inputText = getFormattedJsonString(DEMO_JSON)
  showToast('示例加载成功')
}

// 展开/折叠全部树节点（toggle）
const treeExpanded = ref(true)
provide('treeExpanded', treeExpanded)

const handleToggleExpand = () => {
  treeExpanded.value = !treeExpanded.value
  showToast(treeExpanded.value ? '已展开全部节点' : '已折叠节点')
}

// 去除 JSON 注释（支持字符串内不误删）
const handleRemoveComments = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return

  let text = tab.inputText, result = '', i = 0
  let inStr = false, strDelim = '', inLine = false, inBlock = false

  while (i < text.length) {
    const ch = text[i], next = text[i + 1]

    if (inLine)   { if (ch === '\n') { inLine = false; result += ch } i++; continue }
    if (inBlock)  { if (ch === '*' && next === '/') { inBlock = false; i += 2 } else i++; continue }
    if (inStr)    { if (ch === '\\') { result += ch + next; i += 2; continue }
                    if (ch === strDelim) { inStr = false; strDelim = '' }
                    result += ch; i++; continue }
    if ((ch === '"' || ch === "'") && !inStr) { inStr = true; strDelim = ch; result += ch; i++; continue }
    if (ch === '/' && next === '/') { inLine = true; i += 2; continue }
    if (ch === '/' && next === '*') { inBlock = true; i += 2; continue }

    result += ch; i++
  }

  tab.inputText = result
  showToast('注释已去除')
}

// File upload handler
const triggerFileUpload = (e) => {
  const file = e.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (event) => {
      activeTab.value.inputText = getFormattedJsonString(event.target.result)
      showToast('文件导入成功')
    }
    reader.readAsText(file)
  }
}

// Drag & Drop
const onDrop = (e) => {
  const file = e.dataTransfer.files[0]
  if (file && file.name.endsWith('.json')) {
    const reader = new FileReader()
    reader.onload = (event) => {
      activeTab.value.inputText = getFormattedJsonString(event.target.result)
      showToast('文件导入成功')
    }
    reader.readAsText(file)
  }
}

// Copy to Clipboard
const copyToClipboard = () => {
  const tab = activeTab.value
  if (!tab.outputText) return
  navigator.clipboard.writeText(tab.outputText).then(() => {
    copySuccess.value = true
    showToast('复制成功')
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  })
}

// Clear input and output panel state
const handleTextareaFocus = async () => {
  activeScrollTarget.value = 'left'
  if (!autoPaste.value) return
  const tab = activeTab.value
  // Only auto-paste into empty input
  if (tab.inputText.trim()) return
  try {
    const text = await navigator.clipboard.readText()
    if (text && text.trim()) {
      tab.inputText = text
      showToast('已自动粘贴')
    }
  } catch (e) {
    // Clipboard read requires permission or https — silently ignore
  }
}

const clearInput = () => {
  const tab = activeTab.value
  if (!tab) return
  tab.inputText = ''
  tab.outputText = ''
  tab.parsedObj = null
  tab.validationError = null
  tab.errorLine = null
  tab.duplicateLines = []
  tab.extractedFormat = null
  tab.convertFormat = null
  if (showToast) {
    showToast('已清空')
  }
}

// ─── JSON 格式转换 ───
const convertedOutput = computed(() => {
  const tab = activeTab.value
  if (!convertFormat.value || !tab.outputText) return ''
  try {
    return convertJson(tab.outputText, convertFormat.value)
  } catch (e) {
    return '// 转换失败: ' + e.message
  }
})

const handleConvert = (format) => {
  // 点击已选中格式 → 取消转换
  if (convertFormat.value === format) {
    convertFormat.value = null
  } else {
    convertFormat.value = format
    // 强制切到代码视图以显示转换结果
    if (activeTab.value) activeTab.value.viewMode = 'text'
  }
  showConvertMenu.value = false
}

const handleCancelConvert = () => {
  convertFormat.value = null
  showConvertMenu.value = false
}

const copyConvertedOutput = () => {
  if (!convertedOutput.value) return
  navigator.clipboard.writeText(convertedOutput.value).then(() => {
    copyConvertedSuccess.value = true
    showToast('已复制转换结果')
    setTimeout(() => { copyConvertedSuccess.value = false }, 1500)
  }).catch(() => {
    showToast('复制失败', 'error')
  })
}

// 点击外部关闭下拉菜单
const convertMenuRef = ref(null)
const onConvertMenuClickOutside = (e) => {
  if (showConvertMenu.value && convertMenuRef.value && !convertMenuRef.value.contains(e.target)) {
    showConvertMenu.value = false
  }
}

// Download file（支持转换后的格式）
const downloadFile = () => {
  const tab = activeTab.value
  const content = convertFormat.value ? convertedOutput.value : tab.outputText
  if (!content) return
  const ext = convertFormat.value ? getFormatExtension(convertFormat.value) : 'json'
  const mime = convertFormat.value ? 'text/plain' : 'application/json'
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `easy-json-${Date.now()}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showToast(`下载成功 (${ext.toUpperCase()})`)
}

// Helper to wrap matched search query with <mark class="search-match">
// counter: { count, target } — shared across all calls in one render pass;
//   the match where count === target gets an extra .search-match-current class.
const highlightMatchText = (text, query, counter) => {
  if (!text) return ''
  const str = String(text)
  if (!query) return str
  const escapedHtmlQuery = query
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const escapedRegexQuery = escapedHtmlQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regex = new RegExp(`(${escapedRegexQuery})`, 'gi')
  return str.replace(regex, (m) => {
    if (counter) {
      const cls = counter.count === counter.target ? 'search-match search-match-current' : 'search-match'
      counter.count++
      return `<mark class="${cls}">${m}</mark>`
    }
    return `<mark class="search-match">${m}</mark>`
  })
}

// Shared JSON syntax highlighter function with path tracking for hover sync
// counter (optional): { count: 0, target: N } — passed to highlightMatchText
//   to mark the Nth match with .search-match-current
const applyJsonHighlightWithPath = (text, counter) => {
  if (!text) return ''
  let safeStr = text
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
    regex = new RegExp(`(${escapedQ}(?:[^\\\\"]|\\\\.)*?${escapedQ}(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?|[{}[\\]]|,)`, 'g')
  } else {
    regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\\d+)?|[{}[\]]|,)/g
  }

  const q = searchQuery.value
  const c = counter || null
  const stack = []

  return safeStr.replace(regex, (match) => {
    if (match === '{') {
      const parent = stack[stack.length - 1]
      let currentPath = []
      if (parent) {
        if (parent.type === 'object') {
          currentPath = [...parent.path, parent.lastKey || '']
        } else if (parent.type === 'array') {
          currentPath = [...parent.path, parent.index]
        }
      }
      stack.push({ type: 'object', lastKey: null, path: currentPath })
      const display = highlightMatchText('{', q, c)
      return `<span class="json-bracket" data-path="${JSON.stringify(currentPath).replace(/"/g, '&quot;')}">${display}</span>`
    }

    if (match === '}') {
      const current = stack.pop()
      const path = current ? current.path : []
      const display = highlightMatchText('}', q, c)
      return `<span class="json-bracket" data-path="${JSON.stringify(path).replace(/"/g, '&quot;')}">${display}</span>`
    }

    if (match === '[') {
      const parent = stack[stack.length - 1]
      let currentPath = []
      if (parent) {
        if (parent.type === 'object') {
          currentPath = [...parent.path, parent.lastKey || '']
        } else if (parent.type === 'array') {
          currentPath = [...parent.path, parent.index]
        }
      }
      stack.push({ type: 'array', index: 0, path: currentPath })
      const display = highlightMatchText('[', q, c)
      return `<span class="json-bracket" data-path="${JSON.stringify(currentPath).replace(/"/g, '&quot;')}">${display}</span>`
    }

    if (match === ']') {
      const current = stack.pop()
      const path = current ? current.path : []
      const display = highlightMatchText(']', q, c)
      return `<span class="json-bracket" data-path="${JSON.stringify(path).replace(/"/g, '&quot;')}">${display}</span>`
    }

    if (match === ',') {
      const parent = stack[stack.length - 1]
      if (parent && parent.type === 'array') {
        parent.index++
      }
      return highlightMatchText(',', q, c)
    }

    // Key match: ends with colon
    if (match.endsWith(':')) {
      const colonIndex = match.lastIndexOf(':')
      const keyPart = match.substring(0, colonIndex)
      const colonPart = match.substring(colonIndex)

      let keyName = keyPart.trim()
      if (isEscaped) {
        const slashCount = (1 << depth) - 1
        const prefix = '\\'.repeat(slashCount) + '"'
        if (keyName.startsWith(prefix) && keyName.endsWith(prefix)) {
          keyName = keyName.slice(prefix.length, -prefix.length)
        }
        keyName = keyName.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      } else {
        if (keyName.startsWith('"') && keyName.endsWith('"')) {
          keyName = keyName.slice(1, -1)
        }
      }

      const parent = stack[stack.length - 1]
      let keyPath = []
      if (parent && parent.type === 'object') {
        parent.lastKey = keyName
        keyPath = [...parent.path, keyName]
      } else {
        keyPath = [keyName]
      }

      const pathStr = JSON.stringify(keyPath).replace(/"/g, '&quot;')
      const highlightedKey = highlightMatchText(keyPart, q, c)
      return `<span class="json-key" data-path="${pathStr}">${highlightedKey}</span><span class="json-colon">${colonPart}</span>`
    }

    // Primitive values
    let cls = 'json-number'
    const isString = isEscaped
      ? match.startsWith('\\'.repeat((1 << depth) - 1) + '"')
      : match.startsWith('"')

    if (isString) {
      cls = 'json-string'
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean'
    } else if (/null/.test(match)) {
      cls = 'json-null'
    }

    const parent = stack[stack.length - 1]
    let valPath = []
    if (parent) {
      if (parent.type === 'object') {
        valPath = [...parent.path, parent.lastKey || '']
      } else if (parent.type === 'array') {
        valPath = [...parent.path, parent.index]
      }
    }

    const pathStr = JSON.stringify(valPath).replace(/"/g, '&quot;')
    const highlightedVal = highlightMatchText(match, q, c)
    return `<span class="${cls}" data-path="${pathStr}">${highlightedVal}</span>`
  })
}

// Input highlight (left pane) — no current-match tracking
// Input highlight (left pane) — drives match count since replace targets input text
const highlightedInput = computed(() => {
  const tab = activeTab.value
  const counter = searchQuery.value
    ? { count: 0, target: currentMatchIndex.value }
    : null
  const html = applyJsonHighlightWithPath(tab.inputText, counter)
  if (counter) {
    totalMatches.value = counter.count
    if (currentMatchIndex.value >= counter.count && counter.count > 0) {
      currentMatchIndex.value = 0
    }
  } else {
    totalMatches.value = 0
  }
  return html
})

// Output highlight (right pane) — uses same currentMatchIndex for highlighting
const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ─── 转换输出语法高亮 ───
const highlightConverted = (code, format) => {
  const escaped = escapeHtml(code)
  // XML/HTML 高亮
  if (format === 'xml') {
    return escaped
      .replace(/(&lt;\/?)([\w.-]+)/g, '$1<span class="hl-tag">$2</span>')
      .replace(/(\s[\w-]+)=(&quot;)/g, ' <span class="hl-attr">$1</span>=$2')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>')
  }
  // 代码类格式高亮（Java/Kotlin/C#/Go/Swift/Dart/Rust/PHP/TS/Python）
  if (/^(java|kotlin|csharp|go|swift|dart|rust|php|typescript|python)$/.test(format)) {
    const keywords = 'public|class|struct|interface|type|func|def|fun|data|val|var|let|const|export|extends|implements|override|return|if|else|for|while|import|from|package|new|this|super|static|final|abstract|async|await|throw|throws|try|catch|void|int|long|double|float|bool|boolean|String|string|char|byte|short|List|Map|Set|Array|Optional|Any|where|enum|extension|protocol|required|factory|trait|match|impl|pub|mut|fn|use|mod|self|sizeof|init|deinit|guard'
    const kwRe = new RegExp(`\\b(${keywords})\\b`, 'g')
    return escaped
      .replace(/(\/\/[^\n]*)/g, '<span class="hl-comment">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>')
      .replace(/(&quot;[^&]*&quot;)/g, '<span class="hl-string">$1</span>')
      .replace(/(`[^`]*`)/g, '<span class="hl-string">$1</span>')
      .replace(kwRe, '<span class="hl-kw">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>')
      .replace(/(@\w+)/g, '<span class="hl-attr">$1</span>')
  }
  // YAML 高亮
  if (format === 'yaml') {
    return escaped
      .replace(/(#.*)/g, '<span class="hl-comment">$1</span>')
      .replace(/^(\s*)([\w.-]+)(:)/gm, '$1<span class="hl-key">$2</span>$3')
      .replace(/(:\s)(true|false|null|~)(\s*)$/gm, '$1<span class="hl-bool">$2</span>$3')
      .replace(/(:\s)(\d+\.?\d*)(\s*)$/gm, '$1<span class="hl-num">$2</span>$3')
      .replace(/(:\s)(&quot;.*?&quot;|'.*?')(\s*)$/gm, '$1<span class="hl-string">$2</span>$3')
  }
  // TOML/INI/Properties 高亮
  if (/^(toml|ini|properties)$/.test(format)) {
    return escaped
      .replace(/(#.*)/g, '<span class="hl-comment">$1</span>')
      .replace(/^(\s*)(\[[^\]]+\])/gm, '$1<span class="hl-section">$2</span>')
      .replace(/^(\s*)([\w.-]+)(\s*=)/gm, '$1<span class="hl-key">$2</span>$3')
      .replace(/(=\s*)(true|false|null)(\s*)$/gm, '$1<span class="hl-bool">$2</span>$3')
      .replace(/(=\s*)(\d+\.?\d*)(\s*)$/gm, '$1<span class="hl-num">$2</span>$3')
      .replace(/(=\s*)&quot;([^&]*)&quot;/g, '$1<span class="hl-string">&quot;$2&quot;</span>')
  }
  // SQL 高亮
  if (format === 'mysql') {
    return escaped
      .replace(/(--[^\n]*)/g, '<span class="hl-comment">$1</span>')
      .replace(/\b(CREATE|TABLE|ENGINE|InnoDB|DEFAULT|CHARSET|NOT|NULL|PRIMARY|KEY|INDEX|AUTO_INCREMENT|VARCHAR|TEXT|INT|BIGINT|BOOLEAN|DOUBLE|JSON|DATETIME)\b/g, '<span class="hl-kw">$1</span>')
      .replace(/(`[^`]*`)/g, '<span class="hl-string">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="hl-num">$1</span>')
  }
  // Protobuf 高亮
  if (format === 'protobuf') {
    return escaped
      .replace(/(\/\/[^\n]*)/g, '<span class="hl-comment">$1</span>')
      .replace(/\b(syntax|message|repeated|optional|required|enum|oneof|map|reserved|package|import|option|rpc|returns|stream)\b/g, '<span class="hl-kw">$1</span>')
      .replace(/(&quot;[^&]*&quot;)/g, '<span class="hl-string">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="hl-num">$1</span>')
      .replace(/\b(string|bool|int32|int64|uint32|uint64|float|double|bytes)\b/g, '<span class="hl-type">$1</span>')
  }
  // GraphQL 高亮
  if (format === 'graphql') {
    return escaped
      .replace(/(#.*)/g, '<span class="hl-comment">$1</span>')
      .replace(/\b(type|input|interface|enum|union|scalar|schema|query|mutation|subscription|fragment|extend|implements|directive)\b/g, '<span class="hl-kw">$1</span>')
      .replace(/\b(String|Int|Float|Boolean|ID)\b/g, '<span class="hl-type">$1</span>')
      .replace(/(&quot;[^&]*&quot;)/g, '<span class="hl-string">$1</span>')
  }
  // CSV/Markdown/Properties: plain
  return escaped
}

const highlightedOutput = computed(() => {
  // 转换模式：显示转换后的内容（带语法高亮）
  if (convertFormat.value && convertedOutput.value) {
    // JSON Schema 输出是合法 JSON，复用 JSON 语法高亮
    if (convertFormat.value === 'jsonschema') {
      return applyJsonHighlightWithPath(convertedOutput.value)
    }
    return highlightConverted(convertedOutput.value, convertFormat.value)
  }
  const tab = activeTab.value
  if (!tab.outputText) return ''
  const counter = searchQuery.value
    ? { count: 0, target: currentMatchIndex.value }
    : null
  return applyJsonHighlightWithPath(tab.outputText, counter)
})

const isInputMinified = computed(() => {
  const text = activeTab.value?.inputText || ''
  return !!text.trim() && !text.includes('\n')
})

const isOutputMinified = computed(() => {
  return indentSize.value === 'minify' || (!!activeTab.value?.outputText && !activeTab.value.outputText.includes('\n'))
})

// Watch hoveredPath to highlight corresponding elements in the input editor
watch(hoveredPath, (newPath) => {
  if (inputHighlightRef.value) {
    const hoveredEls = inputHighlightRef.value.querySelectorAll('.is-hovered')
    hoveredEls.forEach(el => el.classList.remove('is-hovered'))
    
    if (newPath && newPath.length > 0) {
      const pathStr = JSON.stringify(newPath)
      const targets = inputHighlightRef.value.querySelectorAll(`[data-path='${pathStr}']`)
      targets.forEach(el => el.classList.add('is-hovered'))
    }
  }
})

// Hover sync handlers for left-side transparent textarea
const handleTextareaMouseMove = (e) => {
  const textarea = e.currentTarget
  if (!textarea) return
  
  const originalPointerEvents = textarea.style.pointerEvents
  textarea.style.pointerEvents = 'none'
  
  let originalPreEvents = 'none'
  if (inputHighlightRef.value) {
    originalPreEvents = inputHighlightRef.value.style.pointerEvents
    inputHighlightRef.value.style.pointerEvents = 'auto'
  }
  
  const element = document.elementFromPoint(e.clientX, e.clientY)
  
  textarea.style.pointerEvents = originalPointerEvents
  if (inputHighlightRef.value) {
    inputHighlightRef.value.style.pointerEvents = originalPreEvents
  }
  
  if (element) {
    let current = element
    let pathAttr = null
    while (current && current.classList && !current.classList.contains('editor-highlight')) {
      pathAttr = current.getAttribute('data-path')
      if (pathAttr) break
      current = current.parentElement
    }
    
    if (pathAttr) {
      try {
        const path = JSON.parse(pathAttr)
        setHoveredPath(path)
        return
      } catch (err) {}
    }
  }
  setHoveredPath(null)
}

const handleTextareaMouseLeave = () => {
  setHoveredPath(null)
}


// Handler functions for toolbar
const handleFormatDirect = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return
  if (indentSize.value === 'minify') {
    indentSize.value = '2' // default format style
  }
  try {
    let obj = JSON.parse(tab.inputText)
    if (sortKeys.value) {
      obj = sortJSONKeys(obj)
    }
    const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
    tab.inputText = JSON.stringify(obj, null, space)
    tab.validationError = null
    tab.errorLine = null
    showToast('格式化成功')
    autoCopyResult(activeTab.value.inputText)
  } catch (err) {
    formatJSON()
  }
}

const handleMinifyDirect = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return
  try {
    let obj = JSON.parse(tab.inputText)
    tab.inputText = JSON.stringify(obj)
    indentSize.value = 'minify'
    showToast('压缩成功')
    autoCopyResult(activeTab.value.inputText)
  } catch (err) {
    // Try to convert JS object format first
    try {
      const jsonStr = convertJsObjectToJson(tab.inputText)
      const obj = JSON.parse(jsonStr)
      tab.inputText = JSON.stringify(obj)
      indentSize.value = 'minify'
      showToast('压缩成功')
    autoCopyResult(activeTab.value.inputText)
    } catch (e2) {
      tab.validationError = `压缩失败: ${err.message}`
    }
  }
}

const handleEscape = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return
  formatGuard = true
  try {
    let obj = JSON.parse(tab.inputText)
    const minified = JSON.stringify(obj)
    tab.inputText = minified.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    tab.outputText = tab.inputText
    tab.parsedObj = null
    tab.validationError = null
    tab.errorLine = null
    indentSize.value = 'minify'
    showToast('转义成功')
    autoCopyResult(tab.inputText)
  } catch (err) {
    try {
      const jsonStr = convertJsObjectToJson(tab.inputText)
      const obj = JSON.parse(jsonStr)
      const minified = JSON.stringify(obj)
      tab.inputText = minified.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      tab.outputText = tab.inputText
      tab.parsedObj = null
      tab.validationError = null
      tab.errorLine = null
      indentSize.value = 'minify'
      showToast('转义成功')
      autoCopyResult(tab.inputText)
    } catch (e2) {
      tab.inputText = tab.inputText.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      tab.outputText = tab.inputText
      tab.parsedObj = null
      tab.validationError = null
      tab.errorLine = null
      indentSize.value = 'minify'
      showToast('转义成功')
      autoCopyResult(tab.inputText)
    }
  }
  saveFormatterState()
  nextTick(() => { formatGuard = false })
}

// Recursively unescape string values that represent valid JSON objects or arrays
const recursiveUnescape = (val) => {
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed)
        return recursiveUnescape(parsed)
      } catch (e) {
        // Fallback: try JS object literal parsing
        try {
          const parsed = safeParseJsLike(trimmed)
          if (parsed && typeof parsed === 'object') {
            return recursiveUnescape(parsed)
          }
        } catch (e2) {}
      }
    }
    return val
  }
  if (Array.isArray(val)) {
    return val.map(recursiveUnescape)
  }
  if (val !== null && typeof val === 'object') {
    const res = {}
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        res[key] = recursiveUnescape(val[key])
      }
    }
    return res
  }
  return val
}

const handleUnescape = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return
  formatGuard = true
  try {
    let rawText = tab.inputText.trim()

    const tryParseToObj = (txt) => {
      const processParsed = (parsed) => {
        if (parsed === null) return null
        if (typeof parsed === 'object') return parsed
        if (typeof parsed === 'string') {
          const trimmed = parsed.trim()
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              const nested = JSON.parse(trimmed)
              if (nested !== null && typeof nested === 'object') return nested
            } catch (e) {}
          }
        }
        return null
      }

      try {
        const parsed = JSON.parse(txt)
        const res = processParsed(parsed)
        if (res) return res
      } catch (e) {}

      try {
        const candidate = tryParseCandidate(txt)
        if (candidate) {
          const parsed = JSON.parse(candidate)
          const res = processParsed(parsed)
          if (res) return res
        }
      } catch (e) {}

      try {
        const jsonStr = convertJsObjectToJson(txt)
        const parsed = JSON.parse(jsonStr)
        const res = processParsed(parsed)
        if (res) return res
      } catch (e) {}

      return null
    }

    let parsedObj = tryParseToObj(rawText)

    if (parsedObj) {
      const unescapedObj = recursiveUnescape(parsedObj)
      tab.inputText = JSON.stringify(unescapedObj)
      tab.outputText = tab.inputText
      tab.parsedObj = null
      tab.validationError = null
      tab.errorLine = null
      indentSize.value = 'minify'
      showToast('去转义成功')
      autoCopyResult(tab.inputText)
      saveFormatterState()
      nextTick(() => { formatGuard = false })
      return
    }

    let unescapedRaw = rawText.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

    parsedObj = tryParseToObj(unescapedRaw)
    if (parsedObj) {
      const unescapedObj = recursiveUnescape(parsedObj)
      tab.inputText = JSON.stringify(unescapedObj)
    } else {
      tab.inputText = unescapedRaw
    }

    tab.outputText = tab.inputText
    tab.parsedObj = null
    tab.validationError = null
    tab.errorLine = null
    indentSize.value = 'minify'
    showToast('去转义成功')
    autoCopyResult(tab.inputText)
  } catch (err) {
    tab.validationError = `去转义失败: ${err.message}`
  }
  saveFormatterState()
  nextTick(() => { formatGuard = false })
}

const handleExtract = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return
  try {
    const result = extractJsonFromText(tab.inputText)
    let obj = JSON.parse(result.json)
    if (sortKeys.value) {
      obj = sortJSONKeys(obj)
    }
    if (indentSize.value === 'minify') {
      tab.inputText = JSON.stringify(obj)
    } else {
      const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
      tab.inputText = JSON.stringify(obj, null, space)
    }
    tab.validationError = null
    tab.errorLine = null
    tab.extractedFormat = null
    showToast(result.format !== 'JSON' ? `已从 ${result.format} 提取 JSON` : 'JSON 提取成功')
    autoCopyResult(activeTab.value.inputText)
  } catch (err) {
    tab.validationError = `提取失败: ${err.message}`
  }
}

onMounted(() => {
  // Restore persisted tabs from localStorage
  let restored = false
  try {
    const savedTabs = localStorage.getItem('ej_fmt_tabs')
    const savedActive = localStorage.getItem('ej_fmt_active')
    const savedSort = localStorage.getItem('ej_fmt_sort')
    if (savedTabs) {
      const parsed = JSON.parse(savedTabs)
      if (Array.isArray(parsed) && parsed.length > 0) {
        tabs.value = parsed.map(t => ({
          id: t.id,
          title: t.title,
          inputText: t.inputText || '',
          outputText: '',
          parsedObj: null,
          validationError: null,
          errorLine: null,
          duplicateLines: [],
          viewMode: t.viewMode || 'text',
          convertFormat: null,
          extractedFormat: null
        }))
        nextTabId = Math.max(...parsed.map(t => t.id)) + 1
        activeTabId.value = savedActive ? Number(savedActive) : tabs.value[0].id
        restored = true
      }
    }
  } catch (e) {}

  if (!restored) {
    loadDemo()
  }
  canSave = true
  scrollTabsToActive()

  // Check for extract-on-load from right-click context menu
  checkExtractOnLoad()
})

const checkExtractOnLoad = () => {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('action') !== 'extract') return
    if (!window.chrome?.storage?.local) return

    chrome.storage.local.get('ej_extract_text', (result) => {
      const text = result?.ej_extract_text
      if (!text) return

      // 为每次提取新建一个格式化标签页
      const newId = nextTabId++
      const newTab = {
        id: newId,
        title: `格式化 ${newId}`,
        inputText: '',
        outputText: '',
        parsedObj: null,
        validationError: null,
        errorLine: null,
        duplicateLines: [],
        viewMode: 'text',
        convertFormat: null,
        extractedFormat: null
      }
      tabs.value.push(newTab)
      activeTabId.value = newId
      scrollTabsToEnd()

      nextTick(() => {
        const tab = tabs.value.find(t => t.id === newId)
        if (tab) {
          tab.inputText = text
        }
      })

      chrome.storage.local.remove('ej_extract_text')
    })
  } catch (e) {}
  // 点击面板外部收起
  document.addEventListener('click', onConvertMenuClickOutside)
}
onBeforeUnmount(() => {
  document.removeEventListener('click', onConvertMenuClickOutside)
})
</script>

<template>
  <div class="formatter-container">
    <!-- Formatter Tabs Bar -->
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
        <button v-if="!tabsOverflow" class="add-tab-btn" @click="addTab">
          <Plus class="add-tab-icon" />
          <span>新建格式化</span>
        </button>
      </div>
      <button v-if="tabsOverflow" class="add-tab-btn add-tab-btn-fixed" @click="addTab">
        <Plus class="add-tab-icon" />
        <span>新建格式化</span>
      </button>
    </div>

    <!-- Tab Context Menu -->
    <Teleport to="body">
      <div
        v-if="tabContextMenu.visible"
        class="tab-context-menu"
        :style="{ left: tabContextMenu.x + 'px', top: tabContextMenu.y + 'px' }"
      >
        <button @click="closeTab(tabContextMenu.tabId)" :disabled="tabs.length <= 1">关闭</button>
        <button @click="closeLeftTabs" :disabled="tabs.findIndex(t => t.id === tabContextMenu.tabId) === 0">关闭左侧</button>
        <button @click="closeRightTabs" :disabled="tabs.findIndex(t => t.id === tabContextMenu.tabId) === tabs.length - 1">关闭右侧</button>
        <button @click="closeAllTabs" :disabled="tabs.length <= 1">关闭全部</button>
      </div>
    </Teleport>


    <!-- Main Workspace -->
    <div class="workspace-grid" @dragover.prevent @drop.prevent="onDrop">
      <!-- Input Panel -->
      <div class="editor-panel">
        <div class="panel-header">
          <div class="toolbar-actions">
            <button class="toolbar-item" @click="handleFormatDirect" data-tooltip-bottom-left="格式化">
              <Braces class="toolbar-icon" />
              <span class="toolbar-label">格式化</span>
            </button>
            <button class="toolbar-item" @click="handleMinifyDirect" data-tooltip-bottom="压缩 JSON">
              <Minimize2 class="toolbar-icon" />
              <span class="toolbar-label">压缩</span>
            </button>
            <button class="toolbar-item" @click="handleEscape" data-tooltip-bottom="转义 JSON">
              <Code class="toolbar-icon" />
              <span class="toolbar-label">转义</span>
            </button>
            <button class="toolbar-item" @click="handleUnescape" data-tooltip-bottom="去转义 JSON">
              <FileCode class="toolbar-icon" />
              <span class="toolbar-label">去转义</span>
            </button>
            <button class="toolbar-item" @click="handleExtract" data-tooltip-bottom="智能提取 JSON">
              <Search class="toolbar-icon" />
              <span class="toolbar-label">提取</span>
            </button>

            <div class="toolbar-divider"></div>

            <button class="toolbar-item" @click="handleRemoveComments" data-tooltip-bottom="去除 JSON 注释">
              <Strikethrough class="toolbar-icon" />
              <span class="toolbar-label">去注释</span>
            </button>
          </div>
          <div class="header-search-wrapper">
            <button
              class="action-btn outline icon-only copy-btn"
              :class="{ 'copy-success-ring': copySuccess }"
              @click.stop="copyToClipboard"
              :disabled="!activeTab.outputText"
              :data-tooltip-bottom="copySuccess ? '已复制' : '复制结果'"
              style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
            >
              <Check v-if="copySuccess" class="btn-icon success-color" />
              <Copy v-else class="btn-icon" />
              <!-- Snake border ring -->
              <svg v-if="copySuccess" class="snake-ring" viewBox="0 0 28 28">
                <rect x="1" y="1" width="26" height="26" rx="5"
                  fill="none" stroke="#16a34a" stroke-width="2"
                  stroke-linecap="round"
                  stroke-dasharray="20 90"
                  class="snake-rect" />
              </svg>
            </button>

            <button 
              class="action-btn danger icon-only" 
              @click.stop="clearInput" 
              :disabled="!activeTab.inputText"
              data-tooltip-bottom="清空输入"
              style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
            >
              <Trash2 class="btn-icon" />
            </button>

            <label class="action-btn outline icon-only" data-tooltip-bottom="导入本地文件">
              <UploadCloud class="btn-icon" />
              <input type="file" accept=".json" @change="triggerFileUpload" class="hidden-input" />
            </label>

            <button
              class="action-btn outline icon-only"
              :class="{ 'active': searchExpanded }"
              @click.stop="toggleSearch"
              data-tooltip-bottom-left="搜索 / 替换"
              style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
            >
              <Search class="btn-icon" />
            </button>

            <div
              v-if="searchExpanded"
              class="search-replace-box"
            >
              <!-- Search row -->
              <div class="search-row">
                <button class="sr-toggle-btn" @click="toggleReplace" data-tooltip-bottom="替换">
                  <ChevronRight class="sr-toggle-icon" :class="{ 'is-open': replaceExpanded }" />
                </button>
                <input
                  type="text"
                  placeholder="搜索"
                  class="sr-input"
                  v-model="searchQuery"
                  ref="searchInputRef"
                  @keydown="handleSearchKeydown"
                  @keydown.escape="collapseSearch"
                />
                <span v-if="searchQuery" class="match-count">{{ totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : '无' }}</span>
                <button class="sr-nav-btn" @click="goPrevMatch" :disabled="totalMatches === 0" data-tooltip-bottom="上一个">
                  <ChevronUp class="sr-nav-icon" />
                </button>
                <button class="sr-nav-btn" @click="goNextMatch" :disabled="totalMatches === 0" data-tooltip-bottom="下一个">
                  <ChevronDown class="sr-nav-icon" />
                </button>
                <button class="sr-nav-btn" @click="collapseSearch" data-tooltip-bottom-right="关闭">
                  <X class="sr-nav-icon" />
                </button>
              </div>
              <!-- Replace row -->
              <div v-if="replaceExpanded" class="replace-row">
                <input
                  type="text"
                  placeholder="替换"
                  class="sr-input"
                  v-model="replaceText"
                  ref="replaceInputRef"
                  @keydown="handleReplaceKeydown"
                  @keydown.escape="collapseSearch"
                />
                <button class="sr-action-btn" @click="replaceCurrent" :disabled="totalMatches === 0" data-tooltip-bottom="替换当前">替换</button>
                <button class="sr-action-btn" @click="replaceAllMatches" :disabled="totalMatches === 0" data-tooltip-bottom-right="全部替换">全部</button>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-body">
          <div class="editor-wrapper">
            <!-- Sync scroll line numbers -->
            <div class="gutter" ref="gutterRef">
              <div 
                v-for="n in inputLinesCount" 
                :key="n" 
                class="gutter-line" 
                :class="{ 'has-error': activeTab.errorLine === n, 'has-duplicate': activeTab.duplicateLines?.includes(n) }"
              >
                {{ n }}
              </div>
            </div>
            
            <div class="textarea-overlay-container" :class="{ 'minify-wrap': isInputMinified }">
              <!-- Syntax highlight overlay (behind textarea) -->
              <pre
                ref="inputHighlightRef"
                class="editor-highlight"
                aria-hidden="true"
                v-html="highlightedInput || '<span class=\'placeholder\'>在此粘贴或拖入你的 JSON 数据...</span>'"
              ></pre>
              <!-- Transparent textarea on top -->
              <textarea
                ref="textareaRef"
                v-model="activeTab.inputText"
                class="editor-textarea"
                placeholder=""
                spellcheck="false"
                @scroll="syncGutterScroll"
                @paste="handlePaste"
                @mouseenter="activeScrollTarget = 'left'"
                @touchstart="activeScrollTarget = 'left'"
                @focus="handleTextareaFocus"
                @mousemove="handleTextareaMouseMove"
                @mouseleave="handleTextareaMouseLeave"
              ></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Output Panel -->
      <div class="editor-panel">
        <div class="panel-header">
          <div class="header-left-group">
            <!-- View switch -->
            <div class="segmented-control" ref="segmentedRef">
              <div class="segmented-indicator" :style="indicatorStyle"></div>
              <button
                class="segment-btn"
                :class="{ active: activeTab.viewMode === 'text' }"
                @click="activeTab.viewMode = 'text'"
                data-tooltip-bottom="代码视图"
              >
                <Code class="seg-icon" />
              </button>
              <button
                class="segment-btn"
                :class="{ active: activeTab.viewMode === 'tree' }"
                @click="activeTab.viewMode = 'tree'"
                :disabled="!activeTab.parsedObj || !!convertFormat"
                data-tooltip-bottom="树形视图"
              >
                <ListTree class="seg-icon" />
              </button>
              <button
                class="segment-btn"
                :class="{ active: activeTab.viewMode === 'graph' }"
                @click="activeTab.viewMode = 'graph'"
                :disabled="!activeTab.parsedObj || !!convertFormat"
                data-tooltip-bottom="拓扑图"
              >
                <Network class="seg-icon" />
              </button>
              <button
                class="segment-btn"
                :class="{ active: activeTab.viewMode === 'table' }"
                @click="activeTab.viewMode = 'table'"
                :disabled="!activeTab.parsedObj || !!convertFormat"
                data-tooltip-bottom="表格视图"
              >
                <Table2 class="seg-icon" />
              </button>
            </div>
          </div>
          
          <div class="header-actions-group">
            <button v-if="activeTab.viewMode === 'tree' || activeTab.viewMode === 'table'" class="action-btn outline icon-only" @click="handleToggleExpand" :data-tooltip-bottom="treeExpanded ? '折叠全部节点' : '展开全部树节点'">
              <Maximize2 v-if="!treeExpanded" class="btn-icon" />
              <Minimize2 v-else class="btn-icon" />
            </button>
            <!-- 格式转换下拉 -->
            <div class="convert-dropdown" ref="convertMenuRef">
              <button
                class="action-btn outline"
                :class="{ 'active': convertFormat, 'icon-only': !convertFormat }"
                @click.stop="showConvertMenu = !showConvertMenu"
                :disabled="!activeTab.outputText"
                :data-tooltip-bottom-right="convertFormat ? `已转换: ${formatLabels[convertFormat]}` : '格式转换'"
                style="gap: 4px; white-space: nowrap;"
              >
                <Shuffle class="btn-icon" />
                <span v-if="convertFormat" class="convert-badge">{{ formatLabels[convertFormat] }}</span>
              </button>
              <Transition name="fade-slide">
                <div v-if="showConvertMenu" class="convert-menu" @click.stop @mouseleave="showConvertMenu = false">
                  <div class="convert-menu-header">JSON → 其他格式</div>
                  <button
                    v-for="(label, key) in formatLabels"
                    :key="key"
                    class="convert-menu-item"
                    :class="{ active: convertFormat === key }"
                    @click="handleConvert(key)"
                  >
                    <span>{{ label }}</span>
                    <Check v-if="convertFormat === key" class="check-icon" />
                  </button>
                  <div v-if="convertFormat" class="convert-menu-footer">
                    <button class="convert-cancel-btn" @click="handleCancelConvert">取消转换</button>
                  </div>
                </div>
              </Transition>
            </div>

            <button
              v-if="convertFormat"
              class="action-btn outline icon-only"
              @click.stop="copyConvertedOutput"
              data-tooltip-bottom="复制转换结果"
              style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
            >
              <Check v-if="copyConvertedSuccess" class="btn-icon success-color" />
              <Copy v-else class="btn-icon" />
            </button>

            <button class="action-btn outline icon-only" @click="downloadFile" :disabled="!activeTab.outputText" :data-tooltip-bottom-right="convertFormat ? `下载 ${formatLabels[convertFormat]} 文件` : '下载文件'">
              <Download class="btn-icon" />
            </button>
          </div>
        </div>

        <div class="panel-body">
          <Transition name="fade-slide" mode="out-in">
            <!-- Text output -->
            <div v-if="activeTab.viewMode === 'text'" class="output-wrapper" key="text">
              <div class="gutter" ref="outputGutterRef">
                <div
                  v-for="n in outputLinesCount"
                  :key="n"
                  class="gutter-line"
                >{{ n }}</div>
              </div>
              <pre 
                class="output-pre" 
                :class="{ 'minify-wrap': isOutputMinified }"
                ref="outputPreRef"
                @scroll="handleOutputScroll"
                @mouseenter="activeScrollTarget = 'right'"
                @touchstart="activeScrollTarget = 'right'"
                v-html="highlightedOutput || '<span class=\'placeholder\'>等待有效的 JSON 输入...</span>'"
              ></pre>
            </div>
            
            <!-- Tree view -->
            <div v-else-if="activeTab.viewMode === 'tree' && activeTab.parsedObj" class="tree-wrapper" key="tree">
              <JsonTreeNode :value="activeTab.parsedObj" :is-last="true" />
            </div>

            <!-- Graph (topology) view -->
            <JsonGraphView
              v-else-if="activeTab.viewMode === 'graph' && activeTab.parsedObj"
              :parsedObj="activeTab.parsedObj"
              :hoveredPath="hoveredPath"
              @hover-path="setHoveredPath"
              key="graph"
            />

            <!-- Table view -->
            <JsonTableView
              v-else-if="activeTab.viewMode === 'table' && activeTab.parsedObj"
              :data="activeTab.parsedObj"
              :hoveredPath="hoveredPath"
              @hover-path="setHoveredPath"
              key="table"
            />
          </Transition>
        </div>
      </div>
    </div>

    <!-- Full-width bottom status bar -->
    <div class="bottom-status-bar">
      <!-- Left side: validation status -->
      <div class="status-bar-left">
        <template v-if="activeTab.validationError">
          <AlertTriangle class="status-bar-icon error" />
          <span class="status-bar-text error">JSON 校验失败 &nbsp;·&nbsp; {{ activeTab.validationError }} {{ activeTab.errorLine ? `(第 ${activeTab.errorLine} 行)` : '' }}</span>
        </template>
        <template v-else-if="activeTab.extractedFormat">
          <Check class="status-bar-icon success" />
          <span class="status-bar-text success">已从 {{ activeTab.extractedFormat }} 提取 &nbsp;·&nbsp; JSON 有效 &nbsp;·&nbsp; {{ inputLinesCount }} 行</span>
        </template>
        <template v-else-if="activeTab.inputText">
          <Check class="status-bar-icon success" />
          <span class="status-bar-text success">JSON 有效 &nbsp;·&nbsp; {{ inputLinesCount }} 行</span>
        </template>
        <template v-else>
          <span class="status-bar-text muted">在左侧输入 JSON</span>
        </template>
      </div>
      <!-- Right side: output info -->
      <div class="status-bar-right">
        <template v-if="activeTab.outputText">
          <span class="status-bar-text muted">输出 {{ outputLinesCount }} 行</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.formatter-container {
  --ej-btn-size: clamp(24px, 3vw, 32px);
  --ej-icon-size: clamp(15px, 1.3vw, 15px);
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

/* Options bar */
.options-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  padding: 0 12px;
  height: clamp(36px, 4vw, 48px);
  flex-shrink: 0;
}

.options-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.options-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.select-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.styled-select {
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-sans);
  outline: none;
  cursor: pointer;
  transition: all 0.15s ease;
  height: 24px;
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
  height: 16px;
  width: 16px;
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
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* Buttons — ghost style (no border at rest) */
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-panel);
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
  background-color: var(--bg-panel);
  color: var(--text-primary);
}

.action-btn.outline:hover:not(:disabled) {
  background-color: var(--bg-app);
}

.action-btn.outline:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-btn.active {
  background-color: var(--bg-app) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}

.action-btn.danger {
  color: var(--text-primary);
}

.action-btn.danger:hover:not(:disabled) {
  background-color: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.action-btn.icon-only {
  padding: 0 !important;
  width: 28px !important;
  height: 28px !important;
  justify-content: center;
  box-sizing: border-box !important;
  background: #e3e3e3;
    box-shadow: 20px 20px 60px #c1c1c1, -20px -20px 60px #ffffff;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.btn-icon-s {
  width: var(--ej-icon-size);
  height: var(--ej-icon-size);
}


/* Workspace Grid */
.workspace-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  flex-grow: 1;
  min-height: 0;
}

/* Editor Panel */
.editor-panel {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-color);
  min-height: 0;
  min-width: 0;
}


.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: clamp(36px, 4vw, 50px) !important;
  min-height: clamp(36px, 4vw, 50px) !important;
  max-height: clamp(36px, 4vw, 50px) !important;
  padding: 0 10px !important;
  border-bottom: 1px solid var(--border-color) !important;
  background-color: var(--bg-panel);
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

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-upload-wrapper {
  display: inline-block;
}

.upload-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.hidden-input {
  display: none;
}

/* Panel Body */
.panel-body {
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  background-color: var(--bg-input);
  min-height: 0;
  height: 100%;
}

.editor-wrapper {
  display: flex;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.gutter {
  width: 40px;
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-color);
  text-align: right;
  padding: 8px 6px 8px 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 20.15px;  /* 与编辑器 13px*1.55 行高一致，保证对齐 */
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
}

.gutter-line {
  line-height: 20.15px;
}

.gutter-line.has-error {
  color: var(--error-text);
  background-color: var(--error-bg);
  border-right: 2px solid var(--error-text);
  font-weight: bold;
}

.gutter-line.has-duplicate {
  color: #d97706;
  background-color: rgba(234, 179, 8, 0.12);
  border-right: 2px solid #d97706;
  font-weight: 600;
}

.dark-mode .gutter-line.has-duplicate {
  color: #fbbf24;
  background-color: rgba(234, 179, 8, 0.15);
  border-right: 2px solid #fbbf24;
}

.editor-textarea {
  /* Overlay-based approach: text is transparent, caret is visible */
  /* Layout handled globally in style.css */
  z-index: 1;
}

.editor-highlight {
  z-index: 0;
}

.output-pre {
  margin: 0;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  overflow: auto;
  flex-grow: 1;
  white-space: pre;
  text-align: left;
  user-select: text;
  min-width: 0;
  color: var(--text-primary);
}

.output-wrapper {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}

.tree-wrapper {
  padding: 16px;
  overflow: auto;
  flex-grow: 1;
}

/* Placeholder */
.placeholder {
  color: var(--text-muted);
}

/* Segmented Control — json4u style */
.segmented-control {
  --seg-size: 26px;
  position: relative;
  display: inline-flex;
  align-items: center;
  height: calc(var(--seg-size) + 6px);
  background-color: var(--segmented-bg);
  padding: 3px;
  border-radius: 8px;
  gap: 2px;
}

.segmented-indicator {
  position: absolute;
  top: 3px;
  height: var(--seg-size);
  background-color: var(--segmented-indicator-bg);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 1;
}

.segment-btn {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--seg-size);
  height: var(--seg-size);
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.seg-icon {
  width: 14px;
  height: 14px;
}

.segment-btn:hover:not(:disabled):not(.active) {
  color: var(--text-primary);
}

.segment-btn.active {
  color: var(--segmented-active-color);
}

.segment-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Toolbar Actions (inline text commands) */
.toolbar-actions {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0;
  gap: 2px;
}

.toolbar-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans);
  white-space: nowrap;
  transform: scale(1);
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}

.toolbar-item:hover:not(:disabled) {
  background-color: var(--segmented-indicator-bg);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.toolbar-item:active:not(:disabled) {
  transform: scale(0.95);
}

.toolbar-item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.toolbar-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.toolbar-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
  margin: 0 2px;
  opacity: 0.5;
}

/* Hover style in highlight pre */
:deep(.editor-highlight [data-path].is-hovered) {
  background-color: var(--json-hover-bg);
  border-radius: 6px;
  box-shadow: 0 0 0 2px var(--json-hover-bg);
}



/* Bottom status bar */
.bottom-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  min-height: 26px;
  flex-shrink: 0;
  padding: 0 12px;
  border-top: 1px solid var(--border-color);
  background-color: var(--bg-panel);
  box-sizing: border-box;
}

.status-bar-left,
.status-bar-right {
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-bar-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}
.status-bar-icon.success { color: var(--success-text); }
.status-bar-icon.error { color: var(--error-text); }

.status-bar-text {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 680px;
}
.status-bar-text.success { color: var(--success-text); }
.status-bar-text.error { color: var(--error-text); }
.status-bar-text.muted { color: var(--text-muted); font-weight: 400; }

.success-color {
  color: var(--success-text) !important;
}

/* Segmented Control */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background-color: var(--bg-app);
  color: var(--text-primary);
  border-color: var(--border-color-active);
}

.tool-icon {
  width: 13px;
  height: 13px;
}

@media (max-width: 600px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
  
  .formatter-container {
    padding: 12px;
  }
  
  .options-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .options-left {
    flex-wrap: wrap;
    gap: 16px;
  }
}

/* Header Actions Group inside panel-header */
.header-actions-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-header-actions {
  margin-left: 30px;
}

.icon-text-btn {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  padding: 0 8px !important;
  height: 28px !important;
  width: auto !important;
  min-width: fit-content !important;
  box-sizing: border-box !important;
  border: 1px solid var(--border-color) !important;
  background: var(--bg-panel) !important;
  color: var(--text-primary) !important;
  border-radius: 6px !important;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transform: scale(1);
  transition: transform 0.1s ease, background-color 0.15s ease, color 0.15s ease;
}

.icon-text-btn:hover {
  background-color: var(--bg-app) !important;
  color: var(--text-primary) !important;
}

.icon-text-btn:active {
  transform: scale(0.95);
}

.icon-text-btn .tool-icon-s,
.icon-text-btn .btn-icon-s {
  width: 13px !important;
  height: 13px !important;
}

.btn-label {
  font-size: 11.5px !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  color: inherit !important;
}

.tool-btn-small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 0 8px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 500;
  height: 28px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transform: scale(1);
  cursor: pointer;
  transition: transform 0.1s ease, background-color 0.15s ease, color 0.15s ease;
}

.tool-btn-small:hover {
  background-color: var(--bg-app);
  color: var(--text-primary);
}

.tool-btn-small:active {
  transform: scale(0.95);
}

.tool-icon-s {
  width: var(--ej-icon-size);
  height: var(--ej-icon-size);
}

.divider-v {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
  margin: 0 4px;
}

/* Header Search / Command Widgets */
.header-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Search & Replace Box */
.search-replace-box {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-panel);
  border-radius: 6px;
  width: clamp(220px, 20vw, 320px);
  height: auto;
  box-sizing: border-box;
  overflow: visible;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
  z-index: 100;
  transition: box-shadow 0.2s ease;
}

.dark-mode .search-replace-box {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
}

.search-replace-box:focus-within {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 2px var(--primary-light);
  background-color: var(--bg-panel);
}

.dark-mode .search-replace-box:focus-within {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45), 0 0 0 2px var(--primary-light);
}

.search-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: clamp(2px, 0.2vw, 4px);
  padding: clamp(2px, 0.2vw, 4px) clamp(3px, 0.3vw, 5px);
  min-height: clamp(22px, 1.8vw, 28px);
}

.replace-row {
  border-top: 1px solid var(--border-color);
  padding-left: clamp(20px, 1.8vw, 28px);
}

.sr-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(16px, 1.2vw, 20px);
  height: clamp(16px, 1.2vw, 20px);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.sr-toggle-btn:hover {
  color: var(--text-primary);
  background-color: var(--border-color);
}

.sr-toggle-icon {
  width: clamp(10px, 0.8vw, 14px);
  height: clamp(10px, 0.8vw, 14px);
  transition: transform 0.2s ease;
}

.sr-toggle-icon.is-open {
  transform: rotate(90deg);
}

.sr-input {
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  color: var(--text-primary);
  font-size: clamp(10px, 0.75vw, 12px);
  font-family: var(--font-mono);
  flex-grow: 1;
  min-width: 0;
  padding: clamp(1px, 0.15vw, 3px) clamp(4px, 0.4vw, 8px);
  height: clamp(18px, 1.5vw, 24px);
  border-radius: 4px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.sr-input:focus {
  border-color: var(--primary-color);
}

.sr-input::placeholder {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: clamp(9px, 0.7vw, 11px);
}

.match-count {
  font-size: clamp(9px, 0.65vw, 11px);
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: clamp(22px, 1.8vw, 32px);
  text-align: center;
}

.sr-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(16px, 1.3vw, 22px);
  height: clamp(16px, 1.3vw, 22px);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 0.1s ease, background-color 0.1s ease;
}

.sr-nav-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background-color: var(--border-color);
}

.sr-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.sr-nav-icon {
  width: clamp(10px, 0.8vw, 14px);
  height: clamp(10px, 0.8vw, 14px);
}

.sr-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 clamp(5px, 0.5vw, 10px);
  height: clamp(18px, 1.5vw, 24px);
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: clamp(9px, 0.7vw, 11px);
  font-weight: 500;
  font-family: var(--font-sans);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  transition: background-color 0.1s ease, transform 0.1s ease;
}

.sr-action-btn:hover:not(:disabled) {
  background-color: var(--bg-app);
}

.sr-action-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.sr-action-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.shortcut-badge {
  font-family: var(--font-sans);
  font-size: clamp(8px, 0.6vw, 10px);
  background-color: var(--border-color);
  color: var(--text-secondary);
  padding: 1px clamp(3px, 0.25vw, 5px);
  border-radius: 6px;
  border: 1px solid var(--border-color-active);
  font-weight: 500;
  user-select: none;
  flex-shrink: 0;
  white-space: nowrap;
}

.header-left-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-only-btn {
  padding: 4px !important;
  width: var(--ej-btn-size) !important;
  height: var(--ej-btn-size) !important;
  justify-content: center;
  box-sizing: border-box !important;
}

.icon-text-btn.danger {
  color: var(--text-primary) !important;
}

.icon-text-btn.danger:hover {
  background-color: rgba(239, 68, 68, 0.08) !important;
  color: #ef4444 !important;
}

/* Slide transition for view switcher */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

/* ─── Convert Dropdown ─── */
.convert-dropdown {
  position: relative;
}

.convert-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--primary-light, rgba(15, 23, 41, 0.08));
  color: var(--primary-color, #0f1729);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.convert-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: clamp(180px, 20vw, 240px);
  max-height: min(420px, 60vh);
  background: var(--bg-panel, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.12);
  z-index: 100;
  overflow-y: auto;
  overflow-x: hidden;
}

.convert-menu-header {
  font-size: clamp(9px, 0.8vw, 11px);
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  padding: clamp(6px, 0.8vw, 10px) clamp(10px, 1vw, 14px) clamp(4px, 0.5vw, 6px);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.convert-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: none;
  font-family: inherit;
  font-size: clamp(10.5px, 0.85vw, 12.5px);
  color: var(--text-primary, #0f1729);
  padding: clamp(5px, 0.55vw, 8px) clamp(10px, 1vw, 14px);
  cursor: pointer;
  transition: background 0.1s;
  text-align: left;
}

.convert-menu-item:hover {
  background: var(--bg-app, #f8fafc);
}

.convert-menu-item.active {
  background: var(--primary-light, rgba(15, 23, 41, 0.06));
  color: var(--primary-color, #0f1729);
  font-weight: 600;
}

.check-icon {
  width: clamp(11px, 0.9vw, 14px);
  height: clamp(11px, 0.9vw, 14px);
  color: var(--primary-color, #0f1729);
  flex-shrink: 0;
}

.convert-menu-footer {
  border-top: 1px solid var(--border-color, #e2e8f0);
  padding: clamp(4px, 0.4vw, 6px);
}

.convert-cancel-btn {
  width: 100%;
  border: none;
  background: none;
  font-family: inherit;
  font-size: clamp(10px, 0.75vw, 11.5px);
  color: var(--text-muted, #94a3b8);
  padding: clamp(4px, 0.4vw, 6px);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.1s;
}

.convert-cancel-btn:hover {
  background: var(--bg-app, #f1f5f9);
  color: #dc2626;
}

/* ─── Copy button snake ring animation ─── */
.copy-btn {
  position: relative;
  overflow: visible;
}
.snake-ring {
  position: absolute;
  inset: -2px;
  width: calc(100% + 4px);
  height: calc(100% + 4px);
  pointer-events: none;
}
.snake-rect {
  stroke-dasharray: 20 100;
  animation: snake-crawl 0.7s ease-out forwards;
}
@keyframes snake-crawl {
  0%   { stroke-dashoffset: 0; opacity: 1; }
  70%  { opacity: 1; }
  100% { stroke-dashoffset: -120; opacity: 0; }
}

/* Convert mode: hide tree/graph/table views */
.convert-mode-hint {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
}
</style>
