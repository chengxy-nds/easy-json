<script setup>
import { ref, computed, watch, onMounted, nextTick, inject } from 'vue'
import {
  Split, ArrowRightLeft, RefreshCw, Copy, SlidersHorizontal,
  FileJson, Check, AlertTriangle, Plus, Minus, FileCode, X, Trash2
} from 'lucide-vue-next'
import * as diff from 'diff'
import { useTabsDrag } from '../composables/useTabsDrag'

const showToast = inject('showToast')

const sortKeys = inject('sortKeys', ref(false))
const ignoreWhitespace = inject('ignoreWhitespace', ref(false))
const caseInsensitive = ref(false)

const copySuccessLeft = ref(false)
const copySuccessRight = ref(false)

const leftPaneRef = ref(null)
const rightPaneRef = ref(null)
const leftTextareaRef = ref(null)
const rightTextareaRef = ref(null)
const leftGutterRef = ref(null)
const rightGutterRef = ref(null)
const leftHighlightRef = ref(null)
const rightHighlightRef = ref(null)

const leftEditing = ref(false)
const rightEditing = ref(false)

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
    leftText: DEMO_LEFT, 
    rightText: DEMO_RIGHT, 
    leftError: null,
    rightError: null
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
    rightError: null
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

const closeAllTabs = () => {
  tabs.value = [{
    id: tabs.value[0].id,
    title: '对比 1',
    leftText: DEMO_LEFT,
    rightText: DEMO_RIGHT,
    leftError: null,
    rightError: null
  }]
  activeTabId.value = tabs.value[0].id
  saveComparerState()
  nextTick(checkTabsOverflow)
}

// JSON Validation Watchers to avoid side-effects in computed
const validateJson = (text, isLeft) => {
  const tab = activeTab.value
  if (!tab) return
  if (!text || !text.trim()) {
    if (isLeft) tab.leftError = null
    else tab.rightError = null
    return
  }
  try {
    JSON.parse(text)
    if (isLeft) tab.leftError = null
    else tab.rightError = null
  } catch (err) {
    if (isLeft) tab.leftError = `无效的 JSON: ${err.message}`
    else tab.rightError = `无效的 JSON: ${err.message}`
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
})

watch(() => tabs.value.length, () => {
  saveComparerState()
})

// Helper to check and format JSON strings
const getFormattedText = (rawText) => {
  if (!rawText || !rawText.trim()) return ''
  try {
    let parsed = JSON.parse(rawText)
    if (sortKeys.value) {
      parsed = sortJSONKeys(parsed)
    }
    return JSON.stringify(parsed, null, 2)
  } catch (err) {
    return rawText
  }
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
  return JSON.stringify(obj, null, 2)
}

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
      } catch (e) {}
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

// In-place Format and Minify Actions
const formatInputs = () => {
  const tab = activeTab.value
  if (!tab) return
  
  let success = false
  if (tab.leftText && tab.leftText.trim()) {
    try {
      tab.leftText = JSON.stringify(JSON.parse(tab.leftText), null, 2)
      tab.leftError = null
      success = true
    } catch (err) {
      tab.leftError = `格式化左侧失败: ${err.message}`
    }
  }
  if (tab.rightText && tab.rightText.trim()) {
    try {
      tab.rightText = JSON.stringify(JSON.parse(tab.rightText), null, 2)
      tab.rightError = null
      success = true
    } catch (err) {
      tab.rightError = `格式化右侧失败: ${err.message}`
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
      tab.leftText = JSON.stringify(JSON.parse(tab.leftText))
      tab.leftError = null
      success = true
    } catch (err) {
      tab.leftError = `压缩左侧失败: ${err.message}`
    }
  }
  if (tab.rightText && tab.rightText.trim()) {
    try {
      tab.rightText = JSON.stringify(JSON.parse(tab.rightText))
      tab.rightError = null
      success = true
    } catch (err) {
      tab.rightError = `压缩右侧失败: ${err.message}`
    }
  }
  if (success && showToast) {
    showToast('压缩成功')
  }
}

// Synchronized scrolling logic for diff panes
const handleLeftScroll = () => {
  if (activeScrollTarget.value === 'left' && leftPaneRef.value) {
    const scrollTop = leftPaneRef.value.scrollTop
    const scrollLeft = leftPaneRef.value.scrollLeft
    
    if (rightEditing.value && rightTextareaRef.value) {
      rightTextareaRef.value.scrollTop = scrollTop
      rightTextareaRef.value.scrollLeft = scrollLeft
      if (rightGutterRef.value) rightGutterRef.value.scrollTop = scrollTop
    } else if (rightPaneRef.value) {
      rightPaneRef.value.scrollTop = scrollTop
      rightPaneRef.value.scrollLeft = scrollLeft
    }
  }
}

const handleRightScroll = () => {
  if (activeScrollTarget.value === 'right' && rightPaneRef.value) {
    const scrollTop = rightPaneRef.value.scrollTop
    const scrollLeft = rightPaneRef.value.scrollLeft
    
    if (leftEditing.value && leftTextareaRef.value) {
      leftTextareaRef.value.scrollTop = scrollTop
      leftTextareaRef.value.scrollLeft = scrollLeft
      if (leftGutterRef.value) leftGutterRef.value.scrollTop = scrollTop
    } else if (leftPaneRef.value) {
      leftPaneRef.value.scrollTop = scrollTop
      leftPaneRef.value.scrollLeft = scrollLeft
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

const highlightedLeft = computed(() => {
  const tab = activeTab.value
  return applyJsonHighlight(tab?.leftText || '')
})

const highlightedRight = computed(() => {
  const tab = activeTab.value
  return applyJsonHighlight(tab?.rightText || '')
})

const isLeftMinified = computed(() => {
  const text = activeTab.value?.leftText || ''
  return !!text.trim() && !text.includes('\n')
})

const isRightMinified = computed(() => {
  const text = activeTab.value?.rightText || ''
  return !!text.trim() && !text.includes('\n')
})

// Synchronized scrolling logic for gutters inside textareas
const handleLeftTextareaScroll = () => {
  if (leftTextareaRef.value) {
    const scrollTop = leftTextareaRef.value.scrollTop
    const scrollLeft = leftTextareaRef.value.scrollLeft
    if (leftGutterRef.value) {
      leftGutterRef.value.scrollTop = scrollTop
    }
    if (leftHighlightRef.value) {
      leftHighlightRef.value.scrollTop = scrollTop
      leftHighlightRef.value.scrollLeft = scrollLeft
    }
    // Also scroll sync right diff pane or right textarea if left is active scroll target
    if (activeScrollTarget.value === 'left') {
      if (rightEditing.value && rightTextareaRef.value) {
        rightTextareaRef.value.scrollTop = scrollTop
        rightTextareaRef.value.scrollLeft = scrollLeft
        if (rightGutterRef.value) rightGutterRef.value.scrollTop = scrollTop
        if (rightHighlightRef.value) {
          rightHighlightRef.value.scrollTop = scrollTop
          rightHighlightRef.value.scrollLeft = scrollLeft
        }
      } else if (rightPaneRef.value) {
        rightPaneRef.value.scrollTop = scrollTop
        rightPaneRef.value.scrollLeft = scrollLeft
      }
    }
  }
}

const handleRightTextareaScroll = () => {
  if (rightTextareaRef.value) {
    const scrollTop = rightTextareaRef.value.scrollTop
    const scrollLeft = rightTextareaRef.value.scrollLeft
    if (rightGutterRef.value) {
      rightGutterRef.value.scrollTop = scrollTop
    }
    if (rightHighlightRef.value) {
      rightHighlightRef.value.scrollTop = scrollTop
      rightHighlightRef.value.scrollLeft = scrollLeft
    }
    // Also scroll sync left diff pane or left textarea if right is active scroll target
    if (activeScrollTarget.value === 'right') {
      if (leftEditing.value && leftTextareaRef.value) {
        leftTextareaRef.value.scrollTop = scrollTop
        leftTextareaRef.value.scrollLeft = scrollLeft
        if (leftGutterRef.value) leftGutterRef.value.scrollTop = scrollTop
        if (leftHighlightRef.value) {
          leftHighlightRef.value.scrollTop = scrollTop
          leftHighlightRef.value.scrollLeft = scrollLeft
        }
      } else if (leftPaneRef.value) {
        leftPaneRef.value.scrollTop = scrollTop
        leftPaneRef.value.scrollLeft = scrollLeft
      }
    }
  }
}

// Transition functions for editing state with scroll preservation
const startEditingLeft = () => {
  if (leftEditing.value) return
  const scrollTop = leftPaneRef.value ? leftPaneRef.value.scrollTop : 0
  const scrollLeft = leftPaneRef.value ? leftPaneRef.value.scrollLeft : 0
  
  leftEditing.value = true
  activeScrollTarget.value = 'left'
  nextTick(() => {
    if (leftTextareaRef.value) {
      leftTextareaRef.value.scrollTop = scrollTop
      leftTextareaRef.value.scrollLeft = scrollLeft
      leftTextareaRef.value.focus()
    }
  })
}

const startEditingRight = () => {
  if (rightEditing.value) return
  const scrollTop = rightPaneRef.value ? rightPaneRef.value.scrollTop : 0
  const scrollLeft = rightPaneRef.value ? rightPaneRef.value.scrollLeft : 0
  
  rightEditing.value = true
  activeScrollTarget.value = 'right'
  nextTick(() => {
    if (rightTextareaRef.value) {
      rightTextareaRef.value.scrollTop = scrollTop
      rightTextareaRef.value.scrollLeft = scrollLeft
      rightTextareaRef.value.focus()
    }
  })
}

const stopEditingLeft = () => {
  if (!leftEditing.value) return
  const scrollTop = leftTextareaRef.value ? leftTextareaRef.value.scrollTop : 0
  const scrollLeft = leftTextareaRef.value ? leftTextareaRef.value.scrollLeft : 0
  
  leftEditing.value = false
  
  // Auto-format Left if valid
  const tab = activeTab.value
  if (tab && tab.leftText) {
    try {
      const parsed = JSON.parse(tab.leftText)
      tab.leftText = JSON.stringify(parsed, null, 2)
      tab.leftError = null
    } catch (err) {
      // keep raw
    }
  }
  
  nextTick(() => {
    if (leftPaneRef.value) {
      leftPaneRef.value.scrollTop = scrollTop
      leftPaneRef.value.scrollLeft = scrollLeft
    }
  })
}

const stopEditingRight = () => {
  if (!rightEditing.value) return
  const scrollTop = rightTextareaRef.value ? rightTextareaRef.value.scrollTop : 0
  const scrollLeft = rightTextareaRef.value ? rightTextareaRef.value.scrollLeft : 0
  
  rightEditing.value = false
  
  // Auto-format Right if valid
  const tab = activeTab.value
  if (tab && tab.rightText) {
    try {
      const parsed = JSON.parse(tab.rightText)
      tab.rightText = JSON.stringify(parsed, null, 2)
      tab.rightError = null
    } catch (err) {
      // keep raw
    }
  }
  
  nextTick(() => {
    if (rightPaneRef.value) {
      rightPaneRef.value.scrollTop = scrollTop
      rightPaneRef.value.scrollLeft = scrollLeft
    }
  })
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
  const original = getFormattedText(tab.leftText)
  const modified = getFormattedText(tab.rightText)
  
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
        const minLines = Math.min(leftLines.length, rightLines.length)
        
        for (let j = 0; j < minLines; j++) {
          const lLine = leftLines[j]
          const rLine = rightLines[j]
          const charDiffs = diff.diffChars(lLine, rLine, options)
          
          const leftParts = charDiffs
            .filter(d => !d.added)
            .map(d => ({ text: d.value, highlight: !!d.removed }))
            
          const rightParts = charDiffs
            .filter(d => !d.removed)
            .map(d => ({ text: d.value, highlight: !!d.added }))
            
          rows.push({
            left: { lineNum: leftLineNum++, text: lLine, type: 'modified', parts: leftParts },
            right: { lineNum: rightLineNum++, text: rLine, type: 'modified', parts: rightParts }
          })
        }
        
        if (leftLines.length > rightLines.length) {
          for (let j = minLines; j < leftLines.length; j++) {
            rows.push({
              left: { lineNum: leftLineNum++, text: leftLines[j], type: 'removed' },
              right: { lineNum: '', text: '', type: 'empty' }
            })
          }
        } else if (rightLines.length > leftLines.length) {
          for (let j = minLines; j < rightLines.length; j++) {
            rows.push({
              left: { lineNum: '', text: '', type: 'empty' },
              right: { lineNum: rightLineNum++, text: rightLines[j], type: 'added' }
            })
          }
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
  tab.leftText = DEMO_LEFT
  tab.rightText = DEMO_RIGHT
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

const copyLeftText = () => {
  const tab = activeTab.value
  if (!tab || !tab.leftText) return
  navigator.clipboard.writeText(tab.leftText).then(() => {
    copySuccessLeft.value = true
    if (showToast) showToast('原始 JSON 已复制到剪贴板')
    setTimeout(() => { copySuccessLeft.value = false }, 2000)
  })
}

const copyRightText = () => {
  const tab = activeTab.value
  if (!tab || !tab.rightText) return
  navigator.clipboard.writeText(tab.rightText).then(() => {
    copySuccessRight.value = true
    if (showToast) showToast('对比 JSON 已复制到剪贴板')
    setTimeout(() => { copySuccessRight.value = false }, 2000)
  })
}

onMounted(() => {
  // Restore persisted tabs from localStorage
  try {
    const savedTabs = localStorage.getItem('ej_cmp_tabs')
    const savedActive = localStorage.getItem('ej_cmp_active')
    if (savedTabs) {
      const parsed = JSON.parse(savedTabs)
      if (Array.isArray(parsed) && parsed.length > 0) {
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
        return
      }
    }
  } catch (e) {}
  loadDemo()
  canSave = true
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
              <div class="edit-gutter" ref="leftGutterRef">
                <div v-for="n in leftLinesCount" :key="n" class="edit-line-number">{{ n }}</div>
              </div>
              <div class="textarea-overlay-container" :class="{ 'minify-wrap': isLeftMinified }">
                <pre
                  ref="leftHighlightRef"
                  class="editor-highlight"
                  aria-hidden="true"
                  v-html="highlightedLeft || '<span class=\'placeholder\'>粘贴或输入左侧 JSON...</span>'"
                ></pre>
                <textarea 
                  v-model="activeTab.leftText" 
                  class="edit-textarea" 
                  ref="leftTextareaRef"
                  @scroll="handleLeftTextareaScroll"
                  @mouseenter="activeScrollTarget = 'left'"
                  @touchstart="activeScrollTarget = 'left'"
                  @focus="activeScrollTarget = 'left'"
                  @blur="stopEditingLeft"
                  placeholder=""
                  spellcheck="false"
                ></textarea>
              </div>
            </div>

            <!-- View / Diff Mode -->
            <div 
              v-else 
              class="panel-body scroll-container clickable-pane" 
              ref="leftPaneRef" 
              @scroll="handleLeftScroll"
              @mouseenter="activeScrollTarget = 'left'"
              @touchstart="activeScrollTarget = 'left'"
              @click="startEditingLeft"
            >
              <!-- Empty state -->
              <div v-if="!activeTab.leftText" class="empty-placeholder">
                <div class="placeholder-content">
                  <FileJson class="placeholder-icon" />
                  <span>点击此处输入/粘贴左侧 JSON</span>
                </div>
              </div>

              <!-- Lines wrapper -->
              <div v-else class="diff-lines-wrapper" :class="{ 'minify-wrap': isLeftMinified }">
                <div v-for="(row, idx) in alignedDiff" :key="'l-' + idx" class="diff-line-row" :class="row.left.type">
                  <div class="line-number">{{ row.left.lineNum }}</div>
                  <div class="line-marker">
                    <span v-if="row.left.type === 'removed'">-</span>
                    <span v-else-if="row.left.type === 'modified'">~</span>
                  </div>
                  <div class="line-code">
                    <template v-if="row.left.parts">
                      <span 
                        v-for="(part, pidx) in row.left.parts" 
                        :key="pidx" 
                        :class="{ 'word-removed': part.highlight }"
                      >{{ part.text }}</span>
                    </template>
                    <template v-else>
                      {{ row.left.text }}
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error Banner -->
            <div v-if="activeTab.leftError" class="input-error-banner">
              <AlertTriangle class="banner-icon" />
              <span>{{ activeTab.leftError }}</span>
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
                  @click.stop="swapInputs" 
                  data-tooltip-bottom="交换两侧 JSON"
                  style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
                >
                  <ArrowRightLeft class="btn-icon" />
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
              <div class="edit-gutter" ref="rightGutterRef">
                <div v-for="n in rightLinesCount" :key="n" class="edit-line-number">{{ n }}</div>
              </div>
              <div class="textarea-overlay-container" :class="{ 'minify-wrap': isRightMinified }">
                <pre
                  ref="rightHighlightRef"
                  class="editor-highlight"
                  aria-hidden="true"
                  v-html="highlightedRight || '<span class=\'placeholder\'>粘贴或输入右侧 JSON...</span>'"
                ></pre>
                <textarea 
                  v-model="activeTab.rightText" 
                  class="edit-textarea" 
                  ref="rightTextareaRef"
                  @scroll="handleRightTextareaScroll"
                  @mouseenter="activeScrollTarget = 'right'"
                  @touchstart="activeScrollTarget = 'right'"
                  @focus="activeScrollTarget = 'right'"
                  @blur="stopEditingRight"
                  placeholder=""
                  spellcheck="false"
                ></textarea>
              </div>
            </div>

            <!-- View / Diff Mode -->
            <div 
              v-else 
              class="panel-body scroll-container clickable-pane" 
              ref="rightPaneRef" 
              @scroll="handleRightScroll"
              @mouseenter="activeScrollTarget = 'right'"
              @touchstart="activeScrollTarget = 'right'"
              @click="startEditingRight"
            >
              <!-- Empty state -->
              <div v-if="!activeTab.rightText" class="empty-placeholder">
                <div class="placeholder-content">
                  <FileJson class="placeholder-icon" />
                  <span>点击此处输入/粘贴右侧 JSON</span>
                </div>
              </div>

              <!-- Lines wrapper -->
              <div v-else class="diff-lines-wrapper" :class="{ 'minify-wrap': isRightMinified }">
                <div v-for="(row, idx) in alignedDiff" :key="'r-' + idx" class="diff-line-row" :class="row.right.type">
                  <div class="line-number">{{ row.right.lineNum }}</div>
                  <div class="line-marker">
                    <span v-if="row.right.type === 'added'">+</span>
                    <span v-else-if="row.right.type === 'modified'">~</span>
                  </div>
                  <div class="line-code">
                    <template v-if="row.right.parts">
                      <span 
                        v-for="(part, pidx) in row.right.parts" 
                        :key="pidx" 
                        :class="{ 'word-added': part.highlight }"
                      >{{ part.text }}</span>
                    </template>
                    <template v-else>
                      {{ row.right.text }}
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error Banner -->
            <div v-if="activeTab.rightError" class="input-error-banner">
              <AlertTriangle class="banner-icon" />
              <span>{{ activeTab.rightError }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Bottom Stats Bar -->
    <div class="comparer-status-bar">
      <div class="instruction-badge" style="margin-right: 16px;">
        <SlidersHorizontal class="badge-icon" />
        <span>点击窗格即可编辑，鼠标移出自动对比</span>
      </div>
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
  background-color: var(--bg-panel);
  border-top: 1px solid var(--border-color);
  padding: 0 16px;
  height: 28px;
  flex-shrink: 0;
}

.comparer-status-bar .stat-badge {
  font-size: 11px;
  padding: 1px 6px;
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

.action-btn.icon-only {
  padding: 0 !important;
  width: 28px !important;
  height: 28px !important;
  justify-content: center;
  box-sizing: border-box !important;
  background: #e3e3e3;
    box-shadow: 20px 20px 60px #c1c1c1, -20px -20px 60px #ffffff;
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
  height: clamp(36px, 4vw, 50px) !important;
  min-height: clamp(36px, 4vw, 50px) !important;
  max-height: clamp(36px, 4vw, 50px) !important;
  padding: 0 10px !important;
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
  width: 40px;
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  overflow: hidden;
  user-select: none;
  flex-shrink: 0;
}

.edit-line-number {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  text-align: right;
  padding-right: 6px;
  color: var(--text-muted);
  height: 20.15px;
}

.edit-textarea {
  flex-grow: 1;
  border: none;
  background-color: transparent;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  padding: 8px 12px;
  outline: none;
  resize: none;
  white-space: pre;
  overflow: auto;
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
}

.input-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: var(--error-bg);
  border-top: 1px solid rgba(239, 68, 68, 0.15);
  color: var(--error-text);
  font-size: 12px;
  font-weight: 500;
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

.diff-lines-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 0;
}

/* Aligned Diff line row styling */
.diff-line-row {
  display: flex;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  width: 100%;
}

.line-number {
  width: 40px;
  text-align: right;
  padding-right: 6px;
  color: var(--text-muted);
  font-size: 11px;
  user-select: none;
  border-right: 1px solid var(--border-color);
  margin-right: 8px;
  flex-shrink: 0;
}

.line-marker {
  width: 12px;
  text-align: center;
  font-weight: 600;
  user-select: none;
  margin-right: 6px;
  flex-shrink: 0;
}

.line-code {
  flex-grow: 1;
  white-space: pre;
  padding-right: 16px;
}

/* Diff Types Styling */
.diff-line-row.added {
  background-color: var(--diff-added-bg);
}
.diff-line-row.added .line-number {
  background-color: rgba(34, 197, 94, 0.05);
}
.diff-line-row.added .line-marker {
  color: var(--success-text);
}

.diff-line-row.removed {
  background-color: var(--diff-removed-bg);
}
.diff-line-row.removed .line-number {
  background-color: rgba(239, 68, 68, 0.05);
}
.diff-line-row.removed .line-marker {
  color: var(--error-text);
}

.diff-line-row.modified {
  background-color: var(--diff-modified-bg);
}
.diff-line-row.modified .line-marker {
  color: #d97706;
}
.dark-mode .diff-line-row.modified .line-marker {
  color: #fbbf24;
}

/* Empty spacer line - Stripe pattern */
.diff-line-row.empty {
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 8px,
    var(--border-color) 8px,
    var(--border-color) 16px
  );
  opacity: 0.2;
  height: 19.375px; /* 12.5px × 1.55 */
}
.diff-line-row.empty .line-number {
  border-right: 1px solid var(--border-color);
  background-color: transparent;
}

/* Character level word highlighting */
.word-added {
  background-color: var(--diff-added-word-bg);
  border-radius: 6px;
  padding: 1px 0;
  font-weight: 500;
}

.word-removed {
  background-color: var(--diff-removed-word-bg);
  border-radius: 6px;
  padding: 1px 0;
  font-weight: 500;
  text-decoration: line-through;
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

</style>
