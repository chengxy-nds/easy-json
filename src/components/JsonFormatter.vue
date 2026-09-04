<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated, inject, provide, nextTick } from 'vue'
import { useTabsDrag } from '../composables/useTabsDrag'
import {
  Copy, Download, UploadCloud, Check, Trash2,
  AlertTriangle, Braces, Eye, EyeOff, FileJson, ArrowRightLeft, Shuffle,
  ChevronDown, ChevronRight, ChevronUp, ChevronLeft, HelpCircle, Minimize2, Code, Search, Plus, X,
  Network, Table2, Menu, FileCode, Maximize2, Strikethrough, ListTree,
  Pencil, ArrowLeft, ArrowRight, Wand2, GripVertical, ArrowLeftToLine, ArrowRightToLine, MoreHorizontal,
  ShieldCheck, Workflow,
  Smartphone, IdCard, Mail, CreditCard, Globe,
  Car, Building2, BookUser, Database
} from 'lucide-vue-next'
import JsonTreeNode   from './JsonTreeNode.vue'
import JsonGraphView  from './JsonGraphView.vue'
import JsonTableView  from './JsonTableView.vue'
import ImportDropdown from './ImportDropdown.vue'
import ImagePreviewPopover from './ImagePreviewPopover.vue'
import MaskKeyTreePicker from './MaskKeyTreePicker.vue'
import { extractJsonFromText, convertJsObjectToJson, safeParseJsLike, tryParseCandidate } from '../utils/jsonExtractor.js';
import { convertJson, formatLabels, getFormatExtension } from '../utils/jsonConverter.js';
import { safeParse, safeStringify } from '../utils/jsonBigInt.js';
import { maskJsonData, extractAllKeys } from '../utils/dataMasker.js';
import { queryJsonPath } from '../utils/jsonPath.js';
import { isImageUrl } from '../utils/imageDetector.js';

const showToast = inject('showToast')

const indentSize = ref('2') // '2' | '4' | 'tab' | 'minify'
const sortKeys = inject('sortKeys', ref(false))
const autoFormat = inject('autoFormat', ref(false))
const autoCopy = inject('autoCopy', ref(false))
const autoExtract = inject('autoExtract', ref(true))
const autoPaste = inject('autoPaste', ref(false))
const incomingExtractText = inject('incomingExtractText', ref(null))
const formatterLastPasted = ref('')

const editorFontSize = inject('editorFontSize', ref(12))
const showLineNumbers = inject('showLineNumbers', ref(true))

const editorLineHeight = computed(() => {
  const size = Number(editorFontSize.value) || 12
  const map = { 11: 18, 12: 20, 13: 20, 14: 22, 15: 23, 16: 24, 18: 26, 20: 28 }
  return map[size] || Math.round(size * 1.6)
})

watch(editorFontSize, () => {
  nextTick(() => {
    syncGutterScroll()
  })
})

const copySuccess = ref(false)
const gutterRef = ref(null)
const textareaRef = ref(null)
const inputHighlightRef = ref(null)
const outputPreRef = ref(null)
const outputGutterRef = ref(null)
const hoveredPath = ref(null)
const setHoveredPath = (path) => {
  hoveredPath.value = path
}
const selectedPath = ref(null)
const selectedType = ref('all') // 'key' | 'value' | 'all'
const setSelectedPath = (path, type = 'all') => {
  selectedPath.value = path
  selectedType.value = type
}
const searchQuery = ref('')
const searchExpanded = ref(false)

// ── 图片悬停预览状态与提供者 ──
const imagePreviewState = ref({
  visible: false,
  url: '',
  targetRect: null
})

let imagePreviewShowTimer = null
let imagePreviewHideTimer = null

const showImagePreview = (url, targetElOrRect) => {
  if (imagePreviewHideTimer) {
    clearTimeout(imagePreviewHideTimer)
    imagePreviewHideTimer = null
  }
  if (!url) return

  if (imagePreviewShowTimer) clearTimeout(imagePreviewShowTimer)

  imagePreviewShowTimer = setTimeout(() => {
    let rect = null
    if (targetElOrRect instanceof HTMLElement) {
      rect = targetElOrRect.getBoundingClientRect()
    } else if (targetElOrRect && typeof targetElOrRect === 'object') {
      rect = targetElOrRect
    }
    imagePreviewState.value = {
      visible: true,
      url,
      targetRect: rect
    }
  }, 120)
}

const hideImagePreview = (immediate = false) => {
  if (imagePreviewShowTimer) {
    clearTimeout(imagePreviewShowTimer)
    imagePreviewShowTimer = null
  }
  if (immediate) {
    if (imagePreviewHideTimer) clearTimeout(imagePreviewHideTimer)
    imagePreviewState.value.visible = false
    return
  }
  if (imagePreviewHideTimer) clearTimeout(imagePreviewHideTimer)
  imagePreviewHideTimer = setTimeout(() => {
    imagePreviewState.value.visible = false
  }, 120)
}

const onPopoverEnter = () => {
  if (imagePreviewHideTimer) {
    clearTimeout(imagePreviewHideTimer)
    imagePreviewHideTimer = null
  }
}

const onPopoverLeave = () => {
  hideImagePreview(false)
}

provide('imagePreview', {
  show: showImagePreview,
  hide: hideImagePreview
})
const searchInputRef = ref(null)
const replaceText = ref('')
const replaceExpanded = ref(false)
const replaceInputRef = ref(null)
const currentMatchIndex = ref(0)
const totalMatches = ref(0)
const isTextareaFocused = ref(false)

// 导入文本回调（由 ImportDropdown 触发）
const handleImportText = (text) => {
  if (activeTab.value) {
    activeTab.value.inputText = text
    activeTab.value._unsortedText = null
    if (activeTabId.value !== activeTab.value.id) {
      activeTabId.value = activeTab.value.id
    }
  }
}
// ─── 转换状态 ───
const showConvertMenu = ref(false)
const copyConvertedSuccess = ref(false)
const convertFormat = computed({
  get: () => activeTab.value?.convertFormat || null,
  set: (val) => { if (activeTab.value) activeTab.value.convertFormat = val }
})
provide('searchQuery', searchQuery)
provide('setHoveredPath', setHoveredPath)
provide('hoveredPath', hoveredPath)
provide('selectedPath', selectedPath)
provide('selectedType', selectedType)
provide('setSelectedPath', setSelectedPath)

const expandSearch = () => {
  showJsonPathBar.value = false
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
    showJsonPathBar.value = false
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
    // 1. 左侧输入编辑区：根据高亮层中的 .search-match-current 滚动 textarea
    const inputContainer = inputHighlightRef.value
    const textarea = textareaRef.value
    if (inputContainer && textarea) {
      const target = inputContainer.querySelector('.search-match-current')
      if (target) {
        const relativeTop = targetRect.top - containerRect.top
        const relativeLeft = targetRect.left - containerRect.left

        textarea.scrollTo({
          top: Math.max(0, relativeTop - textarea.clientHeight / 2 + targetRect.height / 2),
          left: Math.max(0, relativeLeft - textarea.clientWidth / 4),
          behavior: 'smooth'
        })
        syncGutterScroll()
      }
    }

    // 2. 右侧代码视图：根据 outputPre 中的 .search-match-current 滚动
    if (outputPreRef.value) {
      const outputTarget = outputPreRef.value.querySelector('.search-match-current')
      if (outputTarget) {
        const targetRect = outputTarget.getBoundingClientRect()
        const containerRect = outputPreRef.value.getBoundingClientRect()
        const relativeTop = targetRect.top - containerRect.top + outputPreRef.value.scrollTop
        const relativeLeft = targetRect.left - containerRect.left + outputPreRef.value.scrollLeft

        outputPreRef.value.scrollTo({
          top: Math.max(0, relativeTop - outputPreRef.value.clientHeight / 2 + targetRect.height / 2),
          left: Math.max(0, relativeLeft - outputPreRef.value.clientWidth / 4),
          behavior: 'smooth'
        })
      }
    }

    // 3. 右侧树形视图：滚动到对应匹配节点
    if (treeWrapperRef.value) {
      const treeTarget = treeWrapperRef.value.querySelector('.search-match-current') || treeWrapperRef.value.querySelector('.search-match')
      if (treeTarget) {
        treeTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  })
}

// 点击底部校验错误信息时，自动定位并滚动到错误所在行
const scrollToErrorLine = () => {
  const tab = activeTab.value
  if (!tab) return

  const textarea = textareaRef.value
  if (!textarea) return

  const targetLine = tab.errorLine || 1
  const lines = (tab.inputText || '').split('\n')
  const targetLineIdx = Math.max(0, Math.min(targetLine - 1, lines.length - 1))

  // 1. 精确计算目标行在编辑区内容中的绝对像素高度（顶端 8px 内边距 + 行号 * 行高）
  const targetTop = 8 + targetLineIdx * editorLineHeight.value
  const targetScrollTop = Math.max(0, targetTop - textarea.clientHeight / 2 + 10)

  // 2. 平滑滚动定位到错误所在行居中显示
  textarea.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth'
  })
  syncGutterScroll()

  // 3. 设置光标选区并聚焦输入框（防止浏览器原生 focus 强跳）
  let charIndex = 0
  for (let i = 0; i < targetLineIdx; i++) {
    charIndex += lines[i].length + 1
  }
  const lineLen = lines[targetLineIdx]?.length || 0
  textarea.focus({ preventScroll: true })
  textarea.setSelectionRange(charIndex, charIndex + lineLen)

  // 4. 为错误行添加瞬时闪烁强调动画
  nextTick(() => {
    if (inputHighlightRef.value) {
      const errEl = inputHighlightRef.value.querySelector('.editor-line.has-error')
      if (errEl) {
        errEl.classList.remove('token-highlight-blink')
        void errEl.offsetWidth
        errEl.classList.add('token-highlight-blink')
      }
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

watch(searchQuery, (newVal) => {
  currentMatchIndex.value = 0
  if (newVal) {
    scrollToCurrentMatch()
  }
})

watch(currentMatchIndex, () => {
  scrollToCurrentMatch()
})



// 当前激活展示的路径：鼠标悬停优先，鼠标离开时回退展示光标/点击锁定的路径（JSON 校验失败时不展示）
const activeDisplayPath = computed(() => {
  if (activeTab.value?.validationError) return null
  return hoveredPath.value || selectedPath.value || null
})

// 格式化当前路径为完整的 JSON 路径字符串（支持数字下标与特殊字符）
const hoveredPathStr = computed(() => {
  if (activeTab.value?.validationError) return ''
  const path = activeDisplayPath.value
  if (!path || !Array.isArray(path) || path.length === 0) {
    return ''
  }
  let res = '$'
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]
    if (typeof segment === 'number' || /^\d+$/.test(String(segment))) {
      res += `[${segment}]`
    } else {
      const segStr = String(segment)
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segStr)) {
        res += `.${segStr}`
      } else {
        res += `["${segStr.replace(/"/g, '\\"')}"]`
      }
    }
  }
  return res
})

// 计算当前路径的面包屑分段列表（如：$ > resources > images > [0] > description）
const pathBreadcrumbs = computed(() => {
  if (activeTab.value?.validationError) return []
  const path = activeDisplayPath.value
  if (!path || !Array.isArray(path) || path.length === 0) {
    return []
  }
  const crumbs = [{ label: '$', path: [], fullPathStr: '$', isRoot: true }]
  let currentAccumulated = []
  
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]
    currentAccumulated.push(seg)
    const isNum = typeof seg === 'number' || /^\d+$/.test(String(seg))
    const displayLabel = isNum ? `[${seg}]` : String(seg)
    
    // 计算截至当前层级的 full JSONPath 字符串 (如 $.resources.images[0].description)
    let fullStr = '$'
    for (let j = 0; j < currentAccumulated.length; j++) {
      const s = currentAccumulated[j]
      if (typeof s === 'number' || /^\d+$/.test(String(s))) {
        fullStr += `[${s}]`
      } else {
        const segText = String(s)
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segText)) {
          fullStr += `.${segText}`
        } else {
          fullStr += `["${segText.replace(/"/g, '\\"')}"]`
        }
      }
    }
    
    crumbs.push({
      label: displayLabel,
      path: [...currentAccumulated],
      fullPathStr: fullStr,
      isIndex: isNum
    })
  }
  return crumbs
})

const copyBreadcrumbPath = (crumb) => {
  if (!crumb || !crumb.fullPathStr) return
  if (navigator.clipboard) {
    navigator.clipboard.writeText(crumb.fullPathStr).then(() => {
      if (showToast) showToast(`已复制路径: ${crumb.fullPathStr}`)
    }).catch(() => {
      if (showToast) showToast('复制失败', 'error')
    })
  }
}

const copyHoveredPath = () => {
  if (!hoveredPathStr.value) return
  if (navigator.clipboard) {
    navigator.clipboard.writeText(hoveredPathStr.value).then(() => {
      if (showToast) showToast(`已复制路径: ${hoveredPathStr.value}`)
    }).catch(() => {
      if (showToast) showToast('复制失败', 'error')
    })
  }
}

// 根据 textarea 光标位置自动锁定当前所在行的键/值路径
const updateCursorPath = () => {
  if (activeTab.value?.validationError) {
    selectedPath.value = null
    return
  }
  const textarea = textareaRef.value
  const highlightContainer = inputHighlightRef.value
  if (!textarea || !highlightContainer) return
  
  const textBefore = textarea.value.substring(0, textarea.selectionStart || 0)
  const lineNum = textBefore.split('\n').length
  const lines = highlightContainer.querySelectorAll('.editor-line')
  if (lines && lines[lineNum - 1]) {
    const lineEl = lines[lineNum - 1]
    const keyEl = lineEl.querySelector('.json-key[data-path]')
    const valEl = lineEl.querySelector('.json-string[data-path], .json-number[data-path], .json-boolean[data-path], .json-null[data-path]')
    
    const curPosInLine = (textarea.selectionStart || 0) - (textBefore.lastIndexOf('\n') + 1)
    const lineText = lineEl.textContent || ''
    const colonIdx = lineText.indexOf(':')
    
    if (colonIdx !== -1 && curPosInLine > colonIdx && valEl) {
      const pathAttr = valEl.getAttribute('data-path')
      if (pathAttr) {
        try {
          selectedPath.value = JSON.parse(pathAttr)
          selectedType.value = 'value'
          return
        } catch (e) {}
      }
    } else if (keyEl) {
      const pathAttr = keyEl.getAttribute('data-path')
      if (pathAttr) {
        try {
          selectedPath.value = JSON.parse(pathAttr)
          selectedType.value = 'key'
          return
        } catch (e) {}
      }
    } else {
      const anyEl = lineEl.querySelector('[data-path]')
      if (anyEl) {
        const pathAttr = anyEl.getAttribute('data-path')
        if (pathAttr) {
          try {
            selectedPath.value = JSON.parse(pathAttr)
            selectedType.value = 'all'
            return
          } catch (e) {}
        }
      }
    }
  }
}

const handleOutputPreMouseMove = (e) => {
  let current = e.target
  let pathAttr = null
  let stringEl = null

  while (current && current !== outputPreRef.value) {
    if (!pathAttr) pathAttr = current.getAttribute?.('data-path')
    if (!stringEl && current.classList?.contains('json-string')) {
      stringEl = current
    }
    current = current.parentElement
  }

  // 1. 检查是否悬停在图片字符串上
  if (stringEl) {
    const rawVal = stringEl.textContent?.trim().replace(/^"|"$/g, '').replace(/^\\"|\\"$/g, '')
    if (rawVal && isImageUrl(rawVal)) {
      showImagePreview(rawVal, stringEl)
    } else {
      hideImagePreview()
    }
  } else {
    hideImagePreview()
  }

  // 2. 检查 data-path
  if (pathAttr) {
    try {
      const path = JSON.parse(pathAttr)
      setHoveredPath(path)
      return
    } catch (err) {}
  }
  setHoveredPath(null)
}

const handleOutputPreMouseLeave = () => {
  setHoveredPath(null)
  hideImagePreview()
}

const handleOutputPreClick = (e) => {
  // If user selected text with mouse drag, don't trigger copy on click
  const selection = window.getSelection()
  if (selection && selection.toString().length > 0) return

  let current = e.target
  let pathAttr = null
  let targetType = null
  let rawText = null
  let tokenEl = null

  while (current && !current.classList?.contains('output-pre')) {
    if (!pathAttr) pathAttr = current.getAttribute?.('data-path')
    
    if (current.classList) {
      if (current.classList.contains('json-key')) {
        targetType = 'key'
        rawText = current.textContent
        tokenEl = current
        break
      } else if (current.classList.contains('json-string') ||
                 current.classList.contains('json-number') ||
                 current.classList.contains('json-boolean') ||
                 current.classList.contains('json-null')) {
        targetType = 'val'
        rawText = current.textContent
        tokenEl = current
        break
      } else if (current.classList.contains('json-bracket')) {
        targetType = 'bracket'
        tokenEl = current
        break
      }
    }
    current = current.parentElement
  }

  let parsedPath = null
  if (pathAttr) {
    try {
      parsedPath = JSON.parse(pathAttr)
      setSelectedPath(parsedPath)
    } catch (err) {}
  }

  if (targetType === 'key' && rawText) {
    const cleanKey = rawText.trim().replace(/^"|"$/g, '').replace(/^\\"|\\"$/g, '')
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cleanKey).then(() => {
        if (showToast) showToast(`已复制键名: ${cleanKey}`)
      }).catch(() => {})
    }
  } else if (targetType === 'val' && rawText) {
    let cleanVal = rawText.trim()
    if (tokenEl && tokenEl.classList && tokenEl.classList.contains('json-string')) {
      cleanVal = cleanVal.replace(/^"|"$/g, '').replace(/^\\"|\\"$/g, '')
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cleanVal).then(() => {
        const preview = cleanVal.length > 30 ? cleanVal.slice(0, 27) + '...' : cleanVal
        if (showToast) showToast(`已复制键值: ${preview}`)
      }).catch(() => {})
    }
  } else if (targetType === 'bracket' && parsedPath && activeTab.value?.parsedObj) {
    try {
      let targetObj = activeTab.value.parsedObj
      for (const seg of parsedPath) {
        if (targetObj && typeof targetObj === 'object') {
          targetObj = targetObj[seg]
        }
      }
      if (targetObj !== undefined) {
        const jsonStr = safeStringify(targetObj, null, 2)
        if (navigator.clipboard) {
          navigator.clipboard.writeText(jsonStr).then(() => {
            if (showToast) showToast('已复制子树 JSON')
          }).catch(() => {})
        }
      }
    } catch (err) {}
  }
}

watch(hoveredPath, (newPath) => {
  const container = inputHighlightRef.value
  if (!container) return
  
  // 1. Remove highlight class from all elements
  const prevHighlight = container.querySelectorAll('.line-highlight-hover')
  prevHighlight.forEach(el => el.classList.remove('line-highlight-hover'))
  
  // Only highlight if we are in graph or table view mode
  const currentMode = activeTab.value?.viewMode
  if (currentMode !== 'graph' && currentMode !== 'table') {
    return
  }
  
  // Only highlight if hover is driven by the right-side panel
  if (activeScrollTarget.value !== 'right') {
    return
  }
  
  // 2. Add highlight class to matching elements
  if (newPath && newPath.length > 0) {
    const pathStr = JSON.stringify(newPath)
    const elements = container.querySelectorAll('[data-path]')
    for (const el of elements) {
      if (el.getAttribute('data-path') === pathStr) {
        el.classList.add('line-highlight-hover')
        break
      }
    }
  }
})

const handlePathClick = (path, type = 'all') => {
  if (!path) return
  setSelectedPath(path, type)
  
  const highlightContainer = inputHighlightRef.value
  if (!highlightContainer) return
  
  const pathStr = JSON.stringify(path)
  const elements = highlightContainer.querySelectorAll('[data-path]')
  let targetEl = null
  
  for (const el of elements) {
    if (el.getAttribute('data-path') === pathStr) {
      if (type === 'key' && el.classList.contains('json-key')) {
        targetEl = el
        break
      } else if (type === 'value' && !el.classList.contains('json-key') && !el.classList.contains('editor-line')) {
        targetEl = el
        break
      } else if (!targetEl && !el.classList.contains('editor-line')) {
        targetEl = el
      }
    }
  }

  if (!targetEl) {
    for (let i = path.length - 1; i >= 1; i--) {
      const prefixStr = JSON.stringify(path.slice(0, i))
      for (const el of elements) {
        if (el.getAttribute('data-path') === prefixStr && !el.classList.contains('editor-line')) {
          targetEl = el
          break
        }
      }
      if (targetEl) break
    }
  }
  
  if (targetEl && textareaRef.value) {
    const containerTop = highlightContainer.getBoundingClientRect().top
    const targetTop = targetEl.getBoundingClientRect().top
    const currentScrollTop = textareaRef.value.scrollTop
    const targetRelativeTop = (targetTop - containerTop) + currentScrollTop
    const containerHeight = textareaRef.value.clientHeight
    const targetHeight = targetEl.getBoundingClientRect().height || 20
    const desiredScrollTop = targetRelativeTop - (containerHeight / 2) + (targetHeight / 2)
    
    textareaRef.value.scrollTo({
      top: Math.max(0, desiredScrollTop),
      behavior: 'smooth'
    })
    
    // Add clicked highlight blink animation to the specific token
    targetEl.classList.add('token-highlight-blink')
    setTimeout(() => {
      targetEl.classList.remove('token-highlight-blink')
    }, 1500)
  }
}

watch([selectedPath, selectedType], ([newPath, newType]) => {
  const container = inputHighlightRef.value
  if (!container) return
  
  // 1. Clear previous line and token selections
  const prevSelected = container.querySelectorAll('.token-highlight-selected, .is-selected-line')
  prevSelected.forEach(el => el.classList.remove('token-highlight-selected', 'is-selected-line'))
  
  // 只有在 表格模式和拓扑图模式才要加 左侧编辑区的选中样式
  const currentMode = activeTab.value?.viewMode
  if (currentMode !== 'graph' && currentMode !== 'table') {
    return
  }

  if (!newPath || newPath.length === 0) return
  const pathStr = JSON.stringify(newPath)
  const elements = container.querySelectorAll('[data-path]')
  
  let targetToken = null
  for (const el of elements) {
    if (el.getAttribute('data-path') === pathStr) {
      if (newType === 'key' && el.classList.contains('json-key')) {
        targetToken = el
        break
      } else if (newType === 'value' && !el.classList.contains('json-key') && !el.classList.contains('editor-line')) {
        targetToken = el
        break
      } else if (!targetToken && !el.classList.contains('editor-line')) {
        targetToken = el
      }
    }
  }

  if (!targetToken) {
    for (let i = newPath.length - 1; i >= 1; i--) {
      const prefixStr = JSON.stringify(newPath.slice(0, i))
      for (const el of elements) {
        if (el.getAttribute('data-path') === prefixStr && !el.classList.contains('editor-line')) {
          targetToken = el
          break
        }
      }
      if (targetToken) break
    }
  }

  if (targetToken) {
    // 2. Pop the specific selected key or value token
    targetToken.classList.add('token-highlight-selected')
    // 3. Highlight the entire parent editor-line
    const parentLine = targetToken.closest('.editor-line')
    if (parentLine) {
      parentLine.classList.add('is-selected-line')
    }
  } else {
    for (const el of elements) {
      if (el.getAttribute('data-path') === pathStr) {
        const line = el.classList.contains('editor-line') ? el : el.closest('.editor-line')
        if (line) line.classList.add('is-selected-line')
        break
      }
    }
  }
}, { immediate: true })

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
    inputText: '',
    outputText: '',
    parsedObj: null,
    validationError: null,
    errorLine: null,
    duplicateLines: [],
    viewMode: 'tree',
    convertFormat: null,
    extractedFormat: null
  }
])
const activeTabId = ref(1)
const { tabsListRef, tabsOverflow, onMouseDown: onTabsMouseDown, onWheel: onTabsWheel, scrollToEnd: scrollTabsToEnd, scrollToActive: scrollTabsToActive, checkOverflow: checkTabsOverflow } = useTabsDrag(activeTabId)

const activeTab = computed(() => {
  return tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]
})

watch(() => activeTab.value?.viewMode, (mode) => {
  const container = inputHighlightRef.value
  if (!container) return
  const prevSelected = container.querySelectorAll('.token-highlight-selected, .is-selected-line, .line-highlight-hover')
  prevSelected.forEach(el => el.classList.remove('token-highlight-selected', 'is-selected-line', 'line-highlight-hover'))
  
  if ((mode === 'graph' || mode === 'table') && selectedPath.value) {
    const p = selectedPath.value
    const t = selectedType.value
    selectedPath.value = null
    nextTick(() => {
      selectedPath.value = p
      selectedType.value = t
    })
  }
})


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
    viewMode: 'tree',
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

// 监听来自扩展的无刷新推送文本（右键"智能提取"）
watch(incomingExtractText, (text) => {
  if (!text) return
  const newId = nextTabId++
  const num = nextDisplayNumber()
  tabs.value.push({
    id: newId,
    title: `格式化 ${num}`,
    inputText: text,
    outputText: '',
    parsedObj: null,
    validationError: null,
    errorLine: null,
    duplicateLines: [],
    viewMode: 'tree',
    convertFormat: null,
    extractedFormat: null
  })
  activeTabId.value = newId
  scrollTabsToEnd()
  nextTick(() => applyAutoExtract(tabs.value.find(t => t.id === newId)))
  incomingExtractText.value = null
}, { immediate: true })

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

const closeOtherTabs = () => {
  const targetId = tabContextMenu.value.tabId
  if (tabs.value.length <= 1) return
  tabs.value = tabs.value.filter(t => t.id === targetId)
  activeTabId.value = targetId
  saveFormatterState()
  nextTick(checkTabsOverflow)
}

const closeAllTabs = () => {
  tabs.value = [{
    id: tabs.value[0].id,
    title: '格式化 1',
    inputText: '',
    outputText: '',
    parsedObj: null,
    validationError: null,
    errorLine: null,
    duplicateLines: [],
    viewMode: 'tree',
    convertFormat: null,
    extractedFormat: null
  }]
  activeTabId.value = tabs.value[0].id
  saveFormatterState()
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

// 从 JSON 错误中提取精准行列号（优先扫描原始文本定位，兼容 Chrome/V8、Firefox 和 Safari）
// 并自动修正"缺逗号导致报错偏移一行"的常见误报
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

  // 1. 优先使用精确定位器扫描原始输入文本（最准确，不受 safeParse/BigInt 转换及各浏览器报错差异影响）
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

  // 4. 启发式修正：缺逗号导致报错偏移一行
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

// Check if input is a valid escaped JSON string (or JS object)
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
      } catch (e) {
        // fallback
      }
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
// 右侧面板：窄屏隐藏，拉宽自动显示，缩窄自动隐藏
const showOutput = ref(window.innerWidth >= 900)

// ─── 左右分栏拖拽调整宽度（rem 最小宽度保护，防止工具栏被挤压变形） ───
const LEFT_MIN_WIDTH_REM = 29  // 左侧编辑区最小宽度 29rem (~464px，完全容纳左侧操作工具栏与功能按钮)
const RIGHT_MIN_WIDTH_REM = 29 // 右侧预览区最小宽度 29rem (~464px，完全容纳左侧操作工具栏与功能按钮)

const getRemInPx = () => {
  if (typeof window === 'undefined') return 16
  const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return isNaN(fontSize) || fontSize <= 0 ? 16 : fontSize
}

const clampSplitPercent = (rawPercent, containerWidth) => {
  if (containerWidth <= 0) return 50
  const remPx = getRemInPx()
  const minLeftPx = LEFT_MIN_WIDTH_REM * remPx
  const minRightPx = RIGHT_MIN_WIDTH_REM * remPx

  // 如果容器总宽度不足以同时满足两侧最小宽度，则居中 50:50
  if (minLeftPx + minRightPx >= containerWidth) {
    return 50
  }

  const minPercent = (minLeftPx / containerWidth) * 100
  const maxPercent = ((containerWidth - minRightPx) / containerWidth) * 100

  let clamped = rawPercent
  if (clamped < minPercent) clamped = minPercent
  if (clamped > maxPercent) clamped = maxPercent

  return Math.round(clamped * 10) / 10
}

const updateShowOutput = () => {
  showOutput.value = window.innerWidth >= 900
  if (workspaceGridRef.value && showOutput.value) {
    const totalWidth = workspaceGridRef.value.getBoundingClientRect().width
    if (totalWidth > 0) {
      splitPercent.value = clampSplitPercent(splitPercent.value, totalWidth)
    }
  }
}

const workspaceGridRef = ref(null)
const splitPercent = ref(45)
const lastNormalSplitPercent = ref(45)
const isDraggingSplitter = ref(false)
const dragSnapSide = ref(null) // 'left' | 'right' | null

const isLeftCollapsed = computed(() => showOutput.value && splitPercent.value <= 0.5)
const isRightCollapsed = computed(() => showOutput.value && splitPercent.value >= 99.5)

watch(showOutput, (newVal) => {
  if (!newVal && splitPercent.value <= 0.5) {
    splitPercent.value = lastNormalSplitPercent.value || 45
  }
})

const hideOutput = () => {
  showOutput.value = false
  if (splitPercent.value <= 0.5) {
    splitPercent.value = lastNormalSplitPercent.value || 45
  }
}

// 恢复已保存的分栏比例
try {
  const savedRatio = localStorage.getItem('ej_fmt_split_ratio')
  if (savedRatio) {
    const num = parseFloat(savedRatio)
    if (!isNaN(num)) {
      if (num <= 0.5) {
        splitPercent.value = 0
      } else if (num >= 99.5) {
        splitPercent.value = 100
      } else if (num >= 15 && num <= 85) {
        splitPercent.value = num
        lastNormalSplitPercent.value = num
      }
    }
  }
} catch (e) {}

const gridStyle = computed(() => {
  if (!showOutput.value) {
    return { gridTemplateColumns: '1fr' }
  }
  if (isLeftCollapsed.value) {
    return { gridTemplateColumns: '0px 6px 1fr' }
  }
  if (isRightCollapsed.value) {
    return { gridTemplateColumns: '1fr 6px 0px' }
  }
  return {
    gridTemplateColumns: `${splitPercent.value}% 1px 1fr`
  }
})

const resetSplitRatio = () => {
  splitPercent.value = 45
  lastNormalSplitPercent.value = 45
  try {
    localStorage.setItem('ej_fmt_split_ratio', '45')
  } catch (e) {}
  if (showToast) showToast('分栏比例已重置为 45:55')
}

const handleSplitterClick = () => {
  if (isDraggingSplitter.value) return
  if (isLeftCollapsed.value || isRightCollapsed.value) {
    splitPercent.value = lastNormalSplitPercent.value || 45
    try {
      localStorage.setItem('ej_fmt_split_ratio', String(splitPercent.value))
    } catch (e) {}
  }
}

// 拖拽开始与计算
const calculateDrag = (offsetX, totalWidth) => {
  if (totalWidth <= 0) return
  const rawPercent = (offsetX / totalWidth) * 100
  
  // Snap 判定阈值：靠近左侧 65px (或 < 8%) 触发左折叠预备态，靠近右侧 65px (或 > 92%) 触发右折叠预备态
  const snapThresholdPx = 65
  const isSnapLeft = offsetX < snapThresholdPx || rawPercent < 8
  const isSnapRight = (totalWidth - offsetX) < snapThresholdPx || rawPercent > 92

  if (isSnapLeft) {
    dragSnapSide.value = 'left'
    splitPercent.value = 0
  } else if (isSnapRight) {
    dragSnapSide.value = 'right'
    splitPercent.value = 100
  } else {
    dragSnapSide.value = null
    const clamped = Math.max(12, Math.min(88, rawPercent))
    splitPercent.value = Math.round(clamped * 10) / 10
    lastNormalSplitPercent.value = splitPercent.value
  }
}

const startSplitterDrag = (e) => {
  if (e.button !== 0) return
  isDraggingSplitter.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const onMouseMove = (moveEvent) => {
    if (!workspaceGridRef.value) return
    const rect = workspaceGridRef.value.getBoundingClientRect()
    const offsetX = moveEvent.clientX - rect.left
    calculateDrag(offsetX, rect.width)
  }

  const onMouseUp = () => {
    isDraggingSplitter.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)

    if (dragSnapSide.value === 'left') {
      splitPercent.value = 0
    } else if (dragSnapSide.value === 'right') {
      splitPercent.value = 100
    } else {
      splitPercent.value = Math.max(15, Math.min(85, splitPercent.value))
      lastNormalSplitPercent.value = splitPercent.value
    }
    dragSnapSide.value = null

    try {
      localStorage.setItem('ej_fmt_split_ratio', String(splitPercent.value))
    } catch (e) {}
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const startSplitterTouch = (e) => {
  if (!e.touches || e.touches.length === 0) return
  isDraggingSplitter.value = true

  const onTouchMove = (moveEvent) => {
    if (!workspaceGridRef.value || !moveEvent.touches || moveEvent.touches.length === 0) return
    const touch = moveEvent.touches[0]
    const rect = workspaceGridRef.value.getBoundingClientRect()
    const offsetX = touch.clientX - rect.left
    calculateDrag(offsetX, rect.width)
  }

  const onTouchEnd = () => {
    isDraggingSplitter.value = false
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', onTouchEnd)

    if (dragSnapSide.value === 'left') {
      splitPercent.value = 0
    } else if (dragSnapSide.value === 'right') {
      splitPercent.value = 100
    } else {
      splitPercent.value = Math.max(15, Math.min(85, splitPercent.value))
      lastNormalSplitPercent.value = splitPercent.value
    }
    dragSnapSide.value = null

    try {
      localStorage.setItem('ej_fmt_split_ratio', String(splitPercent.value))
    } catch (e) {}
  }

  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchend', onTouchEnd)
  window.addEventListener('touchcancel', onTouchEnd)
}

const showMoreToolsMenu = ref(false)
const moreToolsMenuRef = ref(null)
const leftPanelRef = ref(null)
const leftPanelWidth = ref(800)
let leftResizeObserver = null

const importDropdownRef = ref(null)

const handleOpenImportFromMore = () => {
  const anchor = moreToolsMenuRef.value
  showMoreToolsMenu.value = false
  nextTick(() => {
    importDropdownRef.value?.openPanel(anchor)
  })
}

// ─── 渐进式响应式工具栏定义（按空间优先级逐个收纳到“更多”下拉菜单） ───
const toolbarToolDefs = [
  { id: 'format', label: '格式化', icon: Braces, tooltip: '格式化', minWidth: 0 },
  { id: 'minify', label: '压缩', icon: Minimize2, tooltip: '压缩 JSON', minWidth: 235 },
  { id: 'escape', label: '转义', icon: Code, tooltip: '转义 JSON', minWidth: 280 },
  { id: 'unescape', label: '去转义', icon: FileCode, tooltip: '去转义 JSON', minWidth: 330 },
  { id: 'import', label: '导入', icon: UploadCloud, tooltip: '导入数据', minWidth: 380, isImport: true },
  { id: 'extract', label: '提取', icon: Wand2, tooltip: '智能提取 JSON', minWidth: 430 },
  { id: 'removeComments', label: '去注释', icon: Strikethrough, tooltip: '去除 JSON 注释', minWidth: 480 },
  { id: 'jsonpath', label: 'JSONPath', icon: Workflow, tooltip: 'JSONPath 表达式提取', minWidth: 540, active: () => showJsonPathBar.value },
  { id: 'mask', label: '脱敏', icon: ShieldCheck, tooltip: '智能数据脱敏', minWidth: 600 }
]

const handleToolAction = (toolId) => {
  switch (toolId) {
    case 'format': handleFormatDirect(); break;
    case 'minify': handleMinifyDirect(); break;
    case 'escape': handleEscape(); break;
    case 'unescape': handleUnescape(); break;
    case 'import': handleOpenImportFromMore(); break;
    case 'extract': handleExtract(); break;
    case 'removeComments': handleRemoveComments(); break;
    case 'jsonpath': toggleJsonPathBar(); break;
    case 'mask': openDataMaskModal(); break;
  }
}

const toolThresholds = {
  format: 0,
  minify: 235,
  escape: 280,
  unescape: 330,
  import: 380,
  extract: 430,
  removeComments: 480,
  jsonpath: 540,
  mask: 600
}

const isToolVisible = (toolIdOrObj) => {
  const w = leftPanelWidth.value || 800
  if (typeof toolIdOrObj === 'string') {
    return w >= (toolThresholds[toolIdOrObj] ?? 0)
  }
  return w >= (toolIdOrObj?.minWidth ?? 0)
}

const overflowTools = computed(() => {
  return toolbarToolDefs.filter(t => !isToolVisible(t))
})

const showRightActions = computed(() => {
  const w = leftPanelWidth.value || 800
  return w >= 390
})

const showMoreMenuButton = computed(() => {
  return overflowTools.value.length > 0 || !showRightActions.value
})

const isUltraNarrow = computed(() => {
  // < 350px 极窄模式：工具切换为纯图标紧凑模式
  return leftPanelWidth.value > 0 && leftPanelWidth.value < 350
})

const handleClickOutsideMoreTools = (e) => {
  if (moreToolsMenuRef.value && !moreToolsMenuRef.value.contains(e.target)) {
    showMoreToolsMenu.value = false
  }
}

onMounted(() => {
  if (window.__UTOOLS__) {
    showOutput.value = false
  }
  window.addEventListener('resize', updateShowOutput)
  document.addEventListener('click', handleClickOutsideMoreTools)

  if (leftPanelRef.value) {
    leftResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          leftPanelWidth.value = entry.contentRect.width
        }
      }
    })
    leftResizeObserver.observe(leftPanelRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateShowOutput)
  document.removeEventListener('click', handleClickOutsideMoreTools)
  if (leftResizeObserver) {
    leftResizeObserver.disconnect()
    leftResizeObserver = null
  }
})

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

  // 检测重复 key（大文本跳过，避免阻塞）
  if (!isHeavy(tab.inputText)) {
    const dups = detectDuplicateKeys(tab.inputText)
    tab.duplicateLines = dups.map(d => d.dupLine)
    if (dups.length > 0) {
      showToast(`检测到 ${dups.length} 个重复 key: ${dups.map(d => `"${d.key}"`).join(', ')}`, 'error')
    }
  } else {
    tab.duplicateLines = []
  }

  try {
    let obj = safeParse(tab.inputText)
    tab.validationError = null
    tab.errorLine = null
    tab.extractedFormat = null
    tab.parsedObj = obj

    // 排序：开启前备份原始文本，关闭后恢复
    if (sortKeys.value) {
      if (!tab._unsortedText) {
        tab._unsortedText = tab.inputText
      }
      obj = sortJSONKeys(obj, sortKeys.value === 2)
    } else {
      if (tab._unsortedText) {
        tab.inputText = tab._unsortedText
        tab._unsortedText = null
        obj = safeParse(tab.inputText)
        tab.parsedObj = obj
      }
    }

    if (indentSize.value === 'minify') {
      tab.outputText = safeStringify(obj)
    } else {
      const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value)
      tab.outputText = safeStringify(obj, null, space)
    }
  } catch (err) {
    const heavy = isHeavy(tab.inputText)
    const escapedCheck = heavy ? null : checkEscapedJson(tab.inputText)
    if (escapedCheck) {
      tab.validationError = null
      tab.errorLine = null
      tab.extractedFormat = null
      let obj = escapedCheck.parsedObj
      tab.parsedObj = obj

      // 排序：开启前备份原始文本，关闭后恢复
      if (sortKeys.value) {
        if (!tab._unsortedText) {
          tab._unsortedText = tab.inputText
        }
        obj = sortJSONKeys(obj, sortKeys.value === 2)
      } else {
        if (tab._unsortedText) {
          tab.inputText = tab._unsortedText
          tab._unsortedText = null
          obj = safeParse(tab.inputText)
          tab.parsedObj = obj
        }
      }

      if (indentSize.value === 'minify') {
        tab.outputText = safeStringify(obj)
      } else {
        const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value)
        tab.outputText = safeStringify(obj, null, space)
      }
    } else {
      let extracted = false
      if (!heavy) {
        try {
          const result = extractJsonFromText(tab.inputText)
          if (result) {
            let obj = safeParse(result.json)
            // 判断输入是否看起来像 JSON（以 {/[ 开头、}/] 结尾）
            const looksLikeJson = /^\s*[{\[]/.test(tab.inputText) && /[}\]]\s*$/.test(tab.inputText)
            // 看起来像 JSON 但解析失败 → 始终保留原始错误行
            if (looksLikeJson) {
              const { line } = getErrorLineAndColumn(err, tab.inputText)
              tab.errorLine = line
              tab.validationError = result.format === 'JSON (自动修复)'
                ? 'JSON 已自动修复，建议检查原始输入'
                : `JSON 解析失败，已提取内层有效 JSON（第 ${line || '?'} 行附近有误）`
            } else {
              tab.validationError = null
              tab.errorLine = null
            }
            tab.extractedFormat = result.format !== 'JSON' ? result.format : null
            tab.parsedObj = obj

            // 排序：开启前备份原始文本，关闭后恢复
            if (sortKeys.value) {
              if (!tab._unsortedText) {
                tab._unsortedText = tab.inputText
              }
              obj = sortJSONKeys(obj, sortKeys.value === 2)
            } else {
              if (tab._unsortedText) {
                tab.inputText = tab._unsortedText
                tab._unsortedText = null
                obj = safeParse(tab.inputText)
                tab.parsedObj = obj
              }
            }

            if (indentSize.value === 'minify') {
              tab.outputText = safeStringify(obj)
            } else {
              const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value)
              tab.outputText = safeStringify(obj, null, space)
            }
            extracted = true
          }
        } catch (e2) {}
      }

      if (!extracted) {
        tab.parsedObj = null
        tab.outputText = ''
        tab.extractedFormat = null

        const { line, message } = getErrorLineAndColumn(err, tab.inputText)
        tab.validationError = message || err.message
        tab.errorLine = line
      }
    }
  }

  // 自动格式化：将格式化结果回填到输入面板
  // 但如果用户正在编辑（textarea 聚焦时），不替换，避免光标跳到末尾
  if (autoFormat.value && tab.outputText && tab.inputText !== tab.outputText
    && !tab.validationError
    && document.activeElement !== textareaRef.value) {
    formatGuard = true
    tab.inputText = tab.outputText
    tab._unsortedText = null
    formatGuard = false
  }

  // 大树 JSON 自动折叠节点（避免 DOM 爆炸，针对 > 80KB 或 key >= 800 的大 JSON 默认折叠深层节点）
  if (tab.parsedObj && (tab.inputText.length > 80_000 || countKeys(tab.parsedObj, 800) >= 800)) {
    treeExpanded.value = false
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

watch(activeTabId, () => {
  formatterLastPasted.value = ''
})

// 对指定 tab 的输入文本执行智能提取（提取成功后替换原始输入）
// 被 handlePaste 和 checkExtractOnLoad 共用
const applyAutoExtract = (tab = activeTab.value) => {
  if (!autoExtract.value) return
  const text = textareaRef.value?.value || tab?.inputText
  if (!text?.trim()) return
  // 如果已经是有效 JSON 则跳过提取
  try { safeParse(text); return } catch (e) {}
  try {
    const result = extractJsonFromText(text)
    if (result && result.json !== text) {
      tab.inputText = result.json
      tab.validationError = null
      tab.errorLine = null
      showToast(result.format !== 'JSON' ? `已从 ${result.format} 提取 JSON` : '已自动提取 JSON')
      if (autoFormat.value) {
        try {
          const obj = safeParse(result.json)
          const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
          tab.inputText = safeStringify(obj, null, space)
        } catch (e2) {}
      }
    }
  } catch (e2) {}
}

const handlePaste = () => {
  setTimeout(() => {
    if (autoExtract.value) {
      applyAutoExtract()
    }
    if (autoFormat.value) {
      const tab = activeTab.value
      if (tab && tab.inputText && !tab.validationError) {
        try {
          const obj = safeParse(tab.inputText)
          const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
          const formatted = safeStringify(obj, null, space)
          if (formatted !== tab.inputText) {
            tab.inputText = formatted
          }
        } catch (_) {}
      }
    }
  }, 60)
}

// 自动格式化设置切换时，对当前输入执行格式化
watch(autoFormat, (enabled) => {
  if (enabled && activeTab.value?.inputText) {
    try {
      const tab = activeTab.value
      const obj = safeParse(tab.inputText)
      const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
      const formatted = safeStringify(obj, null, space)
      if (formatted !== tab.inputText) {
        tab.inputText = formatted
      }
    } catch (_) {}
  }
})

// 操作后自动复制
const autoCopyResult = (text) => {
  if (!autoCopy.value || !text) return
  formatterLastPasted.value = text.trim()
  
  if (window.utools && typeof window.utools.copyText === 'function') {
    window.utools.copyText(text)
    showToast('已自动复制到剪贴板')
    return
  }
  
  navigator.clipboard.writeText(text).then(() => {
    showToast('已自动复制到剪贴板')
  }).catch(() => {
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('write_clipboard', { text }).then(() => {
          showToast('已自动复制到剪贴板')
        }).catch(err => {
          console.error('Tauri clipboard write failed:', err)
        })
      })
    }
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

const inputGutterHtml = computed(() => {
  const count = inputLinesCount.value
  const errorLine = activeTab.value.errorLine
  const dupLines = activeTab.value.duplicateLines
  const setDups = (dupLines && dupLines.length > 0) ? new Set(dupLines) : null
  
  const lines = new Array(count)
  if (!errorLine && !setDups) {
    for (let n = 1; n <= count; n++) {
      lines[n - 1] = `<div class="gutter-line">${n}</div>`
    }
  } else {
    for (let n = 1; n <= count; n++) {
      const cls = errorLine === n ? ' has-error' : (setDups && setDups.has(n)) ? ' has-duplicate' : ''
      lines[n - 1] = `<div class="gutter-line${cls}">${n}</div>`
    }
  }
  return lines.join('')
})

const outputGutterHtml = computed(() => {
  const count = outputLinesCount.value
  const lines = new Array(count)
  for (let n = 1; n <= count; n++) {
    lines[n - 1] = `<div class="gutter-line">${n}</div>`
  }
  return lines.join('')
})

const activeScrollTarget = ref(null)
const treeWrapperRef = ref(null)

const syncGutterScroll = () => {
  const scrollTop = textareaRef.value ? textareaRef.value.scrollTop : 0
  const scrollLeft = textareaRef.value ? textareaRef.value.scrollLeft : 0

  // Sync Gutter
  if (gutterRef.value) {
    gutterRef.value.scrollTop = scrollTop
  }

  // Sync highlight overlay via GPU transform (杜绝任何滚动条截断、子像素舍入或视口高度差导致的错位)
  if (inputHighlightRef.value) {
    inputHighlightRef.value.scrollTop = 0
    inputHighlightRef.value.scrollLeft = 0
    inputHighlightRef.value.style.transform = `translate3d(-${scrollLeft}px, -${scrollTop}px, 0)`
  }

  // 实时记录最新滚动位置（供 KeepAlive 切换后无缝还原）
  savedScrollState.inputTop = scrollTop
  savedScrollState.inputLeft = scrollLeft

  // Sync Output Pane (text view & tree view)
  if (activeScrollTarget.value === 'left') {
    if (outputPreRef.value) {
      outputPreRef.value.scrollTop = scrollTop
      outputPreRef.value.scrollLeft = scrollLeft
      if (outputGutterRef.value) outputGutterRef.value.scrollTop = scrollTop
    }
    // Sync tree view
    if (treeWrapperRef.value) {
      treeWrapperRef.value.scrollTop = scrollTop
      treeWrapperRef.value.scrollLeft = scrollLeft
    }
  }
}

// KeepAlive 标签页切换时保存与恢复滚动位置，杜绝 DOM 分离导致 scrollTop 归零而 transform 滞留错位
const savedScrollState = {
  inputTop: 0,
  inputLeft: 0,
  outputTop: 0,
  outputLeft: 0,
  treeTop: 0,
  treeLeft: 0
}

onDeactivated(() => {
  // 注意：DOM 分离时浏览器会将 scrollTop 重置为 0，滚动状态已在实时滚动事件中记录在 savedScrollState 中，此处无需覆盖
})

onActivated(() => {
  nextTick(() => {
    activeScrollTarget.value = 'left'
    if (textareaRef.value) {
      textareaRef.value.scrollTop = savedScrollState.inputTop
      textareaRef.value.scrollLeft = savedScrollState.inputLeft
    }
    if (outputPreRef.value) {
      outputPreRef.value.scrollTop = savedScrollState.outputTop
      outputPreRef.value.scrollLeft = savedScrollState.outputLeft
    }
    if (treeWrapperRef.value) {
      treeWrapperRef.value.scrollTop = savedScrollState.treeTop
      treeWrapperRef.value.scrollLeft = savedScrollState.treeLeft
    }
    syncGutterScroll()
  })
})

const scrollToTop = () => {
  if (textareaRef.value) {
    textareaRef.value.scrollTop = 0
    syncGutterScroll()
  }
}

const scrollToBottom = () => {
  if (textareaRef.value) {
    textareaRef.value.scrollTop = textareaRef.value.scrollHeight
    syncGutterScroll()
  }
}

const handleGutterWheel = (e) => {
  if (textareaRef.value) {
    textareaRef.value.scrollTop += e.deltaY
    textareaRef.value.scrollLeft += e.deltaX
    syncGutterScroll()
  }
}

const handleOutputGutterWheel = (e) => {
  if (outputPreRef.value) {
    outputPreRef.value.scrollTop += e.deltaY
    outputPreRef.value.scrollLeft += e.deltaX
    handleOutputScroll()
  }
}

const handleOutputScroll = () => {
  const scrollTop = outputPreRef.value ? outputPreRef.value.scrollTop : 0
  const scrollLeft = outputPreRef.value ? outputPreRef.value.scrollLeft : 0
  
  // 右侧自身的行号无条件与右侧内容严格同步
  if (outputGutterRef.value) {
    outputGutterRef.value.scrollTop = scrollTop
  }

  if (activeScrollTarget.value === 'right') {
    savedScrollState.outputTop = scrollTop
    savedScrollState.outputLeft = scrollLeft
    // Sync Input Pane
    if (textareaRef.value) {
      textareaRef.value.scrollTop = scrollTop
      textareaRef.value.scrollLeft = scrollLeft
    }
    
    // Sync Gutter (left)
    if (gutterRef.value) {
      gutterRef.value.scrollTop = scrollTop
    }
    
    // Sync highlight overlay via GPU transform (left)
    if (inputHighlightRef.value) {
      inputHighlightRef.value.scrollTop = 0
      inputHighlightRef.value.scrollLeft = 0
      inputHighlightRef.value.style.transform = `translate3d(-${scrollLeft}px, -${scrollTop}px, 0)`
    }
  }
}

// 树形视图滚动同步（垂直 + 水平双向同步）
const handleTreeScroll = () => {
  if (activeScrollTarget.value === 'right' && treeWrapperRef.value) {
    const scrollTop = treeWrapperRef.value.scrollTop
    const scrollLeft = treeWrapperRef.value.scrollLeft
    savedScrollState.treeTop = scrollTop
    savedScrollState.treeLeft = scrollLeft
    if (textareaRef.value) {
      textareaRef.value.scrollTop = scrollTop
      textareaRef.value.scrollLeft = scrollLeft
    }
    if (gutterRef.value) {
      gutterRef.value.scrollTop = scrollTop
    }
    if (inputHighlightRef.value) {
      inputHighlightRef.value.scrollTop = 0
      inputHighlightRef.value.scrollLeft = 0
      inputHighlightRef.value.style.transform = `translate3d(-${scrollLeft}px, -${scrollTop}px, 0)`
    }
  }
}

const getFormattedJsonString = (rawText) => {
  try {
    let obj = safeParse(rawText)
    if (sortKeys.value) {
      obj = sortJSONKeys(obj, sortKeys.value === 2)
    }
    const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value === 'minify' ? '2' : (indentSize.value || '2'))
    return safeStringify(obj, null, space)
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

// 统计对象总 key 数量（带最大上限提前中断，避免深层大树递归卡死）
const countKeys = (obj, maxLimit = 800) => {
  if (!obj || typeof obj !== 'object') return 0
  let n = 0
  const stack = [obj]
  while (stack.length > 0) {
    const curr = stack.pop()
    if (!curr || typeof curr !== 'object') continue
    if (Array.isArray(curr)) {
      for (let i = 0; i < curr.length; i++) {
        const item = curr[i]
        if (item && typeof item === 'object') {
          stack.push(item)
        }
      }
    } else {
      const keys = Object.keys(curr)
      n += keys.length
      if (n >= maxLimit) return n
      for (let i = 0; i < keys.length; i++) {
        const val = curr[keys[i]]
        if (val && typeof val === 'object') {
          stack.push(val)
        }
      }
    }
  }
  return n
}

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
      activeTab.value._unsortedText = null
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
      activeTab.value._unsortedText = null
      showToast('文件导入成功')
      // 确保不创建新标签页
      if (activeTabId.value !== activeTab.value.id) {
        activeTabId.value = activeTab.value.id
      }
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

// Handle editor textarea focus (auto-paste support)
const handleTextareaFocus = () => {
  activeScrollTarget.value = 'left'
  isTextareaFocused.value = true

  if (!autoPaste.value) return
  const tab = activeTab.value
  if (!tab) return
  // Only auto-paste into empty input
  if (tab.inputText && tab.inputText.trim()) return

  // Delay clipboard reading slightly to allow the OS to synchronize the pasteboard
  setTimeout(async () => {
    if (tab.inputText && tab.inputText.trim()) return

    const processAutoPaste = (text) => {
      if (!text || !text.trim()) return
      const trimmed = text.trim()
      if (trimmed === formatterLastPasted.value) return
      
      formatterLastPasted.value = trimmed
      tab.inputText = text
      tab._unsortedText = null
      if (autoExtract.value) {
        applyAutoExtract()
      }
      showToast('已自动粘贴')
    }

    // 1. uTools environment
    if (window.utools && typeof window.utools.readText === 'function') {
      try {
        const text = window.utools.readText()
        processAutoPaste(text)
      } catch (e) {
        console.warn('uTools clipboard read failed:', e)
      }
      return
    }

    // 2. Tauri native environment
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const text = await invoke('read_clipboard')
        processAutoPaste(text)
      } catch (e) {
        console.error('Tauri clipboard read failed:', e)
      }
      return
    }

    // 3. Standard Web environment
    try {
      const text = await navigator.clipboard.readText()
      processAutoPaste(text)
    } catch (e) {
      // Clipboard read requires permission or https — silently ignore
    }
  }, 150)
}

const handleTextareaBlur = () => {
  isTextareaFocused.value = false
  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer)
    inputDebounceTimer = null
  }
  if (autoFormat.value) {
    const tab = activeTab.value
    if (tab && tab.inputText && !tab.validationError) {
      try {
        const obj = safeParse(tab.inputText)
        const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
        const formatted = safeStringify(obj, null, space)
        if (formatted !== tab.inputText) {
          tab.inputText = formatted
        }
      } catch (_) {}
    }
  }
}

const handleCut = (e) => {
  const el = e.target
  if (el) {
    const text = el.value.substring(el.selectionStart, el.selectionEnd)
    if (text) {
      formatterLastPasted.value = text.trim()
    }
  }
}

const handleCopy = (e) => {
  const el = e.target
  if (el) {
    const text = el.value.substring(el.selectionStart, el.selectionEnd)
    if (text) {
      formatterLastPasted.value = text.trim()
    }
  }
}

let inputDebounceTimer = null
const handleTextareaInput = (e) => {
  const val = e.target.value
  textareaValue.value = val
  const tab = activeTab.value
  if (!tab) return
  tab._unsortedText = null // 用户手动编辑后清除备份
  if (activeTabId.value !== tab.id) {
    activeTabId.value = tab.id
  }

  // 大 JSON (> 60KB) 打字采用 150ms 防抖，保持打字 60fps 丝滑流畅
  if (val.length > 60_000) {
    clearTimeout(inputDebounceTimer)
    inputDebounceTimer = setTimeout(() => {
      tab.inputText = val
    }, 150)
  } else {
    tab.inputText = val
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
      return `<span class="json-bracket" data-path="${JSON.stringify(currentPath).replace(/"/g, '&quot;')}" data-tooltip="点击复制子树 JSON">${display}</span>`
    }

    if (match === '}') {
      const current = stack.pop()
      const path = current ? current.path : []
      const display = highlightMatchText('}', q, c)
      return `<span class="json-bracket" data-path="${JSON.stringify(path).replace(/"/g, '&quot;')}" data-tooltip="点击复制子树 JSON">${display}</span>`
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
      return `<span class="json-bracket" data-path="${JSON.stringify(currentPath).replace(/"/g, '&quot;')}" data-tooltip="点击复制子树 JSON">${display}</span>`
    }

    if (match === ']') {
      const current = stack.pop()
      const path = current ? current.path : []
      const display = highlightMatchText(']', q, c)
      return `<span class="json-bracket" data-path="${JSON.stringify(path).replace(/"/g, '&quot;')}" data-tooltip="点击复制子树 JSON">${display}</span>`
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
      return `<span class="json-key" data-path="${pathStr}" data-tooltip="点击复制键名">${highlightedKey}</span><span class="json-colon">${colonPart}</span>`
    }

    // Primitive values
    let cls = 'json-number'
    let valTitle = '点击复制键值'
    const isString = isEscaped
      ? match.startsWith('\\'.repeat((1 << depth) - 1) + '"')
      : match.startsWith('"')

    if (isString) {
      cls = 'json-string'
      const rawVal = match.trim().replace(/^"|"$/g, '').replace(/^\\"|\\"$/g, '')
      if (rawVal && isImageUrl(rawVal)) {
        cls += ' is-image-url'
        valTitle = '悬停预览图片，点击复制键值'
      } else if (rawVal && (rawVal.startsWith('http://') || rawVal.startsWith('https://'))) {
        cls += ' is-web-url'
      }
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
    return `<span class="${cls}" data-path="${pathStr}" data-tooltip="${valTitle}">${highlightedVal}</span>`
  })
}

// Input highlight (left pane) — no current-match tracking
// Input highlight (left pane) — drives match count since replace targets input text

// ── 大 JSON 性能模式 ──
const HEAVY_SIZE = 50_000
const HEAVY_LINES = 1000
const VERY_HEAVY_SIZE = 200_000
const isHeavy = (text) => {
  if (!text) return false
  if (text.length > HEAVY_SIZE) return true
  let lines = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n' && ++lines >= HEAVY_LINES) return true
  }
  return false
}
const isHeavyInput = computed(() => isHeavy(activeTab.value?.inputText))
const isHeavyOutput = computed(() => isHeavy(activeTab.value?.outputText))

const plainEscape = (text) => {
  if (!text) return ''
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const lightweightHighlight = (text) => {
  if (!text) return ''
  if (text.length > VERY_HEAVY_SIZE) return plainEscape(text)
  let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return safe.replace(
    /("(?:[^"\\]|\\.)*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\]]|,)/g,
    (match) => {
      if (match === '{' || match === '}') return `<span class="json-bracket">${match}</span>`
      if (match === '[' || match === ']') return `<span class="json-bracket">${match}</span>`
      if (match === ',') return match
      if (match.endsWith(':')) {
        const ci = match.lastIndexOf(':')
        return `<span class="json-key">${match.slice(0, ci)}</span>:`
      }
      if (match.startsWith('"')) return `<span class="json-string">${match}</span>`
      if (match === 'true' || match === 'false') return `<span class="json-boolean">${match}</span>`
      if (match === 'null') return `<span class="json-null">${match}</span>`
      return `<span class="json-number">${match}</span>`
    }
  )
}

const wrapLinesWithHighlight = (html, errorLine, dupLines) => {
  if (!html) return ''
  const lines = html.replace(/\r/g, '').split('\n')
  const setDups = (dupLines && dupLines.length > 0) ? new Set(dupLines) : null
  const hasError = !!errorLine
  const hasPathAttr = html.includes('data-path="')
  
  const len = lines.length
  const mapped = new Array(len)
  for (let i = 0; i < len; i++) {
    const line = lines[i]
    const lineNum = i + 1
    const isError = hasError && errorLine === lineNum
    const isDup = setDups ? setDups.has(lineNum) : false
    
    let pathAttr = ''
    if (hasPathAttr) {
      const match = line.match(/data-path="([^"]+)"/)
      if (match) {
        pathAttr = ` data-path="${match[1]}"`
      }
    }
    
    const cls = isError ? 'editor-line has-error' : isDup ? 'editor-line has-duplicate' : 'editor-line'
    mapped[i] = `<div class="${cls}"${pathAttr}>${line || ' '}</div>`
  }
  return mapped.join('')
}

const highlightedInput = computed(() => {
  const tab = activeTab.value
  let html = ''
  if (isHeavyInput.value) {
    html = lightweightHighlight(tab.inputText)
  } else {
    const counter = searchQuery.value
      ? { count: 0, target: currentMatchIndex.value }
      : null
    html = applyJsonHighlightWithPath(tab.inputText, counter)
    if (counter) {
      totalMatches.value = counter.count
      if (currentMatchIndex.value >= counter.count && counter.count > 0) {
        currentMatchIndex.value = 0
      }
    } else {
      totalMatches.value = 0
    }
  }
  return wrapLinesWithHighlight(html, tab.errorLine, tab.duplicateLines)
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
    const numRe = /\b(\d+\.?\d*)\b/g
    let html = escaped
      .replace(/(\/\/[^\n]*)/g, '<span class="hl-comment">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>')
      .replace(/(@\w+)/g, '<span class="hl-attr">$1</span>')
    // 关键词与数字高亮只作用于纯文本，跳过已存在的 HTML 标签，防止污染 class 属性
    html = html.split(/(<[^>]+>)/g).map(part => {
      if (part.startsWith('<')) return part
      return part.replace(kwRe, '<span class="hl-kw">$1</span>')
                 .replace(numRe, '<span class="hl-num">$1</span>')
    }).join('')
    return html
      .replace(/(&quot;[^&]*&quot;)/g, '<span class="hl-string">$1</span>')
      .replace(/(`[^`]*`)/g, '<span class="hl-string">$1</span>')
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
    const sqlKwRe = /\b(CREATE|TABLE|ENGINE|InnoDB|DEFAULT|CHARSET|NOT|NULL|PRIMARY|KEY|INDEX|AUTO_INCREMENT|VARCHAR|TEXT|INT|BIGINT|BOOLEAN|DOUBLE|JSON|DATETIME)\b/g
    const sqlNumRe = /\b(\d+)\b/g
    let html = escaped
      .replace(/(--[^\n]*)/g, '<span class="hl-comment">$1</span>')
    html = html.split(/(<[^>]+>)/g).map(part => {
      if (part.startsWith('<')) return part
      return part.replace(sqlKwRe, '<span class="hl-kw">$1</span>')
                 .replace(sqlNumRe, '<span class="hl-num">$1</span>')
    }).join('')
    return html.replace(/(`[^`]*`)/g, '<span class="hl-string">$1</span>')
  }
  // Protobuf 高亮
  if (format === 'protobuf') {
    let html = escaped
      .replace(/(\/\/[^\n]*)/g, '<span class="hl-comment">$1</span>')
    // 关键词/类型/数字只作用于纯文本，跳过已有 HTML 标签
    const protoKwRe = /\b(syntax|message|repeated|optional|required|enum|oneof|map|reserved|package|import|option|rpc|returns|stream)\b/g
    const protoTypeRe = /\b(string|bool|int32|int64|uint32|uint64|float|double|bytes)\b/g
    const protoNumRe = /\b(\d+)\b/g
    html = html.split(/(<[^>]+>)/g).map(part => {
      if (part.startsWith('<')) return part
      return part.replace(protoKwRe, '<span class="hl-kw">$1</span>')
                 .replace(protoTypeRe, '<span class="hl-type">$1</span>')
                 .replace(protoNumRe, '<span class="hl-num">$1</span>')
    }).join('')
    return html.replace(/(&quot;[^&]*&quot;)/g, '<span class="hl-string">$1</span>')
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
      if (isHeavy(convertedOutput.value)) return lightweightHighlight(convertedOutput.value)
      return applyJsonHighlightWithPath(convertedOutput.value)
    }
    return highlightConverted(convertedOutput.value, convertFormat.value)
  }
  const tab = activeTab.value
  if (!tab.outputText) return ''
  if (isHeavyOutput.value) return lightweightHighlight(tab.outputText)
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


// Handler functions for toolbar
const handleFormatDirect = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return
  if (indentSize.value === 'minify') {
    indentSize.value = '2' // default format style
  }
  try {
    // 排序：开启前备份原始文本，关闭后恢复
    if (sortKeys.value) {
      if (!tab._unsortedText) tab._unsortedText = tab.inputText
    } else if (tab._unsortedText) {
      tab.inputText = tab._unsortedText
      tab._unsortedText = null
    }
    let obj = safeParse(tab.inputText)
    if (sortKeys.value) {
      obj = sortJSONKeys(obj, sortKeys.value === 2)
    }
    const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
    tab.inputText = safeStringify(obj, null, space)
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
    let obj = safeParse(tab.inputText)
    tab.inputText = safeStringify(obj)
    indentSize.value = 'minify'
    showToast('压缩成功')
    autoCopyResult(activeTab.value.inputText)
  } catch (err) {
    // Try to convert JS object format first
    try {
      const jsonStr = convertJsObjectToJson(tab.inputText)
      const obj = safeParse(jsonStr)
      tab.inputText = safeStringify(obj)
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
    try {
      let obj = safeParse(tab.inputText)
      const minified = safeStringify(obj)
      tab.inputText = minified.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      tab.outputText = tab.inputText
      tab.parsedObj = null
      tab.validationError = null
      tab.errorLine = null
      showToast('转义成功')
      autoCopyResult(tab.inputText)
    } catch (err) {
      try {
        const jsonStr = convertJsObjectToJson(tab.inputText)
        const obj = safeParse(jsonStr)
        const minified = safeStringify(obj)
        tab.inputText = minified.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        tab.outputText = tab.inputText
        tab.parsedObj = null
        tab.validationError = null
        tab.errorLine = null
        showToast('转义成功')
        autoCopyResult(tab.inputText)
      } catch (e2) {
        tab.inputText = tab.inputText.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        tab.outputText = tab.inputText
        tab.parsedObj = null
        tab.validationError = null
        tab.errorLine = null
        showToast('转义成功')
        autoCopyResult(tab.inputText)
      }
    }
  } finally {
    nextTick(() => { formatGuard = false })
  }
  saveFormatterState()
}

// Recursively unescape string values that represent valid JSON objects or arrays
const recursiveUnescape = (val) => {
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = safeParse(trimmed)
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
              const nested = safeParse(trimmed)
              if (nested !== null && typeof nested === 'object') return nested
            } catch (e) {}
          }
        }
        return null
      }

      try {
        const parsed = safeParse(txt)
        const res = processParsed(parsed)
        if (res) return res
      } catch (e) {}

      try {
        const candidate = tryParseCandidate(txt)
        if (candidate) {
          const parsed = safeParse(candidate)
          const res = processParsed(parsed)
          if (res) return res
        }
      } catch (e) {}

      try {
        const jsonStr = convertJsObjectToJson(txt)
        const parsed = safeParse(jsonStr)
        const res = processParsed(parsed)
        if (res) return res
      } catch (e) {}

      return null
    }

    let parsedObj = tryParseToObj(rawText)

    if (parsedObj) {
      const unescapedObj = recursiveUnescape(parsedObj)
      tab.inputText = safeStringify(unescapedObj)
      tab.outputText = tab.inputText
      tab.parsedObj = null
      tab.validationError = null
      tab.errorLine = null
      showToast('去转义成功')
      autoCopyResult(tab.inputText)
      saveFormatterState()
      return
    }

    let unescapedRaw = rawText.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

    parsedObj = tryParseToObj(unescapedRaw)
    if (parsedObj) {
      const unescapedObj = recursiveUnescape(parsedObj)
      tab.inputText = safeStringify(unescapedObj)
    } else {
      tab.inputText = unescapedRaw
    }

    tab.outputText = tab.inputText
    tab.parsedObj = null
    tab.validationError = null
    tab.errorLine = null
    showToast('去转义成功')
    autoCopyResult(tab.inputText)
  } catch (err) {
    tab.validationError = `去转义失败: ${err.message}`
  } finally {
    nextTick(() => { formatGuard = false })
    saveFormatterState()
  }
}

const handleExtract = () => {
  const tab = activeTab.value
  if (!tab.inputText.trim()) return
  try {
    const result = extractJsonFromText(tab.inputText)
    let obj = safeParse(result.json)
    if (sortKeys.value) {
      obj = sortJSONKeys(obj, sortKeys.value === 2)
    }
    if (indentSize.value === 'minify') {
      tab.inputText = safeStringify(obj)
    } else {
      const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
      tab.inputText = safeStringify(obj, null, space)
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

// ─── 1. 智能数据脱敏弹窗与配置 ───
const showMaskModal = ref(false)
const maskOptions = ref({
  maskPhone: true,
  maskIdCard: true,
  maskEmail: true,
  maskBankCard: true,
  maskIp: true,
  maskLicensePlate: true,
  maskUsci: true,
  maskPassport: true,
  maskDsn: true,
  customKeys: []
})
const customKeyInput = ref('')
const showKeyTreePicker = ref(false)
const extractedKeysList = ref([])
const maskPreviewText = ref('')
const maskCountResult = ref(0)

const highlightedMaskPreview = computed(() => {
  if (!maskPreviewText.value) return ''
  if (maskPreviewText.value.startsWith('//')) {
    return `<div class="mask-preview-line"><span class="json-comment">${plainEscape(maskPreviewText.value)}</span></div>`
  }
  const highlighted = applyJsonHighlightWithPath(maskPreviewText.value)
  const lines = highlighted.replace(/\r/g, '').split('\n')
  return lines.map(line => {
    const isMasked = line.includes('*')
    const content = isMasked
      ? line.replace(/\*+(?:\.\*+)*/g, (m) => `<mark class="mask-highlight-mark">${m}</mark>`)
      : line
    const cls = isMasked ? 'mask-preview-line is-masked-line' : 'mask-preview-line'
    return `<div class="${cls}">${content || ' '}</div>`
  }).join('')
})

// 从 localStorage 恢复脱敏配置
try {
  const savedMaskOpt = localStorage.getItem('ej_mask_options')
  if (savedMaskOpt) {
    const parsed = JSON.parse(savedMaskOpt)
    maskOptions.value = { ...maskOptions.value, ...parsed }
  }
} catch (e) {}

const saveMaskOptions = () => {
  try {
    localStorage.setItem('ej_mask_options', JSON.stringify(maskOptions.value))
  } catch (e) {}
}

const parseJsonRobust = (text) => {
  if (!text || !text.trim()) return null
  try {
    return safeParse(text)
  } catch (e) {
    try {
      const extracted = extractJsonFromText(text)
      if (extracted?.json) return safeParse(extracted.json)
    } catch (e2) {}
    try {
      const jsConverted = convertJsObjectToJson(text)
      if (jsConverted) return safeParse(jsConverted)
    } catch (e3) {}
  }
  return null
}

watch(showMaskModal, (val) => {
  if (!val) {
    showKeyTreePicker.value = false
  }
})

const openDataMaskModal = () => {
  const tab = activeTab.value
  if (!tab || !tab.inputText?.trim()) {
    showToast('请先输入需要脱敏的 JSON 数据', 'error')
    return
  }
  showKeyTreePicker.value = false
  const parsed = tab.parsedObj || parseJsonRobust(tab.inputText)
  if (parsed) {
    extractedKeysList.value = extractAllKeys(parsed)
  } else {
    extractedKeysList.value = []
  }
  updateMaskPreview()
  showMaskModal.value = true
}

const addCustomKey = () => {
  const key = customKeyInput.value.trim()
  if (!key) return
  if (!maskOptions.value.customKeys.includes(key)) {
    maskOptions.value.customKeys.push(key)
    saveMaskOptions()
    updateMaskPreview()
  }
  customKeyInput.value = ''
}

const removeCustomKey = (key) => {
  maskOptions.value.customKeys = maskOptions.value.customKeys.filter(k => k !== key)
  saveMaskOptions()
  updateMaskPreview()
}

const clearAllCustomKeys = () => {
  maskOptions.value.customKeys = []
  saveMaskOptions()
  updateMaskPreview()
}

const toggleKeyFromExtracted = (key) => {
  const idx = maskOptions.value.customKeys.indexOf(key)
  if (idx > -1) {
    maskOptions.value.customKeys.splice(idx, 1)
  } else {
    maskOptions.value.customKeys.push(key)
  }
  saveMaskOptions()
  updateMaskPreview()
}

const updateMaskPreview = () => {
  const tab = activeTab.value
  if (!tab || !tab.inputText?.trim()) {
    maskPreviewText.value = ''
    maskCountResult.value = 0
    return
  }
  try {
    const parsed = tab.parsedObj || parseJsonRobust(tab.inputText)
    if (!parsed) {
      maskPreviewText.value = '// 输入数据非有效 JSON 格式，无法解析'
      maskCountResult.value = 0
      return
    }
    const { maskedData, count } = maskJsonData(parsed, maskOptions.value)
    maskCountResult.value = count
    const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
    maskPreviewText.value = safeStringify(maskedData, null, space)
  } catch (e) {
    maskPreviewText.value = '// 脱敏处理失败: ' + (e?.message || '')
    maskCountResult.value = 0
  }
}

watch(maskOptions, () => {
  saveMaskOptions()
  if (showMaskModal.value) {
    updateMaskPreview()
  }
}, { deep: true })

const applyMaskToCurrentTab = () => {
  if (!maskPreviewText.value || maskPreviewText.value.startsWith('//')) return
  activeTab.value.inputText = maskPreviewText.value
  showMaskModal.value = false
  showToast(`已完成智能脱敏（共处理 ${maskCountResult.value} 处敏感数据）`)
  autoCopyResult(activeTab.value.inputText)
}

const applyMaskToNewTab = () => {
  if (!maskPreviewText.value || maskPreviewText.value.startsWith('//')) return
  const newId = nextTabId++
  const newTab = {
    id: newId,
    title: `脱敏数据`,
    inputText: maskPreviewText.value,
    outputText: '',
    parsedObj: null,
    validationError: null,
    errorLine: null,
    duplicateLines: [],
    viewMode: 'tree',
    convertFormat: null,
    extractedFormat: null
  }
  tabs.value.push(newTab)
  activeTabId.value = newId
  showMaskModal.value = false
  showToast(`已在新标签页生成脱敏数据（共脱敏 ${maskCountResult.value} 处）`)
}

const copyMaskedData = () => {
  if (!maskPreviewText.value || maskPreviewText.value.startsWith('//')) return
  navigator.clipboard.writeText(maskPreviewText.value).then(() => {
    showToast('脱敏数据已复制到剪贴板')
  })
}

// ─── 2. JSONPath 表达式提取 ───
const showJsonPathBar = ref(false)
const jsonPathQuery = ref('$.data')
const jsonPathWrapRef = ref(null)
const jsonPathInputRef = ref(null)
const jsonPathPresetPills = ['$.data', '$.data.list[*]', '$..id', '$..name', '$[?(@.id > 1)]', '$..*']

const jsonPathMatches = computed(() => {
  if (!showJsonPathBar.value || !jsonPathQuery.value.trim()) return []
  const obj = activeTab.value?.parsedObj
  if (!obj) return []
  try {
    return queryJsonPath(obj, jsonPathQuery.value)
  } catch (e) {
    return []
  }
})

const toggleJsonPathBar = () => {
  showJsonPathBar.value = !showJsonPathBar.value
  if (showJsonPathBar.value) {
    collapseSearch()
    if (!jsonPathQuery.value) {
      jsonPathQuery.value = '$.data'
    }
    nextTick(() => {
      jsonPathInputRef.value?.focus()
      jsonPathInputRef.value?.select()
    })
  }
}

watch(activeTabId, () => {
  showJsonPathBar.value = false
})

const onJsonPathClickOutside = (e) => {
  if (showJsonPathBar.value && jsonPathWrapRef.value && !jsonPathWrapRef.value.contains(e.target)) {
    showJsonPathBar.value = false
  }
}

const applyJsonPathToInput = () => {
  const matches = jsonPathMatches.value
  if (!matches.length) {
    showToast('未匹配到任何结果', 'error')
    return
  }
  const resultData = matches.length === 1 ? matches[0] : matches
  const space = indentSize.value === 'tab' ? '\t' : parseInt(indentSize.value || '2')
  activeTab.value.inputText = safeStringify(resultData, null, space)
  showToast(`已提取并应用 ${matches.length} 项匹配结果`)
  showJsonPathBar.value = false
}

const copyJsonPathResult = () => {
  const matches = jsonPathMatches.value
  if (!matches.length) {
    showToast('未匹配到任何结果', 'error')
    return
  }
  const resultData = matches.length === 1 ? matches[0] : matches
  navigator.clipboard.writeText(safeStringify(resultData, null, 2)).then(() => {
    showToast(`已复制 ${matches.length} 项提取结果`)
  }).catch(() => {
    showToast('复制失败', 'error')
  })
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
        // 如果所有保存的 tab 内容都为空，视为首次加载，展示示例数据
        const hasContent = parsed.some(t => t.inputText && t.inputText.trim())
        if (!hasContent) {
          restored = false
        } else {
          tabs.value = parsed.map(t => ({
            id: t.id,
            title: t.title,
            inputText: t.inputText || '',
            outputText: '',
            parsedObj: null,
            validationError: null,
            errorLine: null,
            duplicateLines: [],
            viewMode: 'tree',
            convertFormat: null,
            extractedFormat: null
          }))
          nextTabId = Math.max(...parsed.map(t => t.id)) + 1
          activeTabId.value = savedActive ? Number(savedActive) : tabs.value[0].id
          restored = true
        }
      }
    }
  } catch (e) {}

  if (!restored) {
    // 首次启动为空，不清空已有恢复数据
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
        viewMode: 'tree',
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
          tab._unsortedText = null
          // 与粘贴行为一致：启用自动提取时，替换原始输入为提取后的 JSON
          setTimeout(() => applyAutoExtract(tab), 50)
        }
      })

      chrome.storage.local.remove('ej_extract_text')
    })
  } catch (e) {}
  // 点击面板外部收起
  document.addEventListener('click', onConvertMenuClickOutside)
  document.addEventListener('click', onJsonPathClickOutside)
}
onBeforeUnmount(() => {
  document.removeEventListener('click', onConvertMenuClickOutside)
  document.removeEventListener('click', onJsonPathClickOutside)
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


    <!-- Main Workspace -->
    <div
      ref="workspaceGridRef"
      class="workspace-grid"
      :class="{ 'single-panel': !showOutput, 'is-resizing': isDraggingSplitter }"
      :style="gridStyle"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <!-- Input Panel -->
      <div ref="leftPanelRef" class="editor-panel" :class="{ 'is-collapsed': isLeftCollapsed, 'is-ultra-narrow': isUltraNarrow }">
        <div class="panel-header">
          <div class="toolbar-actions">
            <!-- 1. 格式化（常驻） -->
            <button class="toolbar-item" @click="handleFormatDirect" data-tooltip-bottom-left="格式化">
              <Braces class="toolbar-icon" />
              <span class="toolbar-label">格式化</span>
            </button>

            <!-- 2. 压缩 -->
            <button v-if="isToolVisible('minify')" class="toolbar-item" @click="handleMinifyDirect" data-tooltip-bottom="压缩 JSON">
              <Minimize2 class="toolbar-icon" />
              <span class="toolbar-label">压缩</span>
            </button>

            <!-- 3. 转义 -->
            <button v-if="isToolVisible('escape')" class="toolbar-item" @click="handleEscape" data-tooltip-bottom="转义 JSON">
              <Code class="toolbar-icon" />
              <span class="toolbar-label">转义</span>
            </button>

            <!-- 4. 去转义 -->
            <button v-if="isToolVisible('unescape')" class="toolbar-item" @click="handleUnescape" data-tooltip-bottom="去转义 JSON">
              <FileCode class="toolbar-icon" />
              <span class="toolbar-label">去转义</span>
            </button>

            <!-- 5. 导入 (平铺时显示，收纳时仅保留弹窗实例) -->
            <ImportDropdown ref="importDropdownRef" :hide-trigger="!isToolVisible('import')" @import-text="handleImportText" />

            <!-- 6. 提取 -->
            <button v-if="isToolVisible('extract')" class="toolbar-item" @click="handleExtract" data-tooltip-bottom="智能提取 JSON">
              <Wand2 class="toolbar-icon" />
              <span class="toolbar-label">提取</span>
            </button>

            <!-- 7. 去注释 -->
            <button v-if="isToolVisible('removeComments')" class="toolbar-item" @click="handleRemoveComments" data-tooltip-bottom="去除 JSON 注释">
              <Strikethrough class="toolbar-icon" />
              <span class="toolbar-label">去注释</span>
            </button>

            <!-- 8. JSONPath -->
            <button 
              v-if="isToolVisible('jsonpath')"
              class="toolbar-item" 
              :class="{ active: showJsonPathBar }" 
              @click.stop="toggleJsonPathBar" 
              data-tooltip-bottom="JSONPath 表达式提取"
            >
              <Workflow class="toolbar-icon" />
              <span class="toolbar-label">JSONPath</span>
            </button>

            <!-- 9. 脱敏 -->
            <button v-if="isToolVisible('mask')" class="toolbar-item" @click="openDataMaskModal" data-tooltip-bottom="智能数据脱敏">
              <ShieldCheck class="toolbar-icon" />
              <span class="toolbar-label">脱敏</span>
            </button>

            <!-- 渐进式更多工具下拉（只要有工具被收起就动态出现） -->
            <div v-if="showMoreMenuButton" class="more-tools-dropdown" ref="moreToolsMenuRef">
              <button 
                class="toolbar-item more-tools-trigger" 
                :class="{ active: showMoreToolsMenu || (showJsonPathBar && !isToolVisible('jsonpath')) }"
                @click.stop="showMoreToolsMenu = !showMoreToolsMenu"
                data-tooltip-bottom="更多工具"
              >
                <MoreHorizontal class="toolbar-icon" />
                <span class="toolbar-label">更多</span>
                <ChevronDown class="more-arrow-icon" :class="{ 'is-open': showMoreToolsMenu }" />
              </button>

              <Transition name="fade-dropdown">
                <div v-if="showMoreToolsMenu" class="more-tools-menu">
                  <!-- 动态渲染当前被收纳进来的工具项 -->
                  <template v-for="tool in overflowTools" :key="tool.id">
                    <button 
                      class="more-menu-item" 
                      :class="{ active: tool.id === 'jsonpath' && showJsonPathBar }"
                      @click="handleToolAction(tool.id); showMoreToolsMenu = false"
                    >
                      <component :is="tool.icon" class="more-item-icon" />
                      <span>{{ tool.id === 'import' ? '导入数据' : (tool.id === 'jsonpath' ? 'JSONPath 表达式提取' : (tool.id === 'extract' ? '智能提取 JSON' : (tool.id === 'removeComments' ? '去除 JSON 注释' : (tool.id === 'mask' ? '智能数据脱敏' : tool.label)))) }}</span>
                    </button>
                  </template>

                  <!-- 极窄模式下右侧 3 按钮收纳至此 -->
                  <template v-if="!showRightActions">
                    <div v-if="overflowTools.length > 0" class="more-menu-divider"></div>
                    <button class="more-menu-item" :class="{ active: searchExpanded }" @click="toggleSearch(); showMoreToolsMenu = false">
                      <Search class="more-item-icon" />
                      <span>{{ searchExpanded ? '关闭搜索 / 替换' : '搜索 / 替换' }}</span>
                    </button>
                    <button class="more-menu-item" @click="copyToClipboard(); showMoreToolsMenu = false" :disabled="!activeTab.outputText">
                      <Copy class="more-item-icon" />
                      <span>复制结果</span>
                    </button>
                    <button class="more-menu-item danger-item" @click="clearInput(); showMoreToolsMenu = false" :disabled="!activeTab.inputText">
                      <Trash2 class="more-item-icon" />
                      <span>清空</span>
                    </button>
                  </template>
                </div>
              </Transition>
            </div>
          </div>
          <div class="header-search-wrapper">
            <button
              v-if="!showOutput"
              class="action-btn outline icon-only"
              @click.stop="showOutput = true"
              data-tooltip-bottom="显示输出面板"
              style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
            >
              <Eye class="btn-icon" />
            </button>

            <!-- 宽屏常驻显示右侧 3 个操作按钮；极窄时完全收敛至“更多”菜单 -->
            <template v-if="showRightActions">
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

              <button
                class="action-btn outline icon-only"
                :class="{ 'active': searchExpanded }"
                @click.stop="toggleSearch"
                data-tooltip-bottom-right="搜索 / 替换"
                style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
              >
                <Search class="btn-icon" />
              </button>
            </template>

            <!-- 窄屏下若搜索框已展开，保留激活态关闭搜索按钮 -->
            <template v-else-if="searchExpanded">
              <button
                class="action-btn outline icon-only active"
                @click.stop="toggleSearch"
                data-tooltip-bottom-right="关闭搜索"
                style="height: 28px; width: 28px; display: flex; align-items: center; justify-content: center; padding: 0;"
              >
                <Search class="btn-icon" />
              </button>
            </template>

            <div
              v-if="searchExpanded"
              class="search-replace-box"
              :style="{ width: Math.min(310, Math.max(160, (leftPanelWidth || 800) - 16)) + 'px', maxWidth: 'calc(100vw - 20px)' }"
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
                <button class="sr-nav-btn" @click="collapseSearch">
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

        <!-- JSONPath 嵌入式顶部工具栏 (第1行: 输入框+计数+应用+复制+关闭; 第2行: 预设表达式) -->
        <Transition name="jp-slide">
          <div v-if="showJsonPathBar" class="jsonpath-inline-bar" @click.stop>
            <!-- 第一行：输入框 + 匹配计数 + 应用 + 复制 + 关闭 -->
            <div class="jp-main-row">
              <input
                v-model="jsonPathQuery"
                ref="jsonPathInputRef"
                type="text"
                placeholder="输入 JSONPath 表达式 (如: $.data, $..id, $[?(@.id > 1)])"
                class="jp-bar-input"
                @keydown.enter="applyJsonPathToInput"
                @keydown.escape="showJsonPathBar = false"
              />
              <span class="jp-bar-match-count" :class="{ 'has-matches': jsonPathMatches.length > 0 }">
                {{ jsonPathMatches.length > 0 ? `${jsonPathMatches.length}项匹配` : '0项' }}
              </span>
              <button 
                class="jp-action-btn primary" 
                :disabled="!jsonPathMatches.length" 
                @click="applyJsonPathToInput"
                data-tooltip-bottom="应用提取结果到当前输入框"
              >
                应用
              </button>
              <button 
                class="jp-action-btn" 
                :disabled="!jsonPathMatches.length" 
                @click="copyJsonPathResult"
                data-tooltip-bottom="复制提取结果"
              >
                <Copy class="btn-icon-xs" />
                <span>复制</span>
              </button>
              <button class="jp-close-btn" @click="showJsonPathBar = false" data-tooltip-bottom="关闭">
                <X class="btn-icon-xs" />
              </button>
            </div>

            <!-- 第二行：预设表达式快速选择 -->
            <div class="jp-presets-row">
              <span class="jp-preset-label">预设:</span>
              <button
                v-for="pill in jsonPathPresetPills"
                :key="pill"
                class="jp-preset-pill"
                :class="{ active: jsonPathQuery === pill }"
                @click="jsonPathQuery = pill"
              >
                {{ pill }}
              </button>
            </div>
          </div>
        </Transition>

        <div class="panel-body">
          <div class="editor-wrapper">
            <!-- Sync scroll line numbers -->
            <div v-show="showLineNumbers" class="gutter" ref="gutterRef" v-html="inputGutterHtml" aria-hidden="true" @wheel.prevent="handleGutterWheel"></div>

            <div class="textarea-overlay-container" :class="{ 'minify-wrap': isInputMinified }">
              <!-- Syntax highlight overlay (behind textarea) -->
              <div
                ref="inputHighlightRef"
                class="editor-highlight"
                v-html="highlightedInput || (isTextareaFocused ? '' : '<div class=\'editor-line placeholder\'>在此粘贴或拖入你的 JSON 数据...</div>')"
              ></div>
              <!-- Transparent textarea on top -->
              <textarea
                ref="textareaRef"
                v-model="activeTab.inputText"
                class="editor-textarea"
                placeholder=""
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                @scroll="syncGutterScroll"
                @paste="handlePaste"
                @cut="handleCut"
                @copy="handleCopy"
                @click="updateCursorPath"
                @keyup="updateCursorPath"
                @select="updateCursorPath"
                @mouseenter="activeScrollTarget = 'left'"
                @touchstart="activeScrollTarget = 'left'"
                @focus="handleTextareaFocus(); updateCursorPath()"
                @blur="handleTextareaBlur"
              ></textarea>
              
              <!-- Floating Scroll Buttons -->
              <div v-if="activeTab.inputText" class="textarea-scroll-controls">
                <button class="scroll-control-btn" @click="scrollToTop" data-tooltip-left="回到顶部">
                  <ChevronUp class="scroll-control-icon" />
                </button>
                <button class="scroll-control-btn" @click="scrollToBottom" data-tooltip-left="回到底部">
                  <ChevronDown class="scroll-control-icon" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Splitter Divider -->
      <div
        v-if="showOutput"
        class="pane-splitter"
        :class="{ 
          active: isDraggingSplitter,
          'is-collapsed-left': isLeftCollapsed,
          'is-collapsed-right': isRightCollapsed,
          'snap-active-left': dragSnapSide === 'left',
          'snap-active-right': dragSnapSide === 'right'
        }"
        @mousedown.prevent="startSplitterDrag"
        @touchstart.prevent="startSplitterTouch"
        @click="handleSplitterClick"
        @dblclick="resetSplitRatio"
        :title="isLeftCollapsed ? '点击展开左侧编辑区' : isRightCollapsed ? '点击展开右侧视图' : '按住左右拖拽调整宽度（拖到两端折叠，双击重置 45:55）'"
      >
        <!-- Snap & Percentage Floating Tooltip Badge -->
        <Transition name="fade-scale">
          <div v-if="isDraggingSplitter" class="splitter-snap-badge" :class="'badge-' + (dragSnapSide || 'center')">
            <template v-if="dragSnapSide === 'left'">
              <ArrowLeftToLine class="snap-badge-icon pulse-left" />
              <span>松开折叠左侧</span>
            </template>
            <template v-else-if="dragSnapSide === 'right'">
              <span>松开折叠右侧</span>
              <ArrowRightToLine class="snap-badge-icon pulse-right" />
            </template>
            <template v-else>
              <span>{{ Math.round(splitPercent) }}% : {{ Math.round(100 - splitPercent) }}%</span>
            </template>
          </div>
        </Transition>

        <div class="pane-splitter-handle" :class="{ 'collapsed-handle': isLeftCollapsed || isRightCollapsed }">
          <ChevronRight v-if="isLeftCollapsed" class="pane-splitter-icon expand-icon" />
          <ChevronLeft v-else-if="isRightCollapsed" class="pane-splitter-icon expand-icon" />
          <GripVertical v-else class="pane-splitter-icon" />
        </div>
      </div>

      <!-- Output Panel -->
      <div class="editor-panel" v-if="showOutput" :class="{ 'is-collapsed': isRightCollapsed }">
        <div class="panel-header">
          <div class="header-left-group">
            <!-- View switch (3 core structural views: Tree, Table, Graph) -->
            <div class="segmented-control" v-if="!convertFormat">
              <div class="segmented-indicator" :class="'pos-' + activeTab.viewMode"></div>
              <button
                class="segment-btn"
                :class="{ active: activeTab.viewMode === 'tree' }"
                @click="activeTab.viewMode = 'tree'"
                :disabled="!activeTab.parsedObj"
                data-tooltip-bottom-left="树形视图"
              >
                <ListTree class="seg-icon" />
              </button>
              <button
                class="segment-btn"
                :class="{ active: activeTab.viewMode === 'table' }"
                @click="activeTab.viewMode = 'table'"
                :disabled="!activeTab.parsedObj"
                data-tooltip-bottom="表格视图"
              >
                <Table2 class="seg-icon" />
              </button>
              <button
                class="segment-btn"
                :class="{ active: activeTab.viewMode === 'graph' }"
                @click="activeTab.viewMode = 'graph'"
                :disabled="!activeTab.parsedObj"
                data-tooltip-bottom="拓扑图"
              >
                <Network class="seg-icon" />
              </button>
            </div>
          </div>
          
          <div class="header-actions-group">
            <button class="action-btn outline icon-only" @click="hideOutput" data-tooltip-bottom="隐藏输出">
              <EyeOff class="btn-icon" />
            </button>
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
            <!-- 格式转换输出视图 (当开启转换时自动呈现代码视图) -->
            <div v-if="convertFormat" class="output-wrapper" key="convert">
              <div v-show="showLineNumbers" class="gutter" ref="outputGutterRef" v-html="outputGutterHtml" aria-hidden="true" @wheel.prevent="handleOutputGutterWheel"></div>
              <pre
                class="output-pre"
                :class="{ 'minify-wrap': isOutputMinified }"
                ref="outputPreRef"
                @scroll="handleOutputScroll"
                @mousemove="handleOutputPreMouseMove"
                @mouseleave="handleOutputPreMouseLeave"
                @click="handleOutputPreClick"
                @mouseenter="activeScrollTarget = 'right'"
                @touchstart="activeScrollTarget = 'right'"
                v-html="highlightedOutput || '<span class=\'placeholder\'>等待转换输出...</span>'"
              ></pre>
            </div>

            <!-- Tree view -->
            <div
              v-else-if="activeTab.viewMode === 'tree' && activeTab.parsedObj"
              class="tree-wrapper"
              ref="treeWrapperRef"
              key="tree"
              @scroll="handleTreeScroll"
              @mouseenter="activeScrollTarget = 'right'"
              @touchstart="activeScrollTarget = 'right'"
            >
              <JsonTreeNode :value="activeTab.parsedObj" :is-last="true" :path="[]" />
            </div>

            <!-- Table view -->
            <JsonTableView
              v-else-if="activeTab.viewMode === 'table' && activeTab.parsedObj"
              :data="activeTab.parsedObj"
              :hoveredPath="hoveredPath"
              :selectedPath="selectedPath"
              @hover-path="setHoveredPath"
              @click-path="handlePathClick"
              @mouseenter="activeScrollTarget = 'right'"
              @touchstart="activeScrollTarget = 'right'"
              key="table"
            />

            <!-- Graph (topology) view -->
            <JsonGraphView
              v-else-if="activeTab.viewMode === 'graph' && activeTab.parsedObj"
              :parsedObj="activeTab.parsedObj"
              :hoveredPath="hoveredPath"
              @hover-path="setHoveredPath"
              @click-path="handlePathClick"
              @mouseenter="activeScrollTarget = 'right'"
              @touchstart="activeScrollTarget = 'right'"
              key="graph"
            />
          </Transition>
        </div>
      </div>
    </div>

    <!-- Full-width bottom status bar -->
    <div class="bottom-status-bar">
      <!-- Left side: validation status & hovered key path -->
      <div class="status-bar-left">
        <template v-if="activeTab.validationError">
          <div
            class="status-bar-error-action"
            @click="scrollToErrorLine"
            :title="activeTab.errorLine ? `点击跳转定位到错误所在行 (第 ${activeTab.errorLine} 行)` : '点击跳转定位到错误位置'"
          >
            <AlertTriangle class="status-bar-icon error" />
            <span class="status-bar-text error">JSON 校验失败 &nbsp;·&nbsp; {{ activeTab.validationError }} {{ activeTab.errorLine ? `(第 ${activeTab.errorLine} 行)` : '' }}</span>
            <span v-if="activeTab.errorLine" class="status-bar-error-hint">点击定位</span>
          </div>
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

        <!-- Hovered / Active Key Path Breadcrumbs in status bar -->
        <Transition name="fade-fast">
          <div
            v-if="!activeTab.validationError && pathBreadcrumbs.length > 0"
            class="status-path-breadcrumbs"
          >
            <template v-for="(crumb, idx) in pathBreadcrumbs" :key="crumb.fullPathStr">
              <span v-if="idx > 0" class="breadcrumb-separator">
                <ChevronRight class="breadcrumb-chevron-icon" />
              </span>
              <button
                type="button"
                class="breadcrumb-node-btn"
                :class="{ 'is-root': crumb.isRoot, 'is-index': crumb.isIndex, 'is-last': idx === pathBreadcrumbs.length - 1 }"
                @click.stop="copyBreadcrumbPath(crumb)"
                :title="`点击复制: ${crumb.fullPathStr}`"
              >
                {{ crumb.label }}
              </button>
            </template>
            <button
              type="button"
              class="breadcrumb-copy-all-btn"
              @click.stop="copyHoveredPath"
              :title="`复制完整路径: ${hoveredPathStr}`"
            >
              <Copy class="breadcrumb-copy-icon" />
            </button>
          </div>
        </Transition>
      </div>
      <!-- Right side: output info -->
      <div class="status-bar-right">
        <template v-if="activeTab.outputText">
          <span class="status-bar-text muted">输出 {{ outputLinesCount }} 行</span>
        </template>
      </div>
    </div>

    <!-- 智能数据脱敏配置弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showMaskModal" class="ej-modal-backdrop" @click="showMaskModal = false">
          <div class="ej-modal-dialog mask-modal-dialog" @click.stop>
            <div class="ej-modal-header">
              <div class="ej-modal-title">
                <ShieldCheck class="modal-title-icon" />
                <span>智能数据脱敏配置</span>
              </div>
              <button class="ej-modal-close" @click="showMaskModal = false">
                <X class="modal-close-icon" />
              </button>
            </div>

            <div class="ej-modal-body">
              <!-- 规则选择区 -->
              <div class="mask-section">
                <div class="mask-section-title">内置规则勾选</div>
                <div class="mask-checkbox-grid">
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskPhone" />
                    <Smartphone class="rule-icon" />
                    <span>手机号码 (11位)</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskIdCard" />
                    <IdCard class="rule-icon" />
                    <span>身份证号 (18位)</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskEmail" />
                    <Mail class="rule-icon" />
                    <span>电子邮箱</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskBankCard" />
                    <CreditCard class="rule-icon" />
                    <span>银行卡号</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskIp" />
                    <Globe class="rule-icon" />
                    <span>IP 地址 (v4/v6)</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskLicensePlate" />
                    <Car class="rule-icon" />
                    <span>车牌号码</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskUsci" />
                    <Building2 class="rule-icon" />
                    <span>统一社会信用代码</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskPassport" />
                    <BookUser class="rule-icon" />
                    <span>中国护照号</span>
                  </label>
                  <label class="mask-checkbox-item">
                    <input type="checkbox" v-model="maskOptions.maskDsn" />
                    <Database class="rule-icon" />
                    <span>数据库连接串 (DSN)</span>
                  </label>
                </div>
              </div>

              <!-- 自定义 Key 脱敏区 -->
              <div class="mask-section">
                <div class="mask-section-title">
                  <span>指定 Key 脱敏</span>
                  <span class="section-sub-tip">（匹配到的字段值将自动掩码）</span>
                </div>
                <div class="custom-key-input-row">
                  <input
                    type="text"
                    class="custom-key-input"
                    v-model="customKeyInput"
                    placeholder="输入需要脱敏的 Key 名称 (如 salary, address)，按回车添加"
                    @keydown.enter="addCustomKey"
                  />
                  <button class="custom-key-add-btn" @click="addCustomKey" :disabled="!customKeyInput.trim()">
                    添加
                  </button>
                  <button
                    type="button"
                    class="custom-key-tree-btn"
                    :class="{ active: showKeyTreePicker }"
                    @click="showKeyTreePicker = !showKeyTreePicker"
                    title="从当前 JSON 树形结构可视化选取字段"
                  >
                    <ListTree class="btn-icon-xs" />
                    <span>从当前 JSON 选取</span>
                    <ChevronDown class="tree-toggle-arrow" :class="{ 'is-open': showKeyTreePicker }" />
                  </button>
                </div>

                <!-- 已指定的 Key 列表 -->
                <div v-if="maskOptions.customKeys.length > 0" class="selected-keys-wrap">
                  <span class="selected-key-tag" v-for="k in maskOptions.customKeys" :key="k">
                    {{ k }}
                    <X class="tag-close-icon" @click="removeCustomKey(k)" />
                  </span>
                  <button class="clear-all-keys-btn" @click="clearAllCustomKeys" title="一键清空全部已选字段">
                    <Trash2 class="clear-keys-icon" />
                    <span>一键清空</span>
                  </button>
                </div>

                <!-- 树形结构选取面板 -->
                <MaskKeyTreePicker
                  v-if="showKeyTreePicker"
                  :data="activeTab.parsedObj || parseJsonRobust(activeTab.inputText)"
                  v-model="maskOptions.customKeys"
                  @update:model-value="() => { saveMaskOptions(); updateMaskPreview(); }"
                />
              </div>

              <!-- 实时预览区 -->
              <div class="mask-preview-area">
                <div class="preview-header">
                  <span>脱敏效果实时预览 (当前共处理 {{ maskCountResult }} 处)</span>
                  <button class="preview-copy-btn" @click="copyMaskedData">
                    <Copy class="btn-icon-xs" />
                    <span>复制 JSON</span>
                  </button>
                </div>
                <div class="mask-preview-code-wrap">
                  <pre class="mask-preview-pre output-pre" @click="handleOutputPreClick" v-html="highlightedMaskPreview"></pre>
                </div>
              </div>
            </div>

            <div class="ej-modal-footer">
              <button class="modal-btn outline" @click="showMaskModal = false">取消</button>
              <button class="modal-btn secondary" @click="applyMaskToNewTab">
                <Plus class="btn-icon-xs" />
                <span>在新标签页打开</span>
              </button>
              <button class="modal-btn primary" @click="applyMaskToCurrentTab">
                <Check class="btn-icon-xs" />
                <span>应用到当前编辑器</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- 悬停图片预览全局浮窗 -->
    <ImagePreviewPopover
      :visible="imagePreviewState.visible"
      :url="imagePreviewState.url"
      :targetRect="imagePreviewState.targetRect"
      @close="hideImagePreview(true)"
      @enter="onPopoverEnter"
      @leave="onPopoverLeave"
    />
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
  height: 100%;
  width: 100%;
  position: relative;
  transition: grid-template-columns 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.workspace-grid.single-panel {
  grid-template-columns: 1fr !important;
}

.workspace-grid.is-resizing {
  user-select: none;
  transition: none !important;
}

.workspace-grid.is-resizing .editor-panel {
  pointer-events: none;
}

/* Pane Splitter */
.pane-splitter {
  position: relative;
  width: 1px;
  background-color: var(--border-color);
  cursor: col-resize;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}

.pane-splitter.is-collapsed-left {
  cursor: pointer;
  width: 6px;
  background-color: var(--border-color);
}

.pane-splitter.is-collapsed-right {
  cursor: pointer;
  width: 6px;
  background-color: var(--border-color);
}

.pane-splitter.snap-active-left,
.pane-splitter.snap-active-right {
  background-color: var(--primary-color, #3b82f6) !important;
  box-shadow: 0 0 10px var(--primary-light, rgba(79, 193, 255, 0.4)) !important;
}

/* 隐形鼠标抓取热区：向左右各延伸 6px，视觉保持精细线条，操作手感极佳 */
.pane-splitter::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -6px;
  right: -6px;
  z-index: 1;
  cursor: col-resize;
}

.pane-splitter.is-collapsed-left::before {
  cursor: pointer;
  left: 0;
  right: -8px;
}

.pane-splitter.is-collapsed-right::before {
  cursor: pointer;
  left: -8px;
  right: 0;
}

.pane-splitter-handle {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  width: 9px;
  height: 30px;
  border-radius: 5px;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  color: var(--text-muted, #888);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  transition: border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease, background-color 0.2s ease;
}

.pane-splitter-handle.collapsed-handle {
  width: 14px;
  height: 38px;
  border-radius: 6px;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color-active, var(--border-color));
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

/* 左侧贴边展开把手：固定贴在可见区域左内侧，杜绝被屏幕切边 */
.pane-splitter.is-collapsed-left .pane-splitter-handle {
  left: 0;
  transform: translateY(-50%);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: none;
  padding-right: 1px;
}

/* 右侧贴边展开把手：固定贴在可见区域右内侧，杜绝被屏幕切边 */
.pane-splitter.is-collapsed-right .pane-splitter-handle {
  left: auto;
  right: 0;
  transform: translateY(-50%);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
  padding-left: 1px;
}

.pane-splitter:hover .pane-splitter-handle,
.pane-splitter.active .pane-splitter-handle {
  border-color: var(--primary-color, #3b82f6);
  color: var(--primary-color, #3b82f6);
  background-color: var(--bg-panel);
  box-shadow: 0 0 10px var(--primary-light, rgba(79, 193, 255, 0.3));
  transform: translate(-50%, -50%) scale(1.1);
}

.pane-splitter.is-collapsed-left:hover .pane-splitter-handle {
  border-color: var(--primary-color, #3b82f6);
  color: var(--primary-color, #3b82f6);
  background-color: var(--bg-panel);
  box-shadow: 0 0 12px var(--primary-light, rgba(79, 193, 255, 0.35));
  transform: translateY(-50%) scale(1.1);
  transform-origin: left center;
}

.pane-splitter.is-collapsed-right:hover .pane-splitter-handle {
  border-color: var(--primary-color, #3b82f6);
  color: var(--primary-color, #3b82f6);
  background-color: var(--bg-panel);
  box-shadow: 0 0 12px var(--primary-light, rgba(79, 193, 255, 0.35));
  transform: translateY(-50%) scale(1.1);
  transform-origin: right center;
}

.pane-splitter-icon {
  width: 7px;
  height: 12px;
  stroke-width: 2.2;
}

.pane-splitter-icon.expand-icon {
  width: 11px;
  height: 11px;
  stroke-width: 2.8;
}

/* ─── Floating Snap Badge（遵循系统毛玻璃与主题色调） ─── */
.splitter-snap-badge {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: var(--bg-panel, rgba(255, 255, 255, 0.95));
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
  color: var(--text-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
}

.splitter-snap-badge.badge-center {
  left: 50%;
  transform: translate(-50%, -50%);
}

.splitter-snap-badge.badge-left {
  left: 18px;
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22), 0 0 12px var(--primary-light, rgba(79, 193, 255, 0.25));
}

.splitter-snap-badge.badge-right {
  right: 18px;
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22), 0 0 12px var(--primary-light, rgba(79, 193, 255, 0.25));
}

.snap-badge-icon {
  width: 14px;
  height: 14px;
  color: var(--primary-color, #3b82f6);
  flex-shrink: 0;
}

@keyframes pulseLeft {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-4px); }
}

@keyframes pulseRight {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(4px); }
}

.pulse-left {
  animation: pulseLeft 0.8s ease-in-out infinite;
}

.pulse-right {
  animation: pulseRight 0.8s ease-in-out infinite;
}

/* Fade scale transition */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: translateY(-50%) scale(0.9);
}

/* Editor Panel */
.editor-panel {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-panel);
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

.editor-panel.is-collapsed {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
  border: none !important;
}

.workspace-grid.single-panel .editor-panel {
  min-width: 0 !important;
}

@media (max-width: 600px) {
  .workspace-grid .editor-panel {
    min-width: 0 !important;
  }
}


.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px !important;
  min-height: 40px !important;
  max-height: 40px !important;
  padding: 0 10px !important;
  border-bottom: 1px solid var(--border-color) !important;
  background-color: var(--bg-panel);
  box-sizing: border-box !important;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  overflow: visible;
  flex-wrap: nowrap;
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

.editor-panel:first-child .textarea-overlay-container {
  background-color: rgba(0, 0, 0, 0.01);
}

.editor-panel:first-child .gutter {
  background-color: var(--bg-panel);
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
  min-width: 42px;
  width: auto;
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-color);
  text-align: right;
  padding: 8px 6px 60px 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: var(--editor-line-height, 20px);
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
}

.gutter-line {
  font-size: 12px;
  line-height: var(--editor-line-height, 20px);
  height: var(--editor-line-height, 20px);
  box-sizing: border-box;
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
  padding: 8px 12px 24px 12px;
  font-family: var(--font-mono);
  font-size: var(--editor-font-size, 12px);
  line-height: var(--editor-line-height, 20px);
  overflow: auto;
  flex-grow: 1;
  white-space: pre;
  text-align: left;
  user-select: text;
  min-width: 0;
  color: var(--text-primary);
  /* 大文件虚拟滚动 */
  content-visibility: auto;
  contain-intrinsic-size: auto 3000px;
}

.output-pre .json-key,
.output-pre .json-string,
.output-pre .json-number,
.output-pre .json-boolean,
.output-pre .json-null,
.output-pre .json-bracket {
  cursor: pointer;
  transition: all 0.2s ease;
}

.output-pre .json-key:hover,
.output-pre .json-string:hover,
.output-pre .json-number:hover,
.output-pre .json-boolean:hover,
.output-pre .json-null:hover,
.output-pre .json-bracket:hover {
  text-decoration: underline;
  opacity: 0.8;
}

.output-pre .is-image-url {
  text-decoration: underline dotted var(--accent-color, #6366f1) !important;
  text-underline-offset: 3px;
  cursor: pointer;
}

.output-pre .is-image-url:hover {
  opacity: 0.8;
}

.output-pre .is-web-url {
  text-decoration: underline dotted var(--text-secondary, #9ca3af) !important;
  text-underline-offset: 3px;
  cursor: pointer;
}

.output-pre .is-web-url:hover {
  opacity: 0.8;
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
  padding: 8px 12px;
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
  --seg-padding: 3px;
  position: relative;
  display: inline-flex;
  align-items: center;
  height: calc(var(--seg-size) + 6px);
  background-color: var(--segmented-bg);
  padding: var(--seg-padding);
  border-radius: 8px;
  gap: 2px;
}

.segmented-indicator {
  position: absolute;
  top: 3px;
  height: var(--seg-size);
  width: var(--seg-size);
  background-color: var(--segmented-indicator-bg);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 1;
}

.segmented-indicator.pos-tree {
  left: var(--seg-padding);
}
.segmented-indicator.pos-table {
  left: calc(var(--seg-padding) + var(--seg-size) + 2px);
}
.segmented-indicator.pos-graph {
  left: calc(var(--seg-padding) + var(--seg-size) * 2 + 4px);
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

/* Toolbar Actions (icon-above-text layout) */
.toolbar-actions {
  display: inline-flex;
  align-items: center;
  height: auto;
  padding: 0;
  gap: 1px;
  min-width: 0;
  overflow: visible;
  flex-wrap: nowrap;
  flex-shrink: 1;
}

/* More Tools Dropdown */
.more-tools-dropdown {
  position: relative;
  display: inline-flex;
}

.more-tools-trigger {
  flex-direction: row !important;
  gap: 3px !important;
  padding: 4px 7px !important;
}

.more-arrow-icon {
  width: 10px;
  height: 10px;
  transition: transform 0.2s ease;
  color: var(--text-muted);
}

.more-arrow-icon.is-open {
  transform: rotate(180deg);
}

.more-tools-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 170px;
  background: var(--bg-panel, #ffffff);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.15), 0 4px 10px -2px rgba(0, 0, 0, 0.05);
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 999;
}

:global(.dark-mode) .more-tools-menu {
  background: rgba(45, 45, 52, 0.95);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
}

.more-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 500;
  font-family: var(--font-sans);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.more-menu-item:hover {
  background-color: var(--primary-light, rgba(37, 99, 235, 0.08));
  color: var(--primary-color);
}

:global(.dark-mode) .more-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.more-menu-item.active {
  background-color: var(--primary-light, rgba(37, 99, 235, 0.12));
  color: var(--primary-color);
}

.more-item-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-muted);
}

.more-menu-item:hover .more-item-icon,
.more-menu-item.active .more-item-icon {
  color: inherit;
}

/* Fade Dropdown Transition */
.fade-dropdown-enter-active,
.fade-dropdown-leave-active {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.more-menu-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 3px 0;
}

.more-menu-item.danger-item:hover {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* ─── 极窄模式（< 380px）纯图标收敛与防挤压 ─── */
.editor-panel.is-ultra-narrow .toolbar-item {
  min-width: 28px !important;
  padding: 3px 4px !important;
}

.editor-panel.is-ultra-narrow .toolbar-label {
  display: none !important;
}

.editor-panel.is-ultra-narrow .toolbar-icon {
  width: 15px;
  height: 15px;
}

.editor-panel.is-ultra-narrow .more-tools-trigger {
  padding: 3px 4px !important;
  min-width: 32px !important;
}

.editor-panel.is-ultra-narrow .more-tools-trigger .more-arrow-icon {
  display: none;
}

.toolbar-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 2px 8px;
  min-width: 38px;
  height: auto;
  border: none;
  background: var(--toolbar-item-bg);
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans);
  white-space: nowrap;
  transform: scale(1);
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}

:global(.dark-mode) .toolbar-item {
  color: #cbd5e1;
}

.toolbar-item:hover:not(:disabled) {
  background-color: var(--segmented-indicator-bg);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

:global(.dark-mode) .toolbar-item:hover:not(:disabled),
:global(.dark-mode) .toolbar-item.active {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.10);
}

.toolbar-item:active:not(:disabled) {
  transform: scale(0.95);
}

.toolbar-item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.toolbar-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.toolbar-label {
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
}

.toolbar-divider {
  width: 1px;
  height: 28px;
  background-color: var(--border-color);
  margin: 0 3px;
  opacity: 0.4;
}

/* Hover style in highlight pre
:deep(.editor-highlight [data-path].is-hovered) {
  background-color: var(--json-hover-bg);
  border-radius: 6px;
  box-shadow: 0 0 0 2px var(--json-hover-bg);
}
*/



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

.status-bar-error-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  margin: -2px -4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.status-bar-error-action:hover {
  background-color: var(--error-bg, rgba(239, 68, 68, 0.1));
}
.status-bar-error-action:hover .status-bar-text.error {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.status-bar-error-hint {
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
.status-bar-error-action:hover .status-bar-error-hint {
  background-color: var(--error-text);
  color: #fff;
  border-color: var(--error-text);
}

.status-path-breadcrumbs {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: 0.5rem;
  padding: 0.09375rem 0.375rem;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--breadcrumb-text);
  user-select: none;
  animation: fadeInPath 0.15s ease-out;
  overflow-x: auto;
  max-width: calc(100vw - 20rem);
  transition: all 0.15s ease;
}

@keyframes fadeInPath {
  from { opacity: 0; transform: translateY(1px); }
  to { opacity: 1; transform: translateY(0); }
}

.breadcrumb-separator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--breadcrumb-sep);
  padding: 0 0.125rem;
  opacity: 0.85;
}

.breadcrumb-chevron-icon {
  width: 0.8975rem;
  height: 0.8975rem;
  stroke-width: 2.2;
}

.breadcrumb-node-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.25rem;
  border: none;
  border-radius: 0.1875rem;
  background: transparent;
  color: var(--breadcrumb-text);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.3;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.breadcrumb-node-btn:hover {
  background: var(--breadcrumb-hover-bg);
  color: var(--breadcrumb-hover-text);
}

.breadcrumb-node-btn.is-root {
}

.breadcrumb-node-btn.is-index {
  color: var(--breadcrumb-index);
}

.breadcrumb-node-btn.is-last {
  color: var(--breadcrumb-target);
  font-weight: 500;
}

.breadcrumb-copy-all-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem 0.1875rem;
  margin-left: 0.25rem;
  border: none;
  background: transparent;
  color: var(--breadcrumb-copy-color);
  border-radius: 0.1875rem;
  cursor: pointer;
  opacity: 0.85;
  transition: all 0.15s ease;
}

.breadcrumb-copy-all-btn:hover {
  opacity: 1;
  color: var(--breadcrumb-copy-hover);
  background: var(--breadcrumb-copy-hover-bg);
}

.breadcrumb-copy-icon {
  width: 0.875rem;
  height: 0.875rem;
}

.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
  transform: translateY(2px);
}

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

@media (max-width: 960px) {
  .panel-header {
    flex-wrap: wrap;
  }
  .toolbar-item {
    padding: 2px 6px;
    min-width: 34px;
  }
  .toolbar-divider {
    margin: 0 1px;
  }
  .header-search-wrapper {
    flex-shrink: 1;
    min-width: 0;
    gap: 2px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .header-search-wrapper .action-btn.icon-only {
    width: 26px !important;
    height: 26px !important;
    min-width: 26px !important;
  }
  .header-search-wrapper .btn-icon {
    width: 12px;
    height: 12px;
  }
}

body.utools-mode {
  .header-search-wrapper {
    flex-shrink: 1;
    min-width: 0;
    gap: 2px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .header-search-wrapper .action-btn.icon-only {
    width: 26px !important;
    height: 26px !important;
    min-width: 26px !important;
  }
  .header-search-wrapper .btn-icon {
    width: 12px;
    height: 12px;
  }
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
  flex-shrink: 0;
}

/* Search & Replace Box */
.search-replace-box {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 310px;
  max-width: calc(100vw - 20px);
  height: auto;
  box-sizing: border-box;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06);
  z-index: 100;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: box-shadow 0.2s ease;
}

.dark-mode .search-replace-box {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25);
  background-color: rgba(40, 40, 46, 0.95);
}

.search-replace-box:focus-within {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 0 0 2px var(--primary-light);
}

.dark-mode .search-replace-box:focus-within {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 2px var(--primary-light);
}

.search-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  min-height: 28px;
  box-sizing: border-box;
  width: 100%;
}

.replace-row {
  border-top: 1px solid var(--border-color);
  padding-left: 25px;
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

/* ─── JSONPath 嵌入式顶部过滤栏 ─── */
/* ─── JSONPath 嵌入式顶部工具栏 ─── */
.jsonpath-inline-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 10px;
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  z-index: 15;
  flex-shrink: 0;
  box-sizing: border-box;
}

.dark-mode .jsonpath-inline-bar {
  background-color: var(--bg-panel);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}

/* 第一行：输入框 + 匹配计数 + 应用 + 复制 + 关闭 */
.jp-main-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.jp-bar-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--primary-color);
  background: var(--primary-light, rgba(99, 102, 241, 0.12));
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.jp-bar-input {
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-mono);
  flex: 1;
  min-width: 120px;
  padding: 3px 8px;
  height: 26px;
  border-radius: 4px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.jp-bar-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-light, rgba(99, 102, 241, 0.15));
}

.jp-bar-input::placeholder {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 11px;
}

.jp-bar-match-count {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
}

.dark-mode .jp-bar-match-count {
  background: rgba(255, 255, 255, 0.08);
}

.jp-bar-match-count.has-matches {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
  font-weight: 600;
}

.dark-mode .jp-bar-match-count.has-matches {
  background: rgba(34, 197, 94, 0.25);
  color: #4ade80;
}

.jp-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.jp-action-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--primary-color);
}

.jp-action-btn.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #ffffff;
}

.jp-action-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.jp-action-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.jp-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: all 0.1s ease;
}

.jp-close-btn:hover {
  color: var(--text-primary);
  background-color: var(--border-color);
}

/* 第二行：预设表达式快速选择 */
.jp-presets-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding-left: 2px;
}

.jp-preset-label {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.jp-preset-pill {
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 1px 7px;
  border-radius: 3px;
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.jp-preset-pill:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.jp-preset-pill.active {
  background: var(--primary-light, rgba(99, 102, 241, 0.12));
  color: var(--primary-color);
  border-color: var(--primary-color);
  font-weight: 500;
}

/* 丝滑无卡顿的过渡动画 (GPU-accelerated, 无重排) */
.jp-slide-enter-active,
.jp-slide-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.jp-slide-enter-from,
.jp-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ─── 通用模态弹窗样式 (rem 响应式全分辨率自适应) ─── */
.ej-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1.25rem;
  box-sizing: border-box;
}

.ej-modal-dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  box-shadow: 0 1.25rem 3rem -0.5rem rgba(0, 0, 0, 0.22), 0 0.25rem 0.75rem -0.125rem rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  max-width: 90vw;
  max-height: 85vh;
  overflow: hidden;
  animation: modalPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPopIn {
  from { opacity: 0; transform: scale(0.96) translateY(0.5rem); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.ej-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
}

.ej-modal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-title-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: var(--primary-color, #6366f1);
}

.ej-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ej-modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.modal-close-icon {
  width: 1rem;
  height: 1rem;
}

.ej-modal-body {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  overflow-y: auto;
}

.mask-preview-area {
  display: flex;
  flex-direction: column;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
  overflow: hidden;
  background: var(--bg-app);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--bg-input, rgba(0, 0, 0, 0.03));
  border-bottom: 1px solid var(--border-color);
  font-size: 0.71875rem;
  font-weight: 500;
  color: var(--text-muted);
}

.dark-mode .preview-header {
  background: rgba(255, 255, 255, 0.04);
}

.preview-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.6875rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preview-copy-btn:hover {
  border-color: var(--primary-color, #6366f1);
}

.mask-preview-code-wrap {
  position: relative;
  background: var(--bg-app);
  max-height: 13.75rem;
  min-height: 8.75rem;
  overflow: auto;
  padding: 0.625rem 0.875rem;
  box-sizing: border-box;
}

.mask-preview-pre {
  margin: 0;
  padding: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.55;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  background: transparent;
}

.mask-preview-line {
  min-height: 1.55em;
  line-height: 1.55;
  padding: 0 0.375rem;
  margin: 0 -0.375rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s ease;
}

.mask-preview-line.is-masked-line {
  background: rgba(245, 158, 11, 0.12);
  border-left: 3px solid #f59e0b;
  padding-left: 0.375rem;
}

.dark-mode .mask-preview-line.is-masked-line {
  background: rgba(245, 158, 11, 0.18);
  border-left: 3px solid #fbbf24;
}

.rule-icon {
  width: 0.875rem;
  height: 0.875rem;
  color: var(--primary-color, #6366f1);
  flex-shrink: 0;
}

.mask-highlight-mark {
  background: rgba(245, 158, 11, 0.25);
  color: #b45309;
  font-weight: 700;
  padding: 0 0.25rem;
  margin: 0 0.0625rem;
  border-radius: 0.1875rem;
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.35);
  display: inline;
}

.dark-mode .mask-highlight-mark {
  background: rgba(245, 158, 11, 0.32);
  color: #fde68a;
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.45);
}

.ej-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 2rem;
  padding: 0 0.875rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.modal-btn.outline {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.modal-btn.outline:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.modal-btn.secondary {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.modal-btn.secondary:hover {
  border-color: var(--primary-color, #6366f1);
}

.modal-btn.primary {
  background: var(--primary-color, #6366f1);
  border: 1px solid var(--primary-color, #6366f1);
  color: #ffffff;
}

.modal-btn.primary:hover {
  opacity: 0.9;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.btn-icon-xs {
  width: 0.8125rem;
  height: 0.8125rem;
}

/* ─── Data Masking Modal Styles (rem 响应式) ─── */
.mask-modal-dialog {
  width: min(47.5rem, 90vw);
}

.mask-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mask-section-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.section-sub-tip {
  font-size: 0.6875rem;
  font-weight: 400;
  color: var(--text-muted);
}

.mask-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11.25rem, 1fr));
  gap: 0.5rem 0.75rem;
  padding: 0.625rem 0.875rem;
  background: var(--bg-input, rgba(0, 0, 0, 0.03));
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
}

.mask-checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.mask-checkbox-item input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--primary-color, #6366f1);
}

.custom-key-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.custom-key-input {
  flex: 1;
  height: 2rem;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  font-size: 0.75rem;
  color: var(--text-primary);
  outline: none;
  font-family: var(--font-mono);
  box-sizing: border-box;
}

.custom-key-input:focus {
  border-color: var(--primary-color, #6366f1);
}

.custom-key-add-btn {
  height: 2rem;
  padding: 0 0.875rem;
  border-radius: 0.375rem;
  border: 1px solid var(--border-color);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.custom-key-add-btn:hover:not(:disabled) {
  border-color: var(--primary-color, #6366f1);
  color: var(--primary-color, #6366f1);
}

.custom-key-add-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.selected-keys-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.25rem 0;
}

.selected-key-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.71875rem;
  font-family: var(--font-mono);
  background: var(--primary-light, rgba(99, 102, 241, 0.12));
  color: var(--primary-color, #6366f1);
  border: 1px solid var(--primary-color, #6366f1);
}

.tag-close-icon {
  width: 0.75rem;
  height: 0.75rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.1s ease;
}

.tag-close-icon:hover {
  opacity: 1;
}

.clear-all-keys-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.1875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px dashed rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  transition: all 0.15s ease;
}

.clear-all-keys-btn:hover {
  background: #ef4444;
  color: #ffffff;
  border-color: #ef4444;
  border-style: solid;
}

.clear-keys-icon {
  width: 0.75rem;
  height: 0.75rem;
}

.custom-key-tree-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  height: 2rem;
  padding: 0 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.custom-key-tree-btn:hover {
  border-color: var(--primary-color, #6366f1);
  color: var(--primary-color, #6366f1);
  background: var(--bg-hover);
}

.custom-key-tree-btn.active {
  background: var(--primary-light, rgba(99, 102, 241, 0.12));
  border-color: var(--primary-color, #6366f1);
  color: var(--primary-color, #6366f1);
}

.tree-toggle-arrow {
  width: 0.8125rem;
  height: 0.8125rem;
  transition: transform 0.2s ease;
}

.tree-toggle-arrow.is-open {
  transform: rotate(180deg);
}

/* ─── 模态弹窗全分辨率与响应式适配 (rem 尺寸单位) ─── */
@media (max-width: 768px) {
  .ej-modal-backdrop {
    padding: 0.625rem;
  }

  .mask-modal-dialog {
    width: 100%;
    max-width: 100%;
    max-height: calc(100vh - 1.25rem);
    border-radius: 0.625rem;
  }

  .ej-modal-header {
    padding: 0.625rem 0.875rem;
  }

  .ej-modal-title {
    font-size: 0.875rem;
  }

  .ej-modal-body {
    padding: 0.75rem 0.875rem;
    gap: 0.625rem;
  }

  .mask-checkbox-grid {
    grid-template-columns: repeat(auto-fill, minmax(8.125rem, 1fr));
    padding: 0.5rem 0.625rem;
    gap: 0.375rem 0.5rem;
  }

  .custom-key-input-row {
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .custom-key-input {
    min-width: 100%;
  }

  .custom-key-add-btn,
  .custom-key-tree-btn {
    flex: 1;
    justify-content: center;
  }

  .mask-preview-code-wrap {
    max-height: 11.25rem;
    min-height: 6.25rem;
    padding: 0.5rem 0.625rem;
  }

  .ej-modal-footer {
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.625rem 0.875rem;
  }

  .modal-btn {
    flex: 1;
    justify-content: center;
    height: 2.125rem;
  }
}

@media (max-width: 480px) {
  .mask-checkbox-grid {
    grid-template-columns: 1fr 1fr;
  }

  .mask-checkbox-item {
    font-size: 0.6875rem;
  }
}

@media (max-height: 600px) {
  .ej-modal-backdrop {
    padding: 0.5rem;
  }

  .mask-modal-dialog {
    max-height: calc(100vh - 1rem);
  }

  .ej-modal-header {
    padding: 0.5rem 0.875rem;
  }

  .ej-modal-body {
    padding: 0.625rem 0.875rem;
    gap: 0.5rem;
  }

  .mask-checkbox-grid {
    padding: 0.375rem 0.5rem;
    gap: 0.25rem 0.375rem;
  }

  .mask-preview-code-wrap {
    max-height: 8.125rem;
    min-height: 5rem;
  }

  .ej-modal-footer {
    padding: 0.5rem 0.875rem;
  }
}
</style>
