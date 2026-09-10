<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, inject, nextTick } from 'vue'
import { ExternalLink, Image as ImageIcon, Volume2, Video as VideoIcon, Table, GitFork, Copy, ArrowLeft, Minus, Plus, Map as MapIcon, Clock, Braces, X, UnfoldVertical, FoldVertical, CalendarClock, KeyRound } from 'lucide-vue-next'
import { safeStringify } from '../utils/jsonBigInt.js'
import { isImageUrl, isHttpUrl, isColorValue, openExternalUrl } from '../utils/imageDetector.js'
import { detectTimestamp, detectUnicode, detectNestedJson, getFormatNow } from '../utils/capsuleDetector.js'
import { detectMedia, detectBase64Text, detectUrlEncoded, detectCron, detectJwt, detectHtml } from '../utils/advancedDetectors.js'

const searchQuery = inject('searchQuery', ref(''))
const imagePreview = inject('imagePreview', null)
const smartPreview = inject('smartPreview', null)
const showToast = inject('showToast', null)
const isDark = inject('isDark', ref(true))
const openNestedJsonTab = inject('openNestedJsonTab', null)

const getBase64Data = (v) => {
  if (typeof v !== 'string' || isColor(v) || isImg(v) || detectNestedJson(v)) return null
  return detectBase64Text(v)
}

const getUrlEncodedData = (v) => {
  if (typeof v !== 'string' || isColor(v) || isImg(v) || detectNestedJson(v)) return null
  if (detectBase64Text(v)) return null
  return detectUrlEncoded(v)
}

const getCronData = (v) => {
  if (typeof v !== 'string' || isColor(v) || isImg(v) || detectNestedJson(v)) return null
  if (getBase64Data(v) || getUrlEncodedData(v)) return null
  return detectCron(v)
}

const getSmartData = (v) => {
  if (typeof v !== 'string') return null
  if (isColor(v) || isImg(v) || getMediaData(v) || detectNestedJson(v) || getBase64Data(v) || getUrlEncodedData(v) || getCronData(v)) return null
  return detectJwt(v) || detectHtml(v)
}

const getUnicodeData = (v, path = []) => {
  if (typeof v !== 'string' || !v) return null
  return detectUnicode(v, props.rawInput, path)
}

const getDisplayValue = (v, path = []) => {
  if (typeof v !== 'string') return v
  const uData = getUnicodeData(v, path)
  let disp = (uData && uData.decodedText && uData.decodedText !== v) ? uData.decodedText : v
  const b64 = getBase64Data(disp)
  if (b64) return b64.decoded
  const urlEnc = getUrlEncodedData(disp)
  if (urlEnc) return urlEnc.decoded
  return disp
}

const handleCopyRaw = (rawVal, label = '原值') => {
  if (rawVal === undefined || rawVal === null) return
  const text = String(rawVal)
  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      showToast(`已复制 ${label}`)
    }
  })
}

const handleCopyKey = (key) => {
  if (key === null || key === undefined) return
  navigator.clipboard.writeText(String(key)).then(() => {
    if (showToast) {
      showToast(`已复制键名: ${key}`)
    }
  })
}

const handleCopyValue = (val) => {
  if (val === undefined || val === null) return
  const disp = getDisplayValue(val)
  let text = ''
  if (typeof disp === 'object') {
    text = safeStringify(disp, null, 2)
  } else if (typeof disp === 'string' && detectNestedJson(disp)) {
    text = JSON.stringify(disp)
  } else {
    text = typeof disp === 'string' ? disp : String(disp)
  }

  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      const truncated = text.length > 20 ? text.substring(0, 20) + '...' : text
      showToast(`已复制键值: ${truncated}`)
    }
  })
}

const handleCopyColumn = (arr, colKey) => {
  if (!Array.isArray(arr) || colKey === null || colKey === undefined) return
  const values = arr.map(item => {
    if (item === null || item === undefined || typeof item !== 'object') return ''
    return item[colKey] !== undefined ? item[colKey] : ''
  })
  const text = safeStringify(values, null, 2)
  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      showToast(`已复制整列「${colKey}」数据 (${values.length} 项)`)
    }
  })
}

const isColor = (v) => typeof v === 'string' && isColorValue(v)
const getMediaData = (v) => typeof v === 'string' && !isColor(v) ? detectMedia(v) : null
const isAudio = (v) => getMediaData(v)?.mediaType === 'audio'
const isVideo = (v) => getMediaData(v)?.mediaType === 'video'
const isImg = (v) => typeof v === 'string' && !isColor(v) && !getMediaData(v) && isImageUrl(v)
const isHttpLink = (v) => typeof v === 'string' && !isColor(v) && !getMediaData(v) && !isImg(v) && isHttpUrl(v)

const handleOpenUrl = (url) => {
  openExternalUrl(url)
  if (showToast) {
    showToast('已在浏览器打开链接')
  }
}

const onSmartMouseEnter = (sData, e) => {
  if (smartPreview && sData) smartPreview.show(sData, e.currentTarget)
}

const onSmartMouseLeave = () => {
  if (smartPreview) smartPreview.hide()
}

const onValMouseEnter = (v, e) => {
  if (typeof v === 'string') {
    const m = getMediaData(v)
    if (m && imagePreview) {
      imagePreview.show(v, e.currentTarget)
      return
    }
    if (isImg(v) && imagePreview) {
      imagePreview.show(v, e.currentTarget)
      return
    }
    const s = getSmartData(v)
    if (s && smartPreview) {
      smartPreview.show(s, e.currentTarget)
      return
    }
  }
}

const onValMouseLeave = (v) => {
  if (imagePreview) {
    imagePreview.hide()
  }
  if (smartPreview) {
    smartPreview.hide()
  }
}

const escapeHtml = (str) => {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const highlightText = (text, query) => {
  if (text === null || text === undefined) return ''
  const str = String(text)
  const escapedText = escapeHtml(str)
  if (!query) return escapedText
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  return escapedText.replace(regex, '<mark class="search-match">$1</mark>')
}

// 估算字符串渲染像素宽度（基于系统/等宽字体，中文及全角字符 13px，半角 ASCII 7.8px）
const estimateTextWidth = (str) => {
  if (!str) return 0
  const s = String(str)
  let w = 0
  for (let i = 0; i < s.length; i++) {
    w += s.charCodeAt(i) > 255 ? 13 : 7.8
  }
  return Math.ceil(w)
}

const props = defineProps({
  parsedObj: { required: true },
  rawInput: { type: String, default: '' },
  hoveredPath: { type: Array, default: null },
  selectedPath: { type: Array, default: null }
})

const emit = defineEmits(['hover-path', 'click-path'])

let isInternalGraphClick = false

const emitClick = (path, type = 'all') => {
  isInternalGraphClick = true
  emit('click-path', path, type)
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CARD_ROW_H    = 22   // height of each row inside a standard card
const CARD_PAD      = 6    // vertical padding inside standard card (上下内边距 6px，边缘舒适不贴边)
const CARD_GAP      = 24   // vertical gap between cards (prevents crowding)
const COL_GAP       = 130  // horizontal gap between columns (generous channel for non-occluding curves)
const BULLET_R      = 3.5  // bullet circle radius

const SWITCH_BAR_H  = 24   // switch bar height in standard card
const TABLE_TITLE_H = 26   // table node title bar height
const TABLE_THEAD_H = 24   // table node thead row height
const TABLE_ROW_H   = 22   // table node row height
const NODE_MAX_VISIBLE_ROWS = 50 // 节点高度是 50 行的高度，超过 50 行直接开启节点内虚拟滚动
const VIRTUAL_BUFFER_ROWS = 8   // 虚拟渲染上下缓冲行数
const MAX_TOTAL_GRAPH_NODES = 200 // 全图最大拓扑节点数量保护，保证流畅渲染
const nodeScrollState = reactive({})

const getNodeScrollTop = (nodeId) => {
  return nodeScrollState[nodeId] || 0
}

const setNodeScrollTop = (nodeId, val) => {
  nodeScrollState[nodeId] = val
}

const handleNodeScroll = (nodeId, e) => {
  setNodeScrollTop(nodeId, e.target.scrollTop)
}

// ─── Table Mode Control (全局模式 + 单节点覆盖) ──────────────────────────────────
const globalTableMode = ref(true)
const nodeTableOverrides = ref(new Map())

const isTableModeForNode = (path, isObjArray) => {
  if (!isObjArray) return false
  const pathKey = JSON.stringify(path)
  if (nodeTableOverrides.value.has(pathKey)) {
    return nodeTableOverrides.value.get(pathKey)
  }
  return globalTableMode.value
}

const findNodeScrollEl = (nodeId) => {
  if (!containerRef.value) return null
  const allScrollEls = containerRef.value.querySelectorAll('.table-card-body, .card-entries-viewport')
  for (const el of allScrollEls) {
    if (el.getAttribute('data-node-id') === nodeId) {
      return el
    }
  }
  return null
}

const toggleNodeTableMode = (path) => {
  const pathKey = JSON.stringify(path)
  const isCurrentlyTable = isTableModeForNode(path, true)
  const nextMode = !isCurrentlyTable

  // 1. 不可变 Map 替换赋值，彻底激活 Vue 响应式依赖更新！
  const newMap = new Map(nodeTableOverrides.value)
  newMap.set(pathKey, nextMode)
  nodeTableOverrides.value = newMap

  // 2. 关键修复：重置该节点在切片引擎中的旧滚动高度，确保新模式从顶部 (0) 开始切片！
  setNodeScrollTop(pathKey, 0)

  // 3. 在 nextTick 中，确保新挂载的视口容器 scrollTop 强制归零，彻底杜绝 spacer 悬空导致的白屏！
  nextTick(() => {
    const el = findNodeScrollEl(pathKey)
    if (el) {
      el.scrollTop = 0
    }
  })
}

const toggleGlobalTableMode = () => {
  globalTableMode.value = !globalTableMode.value
  nodeTableOverrides.value = new Map() // 新 Map 触发响应式
  Object.keys(nodeScrollState).forEach(k => { delete nodeScrollState[k] })

  nextTick(() => {
    if (containerRef.value) {
      const scrollEls = containerRef.value.querySelectorAll('.table-card-body, .card-entries-viewport')
      scrollEls.forEach(el => { el.scrollTop = 0 })
    }
  })

  if (showToast) {
    showToast(globalTableMode.value ? '已启用表格紧凑模式 (行转列)' : '已切换为树形发散模式')
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isPrimitive = (v) => v === null || typeof v !== 'object'

const getValueType = (v) => {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  return typeof v
}

const getPreview = (v) => {
  if (v === undefined) return ''
  const disp = getDisplayValue(v)
  if (disp === null) return 'null'
  if (Array.isArray(disp)) return `[${disp.length}]`
  if (typeof disp === 'object') return `{${Object.keys(disp).length}}`
  if (typeof disp === 'string') {
    if (detectNestedJson(disp)) {
      return JSON.stringify(disp)
    }
    return disp.replace(/\r?\n\s*/g, ' ')
  }
  if (typeof disp === 'boolean') return disp ? 'true' : 'false'
  return String(disp)
}

// ─── Timestamp Popover State & Control ─────────────────────────
const activeTimeMenu = ref(null)
let timeMenuTimer = null
const currentNowStr = ref('')
let nowTimer = null

const startNowTimer = () => {
  currentNowStr.value = getFormatNow()
  if (!nowTimer) {
    nowTimer = setInterval(() => {
      currentNowStr.value = getFormatNow()
    }, 1000)
  }
}

const stopNowTimer = () => {
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
}

watch(activeTimeMenu, (val) => {
  if (!val) {
    stopNowTimer()
  }
})

onBeforeUnmount(() => {
  stopNowTimer()
  if (timeMenuTimer) clearTimeout(timeMenuTimer)
  if (nestedMenuTimer) clearTimeout(nestedMenuTimer)
})

const openTimeMenu = (tData, event) => {
  if (!tData || !event || !event.currentTarget) return
  startNowTimer()
  const rect = event.currentTarget.getBoundingClientRect()
  const popWidth = 290
  const popHeight = tData.isIso ? 180 : 155
  const padding = 12

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = Math.max(padding, Math.min(viewportWidth - popWidth - padding, rect.left))
  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top

  let top = 0
  if (spaceBelow >= popHeight + 10 || spaceBelow >= spaceAbove) {
    top = rect.bottom + 6
    if (top + popHeight > viewportHeight - padding) {
      top = Math.max(padding, viewportHeight - popHeight - padding)
    }
  } else {
    top = Math.max(padding, rect.top - popHeight - 6)
  }

  activeTimeMenu.value = {
    top,
    left,
    timeData: tData
  }
}

const onTimeBadgeEnter = (tData, event) => {
  if (timeMenuTimer) {
    clearTimeout(timeMenuTimer)
    timeMenuTimer = null
  }
  openTimeMenu(tData, event)
}

const onTimeBadgeLeave = () => {
  timeMenuTimer = setTimeout(() => {
    activeTimeMenu.value = null
  }, 220)
}

const onPopoverEnter = () => {
  if (timeMenuTimer) {
    clearTimeout(timeMenuTimer)
    timeMenuTimer = null
  }
}

const onPopoverLeave = () => {
  timeMenuTimer = setTimeout(() => {
    activeTimeMenu.value = null
  }, 220)
}

const copyTimeFormat = (val, label) => {
  if (!val) return
  navigator.clipboard.writeText(String(val)).then(() => {
    if (showToast) {
      showToast(`已复制${label}: ${val}`)
    }
    activeTimeMenu.value = null
  })
}

const closeTimeMenu = () => {
  if (timeMenuTimer) {
    clearTimeout(timeMenuTimer)
    timeMenuTimer = null
  }
  stopNowTimer()
  activeTimeMenu.value = null
}

// ─── Unicode Handler ──────────────────────────────────────────
const handleCopyUnicode = (uData) => {
  if (!uData) return
  navigator.clipboard.writeText(uData.originalUnicode).then(() => {
    if (showToast) {
      showToast(`已复制 Unicode 原文: ${uData.originalUnicode}`)
    }
  })
}

// ─── Nested JSON Popover & Expand State ────────────────────────
const activeNestedMenu = ref(null)
let nestedMenuTimer = null
const expandedNestedPaths = ref(new Set())

const isNestedExpanded = (path) => expandedNestedPaths.value.has(JSON.stringify(path))

const openNestedMenu = (path, val, title, event) => {
  const target = event.currentTarget || event.target
  if (!target) return

  const rect = target.getBoundingClientRect()
  const popWidth = 190
  const popHeight = 36
  const padding = 10
  const viewportWidth = window.innerWidth || 1200
  const viewportHeight = window.innerHeight || 800

  let left = rect.left
  if (left + popWidth > viewportWidth - padding) {
    left = Math.max(padding, viewportWidth - popWidth - padding)
  }

  const spaceBelow = viewportHeight - rect.bottom
  let top = 0
  if (spaceBelow >= popHeight + 6) {
    top = rect.bottom + 4
  } else {
    top = Math.max(padding, rect.top - popHeight - 4)
  }

  const pathStr = JSON.stringify(path)
  activeNestedMenu.value = {
    top,
    left,
    path,
    val,
    title,
    isExpanded: expandedNestedPaths.value.has(pathStr)
  }
}

const onNestedBadgeEnter = (path, val, title, event) => {
  if (nestedMenuTimer) {
    clearTimeout(nestedMenuTimer)
    nestedMenuTimer = null
  }
  openNestedMenu(path, val, title, event)
}

const onNestedBadgeLeave = () => {
  nestedMenuTimer = setTimeout(() => {
    activeNestedMenu.value = null
  }, 220)
}

const onNestedPopoverEnter = () => {
  if (nestedMenuTimer) {
    clearTimeout(nestedMenuTimer)
    nestedMenuTimer = null
  }
}

const onNestedPopoverLeave = () => {
  nestedMenuTimer = setTimeout(() => {
    activeNestedMenu.value = null
  }, 220)
}

const toggleNestedExpand = (path) => {
  if (!path) return
  const pathStr = JSON.stringify(path)
  const nextSet = new Set(expandedNestedPaths.value)
  if (nextSet.has(pathStr)) {
    nextSet.delete(pathStr)
    if (showToast) {
      showToast('已收回嵌套 JSON 拓扑节点')
    }
  } else {
    nextSet.add(pathStr)
    if (showToast) {
      showToast('已展开嵌套 JSON 拓扑节点')
    }
  }
  expandedNestedPaths.value = nextSet
  activeNestedMenu.value = null
}

const handleOpenInNewTab = (val, title) => {
  if (openNestedJsonTab) {
    openNestedJsonTab(val, title || '嵌套 JSON')
  } else {
    try {
      const parsed = typeof val === 'string' ? JSON.parse(val.trim()) : val
      navigator.clipboard.writeText(safeStringify(parsed, null, 2))
      if (showToast) {
        showToast('已复制解开后的嵌套 JSON 内容')
      }
    } catch (e) {}
  }
  activeNestedMenu.value = null
}

const closeNestedMenu = () => {
  if (nestedMenuTimer) {
    clearTimeout(nestedMenuTimer)
    nestedMenuTimer = null
  }
  activeNestedMenu.value = null
}

const getValueColorClass = (type) => {
  if (type === 'string') return 'tree-string'
  if (type === 'number' || type === 'bigint') return 'tree-number'
  if (type === 'boolean') return 'tree-boolean'
  if (type === 'null') return 'tree-null'
  return ''
}

const getEntryPath = (node, entry) => {
  const key = node.isArray ? Number(entry.key) : entry.key
  return [...node.path, key]
}

const isArrayOfObjects = (v) => {
  return Array.isArray(v) && v.length > 0 && v.every(item => item !== null && typeof item === 'object' && !Array.isArray(item))
}

const getColumnsFromObjectArray = (arr) => {
  const cols = []
  const seen = new Set()
  // 性能保护采样：前 100 项采样足以覆盖全部数据列，避免数万项全量扫描
  const sampleLimit = Math.min(arr.length, 100)
  for (let i = 0; i < sampleLimit; i++) {
    const item = arr[i]
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const k of Object.keys(item)) {
        if (!seen.has(k)) {
          seen.add(k)
          cols.push(k)
        }
      }
    }
  }
  return cols
}

// ─── 卡片内虚拟滚动引擎 (针对海量数据实现 60FPS 极速虚拟切片) ───────────────────
const getTableVisibleRows = (node) => {
  if (!node.isVirtualScroll || !node.rawData) {
    return {
      rows: node.tableRows,
      topSpacer: 0,
      bottomSpacer: 0
    }
  }

  const scrollTop = getNodeScrollTop(node.id)
  const total = node.totalCount
  const visibleCount = NODE_MAX_VISIBLE_ROWS + VIRTUAL_BUFFER_ROWS * 2
  const rawStartIndex = Math.max(0, Math.floor(scrollTop / TABLE_ROW_H) - VIRTUAL_BUFFER_ROWS)
  const maxStartIndex = Math.max(0, total - visibleCount)
  const startIndex = Math.min(rawStartIndex, maxStartIndex)
  const endIndex = Math.min(total, startIndex + visibleCount)

  const topSpacer = startIndex * TABLE_ROW_H
  const bottomSpacer = Math.max(0, (total - endIndex) * TABLE_ROW_H)

  const rawSlice = node.rawData.slice(startIndex, endIndex)
  const rows = rawSlice.map((item, localIdx) => {
    const rowIdx = startIndex + localIdx
    const cells = node.columns.map(col => {
      const cellPath = [...node.path, rowIdx, col]
      const val = item ? item[col] : undefined
      const isNestedExp = expandedNestedPaths.value.has(JSON.stringify(cellPath)) && !!detectNestedJson(val)
      const isComplex = isNestedExp || (val !== null && val !== undefined && typeof val === 'object' && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0))
      const childNodeId = isComplex ? JSON.stringify(cellPath) : null
      return {
        col,
        value: val,
        valueType: getValueType(val),
        preview: getPreview(val),
        isComplex,
        childNodeId,
        path: cellPath
      }
    })
    return {
      rowIdx,
      path: [...node.path, rowIdx],
      cells
    }
  })

  return {
    rows,
    topSpacer,
    bottomSpacer
  }
}

const getCardVisibleEntries = (node) => {
  if (!node.isVirtualScroll || (!node.rawEntries && !node.rawData)) {
    return {
      entries: node.entries,
      topSpacer: 0,
      bottomSpacer: 0
    }
  }

  const scrollTop = getNodeScrollTop(node.id)
  const total = node.totalCount
  const visibleCount = NODE_MAX_VISIBLE_ROWS + VIRTUAL_BUFFER_ROWS * 2
  const rawStartIndex = Math.max(0, Math.floor(scrollTop / CARD_ROW_H) - VIRTUAL_BUFFER_ROWS)
  const maxStartIndex = Math.max(0, total - visibleCount)
  const startIndex = Math.min(rawStartIndex, maxStartIndex)
  const endIndex = Math.min(total, startIndex + visibleCount)

  const topSpacer = startIndex * CARD_ROW_H
  const bottomSpacer = Math.max(0, (total - endIndex) * CARD_ROW_H)

  const rawSlice = (node.isArray && node.rawData)
    ? node.rawData.slice(startIndex, endIndex).map((v, localIdx) => [String(startIndex + localIdx), v])
    : (node.rawEntries ? node.rawEntries.slice(startIndex, endIndex) : [])
  const entries = rawSlice.map(([k, v], localIdx) => {
    const rowIdx = startIndex + localIdx
    const childPath = [...node.path, node.isArray ? Number(k) : k]
    const isNestedExp = expandedNestedPaths.value.has(JSON.stringify(childPath)) && !!detectNestedJson(v)
    const isComplex = isNestedExp || (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0))
    const childNodeId = isComplex ? JSON.stringify(childPath) : null
    return {
      key: k,
      value: v,
      isComplex,
      preview: getPreview(v),
      valueType: getValueType(v),
      childNodeId,
      rowIdx
    }
  })

  return {
    entries,
    topSpacer,
    bottomSpacer
  }
}

// ─── Recursive Tree Layout Computation ────────────────────────────────────────
const layout = computed(() => {
  const obj = props.parsedObj
  if (obj === null || typeof obj !== 'object') return null

  const nodesMap = new Map()
  const maxColWidths = []
  const nodesByDepth = []

  // 1. Recursive function to construct nodes tree
  const buildTreeNodes = (currentObj, path = [], key = "", parentId = null, parentRowIdx = null, depth = 0) => {
    const isArray = Array.isArray(currentObj)
    const nodeId = JSON.stringify(path)
    const isObjArray = isArrayOfObjects(currentObj)
    const isTable = isTableModeForNode(path, isObjArray)

    let node

    if (isTable) {
      // ─── 场景 A: 对象数组行转列表格节点 (Table Node) ───
      const columns = getColumnsFromObjectArray(currentObj)
      const colWidths = {}
      // 列宽计算只采样前 60 项
      const sampleForWidth = currentObj.slice(0, 60)
      columns.forEach(col => {
        let maxTextW = estimateTextWidth(col)
        sampleForWidth.forEach(item => {
          const val = item?.[col]
          if (val !== undefined && val !== null) {
            const prev = getPreview(val)
            const tw = estimateTextWidth(prev)
            if (tw > maxTextW) maxTextW = tw
          }
        })
        const hasTime = sampleForWidth.some(item => detectTimestamp(item?.[col]))
        const hasImgOrUrl = sampleForWidth.some(item => isColor(item?.[col]) || isAudio(item?.[col]) || isVideo(item?.[col]) || isImg(item?.[col]) || isHttpLink(item?.[col]))
        const hasB64OrUrl = sampleForWidth.some(item => getBase64Data(item?.[col]) || getUrlEncodedData(item?.[col]))
        const hasCron = sampleForWidth.some(item => getCronData(item?.[col]))
        const hasSmart = sampleForWidth.some(item => getSmartData(item?.[col]))
        const extraIconW = (hasTime ? 150 : 0) + (hasImgOrUrl ? 22 : 0) + (hasB64OrUrl ? 26 : 0) + (hasCron ? 52 : 0) + (hasSmart ? 48 : 0) + 24
        colWidths[col] = Math.max(84, Math.min(380, Math.round(maxTextW + 20 + extraIconW)))
      })

      const totalCount = currentObj.length
      const isVirtualScroll = totalCount > NODE_MAX_VISIBLE_ROWS
      const displayRowsCount = isVirtualScroll ? NODE_MAX_VISIBLE_ROWS : totalCount

      const indexColW = Math.max(30, String(totalCount).length * 8 + 16)
      const scrollbarReserve = isVirtualScroll ? 12 : 0
      const totalTableW = indexColW + Object.values(colWidths).reduce((a, b) => a + b, 0) + 2
      const width = Math.max(160, totalTableW + scrollbarReserve)

      // 预生成基础行（用于 <= 50 行展示或前 30 项拓扑分支发散）
      const sampleCount = Math.min(totalCount, NODE_MAX_VISIBLE_ROWS)
      const preSampleData = currentObj.slice(0, sampleCount)

      const tableRows = preSampleData.map((item, rowIdx) => {
        const cells = columns.map(col => {
          const val = item?.[col]
          const cellPath = [...path, rowIdx, col]
          const isNestedExp = expandedNestedPaths.value.has(JSON.stringify(cellPath)) && !!detectNestedJson(val)
          const isComplex = isNestedExp || (val !== null && val !== undefined && typeof val === 'object' && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0))
          const childNodeId = isComplex ? JSON.stringify(cellPath) : null
          return {
            col,
            value: val,
            valueType: getValueType(val),
            preview: getPreview(val),
            isComplex,
            childNodeId,
            path: cellPath
          }
        })
        return {
          rowIdx,
          path: [...path, rowIdx],
          cells
        }
      })

      // 节点高度是 50 行的高度（不足 50 行自适应）
      const height = TABLE_TITLE_H + TABLE_THEAD_H + displayRowsCount * TABLE_ROW_H + 2

      if (!maxColWidths[depth] || width > maxColWidths[depth]) {
        maxColWidths[depth] = width
      }

      node = {
        id: nodeId,
        path,
        key,
        parentId,
        parentRowIdx,
        isArray: true,
        isTable: true,
        canToggleTable: true,
        columns,
        colWidths,
        indexColW,
        tableRows,
        rawData: currentObj,
        entries: [],
        width,
        height,
        depth,
        x: 0,
        y: 0,
        childrenIds: tableRows.flatMap(r => r.cells.filter(c => c.isComplex).map(c => c.childNodeId)),
        totalCount,
        isVirtualScroll
      }

      nodesMap.set(nodeId, node)
      if (!nodesByDepth[depth]) nodesByDepth[depth] = []
      nodesByDepth[depth].push(node)

      // Recursively build children for nested complex cells inside table (全量扫描所有行，绝不漏掉中间或任意行的子 json)
      for (let r = 0; r < Math.min(totalCount, 30); r++) {
        if (nodesMap.size >= MAX_TOTAL_GRAPH_NODES) break
        const item = currentObj[r]
        if (!item || typeof item !== 'object') continue
        for (let c = 0; c < columns.length; c++) {
          const col = columns[c]
          const val = item[col]
          const cellPath = [...path, r, col]
          const isNestedExp = expandedNestedPaths.value.has(JSON.stringify(cellPath)) && !!detectNestedJson(val)
          const isComplex = isNestedExp || (val !== null && val !== undefined && typeof val === 'object' && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0))
          if (isComplex && nodesMap.size < MAX_TOTAL_GRAPH_NODES) {
            const childNodeId = JSON.stringify(cellPath)
            if (!node.childrenIds.includes(childNodeId)) {
              node.childrenIds.push(childNodeId)
            }
            const childVal = isNestedExp ? detectNestedJson(val).parsed : val
            buildTreeNodes(childVal, cellPath, col, nodeId, { isTable: true, rowIdx: r }, depth + 1)
          }
        }
      }

    } else {
      // ─── 场景 B: 标准卡片节点 (Standard Card Node) ───
      const totalCount = isArray ? currentObj.length : Object.keys(currentObj).length
      const isVirtualScroll = totalCount > NODE_MAX_VISIBLE_ROWS
      const displayRowsCount = isVirtualScroll ? NODE_MAX_VISIBLE_ROWS : totalCount

      const allEntries = isArray
        ? (totalCount > 1000 ? null : currentObj.map((v, i) => [String(i), v]))
        : Object.entries(currentObj)

      const sampleCount = Math.min(totalCount, NODE_MAX_VISIBLE_ROWS)
      const preSampleRaw = (isArray && (!allEntries || totalCount > 1000))
        ? currentObj.slice(0, sampleCount).map((v, i) => [String(i), v])
        : allEntries.slice(0, sampleCount)

      const cardEntries = preSampleRaw.map(([k, v], idx) => {
        const childPath = [...path, isArray ? Number(k) : k]
        const isNestedExp = expandedNestedPaths.value.has(JSON.stringify(childPath)) && !!detectNestedJson(v)
        const isComplex = isNestedExp || (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0))
        const childNodeId = isComplex ? JSON.stringify(childPath) : null

        return {
          key: k,
          value: v,
          isComplex,
          preview: getPreview(v),
          valueType: getValueType(v),
          childNodeId,
          rowIdx: idx
        }
      })

      let maxKeyW = 0
      let maxValW = 0

      cardEntries.forEach(e => {
        const keyTextW = estimateTextWidth(e.key)
        if (keyTextW > maxKeyW) maxKeyW = keyTextW

        const prevTextW = estimateTextWidth(e.preview)
        let extraBadgeW = 0
        if (detectTimestamp(e.value)) {
          extraBadgeW += 148
        }
        if (isColor(e.value)) {
          extraBadgeW += 19
        } else if (isAudio(e.value) || isVideo(e.value) || isImg(e.value)) {
          extraBadgeW += 18
        } else if (isHttpLink(e.value)) {
          extraBadgeW += 20
        }
        if (getBase64Data(e.value)) {
          extraBadgeW += 26
        }
        if (getUrlEncodedData(e.value)) {
          extraBadgeW += 22
        }
        if (getCronData(e.value)) {
          extraBadgeW += 52
        }
        if (getSmartData(e.value)) {
          extraBadgeW += 48
        }

        const childPath = [...path, isArray ? Number(e.key) : e.key]
        if (detectUnicode(e.value, props.rawInput, childPath)) {
          extraBadgeW += 24
        }
        if (detectNestedJson(e.value)) {
          extraBadgeW += 24
        }

        const rowValW = extraBadgeW + (extraBadgeW > 0 && prevTextW > 0 ? 6 : 0) + prevTextW + 6
        if (rowValW > maxValW) maxValW = rowValW
      })

      const isRoot = depth === 0 || parentId === null

      // 根节点截断宽度缩短一半（上限 240px，总宽上限 440px），避免根节点过宽推开后续拓扑树
      const maxValLimit = isRoot ? 240 : 480
      const maxNodeWidth = isRoot ? (isArray ? 360 : 440) : (isArray ? 680 : 850)

      const keyW = isArray ? Math.max(24, maxKeyW + 12) : Math.max(70, Math.min(isRoot ? 220 : 320, maxKeyW + 16))
      const valW = isArray ? Math.max(40, Math.min(maxValLimit, maxValW)) : Math.max(60, Math.min(maxValLimit, maxValW))
      
      // If node is an array of objects in tree mode, ensure enough width for switch bar [N 项] + 表格化
      const minW = isObjArray ? 148 : (isArray ? 90 : 140)
      const width = isArray ? Math.max(minW, Math.min(maxNodeWidth, keyW + valW + 28)) : Math.max(minW, Math.min(maxNodeWidth, keyW + valW + 44))
      
      const extraBarH = isObjArray ? SWITCH_BAR_H : 0
      const height = extraBarH + CARD_PAD * 2 + Math.max(displayRowsCount, 1) * CARD_ROW_H + 2

      if (!maxColWidths[depth] || width > maxColWidths[depth]) {
        maxColWidths[depth] = width
      }

      node = {
        id: nodeId,
        path,
        key,
        parentId,
        parentRowIdx,
        isArray,
        isTable: false,
        canToggleTable: isObjArray,
        entries: cardEntries,
        rawEntries: allEntries,
        rawData: isArray ? currentObj : null,
        width,
        height,
        depth,
        x: 0,
        y: 0,
        keyW,
        childrenIds: cardEntries.filter(e => e.isComplex).map(e => e.childNodeId),
        totalCount,
        isVirtualScroll
      }

      nodesMap.set(nodeId, node)
      if (!nodesByDepth[depth]) {
        nodesByDepth[depth] = []
      }
      nodesByDepth[depth].push(node)

      // Recursively build children (全量扫描所有项，绝不漏掉中间或任意位置的复杂子项)
      if (!isArray) {
        // 对象模式：扫描所有属性
        for (let i = 0; i < allEntries.length; i++) {
          if (nodesMap.size >= MAX_TOTAL_GRAPH_NODES) break
          const [k, v] = allEntries[i]
          const childPath = [...path, k]
          const isNestedExp = expandedNestedPaths.value.has(JSON.stringify(childPath)) && !!detectNestedJson(v)
          const isComplex = isNestedExp || (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0))
          if (isComplex) {
            const childNodeId = JSON.stringify(childPath)
            if (!node.childrenIds.includes(childNodeId)) node.childrenIds.push(childNodeId)
            const childVal = isNestedExp ? detectNestedJson(v).parsed : v
            buildTreeNodes(childVal, childPath, k, nodeId, i, depth + 1)
          }
        }
      } else {
        // 数组模式：
        // 默认发散覆盖一整屏（50 项），且优先发散包含深层嵌套的项或用户当前选中的目标项
        const selectedChildIdx = (effectiveSelectedPath.value && effectiveSelectedPath.value.length > path.length && path.every((v, idx) => String(v) === String(effectiveSelectedPath.value[idx])))
          ? Number(effectiveSelectedPath.value[path.length])
          : -1

        let simpleBranchCount = 0
        const MAX_SIMPLE_ARRAY_BRANCHES = NODE_MAX_VISIBLE_ROWS // 默认覆盖整屏 50 项，整齐饱满

        for (let i = 0; i < totalCount; i++) {
          if (nodesMap.size >= MAX_TOTAL_GRAPH_NODES) break
          const v = currentObj[i]
          const childPath = [...path, i]
          const isNestedExp = expandedNestedPaths.value.has(JSON.stringify(childPath)) && !!detectNestedJson(v)
          const isComplex = isNestedExp || (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0))
          if (isComplex) {
            // 检查当前对象是否包含深层嵌套子结构（如有嵌套数组或对象）
            const hasDeepChild = typeof v === 'object' && Object.values(v).some(childVal => childVal !== null && typeof childVal === 'object' && (Array.isArray(childVal) ? childVal.length > 0 : Object.keys(childVal).length > 0))
            const isSelectedBranch = (i === selectedChildIdx)

            if (totalCount > 30 && simpleBranchCount >= MAX_SIMPLE_ARRAY_BRANCHES && !hasDeepChild && !isSelectedBranch && !isNestedExp) {
              continue
            }
            if (!hasDeepChild && !isSelectedBranch && !isNestedExp) simpleBranchCount++

            const childNodeId = JSON.stringify(childPath)
            if (!node.childrenIds.includes(childNodeId)) node.childrenIds.push(childNodeId)
            const childVal = isNestedExp ? detectNestedJson(v).parsed : v
            buildTreeNodes(childVal, childPath, String(i), nodeId, i, depth + 1)
          }
        }
      }
    }

    return node
  }

  // Build the root tree
  buildTreeNodes(obj, [], "", null, null, 0)

  // 2. Compute Column X coordinates with generous corridor width
  const colX = []
  let curX = 0
  for (let d = 0; d < maxColWidths.length; d++) {
    colX[d] = curX
    curX += (maxColWidths[d] || 240) + COL_GAP
  }

  // 3. Compact & Tidy Column-wise Y-coordinate calculation
  nodesByDepth.forEach((depthNodes, depth) => {
    let prevBottom = 0
    depthNodes.forEach((node, idx) => {
      node.x = colX[depth] || 0

      let idealY = 0
      if (node.parentId !== null) {
        const parentNode = nodesMap.get(node.parentId)
        if (parentNode) {
          let parentRowY
          if (parentNode.isTable && typeof node.parentRowIdx === 'object' && node.parentRowIdx.isTable) {
            const rIdx = node.parentRowIdx.rowIdx ?? 0
            const rawY = parentNode.y + TABLE_TITLE_H + TABLE_THEAD_H + rIdx * TABLE_ROW_H + TABLE_ROW_H / 2
            parentRowY = Math.max(parentNode.y + 14, Math.min(parentNode.y + parentNode.height - 14, rawY))
          } else if (typeof node.parentRowIdx === 'number') {
            const parentExtraBarH = parentNode.canToggleTable && !parentNode.isTable ? SWITCH_BAR_H : 0
            const rawY = parentNode.y + parentExtraBarH + CARD_PAD + node.parentRowIdx * CARD_ROW_H + CARD_ROW_H / 2
            parentRowY = Math.max(parentNode.y + 14, Math.min(parentNode.y + parentNode.height - 14, rawY))
          } else {
            parentRowY = parentNode.y + parentNode.height / 2
          }
          const nodeCenterY = node.isTable ? (TABLE_TITLE_H + TABLE_THEAD_H) / 2 : CARD_PAD + CARD_ROW_H / 2
          idealY = parentRowY - nodeCenterY
        }
      }

      if (idx === 0) {
        node.y = Math.max(0, idealY)
      } else {
        const minAllowedY = prevBottom + CARD_GAP
        node.y = Math.max(minAllowedY, idealY)
      }

      prevBottom = node.y + node.height
    })
  })

  // 4. Bounding box computation & coordinate normalization
  const allNodes = Array.from(nodesMap.values())
  if (allNodes.length === 0) return null

  const minX = Math.min(...allNodes.map(n => n.x))
  const minY = Math.min(...allNodes.map(n => n.y))
  const maxX = Math.max(...allNodes.map(n => n.x + n.width))
  const maxY = Math.max(...allNodes.map(n => n.y + n.height))

  allNodes.forEach(node => {
    node.x = node.x - minX + 32
    node.y = node.y - minY + 32
  })

  const shiftedColX = colX.map(cx => cx - minX + 32)
  const wsW = maxX - minX + 64
  const wsH = maxY - minY + 64

  return { nodes: allNodes, wsW, wsH, maxColWidths, colX: shiftedColX }
})

// ─── SVG connection lines computation (Guaranteed Zero-Occlusion Routing) ───
const curves = computed(() => {
  if (!layout.value) return []
  const { nodes, maxColWidths, colX } = layout.value

  const connectionList = []
  nodes.forEach(node => {
    if (node.parentId !== null) {
      const parentNode = nodes.find(n => n.id === node.parentId)
      if (parentNode) {
        let x1 = parentNode.x + parentNode.width
        let y1
        const pScrollTop = getNodeScrollTop(parentNode.id)
        if (parentNode.isTable && typeof node.parentRowIdx === 'object' && node.parentRowIdx.isTable) {
          const rIdx = node.parentRowIdx.rowIdx ?? 0
          const rawY = parentNode.y + TABLE_TITLE_H + TABLE_THEAD_H + (rIdx * TABLE_ROW_H - pScrollTop) + TABLE_ROW_H / 2
          y1 = Math.max(parentNode.y + 14, Math.min(parentNode.y + parentNode.height - 14, rawY))
        } else if (typeof node.parentRowIdx === 'number') {
          const parentExtraBarH = parentNode.canToggleTable && !parentNode.isTable ? SWITCH_BAR_H : 0
          const rawY = parentNode.y + parentExtraBarH + CARD_PAD + (node.parentRowIdx * CARD_ROW_H - pScrollTop) + CARD_ROW_H / 2
          y1 = Math.max(parentNode.y + 14, Math.min(parentNode.y + parentNode.height - 14, rawY))
        } else {
          y1 = parentNode.y + parentNode.height / 2
        }

        const x2 = node.x
        let y2
        if (node.isTable) {
          y2 = node.y + (TABLE_TITLE_H + TABLE_THEAD_H) / 2
        } else {
          y2 = node.y + CARD_PAD + CARD_ROW_H / 2
        }

        const parentDepth = parentNode.depth ?? 0
        const parentColRight = (colX[parentDepth] || 0) + (maxColWidths[parentDepth] || parentNode.width)
        const childColLeft = node.x
        // Middle of the clear channel between columns where no card exists
        const channelMidX = (parentColRight + childColLeft) / 2

        let d = ''
        if (Math.abs(y1 - y2) < 2) {
          d = `M ${x1} ${y1} L ${x2} ${y2}`
        } else {
          // Bezier control points are constrained strictly within the empty channel,
          // ensuring that vertical drops never pass under or intersect any card
          const cp1x = Math.max(x1 + 24, channelMidX)
          const cp1y = y1
          const cp2x = Math.min(x2 - 24, channelMidX)
          const cp2y = y2
          d = `M ${x1} ${y1} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`
        }

        connectionList.push({
          id: node.id,
          d,
          x1, y1, x2, y2
        })
      }
    }
  })
  return connectionList
})

// ─── Pan / Zoom (Adapted for smoother interaction) ──────────────────────────
const DEFAULT_SCALE = 0.88 // 默认展示比例提升至 88% (节点与文字更清晰易读，兼顾拓扑纵览)
const MIN_SCALE = 0.25
const MAX_SCALE = 2.0

const containerRef = ref(null)
const tx = ref(40)
const ty = ref(40)
const scale = ref(DEFAULT_SCALE)
const isPanning = ref(false)
const panStartX = ref(0)
const panStartY = ref(0)
const originX = ref(0)
const originY = ref(0)

const startPan = (e) => {
  if (e.button !== 0) return
  // 如果点击的目标是在卡片节点内部（如滚动条、按钮、单元格），不触发外部画布的拖拽平移
  if (e.target && e.target.closest('.graph-node')) return
  isPanning.value = true
  panStartX.value = e.clientX
  panStartY.value = e.clientY
  originX.value = tx.value
  originY.value = ty.value
}
const doPan = (e) => {
  if (!isPanning.value) return
  tx.value = originX.value + (e.clientX - panStartX.value)
  ty.value = originY.value + (e.clientY - panStartY.value)
}
const stopPan = () => { isPanning.value = false }

const wheelMode = ref('zoom') // 'zoom' or 'scroll'
const toggleWheelMode = () => {
  wheelMode.value = wheelMode.value === 'zoom' ? 'scroll' : 'zoom'
}

const doZoom = (e) => {
  e.preventDefault()
  if (wheelMode.value === 'zoom') {
    const factor = e.deltaY < 0 ? 1.08 : 0.92
    const targetScale = scale.value * factor
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(targetScale.toFixed(3))))
    if (newScale === scale.value) return
    
    if (containerRef.value) {
      const rect = containerRef.value.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      tx.value = mouseX - (mouseX - tx.value) * (newScale / scale.value)
      ty.value = mouseY - (mouseY - ty.value) * (newScale / scale.value)
    }
    
    scale.value = newScale
  } else {
    ty.value -= e.deltaY * 0.8
  }
}

const zoomIn  = () => { scale.value = Math.min(MAX_SCALE, Number((scale.value * 1.15).toFixed(3))) }
const zoomOut = () => { scale.value = Math.max(MIN_SCALE, Number((scale.value / 1.15).toFixed(3))) }

const fitToScreen = () => {
  scale.value = DEFAULT_SCALE
  tx.value = 40
  ty.value = 40
}

const resetView = () => { tx.value = 40; ty.value = 40; scale.value = DEFAULT_SCALE }

onMounted(fitToScreen)
watch(() => props.parsedObj, fitToScreen)

// ─── SelectedPath Anchor & Centering ──────────────────────────────────────────
const injectedSelectedPath = inject('selectedPath', ref(null))
const effectiveSelectedPath = computed(() => props.selectedPath || injectedSelectedPath.value)

const anchorFlashPaths = ref(new Set())
let anchorTimer = null

const isAnchorTarget = (path) => {
  if (anchorFlashPaths.value.size === 0 || !path) return false
  const pStr = path.map(String).join('/')
  return anchorFlashPaths.value.has(pStr)
}

let panAnimId = null

const animatePanTo = (destTx, destTy, duration = 300) => {
  if (panAnimId) cancelAnimationFrame(panAnimId)
  const startTx = tx.value
  const startTy = ty.value
  const startTime = performance.now()

  const step = (now) => {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / duration)
    const ease = 1 - Math.pow(1 - progress, 3)
    tx.value = startTx + (destTx - startTx) * ease
    ty.value = startTy + (destTy - startTy) * ease
    if (progress < 1) {
      panAnimId = requestAnimationFrame(step)
    } else {
      panAnimId = null
    }
  }
  panAnimId = requestAnimationFrame(step)
}

const centerOnPath = (path, shouldPan = true) => {
  if (!path || !layout.value || !containerRef.value) return
  const { nodes } = layout.value

  let matchedNode = null
  let maxMatchLen = -1

  for (const node of nodes) {
    const np = node.path
    if (np.length <= path.length && np.every((v, i) => String(v) === String(path[i]))) {
      if (np.length > maxMatchLen) {
        maxMatchLen = np.length
        matchedNode = node
      }
    }
  }

  if (!matchedNode) return

  // 决定外部画布平移聚焦的目标卡片 (focusNode)：
  // 规则：
  // 1. 若选中的是该子节点实体本身（如在左侧 JSON 点击了 {} 或 [] 两边，path.length === matchedNode.path.length），且存在父节点：
  //    外部画布平移聚焦到其父节点，并在父节点内部滚动定位到产生行！
  // 2. 只有点击的是该子节点内部的具体属性（path.length > matchedNode.path.length）：
  //    外部画布才平移聚焦到该子节点卡片！
  let focusNode = matchedNode
  if (matchedNode.parentId !== null && path.length === matchedNode.path.length) {
    const parentNode = nodes.find(n => n.id === matchedNode.parentId)
    if (parentNode) {
      focusNode = parentNode
    }
  }

  // 记录需要高亮闪烁的所有路径（包括当前目标及祖先节点对应产生行）
  const flashSet = new Set()
  flashSet.add(path.map(String).join('/'))

  // 计算目标行索引 (无论是第 0 行还是第 4936 行)
  let targetRowIdx = -1
  const childKey = path[matchedNode.path.length]

  if (childKey !== undefined) {
    if (matchedNode.isTable || matchedNode.isArray) {
      const r = Number(childKey)
      if (!isNaN(r) && r >= 0 && r < matchedNode.totalCount) {
        targetRowIdx = r
      }
    } else {
      const keyStr = String(childKey)
      if (matchedNode.rawEntries) {
        targetRowIdx = matchedNode.rawEntries.findIndex(([k]) => String(k) === keyStr)
      } else if (matchedNode.entries) {
        targetRowIdx = matchedNode.entries.findIndex(e => String(e.key) === keyStr)
      }
    }
  }

  // 1. 如果当前目标节点是虚拟滚动节点，内部滚动条自动锚点定位到目标行
  if (targetRowIdx >= 0 && matchedNode.isVirtualScroll) {
    const rowH = matchedNode.isTable ? TABLE_ROW_H : CARD_ROW_H
    const maxScrollTop = Math.max(0, (matchedNode.totalCount - NODE_MAX_VISIBLE_ROWS) * rowH)
    const targetScrollTop = Math.min(maxScrollTop, Math.max(0, Math.floor((targetRowIdx - 15) * rowH)))

    setNodeScrollTop(matchedNode.id, targetScrollTop)

    nextTick(() => {
      const scrollEl = findNodeScrollEl(matchedNode.id)
      if (scrollEl) {
        scrollEl.scrollTop = targetScrollTop
        scrollEl.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
      }
    })
  }

  // 2. 向上回溯所有父级虚拟滚动节点，同样自动滚动定位到对应的产生行并高亮
  let curr = matchedNode
  while (curr && curr.parentId !== null) {
    const parentNode = nodes.find(n => n.id === curr.parentId)
    if (!parentNode) break

    let parentRow = -1
    if (parentNode.isTable && typeof curr.parentRowIdx === 'object' && curr.parentRowIdx !== null && curr.parentRowIdx.isTable) {
      parentRow = curr.parentRowIdx.rowIdx ?? -1
    } else if (typeof curr.parentRowIdx === 'number') {
      parentRow = curr.parentRowIdx
    }

    if (parentRow >= 0) {
      // 标记父节点产生此子节点的行为高亮闪烁
      flashSet.add([...parentNode.path, parentRow].map(String).join('/'))
      if (curr.key) {
        flashSet.add([...parentNode.path, parentRow, curr.key].map(String).join('/'))
      }

      // 如果父节点是虚拟滚动，驱动父节点内部滚动条自动滚动至该行
      if (parentNode.isVirtualScroll) {
        const pRowH = parentNode.isTable ? TABLE_ROW_H : CARD_ROW_H
        const pMaxScrollTop = Math.max(0, (parentNode.totalCount - NODE_MAX_VISIBLE_ROWS) * pRowH)
        const pTargetScrollTop = Math.min(pMaxScrollTop, Math.max(0, Math.floor((parentRow - 15) * pRowH)))

        setNodeScrollTop(parentNode.id, pTargetScrollTop)

        nextTick(() => {
          const pScrollEl = findNodeScrollEl(parentNode.id)
          if (pScrollEl) {
            pScrollEl.scrollTop = pTargetScrollTop
            pScrollEl.scrollTo({ top: pTargetScrollTop, behavior: 'smooth' })
          }
        })
      }
    }

    curr = parentNode
  }

  // 触发所有相关位置的呼吸高亮动画
  anchorFlashPaths.value = flashSet
  if (anchorTimer) clearTimeout(anchorTimer)
  anchorTimer = setTimeout(() => {
    anchorFlashPaths.value.clear()
  }, 2200)

  // 3. 外部画布平移：将目标卡片聚焦在屏幕主视野
  if (shouldPan) {
    const cw = containerRef.value.clientWidth || 800
    const ch = containerRef.value.clientHeight || 600
    const s = scale.value

    // X 轴定位：
    // 若卡片渲染宽度超出或接近视口，左对齐并保留安全边距，避免左侧分栏遮挡；否则水平居中
    let destTx = cw / 2 - (focusNode.x + focusNode.width / 2) * s
    if (focusNode.width * s > cw - 80) {
      destTx = 32 - focusNode.x * s
    } else {
      destTx = Math.max(28 - focusNode.x * s, destTx)
    }

    // Y 轴定位：
    // 关键修复：卡片高度通常很大（50 行表格约 1150px），如果简单以几何中心对齐屏幕中央，
    // 卡片顶部（表头、前几行）会被直接顶出屏幕上方天花板！
    let destTy
    const cardRenderedH = focusNode.height * s
    if (cardRenderedH > ch * 0.55) {
      // 大卡片（高度超过屏幕 55%）：
      if (targetRowIdx >= 0 && targetRowIdx < 15) {
        // 1. 目标行在卡片最顶部（如第 0 ~ 14 行）：卡片顶部对齐屏幕上方舒适区域，绝不冲出天花板
        destTy = Math.max(36, Math.round(ch * 0.1)) - focusNode.y * s
      } else if (targetRowIdx >= 0 && matchedNode.totalCount && targetRowIdx > matchedNode.totalCount - 30) {
        // 2. 目标行在卡片最底部（如倒数后 30 行，第 9970 ~ 10000 行）：
        // 卡片底部对齐屏幕下方舒适区域，保证最后几行 100% 完整落在视野中，绝不掉出屏幕下方
        const paddingBottom = Math.max(36, Math.round(ch * 0.08))
        destTy = (ch - paddingBottom) - (focusNode.y + focusNode.height) * s
      } else {
        // 3. 目标行在中间：卡片顶部留出安全边距，此时内部虚拟滚动已将目标行定位在卡片可视区中段，正好落在黄金视线中心
        destTy = Math.max(28, Math.round(ch * 0.08)) - focusNode.y * s
      }
    } else {
      // 普通小卡片：以卡片中心居中偏上（0.38）对齐，同时保证顶部不冲出屏幕
      destTy = ch * 0.38 - (focusNode.y + focusNode.height / 2) * s
      destTy = Math.max(28 - focusNode.y * s, destTy)
    }

    animatePanTo(destTx, destTy, 300)
  }
}

watch(effectiveSelectedPath, (newPath) => {
  const fromInternal = isInternalGraphClick
  isInternalGraphClick = false
  if (newPath && newPath.length > 0) {
    centerOnPath(newPath, !fromInternal)
  }
}, { immediate: true })

// ─── Selected & Hover synchronization helpers ─────────────────────────────────
const selectedType = inject('selectedType', ref('all'))

const isRowSelected = (path) => {
  const cur = effectiveSelectedPath.value
  if (!cur || !path || path.length === 0 || path.length > cur.length) return false
  const match = path.every((v, i) => String(v) === String(cur[i]))
  if (!match) return false

  // 1. 如果是父级产生行（path.length < cur.length）：无论子节点选的是内部属性还是整个卡片，父产生行必定被整行选中
  if (path.length < cur.length) return true

  // 2. 如果是当前目标行（path.length === cur.length）：
  // 当 selectedType 为 'all' 或者整行点击时，选中整行；如果是细分的 'key'/'value'，由单元格各自高亮避免边框嵌套
  return selectedType.value === 'all'
}

const isKeySelected = (path) => {
  if (selectedType.value === 'value') return false
  const cur = effectiveSelectedPath.value
  if (!cur || !path || path.length !== cur.length) return false
  return path.every((v, i) => String(v) === String(cur[i]))
}

const isValSelected = (path) => {
  if (selectedType.value === 'key') return false
  const cur = effectiveSelectedPath.value
  if (!cur || !path || path.length !== cur.length) return false
  return path.every((v, i) => String(v) === String(cur[i]))
}

const isColSelected = (col, parentPath = []) => {
  if (selectedType.value === 'value') return false
  const cur = effectiveSelectedPath.value
  if (!cur || cur.length < 2) return false
  if (cur.length !== parentPath.length + 2) return false
  for (let i = 0; i < parentPath.length; i++) {
    if (String(cur[i]) !== String(parentPath[i])) return false
  }
  return String(cur[cur.length - 1]) === String(col)
}

const isColHovered = (col, parentPath = []) => {
  const cur = props.hoveredPath
  if (!cur || cur.length < 2) return false
  if (cur.length !== parentPath.length + 2) return false
  for (let i = 0; i < parentPath.length; i++) {
    if (String(cur[i]) !== String(parentPath[i])) return false
  }
  return String(cur[cur.length - 1]) === String(col)
}

const emitHover = (path) => {
  emit('hover-path', path)
}

const isPathHovered = (path) => {
  const current = props.hoveredPath
  if (!current || !path || path.length === 0 || path.length > current.length) return false
  return path.every((v, i) => String(v) === String(current[i]))
}

const isCardHovered = (node) => {
  const current = props.hoveredPath || effectiveSelectedPath.value
  if (!current || node.path.length > current.length) return false
  return node.path.every((v, i) => String(v) === String(current[i]))
}

const isCardSelected = (node) => {
  const current = props.hoveredPath || effectiveSelectedPath.value
  if (!current) return false
  if (current.length === 0 && node.path.length === 0) return true
  
  if (!layout.value) return false
  let bestNode = null
  let maxMatch = -1
  for (const n of layout.value.nodes) {
    if (n.path.length <= current.length && n.path.every((v, i) => String(v) === String(current[i]))) {
      if (n.path.length > maxMatch) {
        maxMatch = n.path.length
        bestNode = n
      }
    }
  }
  return bestNode?.id === node.id
}

const getParentPath = (node) => {
  if (!node || !node.parentId) return []
  try {
    return JSON.parse(node.parentId)
  } catch (e) {
    return []
  }
}

const isCurveHovered = (curve) => {
  const current = props.hoveredPath || effectiveSelectedPath.value
  if (!current || current.length === 0) return false
  try {
    const nodePath = JSON.parse(curve.id)
    if (nodePath.length > current.length) return false
    return nodePath.every((v, i) => String(v) === String(current[i]))
  } catch (e) {
    return false
  }
}

const BASE_DOT_GRID = 20

// 拓扑图背景点阵：随画布缩放 (scale) 与平移 (tx, ty) 实时同步缩放
const graphViewStyle = computed(() => {
  const s = Math.max(0.2, scale.value)
  const size = BASE_DOT_GRID * s
  return {
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${tx.value}px ${ty.value}px`
  }
})

// ─── Minimap (右下角交互式小地图，默认开启并支持全分辨率高精缩放) ─────────────
const showMinimap = ref(true)
const minimapSvgRef = ref(null)
const isMinimapDragging = ref(false)

const toggleMinimap = () => {
  showMinimap.value = !showMinimap.value
}

const viewportBox = computed(() => {
  if (!containerRef.value || !layout.value) return { x: 0, y: 0, w: 0, h: 0 }
  const cw = containerRef.value.clientWidth || 800
  const ch = containerRef.value.clientHeight || 600
  const s = Math.max(0.1, scale.value)
  return {
    x: -tx.value / s,
    y: -ty.value / s,
    w: cw / s,
    h: ch / s
  }
})

const handleMinimapPointer = (e) => {
  if (!minimapSvgRef.value || !layout.value || !containerRef.value) return
  const rect = minimapSvgRef.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const pointerEvent = e.touches && e.touches[0] ? e.touches[0] : e
  const clickX = Math.max(0, Math.min(rect.width, pointerEvent.clientX - rect.left))
  const clickY = Math.max(0, Math.min(rect.height, pointerEvent.clientY - rect.top))
  
  const wsW = layout.value.wsW || 800
  const wsH = layout.value.wsH || 600

  // 严格适配 SVG preserveAspectRatio="xMidYMid meet" 的 letterbox 留白与真实缩放比
  const scaleRatio = Math.min(rect.width / wsW, rect.height / wsH)
  if (scaleRatio <= 0) return

  const renderedW = wsW * scaleRatio
  const renderedH = wsH * scaleRatio
  const offsetX = (rect.width - renderedW) / 2
  const offsetY = (rect.height - renderedH) / 2

  // 将点击坐标精确反算为全图虚拟坐标 (wsX, wsY)
  const targetWsX = Math.max(0, Math.min(wsW, (clickX - offsetX) / scaleRatio))
  const targetWsY = Math.max(0, Math.min(wsH, (clickY - offsetY) / scaleRatio))
  
  const cw = containerRef.value.clientWidth || 800
  const ch = containerRef.value.clientHeight || 600
  
  const destTx = cw / 2 - targetWsX * scale.value
  const destTy = ch / 2 - targetWsY * scale.value
  
  if (isMinimapDragging.value) {
    tx.value = destTx
    ty.value = destTy
  } else {
    animatePanTo(destTx, destTy, 180)
  }
}

const startMinimapDrag = (e) => {
  if (e.type !== 'touchstart' && e.button !== 0) return
  isMinimapDragging.value = true
  handleMinimapPointer(e)
  const onMove = (ev) => {
    if (isMinimapDragging.value) {
      handleMinimapPointer(ev)
    }
  }
  const onUp = () => {
    isMinimapDragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('touchmove', onMove, { passive: false })
  window.addEventListener('touchend', onUp)
}
</script>

<template>
  <div
    ref="containerRef"
    class="graph-view"
    :class="{ panning: isPanning }"
    @mousedown="startPan"
    @mousemove="doPan"
    @mouseup="stopPan"
    @mouseleave="stopPan"
    @wheel.prevent="doZoom"
    :style="graphViewStyle"
  >
    <!-- Workspace -->
    <div
      class="graph-workspace"
      :style="{
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        width: layout ? layout.wsW + 'px' : '800px',
        height: layout ? layout.wsH + 'px' : '600px'
      }"
    >
      <!-- SVG layer for bezier curves and bullets -->
      <svg
        v-if="layout"
        class="graph-svg"
        :width="layout.wsW"
        :height="layout.wsH"
      >
        <!-- Bezier curves -->
        <path
          v-for="curve in curves"
          :key="'path-' + curve.id"
          :d="curve.d"
          class="graph-edge"
          :class="{ 'is-hovered': isCurveHovered(curve) }"
        />
        <!-- Bullet dots on parent row right edge -->
        <circle
          v-for="curve in curves"
          :key="'bul-' + curve.id"
          :cx="curve.x1"
          :cy="curve.y1"
          :r="BULLET_R"
          class="graph-bullet"
          :class="{ 'is-hovered': isCurveHovered(curve) }"
        />
        <!-- Bullet dots on child card left edge -->
        <circle
          v-for="curve in curves"
          :key="'dot-' + curve.id"
          :cx="curve.x2"
          :cy="curve.y2"
          :r="BULLET_R"
          class="graph-bullet"
          :class="{ 'is-hovered': isCurveHovered(curve) }"
        />
      </svg>

      <!-- Cards & Tables -->
      <div
        v-for="node in layout?.nodes"
        :key="node.id"
        class="graph-node"
        :class="{ 
          'root-node': node.parentId === null,
          'is-table-node': node.isTable,
          'is-hovered': isCardHovered(node)
        }"
        :style="{
          left: node.x + 'px',
          top:  node.y + 'px',
          width: node.width + 'px',
          height: node.height + 'px'
        }"
        @click="emitClick(node.path)"
      >
        <!-- ════════════ 1. 对象数组表格节点 (Table Node) ════════════ -->
        <div v-if="node.isTable" class="graph-table-card">
          <!-- Table Header Bar -->
          <div class="table-card-topbar">
            <div class="table-title-group" @click.stop="emitClick(node.path)">
              <span v-if="node.key" class="table-node-key">{{ node.key }}</span>
              <span class="table-badge">{{ node.totalCount }} 项</span>
            </div>
            <div class="table-topbar-actions">
              <button
                class="table-mode-toggle-btn"
                @click.stop="toggleNodeTableMode(node.path)"
                data-tooltip="切换为树形发散模式"
              >
                <GitFork class="table-btn-icon" />
                <span>展开树形</span>
              </button>
            </div>
          </div>

          <!-- 2D Data Table Grid -->
          <div
            :key="'table-scroll-' + node.id"
            class="table-card-body"
            :class="{ 'is-virtual-scroll': node.isVirtualScroll }"
            :data-node-id="node.id"
            @scroll.passive="handleNodeScroll(node.id, $event)"
            @wheel.stop
          >
            <table class="graph-inner-table">
              <thead class="table-sticky-thead">
                <tr>
                  <th class="tbl-th tbl-th--index" :style="{ width: node.indexColW + 'px', minWidth: node.indexColW + 'px', maxWidth: node.indexColW + 'px' }">#</th>
                  <th
                    v-for="col in node.columns"
                    :key="col"
                    class="tbl-th"
                    :class="{
                      'is-selected': isColSelected(col, node.path),
                      'is-hovered': isColHovered(col, node.path)
                    }"
                    :style="{ width: node.colWidths[col] + 'px', minWidth: node.colWidths[col] + 'px', maxWidth: node.colWidths[col] + 'px' }"
                    @click.stop="emitClick([...node.path, 0, col], 'key')"
                    @mouseenter="emitHover([...node.path, 0, col])"
                    @mouseleave="emitHover(null)"
                  >
                    <div class="tbl-th-content">
                      <span
                        class="tbl-th-text"
                        data-tooltip="点击复制键名"
                        @click.stop="handleCopyKey(col); emitClick([...node.path, 0, col], 'key')"
                        v-html="highlightText(col, searchQuery)"
                      ></span>
                      <button
                        class="copy-col-btn"
                        @click.stop="handleCopyColumn(node.rawData, col)"
                        data-tooltip="复制整列数据"
                      >
                        <Copy class="copy-col-icon" />
                      </button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <!-- 顶部虚拟垫高 -->
                <tr v-if="node.isVirtualScroll && getTableVisibleRows(node).topSpacer > 0" :style="{ height: getTableVisibleRows(node).topSpacer + 'px' }" class="virtual-spacer-row">
                  <td :colspan="node.columns.length + 1" style="padding: 0; border: none; height: inherit;"></td>
                </tr>

                <tr
                  v-for="row in getTableVisibleRows(node).rows"
                  :key="row.rowIdx"
                  class="tbl-tr"
                  :class="{
                    'is-selected': isRowSelected(row.path),
                    'is-hovered': isPathHovered(row.path),
                    'is-anchor-target': isAnchorTarget(row.path)
                  }"
                  :style="{ height: TABLE_ROW_H + 'px' }"
                >
                  <!-- Row Index -->
                  <td
                    class="tbl-td tbl-td--index"
                    :class="{
                      'is-selected': isKeySelected(row.path),
                      'is-hovered': isPathHovered(row.path)
                    }"
                    :style="{ width: node.indexColW + 'px', minWidth: node.indexColW + 'px', maxWidth: node.indexColW + 'px' }"
                    @click.stop="emitClick(row.path, 'key')"
                    @mouseenter="emitHover(row.path)"
                    @mouseleave="emitHover(null)"
                  >
                    <span
                      class="tbl-index-text"
                      data-tooltip="点击复制行号"
                      @click.stop="handleCopyKey(row.rowIdx); emitClick(row.path, 'key')"
                    >{{ row.rowIdx }}</span>
                  </td>

                  <!-- Data Cells -->
                  <td
                    v-for="cell in row.cells"
                    :key="cell.col"
                    class="tbl-td"
                    :class="{
                      'is-selected': isValSelected(cell.path),
                      'is-hovered': isPathHovered(cell.path),
                      'is-anchor-target': isAnchorTarget(cell.path),
                      'tbl-td--complex': cell.isComplex
                    }"
                    :style="{ width: node.colWidths[cell.col] + 'px', minWidth: node.colWidths[cell.col] + 'px', maxWidth: node.colWidths[cell.col] + 'px' }"
                    @click.stop="emitClick(cell.path, 'value')"
                    @mouseenter="emitHover(cell.path)"
                    @mouseleave="emitHover(null)"
                  >
                    <div class="tbl-cell-content">
                      <template v-if="cell.value !== undefined && cell.value !== null">
                        <span
                          v-if="isColor(cell.value)"
                          class="graph-color-badge"
                        >
                          <span class="graph-color-chip-inner" :style="{ backgroundColor: cell.value }"></span>
                        </span>
                        <span
                          v-else-if="isAudio(cell.value)"
                          class="tree-img-badge tree-audio-badge"
                          @mouseenter="(e) => onValMouseEnter(cell.value, e)"
                          @mouseleave="() => onValMouseLeave(cell.value)"
                          data-tooltip="音频直链 (悬停试听)"
                        ><Volume2 class="img-badge-icon" /></span>
                        <span
                          v-else-if="isVideo(cell.value)"
                          class="tree-img-badge tree-video-badge"
                          @mouseenter="(e) => onValMouseEnter(cell.value, e)"
                          @mouseleave="() => onValMouseLeave(cell.value)"
                          data-tooltip="视频直链 (悬停播放)"
                        ><VideoIcon class="img-badge-icon" /></span>
                        <span
                          v-else-if="isImg(cell.value)"
                          class="tree-img-badge"
                          @mouseenter="(e) => onValMouseEnter(cell.value, e)"
                          @mouseleave="() => onValMouseLeave(cell.value)"
                          data-tooltip="图片链接 (悬停预览)"
                        ><ImageIcon class="img-badge-icon" /></span>
                        <button
                          v-else-if="isHttpLink(cell.value)"
                          class="url-jump-btn"
                          @click.stop="handleOpenUrl(cell.value)"
                          data-tooltip="在浏览器中直接打开链接"
                        >
                          <ExternalLink class="url-jump-icon" />
                        </button>

                        <!-- 智能数据胶囊 (JWT, HTML) -->
                        <button
                          v-if="getSmartData(cell.value)"
                          class="tree-capsule-badge"
                          :class="{
                            'tree-jwt-badge': getSmartData(cell.value).isJwt,
                            'tree-html-badge': getSmartData(cell.value).isHtml
                          }"
                          @mouseenter="onSmartMouseEnter(getSmartData(cell.value), $event)"
                          @mouseleave="onSmartMouseLeave"
                          @click.stop="onSmartMouseEnter(getSmartData(cell.value), $event)"
                          :data-tooltip="getSmartData(cell.value).isJwt ? 'JWT Token (悬停解码)' : 'HTML 代码 (悬停预览)'"
                        >
                          <KeyRound v-if="getSmartData(cell.value).isJwt" class="capsule-icon" />
                          <span class="capsule-text">
                            {{ getSmartData(cell.value).isJwt ? 'JWT' : 'HTML' }}
                          </span>
                        </button>

                        <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
                        <button
                          v-if="getCronData(cell.value)"
                          class="tree-capsule-badge tree-cron-badge"
                          @click.stop="handleCopyValue(cell.value)"
                        >
                          <CalendarClock class="capsule-icon" />
                          <span class="capsule-text">CRON</span>
                        </button>

                        <!-- Base64 徽标 (点击复制 Base64 原值) -->
                        <span
                          v-if="getBase64Data(cell.value)"
                          class="tree-inline-badge tree-b64-badge"
                          @click.stop="handleCopyRaw(cell.value, 'Base64 原值')"
                          data-tooltip="点击复制 Base64 原值"
                        >
                          <span class="capsule-symbol">B64</span>
                        </span>

                        <!-- URL 编码 徽标 (点击复制 URL 编码原值) -->
                        <span
                          v-if="getUrlEncodedData(cell.value)"
                          class="tree-inline-badge tree-urldec-badge"
                          @click.stop="handleCopyRaw(cell.value, 'URL 编码原值')"
                          data-tooltip="点击复制 URL 编码原值"
                        >
                          <span class="capsule-symbol">%</span>
                        </span>

                        <!-- 时间戳胶囊 -->
                        <button
                          v-if="detectTimestamp(cell.value)"
                          class="tree-capsule-badge tree-time-badge"
                          @mouseenter="onTimeBadgeEnter(detectTimestamp(cell.value), $event)"
                          @mouseleave="onTimeBadgeLeave"
                          @click.stop="openTimeMenu(detectTimestamp(cell.value), $event)"
                          title="悬停查看与复制时间格式"
                        >
                          <Clock class="capsule-icon" />
                          <span class="capsule-text">{{ detectTimestamp(cell.value).beijingStr }}</span>
                        </button>

                        <!-- Unicode 徽标 -->
                        <span
                          v-if="detectUnicode(cell.value, props.rawInput, cell.path)"
                          class="tree-unicode-badge"
                          @click.stop="handleCopyUnicode(detectUnicode(cell.value, props.rawInput, cell.path))"
                          title="点击复制 Unicode 原文"
                        >
                          <span class="capsule-symbol">\u</span>
                        </span>

                        <!-- 嵌套 JSON 徽标 -->
                        <span
                          v-if="detectNestedJson(cell.value)"
                          class="tree-nested-badge"
                          :class="{ 'is-expanded': isNestedExpanded(cell.path) }"
                          @click.stop="toggleNestedExpand(cell.path)"
                          @mouseenter="onNestedBadgeEnter(cell.path, cell.value, cell.col, $event)"
                          @mouseleave="onNestedBadgeLeave"
                          :title="isNestedExpanded(cell.path) ? '嵌套 JSON 已在拓扑图中展开为子分支，点击收回' : '嵌套 JSON 字符串，悬停展开或新 Tab 打开'"
                        >
                          <Braces class="capsule-icon" />
                        </span>

                        <span
                          class="val-text"
                          :class="[
                            getValueColorClass(cell.valueType),
                            `cval-${cell.valueType}`,
                            cell.valueType === 'boolean' ? (cell.value ? 'cval-boolean-true' : 'cval-boolean-false') : '',
                            { 'is-image-url': isImg(cell.value), 'is-web-url': isHttpLink(cell.value) }
                          ]"
                          @mouseenter="(e) => onValMouseEnter(cell.value, e)"
                          @mouseleave="() => onValMouseLeave(cell.value)"
                          @click.stop="handleCopyValue(cell.value); emitClick(cell.path, 'value')"
                          :data-tooltip="getSmartData(cell.value) ? (getSmartData(cell.value).isHtml ? 'HTML 代码 (悬停预览，点击复制)' : 'JWT Token (悬停解码，点击复制)') : (getCronData(cell.value) ? ('' + getCronData(cell.value).translation) : (isImg(cell.value) ? '悬停预览图片，点击复制键值' : (isHttpLink(cell.value) ? '点击复制键值，点击左侧图标可直接打开' : (isColor(cell.value) ? `颜色: ${cell.value}，点击复制键值` : '点击复制键值'))))"
                          v-html="highlightText(cell.preview, searchQuery)"
                        ></span>
                      </template>
                      <span v-else class="val-empty">-</span>
                    </div>
                  </td>
                </tr>

                <!-- 底部虚拟垫高 -->
                <tr v-if="node.isVirtualScroll && getTableVisibleRows(node).bottomSpacer > 0" :style="{ height: getTableVisibleRows(node).bottomSpacer + 'px' }" class="virtual-spacer-row">
                  <td :colspan="node.columns.length + 1" style="padding: 0; border: none; height: inherit;"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ════════════ 2. 常规卡片节点 (Standard Card Node) ════════════ -->
        <template v-else>
          <div class="graph-card-inner">
            <!-- Optional array mode switch header for tree arrays of objects -->
            <div v-if="node.canToggleTable" class="card-array-switch-bar">
              <div class="card-switch-left">
                <span class="card-switch-label">{{ node.isArray ? `[${node.totalCount} 项]` : `{${node.totalCount} 属性}` }}</span>
              </div>
              <div class="card-topbar-actions">
                <button
                  class="table-mode-toggle-btn card-mini-btn"
                  @click.stop="toggleNodeTableMode(node.path)"
                  data-tooltip="切换为紧凑表格模式"
                >
                  <Table class="table-btn-icon" />
                  <span>表格化</span>
                </button>
              </div>
            </div>

            <div
              :key="'card-scroll-' + node.id"
              class="card-entries-viewport"
              :class="{ 'is-virtual-scroll': node.isVirtualScroll }"
              :data-node-id="node.id"
              @scroll.passive="handleNodeScroll(node.id, $event)"
              @wheel.stop
            >
              <div v-if="node.entries.length === 0 && !node.isVirtualScroll" class="card-row card-row--empty" :style="{ height: CARD_ROW_H + 'px', padding: '0 8px', display: 'flex', alignItems: 'center' }">
                <span class="card-key node-key root-key--complex">{{ node.isArray ? '[] (空数组)' : '{} (空对象)' }}</span>
              </div>
              <template v-else>
                <!-- 顶部虚拟垫高 -->
                <div v-if="node.isVirtualScroll && getCardVisibleEntries(node).topSpacer > 0" :style="{ height: getCardVisibleEntries(node).topSpacer + 'px' }"></div>

                <div
                  v-for="entry in getCardVisibleEntries(node).entries"
                  :key="entry.key"
                  class="card-row"
                  :class="{
                    'is-selected': isRowSelected(getEntryPath(node, entry)),
                    'is-hovered': isPathHovered(getEntryPath(node, entry)),
                    'card-row--array': node.isArray,
                    'is-anchor-target': isAnchorTarget(getEntryPath(node, entry))
                  }"
                  :style="{ height: CARD_ROW_H + 'px' }"
                  @mouseenter="emitHover(getEntryPath(node, entry))"
                  @mouseleave="emitHover(null)"
                  @click.stop="emitClick(getEntryPath(node, entry))"
                >
                  <span
                    class="card-key node-key"
                    :class="{
                      'is-selected': isKeySelected(getEntryPath(node, entry)),
                      'is-hovered': isPathHovered(getEntryPath(node, entry)),
                      'card-key--index': node.isArray,
                      'root-key--complex': entry.isComplex
                    }"
                    :style="node.isArray ? {} : { width: node.keyW + 'px', minWidth: node.keyW + 'px', maxWidth: node.keyW + 'px' }"
                    @click.stop="emitClick(getEntryPath(node, entry), 'key')"
                  >
                    <span
                      class="card-key-text"
                      data-tooltip="点击复制键名"
                      @click.stop="handleCopyKey(entry.key); emitClick(getEntryPath(node, entry), 'key')"
                      v-html="highlightText(entry.key, searchQuery)"
                    ></span>
                  </span>
                  <span
                    class="card-val"
                    :class="{
                      'is-selected': isValSelected(getEntryPath(node, entry)),
                      'is-hovered': isPathHovered(getEntryPath(node, entry))
                    }"
                    @click.stop="emitClick(getEntryPath(node, entry), 'value')"
                  >
                    <span
                      v-if="isColor(entry.value)"
                      class="graph-color-badge"
                    >
                      <span class="graph-color-chip-inner" :style="{ backgroundColor: entry.value }"></span>
                    </span>
                    <span
                      v-else-if="isAudio(entry.value)"
                      class="tree-img-badge tree-audio-badge"
                      @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                      @mouseleave="() => onValMouseLeave(entry.value)"
                      data-tooltip="音频直链 (悬停试听)"
                    ><Volume2 class="img-badge-icon" /></span>
                    <span
                      v-else-if="isVideo(entry.value)"
                      class="tree-img-badge tree-video-badge"
                      @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                      @mouseleave="() => onValMouseLeave(entry.value)"
                      data-tooltip="视频直链 (悬停播放)"
                    ><VideoIcon class="img-badge-icon" /></span>
                    <span
                      v-else-if="isImg(entry.value)"
                      class="tree-img-badge"
                      @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                      @mouseleave="() => onValMouseLeave(entry.value)"
                      data-tooltip="图片链接 (悬停预览)"
                    ><ImageIcon class="img-badge-icon" /></span>
                    <button
                      v-else-if="isHttpLink(entry.value)"
                      class="url-jump-btn"
                      @click.stop="handleOpenUrl(entry.value)"
                      data-tooltip="在浏览器中直接打开链接"
                    >
                      <ExternalLink class="url-jump-icon" />
                    </button>

                    <!-- 智能数据胶囊 (JWT, HTML) -->
                    <button
                      v-if="getSmartData(entry.value)"
                      class="tree-capsule-badge"
                      :class="{
                        'tree-jwt-badge': getSmartData(entry.value).isJwt,
                        'tree-html-badge': getSmartData(entry.value).isHtml
                      }"
                      @mouseenter="onSmartMouseEnter(getSmartData(entry.value), $event)"
                      @mouseleave="onSmartMouseLeave"
                      @click.stop="onSmartMouseEnter(getSmartData(entry.value), $event)"
                      :data-tooltip="getSmartData(entry.value).isJwt ? 'JWT Token (悬停解码)' : 'HTML 代码 (悬停预览)'"
                    >
                      <KeyRound v-if="getSmartData(entry.value).isJwt" class="capsule-icon" />
                      <span class="capsule-text">
                        {{ getSmartData(entry.value).isJwt ? 'JWT' : 'HTML' }}
                      </span>
                    </button>

                    <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
                    <button
                      v-if="getCronData(entry.value)"
                      class="tree-capsule-badge tree-cron-badge"
                      @click.stop="handleCopyValue(entry.value)"
                    >
                      <CalendarClock class="capsule-icon" />
                      <span class="capsule-text">CRON</span>
                    </button>

                    <!-- Base64 徽标 (点击复制 Base64 原值) -->
                    <span
                      v-if="getBase64Data(entry.value)"
                      class="tree-inline-badge tree-b64-badge"
                      @click.stop="handleCopyRaw(entry.value, 'Base64 原值')"
                      data-tooltip="点击复制 Base64 原值"
                    >
                      <span class="capsule-symbol">B64</span>
                    </span>

                    <!-- URL 编码 徽标 (点击复制 URL 编码原值) -->
                    <span
                      v-if="getUrlEncodedData(entry.value)"
                      class="tree-inline-badge tree-urldec-badge"
                      @click.stop="handleCopyRaw(entry.value, 'URL 编码原值')"
                      data-tooltip="点击复制 URL 编码原值"
                    >
                      <span class="capsule-symbol">%</span>
                    </span>

                    <!-- 时间戳胶囊 -->
                    <button
                      v-if="detectTimestamp(entry.value)"
                      class="tree-capsule-badge tree-time-badge"
                      @mouseenter="onTimeBadgeEnter(detectTimestamp(entry.value), $event)"
                      @mouseleave="onTimeBadgeLeave"
                      @click.stop="openTimeMenu(detectTimestamp(entry.value), $event)"
                      title="悬停查看与复制时间格式"
                    >
                      <Clock class="capsule-icon" />
                      <span class="capsule-text">{{ detectTimestamp(entry.value).beijingStr }}</span>
                    </button>

                    <!-- Unicode 徽标 -->
                    <span
                      v-if="detectUnicode(entry.value, props.rawInput, getEntryPath(node, entry))"
                      class="tree-unicode-badge"
                      @click.stop="handleCopyUnicode(detectUnicode(entry.value, props.rawInput, getEntryPath(node, entry)))"
                      title="点击复制 Unicode 原文"
                    >
                      <span class="capsule-symbol">\u</span>
                    </span>

                    <!-- 嵌套 JSON 徽标 -->
                    <span
                      v-if="detectNestedJson(entry.value)"
                      class="tree-nested-badge"
                      :class="{ 'is-expanded': isNestedExpanded(getEntryPath(node, entry)) }"
                      @click.stop="toggleNestedExpand(getEntryPath(node, entry))"
                      @mouseenter="onNestedBadgeEnter(getEntryPath(node, entry), entry.value, entry.key, $event)"
                      @mouseleave="onNestedBadgeLeave"
                      :title="isNestedExpanded(getEntryPath(node, entry)) ? '嵌套 JSON 已在拓扑图中展开为子分支，点击收回' : '嵌套 JSON 字符串，悬停展开或新 Tab 打开'"
                    >
                      <Braces class="capsule-icon" />
                    </span>

                    <span
                      class="val-text"
                      :class="[
                        getValueColorClass(entry.valueType),
                        `cval-${entry.valueType}`,
                        entry.valueType === 'boolean' ? (entry.value ? 'cval-boolean-true' : 'cval-boolean-false') : '',
                        { 'is-image-url': isImg(entry.value), 'is-web-url': isHttpLink(entry.value) }
                      ]"
                      @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                      @mouseleave="() => onValMouseLeave(entry.value)"
                      @click.stop="handleCopyValue(entry.value); emitClick(getEntryPath(node, entry), 'value')"
                      :data-tooltip="getSmartData(entry.value) ? (getSmartData(entry.value).isHtml ? 'HTML 代码 (悬停预览，点击复制)' : 'JWT Token (悬停解码，点击复制)') : (getCronData(entry.value) ? ('' + getCronData(entry.value).translation) : (isImg(entry.value) ? '悬停预览图片，点击复制键值' : (isHttpLink(entry.value) ? '点击复制键值，点击左侧图标可直接打开' : (isColor(entry.value) ? `颜色: ${entry.value}，点击复制键值` : '点击复制键值'))))"
                      v-html="highlightText(entry.preview, searchQuery)"
                    ></span>
                  </span>
                </div>

                <!-- 底部虚拟垫高 -->
                <div v-if="node.isVirtualScroll && getCardVisibleEntries(node).bottomSpacer > 0" :style="{ height: getCardVisibleEntries(node).bottomSpacer + 'px' }"></div>
              </template>

            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Zoom & Mode controls -->
    <div class="graph-controls">
      <button class="ctrl-btn" @click.stop="zoomIn"     data-tooltip-right="放大">＋</button>
      <button class="ctrl-btn" @click.stop="zoomOut"    data-tooltip-right="缩小">－</button>
      <button class="ctrl-btn" @click.stop="fitToScreen" data-tooltip-right="适应屏幕">⊡</button>
      <button class="ctrl-btn" @click.stop="toggleWheelMode" :data-tooltip-right="wheelMode === 'zoom' ? '当前模式: 滚轮缩放 (点击切换为滚动)' : '当前模式: 滚轮滚动 (点击切换为缩放)'">
        {{ wheelMode === 'zoom' ? 'Z' : '↕' }}
      </button>
      <button
        class="ctrl-btn"
        @click.stop="toggleGlobalTableMode"
        :data-tooltip-right="globalTableMode ? '对象数组: 紧凑表格模式 (点击切换为全部树形展开)' : '对象数组: 树形展开模式 (点击切换为表格模式)'"
      >
        <Table v-if="globalTableMode" class="ctrl-mode-icon" />
        <GitFork v-else class="ctrl-mode-icon" />
      </button>
    </div>

    <!-- Minimap (右下角交互式小地图) -->
    <div class="graph-minimap-container" :class="{ 'is-collapsed': !showMinimap }">
      <transition name="minimap-fade" mode="out-in">
        <!-- Expanded Minimap Card -->
        <div v-if="showMinimap" key="minimap-card" class="graph-minimap-card">
          <div class="minimap-header">
            <div class="minimap-title">
              <MapIcon class="minimap-title-icon" />
              <span>小地图</span>
            </div>
            <button class="minimap-toggle-btn" @click.stop="toggleMinimap" data-tooltip-left="折叠小地图">
              <Minus class="minimap-icon-btn" />
            </button>
          </div>
          <div
            class="minimap-body"
            @mousedown.stop="startMinimapDrag"
            @touchstart.stop.prevent="startMinimapDrag"
          >
            <svg
              v-if="layout"
              ref="minimapSvgRef"
              class="minimap-svg"
              :viewBox="`0 0 ${layout.wsW} ${layout.wsH}`"
              preserveAspectRatio="xMidYMid meet"
            >
              <!-- Minimap Edges -->
              <path
                v-for="curve in curves"
                :key="'mm-path-' + curve.id"
                :d="curve.d"
                class="mm-edge"
                :class="{ 'is-active': isCurveHovered(curve) }"
              />
              <!-- Minimap Nodes -->
              <rect
                v-for="node in layout?.nodes"
                :key="'mm-node-' + node.id"
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="node.height"
                rx="4"
                class="mm-node"
                :class="{ 'is-active': isCardSelected(node) }"
              />
              <!-- Viewport Rectangle Box -->
              <rect
                :x="viewportBox.x"
                :y="viewportBox.y"
                :width="viewportBox.w"
                :height="viewportBox.h"
                rx="4"
                class="mm-viewport"
              />
            </svg>
          </div>
        </div>

        <!-- Collapsed Minimap Button -->
        <button
          v-else
          key="minimap-btn"
          class="minimap-expand-btn"
          @click.stop="toggleMinimap"
          data-tooltip-left="展开小地图"
        >
          <MapIcon class="minimap-expand-icon" />
        </button>
      </transition>
    </div>

    <!-- Watermark -->
    <div class="graph-credit">Graph View</div>

    <!-- Timestamp Copy Menu Popover -->
    <Teleport to="body">
      <Transition name="popover-fade">
        <div
          v-if="activeTimeMenu"
          class="time-capsule-popover"
          :class="{ 'is-dark': isDark }"
          :style="{ top: `${activeTimeMenu.top}px`, left: `${activeTimeMenu.left}px` }"
          @mouseenter="onPopoverEnter"
          @mouseleave="onPopoverLeave"
          @click.stop
        >
          <div class="popover-header">
            <div class="badge-group">
              <span class="type-badge">{{ activeTimeMenu.timeData.badgeLabel || '时间戳' }}</span>
              <span class="dimension-badge">{{ activeTimeMenu.timeData.type }}</span>
            </div>
            <button class="icon-action-btn" @click="closeTimeMenu" title="关闭">
              <X class="action-icon" />
            </button>
          </div>
          <div class="time-popover-body">
            <div
              class="time-popover-item"
              @click="copyTimeFormat(activeTimeMenu.timeData.rawStr, activeTimeMenu.timeData.isIso ? '原始时间' : '时间戳')"
              data-tooltip-right="点击复制"
            >
              <div class="time-item-left">
                <span class="time-label">{{ activeTimeMenu.timeData.isIso ? '原始时间' : '原始时间戳' }}</span>
                <span class="time-val">{{ activeTimeMenu.timeData.rawStr }}</span>
              </div>
            </div>
            <div
              v-if="activeTimeMenu.timeData.isIso"
              class="time-popover-item"
              @click="copyTimeFormat(activeTimeMenu.timeData.timeMsStr, '毫秒时间戳')"
              data-tooltip-right="点击复制"
            >
              <div class="time-item-left">
                <span class="time-label">毫秒时间戳</span>
                <span class="time-val">{{ activeTimeMenu.timeData.timeMsStr }}</span>
              </div>
            </div>
            <div
              class="time-popover-item"
              @click="copyTimeFormat(currentNowStr, '当前本机时间')"
              data-tooltip-right="点击复制"
            >
              <div class="time-item-left">
                <span class="time-label">当前本机时间</span>
                <span class="time-val">{{ currentNowStr }}</span>
              </div>
            </div>
            <div
              class="time-popover-item"
              @click="copyTimeFormat(activeTimeMenu.timeData.beijingStr, '东八区时间')"
              data-tooltip-right="点击复制"
            >
              <div class="time-item-left">
                <span class="time-label">东八区时间 (UTC+8)</span>
                <span class="time-val">{{ activeTimeMenu.timeData.beijingStr }}</span>
              </div>
            </div>
            <div
              class="time-popover-item"
              @click="copyTimeFormat(activeTimeMenu.timeData.utcStr, 'UTC 时间')"
              data-tooltip-right="点击复制"
            >
              <div class="time-item-left">
                <span class="time-label">UTC 国际时间</span>
                <span class="time-val">{{ activeTimeMenu.timeData.utcStr }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Nested JSON Actions Popover (悬浮操作菜单：转义展开 / 新 Tab 打开) -->
    <Teleport to="body">
      <Transition name="popover-fade">
        <div
          v-if="activeNestedMenu"
          class="nested-capsule-popover"
          :class="{ 'is-dark': isDark }"
          :style="{ top: `${activeNestedMenu.top}px`, left: `${activeNestedMenu.left}px` }"
          @mouseenter="onNestedPopoverEnter"
          @mouseleave="onNestedPopoverLeave"
          @click.stop
        >
          <button
            class="nested-action-btn primary"
            :class="{ 'is-expanded': activeNestedMenu.isExpanded }"
            @click.stop="toggleNestedExpand(activeNestedMenu.path)"
          >
            <FoldVertical v-if="activeNestedMenu.isExpanded" class="btn-icon" />
            <UnfoldVertical v-else class="btn-icon" />
            <span>{{ activeNestedMenu.isExpanded ? '还原收起' : '转义展开' }}</span>
          </button>
          <button
            class="nested-action-btn secondary"
            @click.stop="handleOpenInNewTab(activeNestedMenu.val, activeNestedMenu.title)"
          >
            <ExternalLink class="btn-icon" />
            <span>新tab打开</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tbl-tr--truncate {
  background: var(--bg-item-hover, rgba(0, 0, 0, 0.03));
}
.tbl-td--truncate {
  text-align: center;
  padding: 0 8px !important;
  border-top: 1px dashed var(--border-color, rgba(0, 0, 0, 0.12));
}
.tbl-expand-more-btn,
.card-expand-more-btn {
  width: 100%;
  height: 100%;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  transition: opacity 0.2s;
  letter-spacing: 0.01em;
}
.tbl-expand-more-btn:hover,
.card-expand-more-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}
.card-row--truncate {
  padding: 0 8px;
  background: var(--bg-item-hover, rgba(0, 0, 0, 0.03));
  border-top: 1px dashed var(--border-color, rgba(0, 0, 0, 0.12));
  display: flex;
  align-items: center;
  justify-content: center;
}
/* ── Container ── */
.graph-view {
  flex: 1;
  position: relative;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  background-image: radial-gradient(var(--graph-dot-color, rgba(119, 119, 119, 0.22)) 0.75px, transparent 0.75px);
  background-size: 20px 20px;
  transition: background-color 0.2s ease;
}
:global(.dark-mode) .graph-view,
:global(html.dark-mode) .graph-view,
.dark-mode .graph-view {
  background-color: var(--bg-app, #18181b) !important;
  background-image: radial-gradient(var(--graph-dot-color, rgba(255, 255, 255, 0.18)) 0.75px, transparent 0.55px) !important;
}
.graph-view.panning { cursor: grabbing; }

/* ── Workspace (transformed container) ── */
.graph-workspace {
  position: absolute;
  top: 0; left: 0;
  transform-origin: 0 0;
}

/* ── SVG ── */
.graph-svg {
  position: absolute;
  top: 0; left: 0;
  pointer-events: none;
  overflow: visible;
}
.graph-edge {
  fill: none;
  stroke: #94a3b8;
  stroke-width: 1;
  stroke-linecap: round;
  transition: stroke 0.2s ease, stroke-width 0.2s ease;
}
:global(.dark-mode) .graph-edge {
  stroke: #64748b;
}
.graph-edge.is-hovered {
  stroke: var(--json-key, #6366f1) !important;
  stroke-width: 1.5 !important;
}
:global(.dark-mode) .graph-edge.is-hovered {
  stroke: var(--json-key, #818cf8) !important;
}

.graph-bullet {
  fill: #94a3b8;
  transition: fill 0.2s ease;
}
:global(.dark-mode) .graph-bullet {
  fill: #64748b;
}
.graph-bullet.is-hovered {
  fill: var(--json-key, #6366f1) !important;
}
:global(.dark-mode) .graph-bullet.is-hovered {
  fill: var(--json-key, #a5b4fc) !important;
}

/* ── Nodes (shared) ── */
.graph-node {
  position: absolute;
  box-sizing: border-box !important;
  background: var(--bg-panel, #ffffff);
  border: 1px solid var(--graph-node-border, #d2d2d2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

:global(.dark-mode) .graph-node {
  background: #232328;
  border-color: #555555 !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}

/* ── Root node special styling ── */
.root-node {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
:global(.dark-mode) .root-node {
  background: #27272d;
  border-color: #555555 !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
}

.graph-node.is-hovered {
  border-color: var(--json-key, #6366f1);
  box-shadow: 0 0 0 1px var(--json-key, #6366f1), 0 4px 14px rgba(99, 102, 241, 0.18);
}
:global(.dark-mode) .graph-node.is-hovered {
  border-color: var(--json-key, #818cf8);
  box-shadow: 0 0 0 1px var(--json-key, #818cf8), 0 6px 20px rgba(0, 0, 0, 0.6);
}

/* ── 2. Table Node Specific Styling (行转列表格节点) ── */
.graph-node.is-table-node {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.graph-table-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.table-card-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  min-height: 26px;
  max-height: 26px;
  padding: 0 8px;
  background: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  box-sizing: border-box;
  flex-shrink: 0;
}
:global(.dark-mode) .table-card-topbar {
  background: #1e1e23;
  border-color: #38383e;
}

.table-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.table-node-key {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--json-key);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}
:global(.dark-mode) .table-badge {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.table-mode-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  padding: 1.5px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-panel);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}
.table-mode-toggle-btn:hover {
  background: var(--accent-color, #6366f1);
  color: #ffffff;
  border-color: var(--accent-color, #6366f1);
}
:global(.dark-mode) .table-mode-toggle-btn {
  background: #28282e;
  border-color: #4b5563;
  color: #cbd5e1;
}
:global(.dark-mode) .table-mode-toggle-btn:hover {
  background: #6366f1;
  color: #ffffff;
  border-color: #6366f1;
}

.table-btn-icon {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}

.table-card-body {
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
}

.table-sticky-thead {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-panel, #ffffff);
}
:global(.dark-mode) .table-sticky-thead {
  background: #232328;
}

.graph-card-inner {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.card-entries-viewport {
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
  padding: 6px 0;
}

.table-card-body.is-virtual-scroll {
  overflow-y: auto;
  overflow-x: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 116, 139, 0.4) transparent;
}

.card-entries-viewport.is-virtual-scroll {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 116, 139, 0.4) transparent;
}

/* ── 拓扑图节点内虚拟滚动条优化 ── */
/* 彻底隐藏原生 Windows 滚动条两端的粗笨箭头按钮 (◀ ▶) */
.table-card-body.is-virtual-scroll::-webkit-scrollbar-button,
.card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-button {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* 垂直滚动条保持舒适好拉的 8px，最下方的左右水平滚动条极致收敛为精致轻巧的 5px */
.table-card-body.is-virtual-scroll::-webkit-scrollbar,
.card-entries-viewport.is-virtual-scroll::-webkit-scrollbar {
  width: 8px;
  height: 5px;
}

.table-card-body.is-virtual-scroll::-webkit-scrollbar-track,
.card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.table-card-body.is-virtual-scroll:hover::-webkit-scrollbar-track,
.card-entries-viewport.is-virtual-scroll:hover::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.03);
}

.table-card-body.is-virtual-scroll::-webkit-scrollbar-thumb,
.card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.35);
  border-radius: 4px;
  min-height: 24px;
  transition: background-color 0.15s ease;
}

.table-card-body.is-virtual-scroll::-webkit-scrollbar-thumb:hover,
.card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--accent-color, var(--json-key, #6366f1));
}

.table-card-body.is-virtual-scroll::-webkit-scrollbar-thumb:active,
.card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-thumb:active {
  background-color: var(--json-key, #4f46e5);
}

/* 暗色模式适配 */
:global(.dark-mode) .table-card-body.is-virtual-scroll,
:global(.dark-mode) .card-entries-viewport.is-virtual-scroll {
  scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
}

:global(.dark-mode) .table-card-body.is-virtual-scroll:hover::-webkit-scrollbar-track,
:global(.dark-mode) .card-entries-viewport.is-virtual-scroll:hover::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
}

:global(.dark-mode) .table-card-body.is-virtual-scroll::-webkit-scrollbar-thumb,
:global(.dark-mode) .card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
}

:global(.dark-mode) .table-card-body.is-virtual-scroll::-webkit-scrollbar-thumb:hover,
:global(.dark-mode) .card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-thumb:hover {
  background-color: #818cf8;
}

:global(.dark-mode) .table-card-body.is-virtual-scroll::-webkit-scrollbar-thumb:active,
:global(.dark-mode) .card-entries-viewport.is-virtual-scroll::-webkit-scrollbar-thumb:active {
  background-color: #6366f1;
}

.table-virtual-indicator {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-color, #6366f1);
  white-space: nowrap;
  letter-spacing: 0.2px;
}
:global(.dark-mode) .table-virtual-indicator {
  background: rgba(129, 140, 248, 0.2);
  color: #a5b4fc;
}

.table-topbar-actions,
.card-topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-switch-left {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  min-width: 0;
}

.tbl-tr--sticky-foot,
.card-row--sticky-foot {
  position: sticky;
  bottom: 0;
  z-index: 4;
  background: var(--bg-panel, #ffffff);
}
:global(.dark-mode) .tbl-tr--sticky-foot,
:global(.dark-mode) .card-row--sticky-foot {
  background: #232328;
}

.graph-inner-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-family: var(--font-mono);
  box-sizing: border-box;
}

.tbl-th {
  height: 24px;
  min-height: 24px;
  max-height: 24px;
  background: rgba(0, 0, 0, 0.015);
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  padding: 0 6px;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  color: var(--json-key);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  box-sizing: border-box;
  transition: background-color 0.15s ease;
}
.tbl-th:last-child {
  border-right: none;
}
:global(.dark-mode) .tbl-th {
  background: #1e1e23;
  border-color: #38383e;
}
.tbl-th:hover {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.08));
}

/* ── Selected & Hover Highlight for Table Headers, Table Cells, and Card Keys/Values ── */
.tbl-tr.is-selected,
.card-row.is-selected {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.16)) !important;
  /* box-shadow: inset 0 0 0 1.5px var(--json-key, #6366f1) !important; */
  border-radius: 4px;
}
.tbl-tr.is-selected td {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.16)) !important;
  border-top: 1.5px solid var(--json-key, #6366f1) !important;
  border-bottom: 1.5px solid var(--json-key, #6366f1) !important;
}
.tbl-tr.is-selected td:first-child {
  border-left: 1.5px solid var(--json-key, #6366f1) !important;
}
.tbl-tr.is-selected td:last-child {
  border-right: 1.5px solid var(--json-key, #6366f1) !important;
}

:global(.dark-mode .graph-view .tbl-tr.is-selected),
:global(.dark-mode .graph-view .card-row.is-selected) {
  background-color: rgba(97, 175, 239, 0.22) !important;
  /* box-shadow: inset 0 0 0 1.5px #61afef !important; */
  border-radius: 4px;
}
:global(.dark-mode .graph-view .tbl-tr.is-selected td) {
  background-color: rgba(97, 175, 239, 0.22) !important;
  border-top-color: #61afef !important;
  border-bottom-color: #61afef !important;
}
:global(.dark-mode .graph-view .tbl-tr.is-selected td:first-child) {
  border-left-color: #61afef !important;
}
:global(.dark-mode .graph-view .tbl-tr.is-selected td:last-child) {
  border-right-color: #61afef !important;
}

.tbl-tr.is-selected .tbl-td--index,
.card-row.is-selected .card-key {
  color: var(--json-key, #4f46e5) !important;
  font-weight: 700 !important;
}
:global(.dark-mode .graph-view .tbl-tr.is-selected .tbl-td--index),
:global(.dark-mode .graph-view .card-row.is-selected .card-key) {
  color: #61afef !important;
}

.tbl-th.is-selected,
.tbl-td--index.is-selected,
.card-key.is-selected {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.18)) !important;
  color: var(--json-key, #4f46e5) !important;
  font-weight: 700 !important;
  /* box-shadow: inset 0 0 0 1.5px var(--json-key, #6366f1) !important; */
}

:global(.dark-mode .graph-view .tbl-th.is-selected),
:global(.dark-mode .graph-view .tbl-td--index.is-selected),
:global(.dark-mode .graph-view .card-key.is-selected) {
  background-color: rgba(97, 175, 239, 0.32) !important;
  color: #61afef !important;
  /* box-shadow: inset 0 0 0 1.5px #61afef !important; */
}

.tbl-td:not(.tbl-td--complex).is-selected,
.card-val.is-selected {
  padding: 2px 4px;
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.18)) !important;
  /* box-shadow: inset 0 0 0 1px var(--json-key, #6366f1) !important; */
}

:global(.dark-mode .graph-view .tbl-td:not(.tbl-td--complex).is-selected),
:global(.dark-mode .graph-view .card-val.is-selected) {
  padding: 2px 4px;
  background-color: rgba(97, 175, 239, 0.32) !important;
  /* box-shadow: inset 0 0 0 1px #61afef !important; */
}

.tbl-th.is-hovered,
.tbl-td--index.is-hovered {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.12)) !important;
  color: var(--json-key) !important;
}

.card-key.is-hovered {
  background-color: transparent !important;
  color: var(--json-key) !important;
}

.tbl-td:not(.tbl-td--complex).is-hovered {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.12)) !important;
  box-shadow: inset 0 0 0 1px var(--json-key, #6366f1);
}

.tbl-th--index {
  text-align: center;
  color: var(--text-secondary);
  font-weight: 500;
}

.tbl-th-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  overflow: hidden;
  gap: 4px;
}

.tbl-th-text {
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.tbl-th-text:hover {
  text-decoration: underline;
}

.copy-col-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted, #9ca3af);
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.tbl-th:hover .copy-col-btn {
  opacity: 0.85;
}

.copy-col-btn:hover {
  opacity: 1 !important;
  color: var(--json-key, #6366f1);
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.08));
}

:global(.dark-mode) .copy-col-btn:hover {
  background-color: rgba(255, 255, 255, 0.12);
  color: var(--json-key, #818cf8);
}

.copy-col-icon {
  width: 11px;
  height: 11px;
}

.tbl-tr {
  height: 22px;
  min-height: 22px;
  max-height: 22px;
  border-bottom: 1px solid var(--border-color);
  box-sizing: border-box;
  transition: background-color 0.12s ease;
}
.tbl-tr:last-child {
  border-bottom: none;
}
.tbl-tr:hover {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.08));
}
.tbl-tr.is-hovered {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.18)) !important;
}
:global(.dark-mode) .tbl-tr {
  border-color: #333338;
}
:global(.dark-mode) .tbl-tr.is-hovered {
  background-color: var(--json-hover-bg, rgba(129, 140, 248, 0.24)) !important;
}

.tbl-td {
  height: 22px;
  min-height: 22px;
  max-height: 22px;
  padding: 0 6px;
  font-size: 12px;
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  box-sizing: border-box;
}
.tbl-td:last-child {
  border-right: none;
}
:global(.dark-mode) .tbl-td {
  border-color: #333338;
}

.tbl-td--index {
  text-align: center;
  color: var(--json-number, #2563eb);
  cursor: pointer;
}
:global(.dark-mode) .tbl-td--index {
  color: var(--json-number, #60a5fa);
}

.tbl-index-text:hover {
  text-decoration: underline;
}

.tbl-cell-content {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.val-empty {
  color: var(--text-secondary);
  opacity: 0.45;
  font-style: italic;
  font-size: 11px;
}

.card-array-switch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  min-height: 24px;
  max-height: 24px;
  padding: 0 8px;
  background: rgba(0, 0, 0, 0.025);
  border-bottom: 1px solid var(--border-color);
  box-sizing: border-box;
  white-space: nowrap;
}
:global(.dark-mode) .card-array-switch-bar {
  background: #1e1e23;
  border-color: #38383e;
}

.card-switch-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.card-mini-btn {
  padding: 1px 6px;
  font-size: 10.5px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Standard Card Rows ── */
.card-row {
  display: flex;
  align-items: center;
  padding: 0 6px;
  gap: 8px;
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 0.12s ease;
}
.card-row:hover {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.08));
}
.card-row.is-hovered {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.18)) !important;
}
:global(.dark-mode) .card-row.is-hovered {
  background-color: var(--json-hover-bg, rgba(129, 140, 248, 0.24)) !important;
}
.card-row:last-child { border-bottom: none; }
.card-row--array {
  padding: 0 8px !important;
  gap: 8px !important;
}

.card-key {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--json-key);
  min-width: 60px;
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.card-key:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.card-key-text {
  padding: 2px 6px;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.card-key--index {
  color: var(--json-number, #2563eb);
  min-width: auto !important;
}
:global(.dark-mode) .card-key--index {
  color: var(--json-number, #60a5fa);
}

.card-val {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-secondary);
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.card-val:hover .val-text {
  text-decoration: underline;
  opacity: 0.85;
}

.val-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  line-height: 1.2;
}
.cval-string  { color: var(--json-string); }
.cval-number  { color: var(--json-number); }
.cval-boolean { font-weight: 600; }
.cval-boolean-true { color: #16a34a; }
.dark-mode .cval-boolean-true { color: #4ade80; }
.cval-boolean-false { color: #dc2626; }
.dark-mode .cval-boolean-false { color: #fca5a5; }
.cval-null {
  color: var(--json-null);
  font-style: italic;
  font-weight: 500;
}
.cval-array {
  color: var(--text-secondary);
  font-weight: 500;
}
.cval-object {
  color: var(--text-secondary);
  font-weight: 500;
}

/* ── Controls ── */
.graph-controls {
  position: absolute;
  bottom: 20px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}
.ctrl-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.ctrl-btn:hover {
  background: var(--bg-app);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}

.ctrl-mode-icon {
  width: 12px;
  height: 12px;
}

/* ── Watermark ── */
.graph-credit {
  position: absolute;
  bottom: 8px;
  left: 60px;
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.5;
  pointer-events: none;
  font-family: var(--font-sans);
}

.is-image-url {
  text-decoration: underline dotted var(--accent-color, #6366f1) !important;
  text-underline-offset: 2px;
  cursor: pointer;
}

.graph-color-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  margin-right: 4px;
  vertical-align: -1.5px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%),
                    linear-gradient(-45deg, #ccc 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #ccc 75%),
                    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 6px 6px;
  background-position: 0 0, 0 3px, 3px -3px, -3px 0px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.graph-color-badge:hover {
  transform: scale(1.25);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}
.graph-color-chip-inner {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 2px;
}
:global(.dark-mode) .graph-color-badge {
  border-color: rgba(255, 255, 255, 0.3);
  background-image: linear-gradient(45deg, #555 25%, transparent 25%),
                    linear-gradient(-45deg, #555 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #555 75%),
                    linear-gradient(-45deg, transparent 75%, #555 75%);
}

.graph-img-badge {
  font-size: 13px;
  cursor: pointer;
  opacity: 0.85;
  transition: transform 0.15s ease, opacity 0.15s ease;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  flex-shrink: 0;
  margin-right: 4px;
  color: #0284c7;
}

:global(.dark-mode) .graph-img-badge {
  color: #38bdf8;
}

.img-badge-icon {
  width: 14px;
  height: 14px;
  stroke-width: 2;
}

.graph-img-badge:hover {
  transform: scale(1.15);
  opacity: 1;
}

.is-web-url {
  text-decoration: underline dotted var(--text-secondary, #9ca3af) !important;
  text-underline-offset: 2px;
}

.graph-url-jump-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  padding: 0;
  background: transparent;
  border: none !important;
  outline: none !important;
  border-radius: 3px !important;
  color: #2563eb;
  cursor: pointer;
  opacity: 0.95;
  vertical-align: middle;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.graph-url-jump-btn:hover {
  background: rgba(37, 99, 235, 0.15);
  color: #2563eb;
  opacity: 1;
  transform: scale(1.15);
}

:global(.dark-mode) .graph-url-jump-btn {
  background: transparent;
  border: none !important;
  color: #38bdf8;
  opacity: 1;
}

:global(.dark-mode) .graph-url-jump-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  box-shadow: none;
}

.url-jump-icon {
  width: 10px;
  height: 10px;
}

/* ── Minimap (右下角交互小地图) ── */
.graph-minimap-container {
  position: absolute;
  bottom: clamp(10px, 1.8vh, 18px);
  right: clamp(10px, 1.8vw, 18px);
  z-index: 15;
  user-select: none;
  pointer-events: auto;
}

.graph-minimap-card {
  width: clamp(160px, 16vw, 220px);
  height: clamp(110px, 13vh, 150px);
  max-width: min(220px, calc(100vw - 32px), calc(100% - 24px));
  max-height: min(150px, calc(50vh - 32px), calc(50% - 24px));
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  backdrop-filter: blur(8px);
}

:global(.dark-mode) .graph-minimap-card {
  background: rgba(28, 28, 33, 0.95);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}

.minimap-header {
  height: 24px;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
:global(.dark-mode) .minimap-header {
  background: #232328;
  border-color: #38383e;
}

.minimap-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
}
:global(.dark-mode) .minimap-title {
  color: #94a3b8;
}

.minimap-title-icon {
  width: 12px;
  height: 12px;
}

.minimap-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: #94a3b8;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.minimap-toggle-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}
:global(.dark-mode) .minimap-toggle-btn:hover {
  background: #334155;
  color: #f1f5f9;
}

.minimap-icon-btn {
  width: 11px;
  height: 11px;
}

.minimap-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  background-color: #fafbfc;
  background-image: radial-gradient(rgba(0, 0, 0, 0.08) 1px, transparent 1px);
  background-size: 8px 8px;
  cursor: crosshair;
  touch-action: none;
}
:global(.dark-mode) .minimap-body {
  background-color: #141417;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
}

.minimap-svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* 连线：轻淡柔和，不抢视觉 */
.mm-edge {
  fill: none;
  stroke: rgba(148, 163, 184, 0.45);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
:global(.dark-mode) .mm-edge {
  stroke: rgba(255, 255, 255, 0.18);
}
.mm-edge.is-active {
  stroke: #3b82f6;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}
:global(.dark-mode) .mm-edge.is-active {
  stroke: #60a5fa;
}

/* 节点：精致半透明卡片剪影，带有轻盈圆角轮廓 */
.mm-node {
  fill: rgba(100, 116, 139, 0.12);
  stroke: rgba(100, 116, 139, 0.28);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
:global(.dark-mode) .mm-node {
  fill: rgba(255, 255, 255, 0.08);
  stroke: rgba(255, 255, 255, 0.16);
}

/* 激活选中的节点：柔和高亮，绝不用实心黑红块 */
.mm-node.is-active {
  fill: rgba(59, 130, 246, 0.18);
  stroke: #3b82f6;
  stroke-width: 1.5px;
}
:global(.dark-mode) .mm-node.is-active {
  fill: rgba(96, 165, 250, 0.22);
  stroke: #60a5fa;
  stroke-width: 1.5px;
}

/* 视口取景框 (Lens Viewfinder)：现代专业半透明蓝色浮层 */
.mm-viewport {
  fill: rgba(59, 130, 246, 0.08);
  stroke: #3b82f6;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
  cursor: grab;
  transition: fill 0.15s ease, stroke 0.15s ease;
}
.mm-viewport:hover {
  fill: rgba(59, 130, 246, 0.14);
  stroke: #2563eb;
}
.mm-viewport:active {
  cursor: grabbing;
  fill: rgba(59, 130, 246, 0.22);
  stroke: #1d4ed8;
}

:global(.dark-mode) .mm-viewport {
  fill: rgba(96, 165, 250, 0.1);
  stroke: #60a5fa;
}
:global(.dark-mode) .mm-viewport:hover {
  fill: rgba(96, 165, 250, 0.18);
  stroke: #93c5fd;
}
:global(.dark-mode) .mm-viewport:active {
  fill: rgba(96, 165, 250, 0.25);
  stroke: #38bdf8;
}

.minimap-expand-btn {
  width: clamp(28px, 2.4vw, 32px);
  height: clamp(28px, 2.4vw, 32px);
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.15s ease;
}
.minimap-expand-btn:hover {
  background: #f1f5f9;
  color: #0284c7;
  border-color: #0284c7;
}
:global(.dark-mode) .minimap-expand-btn {
  background: #1e1e24;
  border-color: #3f4452;
  color: #cbd5e1;
}
:global(.dark-mode) .minimap-expand-btn:hover {
  background: #334155;
  color: #38bdf8;
  border-color: #38bdf8;
}

.minimap-expand-icon {
  width: 15px;
  height: 15px;
}

.minimap-fade-enter-active,
.minimap-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.minimap-fade-enter-from,
.minimap-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

@media (max-width: 768px) {
  .graph-minimap-container {
    bottom: 8px;
    right: 8px;
  }
  .graph-minimap-card {
    width: clamp(140px, 36vw, 190px);
    height: clamp(95px, 20vh, 130px);
  }
}

/* ── 锚点精准定位呼吸闪烁动效 ── */
@keyframes anchorRowPulse {
  0% {
    background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.45)) !important;
    box-shadow: inset 0 0 0 2px var(--accent-color, #6366f1) !important;
  }
  40% {
    background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.22)) !important;
    box-shadow: inset 0 0 0 1.5px var(--accent-color, #6366f1) !important;
  }
  100% {
    background-color: transparent;
    box-shadow: none;
  }
}

.is-anchor-target {
  animation: anchorRowPulse 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

:global(.dark-mode) .is-anchor-target {
  animation: anchorRowPulseDark 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

@keyframes anchorRowPulseDark {
  0% {
    background-color: rgba(129, 140, 248, 0.45) !important;
    box-shadow: inset 0 0 0 2px #818cf8 !important;
  }
  40% {
    background-color: rgba(129, 140, 248, 0.22) !important;
    box-shadow: inset 0 0 0 1.5px #818cf8 !important;
  }
  100% {
    background-color: transparent;
    box-shadow: none;
  }
}
</style>
