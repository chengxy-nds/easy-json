<script setup>
import { ref, computed, watch, inject, provide, onMounted, onBeforeUnmount, nextTick, reactive } from 'vue'
import { ExternalLink, Copy, Image as ImageIcon, Clock, Braces, X, UnfoldVertical, FoldVertical, Volume2, Video as VideoIcon, KeyRound, FileCode, Code2, CalendarClock } from 'lucide-vue-next'
import { safeStringify, isLosslessNumber } from '../utils/jsonBigInt.js'
import { isImageUrl, isHttpUrl, isColorValue, openExternalUrl } from '../utils/imageDetector.js'
import { detectTimestamp, detectUnicode, detectNestedJson, getFormatNow } from '../utils/capsuleDetector.js'
import { detectMedia, detectJwt, detectBase64Text, detectUrlEncoded, detectCron, detectHtml } from '../utils/advancedDetectors.js'

const searchQuery = inject('searchQuery', ref(''))
const imagePreview = inject('imagePreview', null)
const smartPreview = inject('smartPreview', null)
const showToast = inject('showToast', null)
const isDark = inject('isDark', ref(true))
const openNestedJsonTab = inject('openNestedJsonTab', null)

const handleCopyKey = (key) => {
  if (key === null || key === undefined) return
  navigator.clipboard.writeText(String(key)).then(() => {
    if (showToast) {
      showToast(`已复制键名: ${key}`)
    }
  })
}

const handleCopyIndex = (idx) => {
  if (idx === null || idx === undefined) return
  navigator.clipboard.writeText(String(idx)).then(() => {
    if (showToast) {
      showToast(`已复制行号: ${idx}`)
    }
  })
}

const handleCopyValue = (val) => {
  if (val === null || val === undefined) return
  const disp = getDisplayValue(val)
  let str = ''
  if (isLosslessNumber(disp)) {
    str = String(disp)
  } else if (typeof disp === 'object') {
    str = safeStringify(disp, null, 2)
  } else if (typeof disp === 'string' && detectNestedJson(disp)) {
    str = JSON.stringify(disp)
  } else {
    str = String(disp)
  }
  navigator.clipboard.writeText(str).then(() => {
    if (showToast) {
      showToast(`已复制键值: ${str.length > 30 ? str.slice(0, 30) + '...' : str}`)
    }
  })
}

const handleCopySubtree = (val) => {
  if (val === null || val === undefined) return
  const jsonStr = safeStringify(val, null, 2)
  navigator.clipboard.writeText(jsonStr).then(() => {
    if (showToast) {
      showToast('已复制子树 JSON')
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

const getBase64Data = (v) => {
  if (typeof v !== 'string' || isColor(v) || getMediaData(v) || detectNestedJson(v)) return null
  return detectBase64Text(v)
}

const getUrlEncodedData = (v) => {
  if (typeof v !== 'string' || isColor(v) || getMediaData(v) || detectNestedJson(v)) return null
  if (detectBase64Text(v)) return null
  return detectUrlEncoded(v)
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

const getCronData = (v) => {
  if (typeof v !== 'string') return null
  if (isColor(v) || isImg(v) || getMediaData(v) || detectNestedJson(v) || getBase64Data(v) || getUrlEncodedData(v)) return null
  return detectCron(v)
}

const getSmartData = (v) => {
  if (typeof v !== 'string') return null
  if (isColor(v) || isImg(v) || getMediaData(v) || detectNestedJson(v) || getBase64Data(v) || getUrlEncodedData(v) || getCronData(v)) return null
  return detectJwt(v) || detectHtml(v)
}

const handleOpenUrl = (url) => {
  openExternalUrl(url)
  if (showToast) {
    showToast('已在浏览器打开链接')
  }
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
  if (imagePreview) imagePreview.hide()
  if (smartPreview) smartPreview.hide()
}

const onSmartMouseEnter = (sData, e) => {
  if (smartPreview && sData) smartPreview.show(sData, e.currentTarget)
}

const onSmartMouseLeave = () => {
  if (smartPreview) smartPreview.hide()
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

const props = defineProps({
  data: { required: true },
  rawInput: { type: String, default: '' },
  depth: { type: Number, default: 0 },
  hoveredPath: { type: Array, default: null },
  selectedPath: { type: Array, default: null },
  pathPrefix: { type: Array, default: () => [] }
})

const emit = defineEmits(['hover-path', 'click-path'])

const isPrimitive = (v) => v === null || typeof v !== 'object' || isLosslessNumber(v)

const getValueType = (v) => {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number' || typeof v === 'bigint' || isLosslessNumber(v)) return 'number'
  if (typeof v === 'string') return 'string'
  return 'object'
}

const getPreview = (v) => {
  const disp = getDisplayValue(v)
  if (disp === null) return 'null'
  if (isLosslessNumber(disp)) return String(disp)
  if (Array.isArray(disp)) return `[${disp.length} 项]`
  if (typeof disp === 'object') return `{${Object.keys(disp).length} 属性}`
  if (typeof disp === 'string') {
    if (detectNestedJson(disp)) {
      return JSON.stringify(disp)
    }
    return disp.replace(/\r?\n\s*/g, ' ')
  }
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

const handleCopyRaw = (rawVal, label = '原值') => {
  if (rawVal === undefined || rawVal === null) return
  const text = String(rawVal)
  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      showToast(`已复制 ${label}`)
    }
  })
}

// ─── Nested JSON Popover & Expand State ────────────────────────
const activeNestedMenu = ref(null)
let nestedMenuTimer = null
const expandedNestedPaths = ref(new Set())

const isCellNestedExpanded = (path) => expandedNestedPaths.value.has(JSON.stringify(path))

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
  if (expandedNestedPaths.value.has(pathStr)) {
    expandedNestedPaths.value.delete(pathStr)
    if (showToast) {
      showToast('已还原为转义字符串')
    }
  } else {
    expandedNestedPaths.value.add(pathStr)
    if (showToast) {
      showToast('已转义展开为表格子层级')
    }
  }
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
  if (type === 'number') return 'tree-number'
  if (type === 'boolean') return 'tree-boolean'
  if (type === 'null') return 'tree-null'
  return ''
}

// ─── Path tracking & Expand/Collapse ──────────────────────────────────────────
const treeExpanded = inject('treeExpanded', ref(true))
const injectedSelectedPath = inject('selectedPath', ref(null))
const injectedSelectedType = inject('selectedType', ref('all'))
const currentSelectedPath = computed(() => props.selectedPath || injectedSelectedPath.value)

// ─── Path resolution & Hover/Select synchronization helpers ───────────────────
const getFullPath = (subPath) => {
  return [...props.pathPrefix, ...subPath]
}

const injectedUserToggledPaths = inject('tableUserToggledPaths', null)
const userToggledPaths = injectedUserToggledPaths || ref(new Map())
if (props.depth === 0) {
  provide('tableUserToggledPaths', userToggledPaths)
}

watch(treeExpanded, () => {
  userToggledPaths.value.clear()
})

const toggleExpandPath = (path) => {
  const fullPathStr = JSON.stringify(getFullPath(path))
  const currentlyExpanded = isPathExpanded(path)
  userToggledPaths.value.set(fullPathStr, !currentlyExpanded)
}

const isPathExpanded = (path) => {
  const fullPathStr = JSON.stringify(getFullPath(path))
  if (userToggledPaths.value.has(fullPathStr)) {
    return userToggledPaths.value.get(fullPathStr)
  }
  return treeExpanded.value
}

const isKeySelected = (path) => {
  if (injectedSelectedType.value === 'value') return false
  const target = getFullPath(path)
  const cur = currentSelectedPath.value
  if (!cur || target.length !== cur.length) return false
  return target.every((v, i) => String(v) === String(cur[i]))
}

const isValSelected = (path) => {
  if (injectedSelectedType.value === 'key') return false
  const target = getFullPath(path)
  const cur = currentSelectedPath.value
  if (!cur || target.length !== cur.length) return false
  return target.every((v, i) => String(v) === String(cur[i]))
}

const isColSelected = (col, parentPath = []) => {
  const cur = currentSelectedPath.value
  if (!cur || cur.length === 0) return false
  const fullParent = getFullPath(parentPath)
  
  // 1. 如果当前选中的就是该属性（例如顶层直接选中 [col]，或父级下直接选中 [...fullParent, col]）
  if (cur.length === fullParent.length + 1) {
    for (let i = 0; i < fullParent.length; i++) {
      if (String(cur[i]) !== String(fullParent[i])) return false
    }
    return String(cur[cur.length - 1]) === String(col)
  }

  // 2. 如果当前选中的是某行的这一列（例如 [...fullParent, rowIdx, col]）
  if (cur.length === fullParent.length + 2) {
    for (let i = 0; i < fullParent.length; i++) {
      if (String(cur[i]) !== String(fullParent[i])) return false
    }
    return String(cur[cur.length - 1]) === String(col)
  }

  return false
}

const isColHovered = (col, parentPath = []) => {
  const cur = props.hoveredPath
  if (!cur || cur.length === 0) return false
  const fullParent = getFullPath(parentPath)

  if (cur.length === fullParent.length + 1) {
    for (let i = 0; i < fullParent.length; i++) {
      if (String(cur[i]) !== String(fullParent[i])) return false
    }
    return String(cur[cur.length - 1]) === String(col)
  }

  if (cur.length === fullParent.length + 2) {
    for (let i = 0; i < fullParent.length; i++) {
      if (String(cur[i]) !== String(fullParent[i])) return false
    }
    return String(cur[cur.length - 1]) === String(col)
  }

  return false
}

const isPathHovered = (path) => {
  const target = getFullPath(path)
  const cur = props.hoveredPath
  if (!cur || target.length !== cur.length) return false
  return target.every((v, i) => String(v) === String(cur[i]))
}

const emitHover = (path) => {
  emit('hover-path', path ? getFullPath(path) : null)
}

const handleChildHover = (path) => {
  emit('hover-path', path)
}

const emitClick = (path, type = 'all') => {
  emit('click-path', path ? getFullPath(path) : null, type)
}

const handleChildClick = (path, type = 'all') => {
  emit('click-path', path, type)
}

const getValTooltip = (val) => {
  const cron = getCronData(val)
  if (cron) {
    return '' + cron.translation
  }
  const m = getMediaData(val)
  if (m?.mediaType === 'audio') {
    return '音频直链 (悬停试听，点击复制)'
  }
  if (m?.mediaType === 'video') {
    return '视频直链 (悬停播放，点击复制)'
  }
  if (isImg(val)) {
    return '悬停预览图片，点击复制键值'
  }
  if (isHttpLink(val)) {
    return '点击复制键值，点击左侧图标可直接打开'
  }
  return '点击复制键值'
}

// ─── Fast Sampling & Memoized Helper: 从对象数组中收集全部唯一属性名 ──────────────
const columnsCache = new WeakMap()

const getColumnsFromObjectArray = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return []
  if (columnsCache.has(arr)) {
    return columnsCache.get(arr)
  }
  const cols = []
  const seen = new Set()
  const len = arr.length
  const sampleLimit = len <= 200 ? len : 100

  for (let i = 0; i < sampleLimit; i++) {
    const item = arr[i]
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = Object.keys(item)
      for (let j = 0; j < keys.length; j++) {
        const k = keys[j]
        if (!seen.has(k)) {
          seen.add(k)
          cols.push(k)
        }
      }
    }
  }

  if (len > 200) {
    const step = Math.max(1, Math.floor(len / 40))
    for (let i = sampleLimit; i < len; i += step) {
      const item = arr[i]
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const keys = Object.keys(item)
        for (let j = 0; j < keys.length; j++) {
          const k = keys[j]
          if (!seen.has(k)) {
            seen.add(k)
            cols.push(k)
          }
        }
      }
    }
  }

  columnsCache.set(arr, cols)
  return cols
}

// ─── 高性能判断是否为对象数组 ────────────────────────────────────────────────────────
const isArrayOfObjects = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return false
  const checkCount = Math.min(arr.length, 10)
  for (let i = 0; i < checkCount; i++) {
    const item = arr[i]
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return true
    }
  }
  return false
}

// ─── Inner Grid / KV Virtual Scrolling Engine (针对海量内嵌数组与对象纯虚拟滚动) ───────────
const innerScrollMap = reactive({})
const INNER_VIRTUAL_THRESHOLD = 50
const INNER_BUFFER = 12

const onInnerGridScroll = (e, pathKey) => {
  if (activeTimeMenu.value) activeTimeMenu.value = null
  if (activeNestedMenu.value) activeNestedMenu.value = null
  const top = e.target.scrollTop
  if (!innerScrollMap[pathKey]) {
    innerScrollMap[pathKey] = { scrollTop: top, viewportHeight: e.target.clientHeight || 500 }
  } else {
    innerScrollMap[pathKey].scrollTop = top
    if (e.target.clientHeight) {
      innerScrollMap[pathKey].viewportHeight = e.target.clientHeight
    }
  }
}

const getInnerGridVirtualData = (arr, pathKey) => {
  if (!Array.isArray(arr)) return { rows: [], isVirtual: false, topSpacer: 0, bottomSpacer: 0, rowOffset: 0, total: 0 }
  const total = arr.length
  if (total <= INNER_VIRTUAL_THRESHOLD) {
    return {
      rows: arr,
      isVirtual: false,
      topSpacer: 0,
      bottomSpacer: 0,
      rowOffset: 0,
      total
    }
  }
  const rowH = estimatedRowHeight.value || 30
  const state = innerScrollMap[pathKey]
  const top = state?.scrollTop || 0
  const vpHeight = state?.viewportHeight || 500

  const startIdx = Math.max(0, Math.floor(top / rowH) - INNER_BUFFER)
  const count = Math.ceil(vpHeight / rowH) + INNER_BUFFER * 2
  const endIdx = Math.min(total, startIdx + count)

  const rows = arr.slice(startIdx, endIdx)
  const topSpacer = startIdx * rowH
  const bottomSpacer = Math.max(0, (total - endIdx) * rowH)

  return {
    rows,
    isVirtual: true,
    topSpacer,
    bottomSpacer,
    rowOffset: startIdx,
    total
  }
}

const getInnerKvVirtualData = (val, pathKey) => {
  if (!val || typeof val !== 'object') return { items: [], isVirtual: false, topSpacer: 0, bottomSpacer: 0, total: 0 }
  const isArr = Array.isArray(val)
  const total = isArr ? val.length : Object.keys(val).length
  if (total <= INNER_VIRTUAL_THRESHOLD) {
    const items = isArr ? val.map((v, i) => [i, v]) : Object.entries(val)
    return {
      items,
      isVirtual: false,
      topSpacer: 0,
      bottomSpacer: 0,
      total,
      isArray: isArr
    }
  }
  const rowH = estimatedRowHeight.value || 30
  const state = innerScrollMap[pathKey]
  const top = state?.scrollTop || 0
  const vpHeight = state?.viewportHeight || 500

  const startIdx = Math.max(0, Math.floor(top / rowH) - INNER_BUFFER)
  const count = Math.ceil(vpHeight / rowH) + INNER_BUFFER * 2
  const endIdx = Math.min(total, startIdx + count)

  let items = []
  if (isArr) {
    const slice = val.slice(startIdx, endIdx)
    items = slice.map((v, i) => [startIdx + i, v])
  } else {
    const allKeys = Object.keys(val)
    const sliceKeys = allKeys.slice(startIdx, endIdx)
    items = sliceKeys.map(k => [k, val[k]])
  }
  const topSpacer = startIdx * rowH
  const bottomSpacer = Math.max(0, (total - endIdx) * rowH)

  return {
    items,
    isVirtual: true,
    topSpacer,
    bottomSpacer,
    total,
    isArray: isArr
  }
}

// ─── 判断数据是否为直接对象数组 (支持 2D 矩阵表格呈现) ──────────────────────
const isRootDirectArrayOfObjects = computed(() => {
  return isArrayOfObjects(props.data)
})

const rootDirectColumns = computed(() => {
  return isRootDirectArrayOfObjects.value ? getColumnsFromObjectArray(props.data) : []
})

// ─── 根 entries 列表 ────────────────────────────────────────────────────────────
const rootEntries = computed(() => {
  const obj = props.data
  if (!obj || typeof obj !== 'object' || isRootDirectArrayOfObjects.value) return []

  const isArray = Array.isArray(obj)
  return isArray
    ? obj.map((v, i) => ({ key: String(i), value: v, isIndex: true }))
    : Object.keys(obj).map(k => ({ key: k, value: obj[k], isIndex: false }))
})

// ─── Table Scale & Density Zoom (方案一：字体与密度缩放) ───────────────────────────
const TABLE_SCALE_STORAGE_KEY = 'easy_json_table_scale'
const DEFAULT_TABLE_SCALE = 0.9 // 默认比例 90%
const MIN_TABLE_SCALE = 0.6
const MAX_TABLE_SCALE = 1.5

const savedScale = typeof localStorage !== 'undefined' ? localStorage.getItem(TABLE_SCALE_STORAGE_KEY) : null
const initialScale = savedScale ? parseFloat(savedScale) || DEFAULT_TABLE_SCALE : DEFAULT_TABLE_SCALE
const tableScale = ref(initialScale)

watch(tableScale, (newVal) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TABLE_SCALE_STORAGE_KEY, String(newVal))
  }
})

const tableZoomIn = () => {
  tableScale.value = Math.min(MAX_TABLE_SCALE, Number((tableScale.value + 0.05).toFixed(2)))
}

const tableZoomOut = () => {
  tableScale.value = Math.max(MIN_TABLE_SCALE, Number((tableScale.value - 0.05).toFixed(2)))
}

const resetTableScale = () => {
  tableScale.value = DEFAULT_TABLE_SCALE
}

const handleTableWheel = (e) => {
  if (props.depth !== 0) return
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    if (e.deltaY < 0) {
      tableZoomIn()
    } else {
      tableZoomOut()
    }
  }
}

const rootTableStyles = computed(() => {
  if (props.depth !== 0) return {}
  const s = tableScale.value
  return {
    '--table-scale': s,
    '--table-font-size': `${(13 * s).toFixed(1)}px`,
    '--table-font-small': `${(12 * s).toFixed(1)}px`,
    '--table-font-sub': `${(10 * s).toFixed(1)}px`,
    '--table-padding-y': `${(6 * s).toFixed(1)}px`,
    '--table-padding-x': `${(12 * s).toFixed(1)}px`,
    '--table-header-padding-y': `${(7 * s).toFixed(1)}px`,
    '--table-header-padding-x': `${(12 * s).toFixed(1)}px`,
    '--table-compact-padding-y': `${(4 * s).toFixed(1)}px`,
    '--table-compact-padding-x': `${(10 * s).toFixed(1)}px`,
    '--table-index-width': `${(48 * s).toFixed(1)}px`,
    '--table-root-index-width': `${(50 * s).toFixed(1)}px`,
    '--table-min-val-width': `${(140 * s).toFixed(1)}px`,
    '--table-min-key-width': `${(110 * s).toFixed(1)}px`
  }
})

// ─── Virtual Scroll Engine (针对海量数据虚拟化，杜绝 80,000 行卡顿) ───────────
const scrollContainerRef = ref(null)
const scrollTop = ref(0)
const viewportHeight = ref(700)
const VIRTUAL_THRESHOLD = 60 // 超过 60 行自动开启虚拟滚动，少于 60 行走原本全量保证小数据零开销
const VIRTUAL_BUFFER = 15    // 上下各缓冲 15 行，避免高速滚动出现白屏

const onWrapperScroll = (e) => {
  if (activeTimeMenu.value) activeTimeMenu.value = null
  if (activeNestedMenu.value) activeNestedMenu.value = null
  if (props.depth !== 0) return
  scrollTop.value = e.target.scrollTop
}

const updateViewportHeight = () => {
  if (props.depth === 0 && scrollContainerRef.value) {
    viewportHeight.value = scrollContainerRef.value.clientHeight || 700
  }
}

let tableResizeObserver = null
onMounted(() => {
  if (props.depth === 0 && scrollContainerRef.value) {
    updateViewportHeight()
    tableResizeObserver = new ResizeObserver(() => {
      updateViewportHeight()
    })
    tableResizeObserver.observe(scrollContainerRef.value)
  }
  document.addEventListener('click', closeTimeMenu)
  document.addEventListener('click', closeNestedMenu)
  window.addEventListener('resize', closeTimeMenu)
  window.addEventListener('resize', closeNestedMenu)
})

onBeforeUnmount(() => {
  if (timeMenuTimer) clearTimeout(timeMenuTimer)
  if (nestedMenuTimer) clearTimeout(nestedMenuTimer)
  stopNowTimer()
  if (tableResizeObserver) {
    tableResizeObserver.disconnect()
    tableResizeObserver = null
  }
  document.removeEventListener('click', closeTimeMenu)
  document.removeEventListener('click', closeNestedMenu)
  window.removeEventListener('resize', closeTimeMenu)
  window.removeEventListener('resize', closeNestedMenu)
})

// 行高估算：随 tableScale 动态缩放，默认比例约为 30px
const estimatedRowHeight = computed(() => {
  const s = tableScale.value || 0.9
  return Math.max(20, Math.round(30 * s))
})

// 场景 1 虚拟切片（isRootDirectArrayOfObjects）
const directTotalRows = computed(() => {
  return Array.isArray(props.data) ? props.data.length : 0
})

const isDirectVirtual = computed(() => {
  return props.depth === 0 && isRootDirectArrayOfObjects.value && directTotalRows.value > VIRTUAL_THRESHOLD
})

const directStartIndex = computed(() => {
  if (!isDirectVirtual.value) return 0
  const idx = Math.floor(scrollTop.value / estimatedRowHeight.value) - VIRTUAL_BUFFER
  return Math.max(0, idx)
})

const directEndIndex = computed(() => {
  if (!isDirectVirtual.value) return directTotalRows.value
  const count = Math.ceil(viewportHeight.value / estimatedRowHeight.value) + VIRTUAL_BUFFER * 2
  return Math.min(directTotalRows.value, directStartIndex.value + count)
})

const visibleDirectData = computed(() => {
  if (!isDirectVirtual.value) {
    return Array.isArray(props.data) ? props.data.map((item, idx) => ({ item, idx })) : []
  }
  const result = []
  const start = directStartIndex.value
  const end = directEndIndex.value
  const arr = props.data
  for (let i = start; i < end; i++) {
    result.push({ item: arr[i], idx: i })
  }
  return result
})

const directTopSpacerHeight = computed(() => {
  if (!isDirectVirtual.value) return 0
  return directStartIndex.value * estimatedRowHeight.value
})

const directBottomSpacerHeight = computed(() => {
  if (!isDirectVirtual.value) return 0
  return Math.max(0, (directTotalRows.value - directEndIndex.value) * estimatedRowHeight.value)
})

// 场景 2 虚拟切片（rootEntries）
const isEntriesVirtual = computed(() => {
  return props.depth === 0 && !isRootDirectArrayOfObjects.value && rootEntries.value.length > VIRTUAL_THRESHOLD
})

const entriesTotalRows = computed(() => rootEntries.value.length)

const entriesStartIndex = computed(() => {
  if (!isEntriesVirtual.value) return 0
  const idx = Math.floor(scrollTop.value / estimatedRowHeight.value) - VIRTUAL_BUFFER
  return Math.max(0, idx)
})

const entriesEndIndex = computed(() => {
  if (!isEntriesVirtual.value) return entriesTotalRows.value
  const count = Math.ceil(viewportHeight.value / estimatedRowHeight.value) + VIRTUAL_BUFFER * 2
  return Math.min(entriesTotalRows.value, entriesStartIndex.value + count)
})

const visibleEntries = computed(() => {
  if (!isEntriesVirtual.value) return rootEntries.value
  return rootEntries.value.slice(entriesStartIndex.value, entriesEndIndex.value)
})

const entriesTopSpacerHeight = computed(() => {
  if (!isEntriesVirtual.value) return 0
  return entriesStartIndex.value * estimatedRowHeight.value
})

const entriesBottomSpacerHeight = computed(() => {
  if (!isEntriesVirtual.value) return 0
  return Math.max(0, (entriesTotalRows.value - entriesEndIndex.value) * estimatedRowHeight.value)
})

// ─── 路径追踪、自动祖先展开与虚拟视口居中定位 ──────────────────────────────
watch(currentSelectedPath, (newPath) => {
  if (!newPath || newPath.length === 0 || props.depth !== 0) return

  // 自动展开目标节点的所有折叠祖先路径
  for (let i = 1; i <= newPath.length; i++) {
    const sub = newPath.slice(0, i)
    const subStr = JSON.stringify(sub)
    if (userToggledPaths.value.has(subStr) && !userToggledPaths.value.get(subStr)) {
      userToggledPaths.value.set(subStr, true)
    }
  }

  nextTick(() => {
    // 虚拟滚动预定位：
    // 1. 如果目标属于顶层大数组，先将外层视口粗定位到目标行附近以触发虚拟行挂载
    if (props.depth === 0 && typeof newPath[0] === 'number') {
      const targetIdx = newPath[0]
      const estRowH = estimatedRowHeight.value || 30
      const vpHeight = viewportHeight.value || 700
      const estScrollTop = Math.max(0, targetIdx * estRowH - vpHeight / 2)
      const rootWrapper = scrollContainerRef.value || document.querySelector('.table-view-wrapper:not(.nested-wrapper)')
      if (rootWrapper && Math.abs(rootWrapper.scrollTop - estScrollTop) > vpHeight) {
        rootWrapper.scrollTop = estScrollTop
      }
    }
    // 2. 如果目标属于嵌套在某个对象属性下的大数组（例如 records: [...]），预定位内部虚拟容器
    else if (props.depth === 0 && newPath.length >= 2 && typeof newPath[1] === 'number') {
      const pathKey = JSON.stringify(getFullPath([newPath[0]]))
      const targetIdx = newPath[1]
      const estRowH = estimatedRowHeight.value || 30
      const estTop = Math.max(0, targetIdx * estRowH - 150)
      if (!innerScrollMap[pathKey]) {
        innerScrollMap[pathKey] = { scrollTop: estTop, viewportHeight: 500 }
      } else {
        innerScrollMap[pathKey].scrollTop = estTop
      }
    }

    // 视口垂直与水平双向平滑居中锚点
    setTimeout(() => {
      const rootWrapper = scrollContainerRef.value || document.querySelector('.table-view-wrapper:not(.nested-wrapper)') || document.querySelector('.table-view-wrapper')
      if (!rootWrapper) return
      const targetStr = JSON.stringify(newPath)
      
      // 优先根据 selectedType 精确查找对应类型的单元格
      let targetEl = null
      if (injectedSelectedType.value === 'key') {
        targetEl = rootWrapper.querySelector(`td.inner-key-cell[data-path='${targetStr}'], td.root-key-cell[data-path='${targetStr}'], th[data-path='${targetStr}'], [data-path='${targetStr}'][data-type='key']`)
      } else if (injectedSelectedType.value === 'value') {
        targetEl = rootWrapper.querySelector(`td.inner-val-cell[data-path='${targetStr}'], td.value-cell[data-path='${targetStr}'], [data-path='${targetStr}'][data-type='value']`)
      }
      if (!targetEl) {
        targetEl = rootWrapper.querySelector(`[data-path='${targetStr}']`)
      }
      if (!targetEl) {
        for (let i = newPath.length - 1; i >= 1; i--) {
          const prefixStr = JSON.stringify(newPath.slice(0, i))
          targetEl = rootWrapper.querySelector(`[data-path='${prefixStr}']`)
          if (targetEl) break
        }
      }

      if (targetEl) {
        // 如果 targetEl 是 TR 行，提取出该行对应的关注单元格以准确获取水平坐标
        let focusEl = targetEl
        if (targetEl.tagName === 'TR') {
          if (injectedSelectedType.value === 'value') {
            focusEl = targetEl.querySelector('.inner-val-cell, .value-cell') || targetEl
          } else {
            focusEl = targetEl.querySelector('.inner-key-cell, .root-key-cell, .grid-index-cell') || targetEl.firstElementChild || targetEl
          }
        }

        // 如果 focusEl 存在中间可滚动的父容器（如 .inner-grid-container.is-inner-virtual 等），先滚动内部容器确保目标在内层视口内
        let currParent = focusEl.parentElement
        while (currParent && currParent !== rootWrapper) {
          const style = window.getComputedStyle(currParent)
          const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowX === 'auto' || style.overflowX === 'scroll')
          if (isScrollable && (currParent.scrollHeight > currParent.clientHeight || currParent.scrollWidth > currParent.clientWidth)) {
            const pBox = currParent.getBoundingClientRect()
            const fBox = focusEl.getBoundingClientRect()
            let pDiffY = 0
            if (fBox.top < pBox.top + 20 || fBox.bottom > pBox.bottom - 20) {
              pDiffY = (fBox.top + fBox.height / 2) - (pBox.top + pBox.height / 2)
            }
            let pDiffX = 0
            if (fBox.left < pBox.left + 20 || fBox.right > pBox.right - 20) {
              pDiffX = fBox.left - (pBox.left + 20)
            }
            if (pDiffY !== 0 || pDiffX !== 0) {
              currParent.scrollBy({ top: pDiffY, left: pDiffX, behavior: 'smooth' })
            }
          }
          currParent = currParent.parentElement
        }

        const pRect = rootWrapper.getBoundingClientRect()
        const tRect = focusEl.getBoundingClientRect()
        
        // 垂直对齐：若不在视口舒适区域内才平滑滚动，已可见则不剧烈跳动
        let diffY = 0
        const isVerticallyVisible = tRect.top >= pRect.top + 30 && tRect.bottom <= pRect.bottom - 30
        if (!isVerticallyVisible) {
          diffY = (tRect.top + tRect.height / 2) - (pRect.top + pRect.height / 2)
        }

        // 水平对齐：动态计算最左侧顶层粘滞列宽度（如 root-key-cell.is-sticky-root 或 grid-index-header.is-sticky-header）
        let stickyLeftWidth = 0
        const stickyEl = rootWrapper.querySelector('.root-key-cell.is-sticky-root, .grid-index-header.is-sticky-header, .grid-index-cell.is-sticky-index')
        if (stickyEl) {
          stickyLeftWidth = stickyEl.getBoundingClientRect().width || 0
        }
        if (stickyLeftWidth <= 0) {
          stickyLeftWidth = isRootDirectArrayOfObjects.value ? 48 : 110
        }

        const visibleMinX = pRect.left + stickyLeftWidth
        const visibleMaxX = pRect.right

        let diffX = 0
        // 1. 如果目标就是最外层粘滞列本身（整个数据的第一层根属性），直接让水平滚动完全复位到最左侧 (scrollLeft = 0)
        if (focusEl.classList.contains('is-sticky-root') || focusEl.classList.contains('is-sticky-index') || (Array.isArray(newPath) && newPath.length === 1)) {
          diffX = -rootWrapper.scrollLeft
        }
        // 2. 通用单元格定位：只有当单元格超出可视区域（被左侧 sticky 列盖住、在左外侧或在右外侧）时才按需平移，绝不在已可见时盲目跳动
        else {
          if (tRect.left < visibleMinX + 8) {
            // 被左侧 sticky 列盖住或在左外侧，往左滚动平移至 sticky 列右方安全区
            diffX = tRect.left - (visibleMinX + 16)
          } else if (tRect.right > visibleMaxX - 8) {
            // 在右侧视口外，平滑向右滚动至完整露出
            diffX = tRect.left - (visibleMinX + 16)
          } else {
            // 已经在可视区范围内，完全不需要横向滚动！
            diffX = 0
          }
        }

        rootWrapper.scrollBy({
          top: diffY,
          left: diffX,
          behavior: 'smooth'
        })
      }
    }, 50)
  })
}, { immediate: true, deep: true })
</script>

<template>
  <div
    class="table-view-root"
    :class="{ 'is-nested-child': depth > 0 }"
    :style="depth === 0 ? rootTableStyles : undefined"
    @wheel="handleTableWheel"
  >
    <div
      ref="scrollContainerRef"
      class="table-view-wrapper"
      :class="{ 'nested-wrapper': depth > 0 }"
      @scroll.passive="onWrapperScroll"
    >
      <!-- ─── 场景 1: 顶层数据本身就是对象数组 (Direct 2D Data Grid) ─── -->
      <table v-if="isRootDirectArrayOfObjects" class="json-table data-grid-table">
      <thead>
        <tr class="grid-header-row">
          <th class="grid-col-header grid-index-header" :class="{ 'is-sticky-header': depth === 0 }">#</th>
          <th
            v-for="col in rootDirectColumns"
            :key="col"
            class="grid-col-header"
            :class="{
              'is-sticky-header': depth === 0,
              'is-selected': isColSelected(col, []),
              'is-hovered': isColHovered(col, [])
            }"
            @click.stop="emitClick([0, col], 'key')"
            @mouseenter.stop="emitHover([0, col])"
            @mouseleave.stop="emitHover(null)"
          >
            <div class="grid-th-content">
              <span
                class="grid-col-header-text"
                data-tooltip="点击复制键名"
                @click.stop="handleCopyKey(col); emitClick([0, col], 'key')"
                v-html="highlightText(col, searchQuery)"
              ></span>
              <button
                class="copy-col-btn"
                @click.stop="handleCopyColumn(data, col)"
                data-tooltip="复制整列数据"
              >
                <Copy class="copy-col-icon" />
              </button>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- Top Spacer for Virtual Scroll -->
        <tr v-if="directTopSpacerHeight > 0" class="virtual-spacer-row" :style="{ height: directTopSpacerHeight + 'px' }">
          <td :colspan="rootDirectColumns.length + 1" class="virtual-spacer-cell"></td>
        </tr>

        <tr
          v-for="{ item, idx } in visibleDirectData"
          :key="idx"
          class="json-table-row data-grid-row"
          :data-path="JSON.stringify(getFullPath([idx]))"
        >
          <!-- Row Index -->
          <td
            class="grid-index-cell"
            :class="{ 'is-sticky-index': depth === 0, 'is-selected': isKeySelected([idx]) }"
            @click.stop="emitClick([idx], 'key')"
            @mouseenter.stop="emitHover([idx])"
            @mouseleave.stop="emitHover(null)"
          >
            <span
              class="table-key-text"
              data-tooltip="点击复制行号"
              @click.stop="handleCopyIndex(idx + 1); emitClick([idx], 'key')"
            >{{ idx + 1 }}</span>
          </td>

          <!-- Columns -->
          <td
            v-for="col in rootDirectColumns"
            :key="col"
            class="value-cell grid-data-cell"
            :data-path="JSON.stringify(getFullPath([idx, col]))"
            :class="{
              [`val-${getValueType(item?.[col])}`]: true,
              'is-selected': !isCellNestedExpanded([idx, col]) && isValSelected([idx, col]),
              'is-hovered': !isCellNestedExpanded([idx, col]) && isPathHovered([idx, col]),
              'value-cell--complex': !isPrimitive(item?.[col]) || isCellNestedExpanded([idx, col])
            }"
            @mouseenter.stop="(!isCellNestedExpanded([idx, col])) ? emitHover([idx, col]) : null"
            @mouseleave.stop="(!isCellNestedExpanded([idx, col])) ? emitHover(null) : null"
            @click.stop="(isPrimitive(item?.[col]) && !isCellNestedExpanded([idx, col])) ? emitClick([idx, col], 'value') : null"
          >
            <template v-if="item && item[col] !== undefined">
              <!-- Primitive value in 2D grid -->
              <div v-if="isPrimitive(item[col]) && !isCellNestedExpanded([idx, col])" class="val-primitive-wrap">
                <span
                  v-if="isColor(item[col])"
                  class="table-color-badge"
                ><span class="table-color-chip-inner" :style="{ backgroundColor: item[col] }"></span></span>
                <span
                  v-else-if="isAudio(item[col])"
                  class="tree-img-badge tree-audio-badge"
                  @mouseenter="(e) => onValMouseEnter(item[col], e)"
                  @mouseleave="() => onValMouseLeave(item[col])"
                  data-tooltip="音频直链 (悬停试听)"
                ><Volume2 class="img-badge-icon" /></span>
                <span
                  v-else-if="isVideo(item[col])"
                  class="tree-img-badge tree-video-badge"
                  @mouseenter="(e) => onValMouseEnter(item[col], e)"
                  @mouseleave="() => onValMouseLeave(item[col])"
                  data-tooltip="视频直链 (悬停播放)"
                ><VideoIcon class="img-badge-icon" /></span>
                <span
                  v-else-if="isImg(item[col])"
                  class="tree-img-badge"
                  @mouseenter="(e) => onValMouseEnter(item[col], e)"
                  @mouseleave="() => onValMouseLeave(item[col])"
                  data-tooltip="图片链接 (悬停预览)"
                ><ImageIcon class="img-badge-icon" /></span>
                <button
                  v-else-if="isHttpLink(item[col])"
                  class="url-jump-btn"
                  @click.stop="handleOpenUrl(item[col])"
                  data-tooltip="在浏览器中直接打开链接"
                >
                  <ExternalLink class="url-jump-icon" />
                </button>

                <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
                <button
                  v-if="getCronData(item[col])"
                  class="tree-capsule-badge tree-cron-badge"
                  @click.stop="handleCopyValue(item[col])"
                >
                  <CalendarClock class="capsule-icon" />
                  <span class="capsule-text">CRON</span>
                </button>

                <!-- 智能数据胶囊 (JWT, HTML) -->
                <button
                  v-if="getSmartData(item[col])"
                  class="tree-capsule-badge"
                  :class="{
                    'tree-jwt-badge': getSmartData(item[col]).isJwt,
                    'tree-html-badge': getSmartData(item[col]).isHtml
                  }"
                  @mouseenter="onSmartMouseEnter(getSmartData(item[col]), $event)"
                  @mouseleave="onSmartMouseLeave"
                  @click.stop="onSmartMouseEnter(getSmartData(item[col]), $event)"
                  :title="getSmartData(item[col]).isJwt ? 'JWT Token (悬停解码)' : '智能数据 (悬停查看详情)'"
                >
                  <KeyRound v-if="getSmartData(item[col]).isJwt" class="capsule-icon" />
                  <span class="capsule-text">
                    {{ getSmartData(item[col]).isJwt ? 'JWT' : 'HTML' }}
                  </span>
                </button>

                <!-- Base64 Badge (点击复制 Base64 原值) -->
                <span
                  v-if="getBase64Data(item[col])"
                  class="tree-inline-badge tree-b64-badge"
                  @click.stop="handleCopyRaw(item[col], 'Base64 原值')"
                  data-tooltip="点击复制 Base64 原值"
                >
                  <span class="capsule-symbol">B64</span>
                </span>

                <!-- URL 编码 Badge (点击复制 URL 编码原值) -->
                <span
                  v-if="getUrlEncodedData(item[col])"
                  class="tree-inline-badge tree-urldec-badge"
                  @click.stop="handleCopyRaw(item[col], 'URL 编码原值')"
                  data-tooltip="点击复制 URL 编码原值"
                >
                  <span class="capsule-symbol">%</span>
                </span>

                <!-- 时间戳胶囊 -->
                <button
                  v-if="detectTimestamp(item[col])"
                  class="tree-capsule-badge tree-time-badge"
                  @mouseenter="onTimeBadgeEnter(detectTimestamp(item[col]), $event)"
                  @mouseleave="onTimeBadgeLeave"
                  @click.stop="openTimeMenu(detectTimestamp(item[col]), $event)"
                  title="悬停查看与复制时间格式"
                >
                  <Clock class="capsule-icon" />
                  <span class="capsule-text">{{ detectTimestamp(item[col]).beijingStr }}</span>
                </button>

                <!-- Unicode 徽标 -->
                <span
                  v-if="detectUnicode(item[col], props.rawInput, [idx, col])"
                  class="tree-unicode-badge"
                  @click.stop="handleCopyUnicode(detectUnicode(item[col], props.rawInput, [idx, col]))"
                  title="点击复制 Unicode 原文"
                >
                  <span class="capsule-symbol">\u</span>
                </span>

                <!-- 嵌套 JSON 徽标 -->
                <span
                  v-if="detectNestedJson(item[col])"
                  class="tree-nested-badge"
                  @click.stop="toggleNestedExpand([idx, col])"
                  @mouseenter="onNestedBadgeEnter([idx, col], item[col], col, $event)"
                  @mouseleave="onNestedBadgeLeave"
                  title="嵌套 JSON 字符串，悬停展开或新 Tab 打开"
                >
                  <Braces class="capsule-icon" />
                </span>

                <span
                  :class="[getValueColorClass(getValueType(item[col])), 'copyable-val', { 'is-image-url': isImg(item[col]), 'is-web-url': isHttpLink(item[col]) }]"
                  @mouseenter="(e) => onValMouseEnter(item[col], e)"
                  @mouseleave="() => onValMouseLeave(item[col])"
                  @click.stop="handleCopyValue(item[col]); emitClick([idx, col], 'value')"
                  :data-tooltip="getValTooltip(item[col])"
                  v-html="highlightText(getPreview(item[col]), searchQuery)"
                ></span>
              </div>

              <!-- 嵌套 JSON 就地展开表格 -->
              <div v-else-if="detectNestedJson(item[col]) && isCellNestedExpanded([idx, col])" class="complex-cell-container">
                <div class="complex-header-row nested-json-header">
                  <span
                    class="tree-nested-badge is-expanded"
                    @click.stop="toggleNestedExpand([idx, col])"
                    @mouseenter="onNestedBadgeEnter([idx, col], item[col], col, $event)"
                    @mouseleave="onNestedBadgeLeave"
                  >
                    <Braces class="capsule-icon" />
                  </span>
                  <span class="preview-text">嵌套 JSON (已转义展开)</span>
                </div>
                <JsonTableView
                  :data="detectNestedJson(item[col]).parsed"
                  :rawInput="props.rawInput"
                  :depth="depth + 1"
                  :hoveredPath="hoveredPath"
                  :selectedPath="currentSelectedPath"
                  :pathPrefix="getFullPath([idx, col])"
                  @hover-path="(p) => $emit('hover-path', p)"
                  @click-path="(p, t) => $emit('click-path', p, t)"
                />
              </div>

              <!-- Complex nested value in 2D grid -->
              <div v-else class="complex-cell-container">
                <div class="complex-header-row">
                  <button
                    class="toggle-btn"
                    @click.stop="toggleExpandPath([idx, col])"
                    :data-tooltip="isPathExpanded([idx, col]) ? '收起子层级' : '展开子层级'"
                  >
                    <span class="toggle-icon">{{ isPathExpanded([idx, col]) ? '▼' : '▶' }}</span>
                    <span class="preview-text" v-html="highlightText(getPreview(item[col]), searchQuery)"></span>
                  </button>
                  <button
                    class="copy-subtree-btn"
                    @click.stop="handleCopySubtree(item[col])"
                    data-tooltip="点击复制子树 JSON"
                  >
                    <Copy class="copy-subtree-icon" />
                  </button>
                </div>
                <div v-if="isPathExpanded([idx, col])" class="nested-table-container">
                  <JsonTableView
                    :data="item[col]"
                    :rawInput="props.rawInput"
                    :depth="depth + 1"
                    :hoveredPath="hoveredPath"
                    :selectedPath="currentSelectedPath"
                    :pathPrefix="getFullPath([idx, col])"
                    @hover-path="handleChildHover"
                    @click-path="handleChildClick"
                  />
                </div>
              </div>
            </template>
            <span v-else class="val-empty">-</span>
          </td>
        </tr>

        <!-- Bottom Spacer for Virtual Scroll -->
        <tr v-if="directBottomSpacerHeight > 0" class="virtual-spacer-row" :style="{ height: directBottomSpacerHeight + 'px' }">
          <td :colspan="rootDirectColumns.length + 1" class="virtual-spacer-cell"></td>
        </tr>
      </tbody>
    </table>

    <!-- ─── 场景 2: 常规 JSON 对象结构 (统一 2 列主表，支持对象数组行转列) ─── -->
    <table v-else class="json-table main-json-table">
      <tbody>
        <!-- Top Spacer for Virtual Scroll -->
        <tr v-if="entriesTopSpacerHeight > 0" class="virtual-spacer-row" :style="{ height: entriesTopSpacerHeight + 'px' }">
          <td colspan="2" class="virtual-spacer-cell"></td>
        </tr>

        <tr
          v-for="entry in visibleEntries"
          :key="entry.key"
          class="json-table-row"
          :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))"
        >
          <!-- ─── 左侧键名列 (Root Key Column) ─── -->
          <td
            class="root-key-cell"
            :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))"
            data-type="key"
            :class="{ 
              'is-sticky-root': depth === 0,
              'root-index-cell': entry.isIndex,
              'is-selected': isKeySelected([entry.isIndex ? Number(entry.key) : entry.key]),
              'is-hovered': isPathHovered([entry.isIndex ? Number(entry.key) : entry.key])
            }"
            @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key], 'key')"
            @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key])"
            @mouseleave.stop="emitHover(null)"
          >
            <span
              class="table-key-text"
              data-tooltip="点击复制键名"
              @click.stop="handleCopyKey(entry.key); emitClick([entry.isIndex ? Number(entry.key) : entry.key], 'key')"
              v-html="highlightText(entry.key, searchQuery)"
            ></span>
          </td>

          <!-- ─── 右侧键值列 (Value Column) ─── -->
          <td
            class="value-cell"
            :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))"
            data-type="value"
            :class="{
              [`val-${getValueType(entry.value)}`]: true,
              'is-selected': !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key]) && isValSelected([entry.isIndex ? Number(entry.key) : entry.key]),
              'is-hovered': !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key]) && isPathHovered([entry.isIndex ? Number(entry.key) : entry.key]),
              'value-cell--complex': !isPrimitive(entry.value) || isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key])
            }"
            @click.stop="(isPrimitive(entry.value) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key])) ? emitClick([entry.isIndex ? Number(entry.key) : entry.key], 'value') : null"
            @mouseenter.stop="(isPrimitive(entry.value) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key])) ? emitHover([entry.isIndex ? Number(entry.key) : entry.key]) : null"
            @mouseleave.stop="emitHover(null)"
          >
            <!-- 2.1 基础单值属性 (Primitive Value) -->
            <div v-if="isPrimitive(entry.value) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key])" class="val-primitive-wrap">
              <span
                v-if="isColor(entry.value)"
                class="table-color-badge"
              ><span class="table-color-chip-inner" :style="{ backgroundColor: entry.value }"></span></span>
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

              <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
              <button
                v-if="getCronData(entry.value)"
                class="tree-capsule-badge tree-cron-badge"
                @click.stop="handleCopyValue(entry.value)"
              >
                <CalendarClock class="capsule-icon" />
                <span class="capsule-text">CRON</span>
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
                :title="getSmartData(entry.value).isJwt ? 'JWT Token (悬停解码)' : '智能数据 (悬停查看详情)'"
              >
                <KeyRound v-if="getSmartData(entry.value).isJwt" class="capsule-icon" />
                <span class="capsule-text">
                  {{ getSmartData(entry.value).isJwt ? 'JWT' : 'HTML' }}
                </span>
              </button>

              <!-- Base64 Badge (点击复制 Base64 原值) -->
              <span
                v-if="getBase64Data(entry.value)"
                class="tree-inline-badge tree-b64-badge"
                @click.stop="handleCopyRaw(entry.value, 'Base64 原值')"
                data-tooltip="点击复制 Base64 原值"
              >
                <span class="capsule-symbol">B64</span>
              </span>

              <!-- URL 编码 Badge (点击复制 URL 编码原值) -->
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
                v-if="detectUnicode(entry.value, props.rawInput, [entry.isIndex ? Number(entry.key) : entry.key])"
                class="tree-unicode-badge"
                @click.stop="handleCopyUnicode(detectUnicode(entry.value, props.rawInput, [entry.isIndex ? Number(entry.key) : entry.key]))"
                title="点击复制 Unicode 原文"
              >
                <span class="capsule-symbol">\u</span>
              </span>

              <!-- 嵌套 JSON 徽标 -->
              <span
                v-if="detectNestedJson(entry.value)"
                class="tree-nested-badge"
                @click.stop="toggleNestedExpand([entry.isIndex ? Number(entry.key) : entry.key])"
                @mouseenter="onNestedBadgeEnter([entry.isIndex ? Number(entry.key) : entry.key], entry.value, entry.key, $event)"
                @mouseleave="onNestedBadgeLeave"
                title="嵌套 JSON 字符串，悬停展开或新 Tab 打开"
              >
                <Braces class="capsule-icon" />
              </span>

              <span
                :class="[getValueColorClass(getValueType(entry.value)), 'copyable-val', { 'is-image-url': isImg(entry.value), 'is-web-url': isHttpLink(entry.value) }]"
                @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                @mouseleave="() => onValMouseLeave(entry.value)"
                @click.stop="handleCopyValue(entry.value); emitClick([entry.isIndex ? Number(entry.key) : entry.key], 'value')"
                :data-tooltip="getValTooltip(entry.value)"
                v-html="highlightText(getPreview(entry.value), searchQuery)"
              ></span>
            </div>

            <!-- 嵌套 JSON 就地展开表格 -->
            <div v-else-if="detectNestedJson(entry.value) && isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key])" class="complex-cell-container">
              <div class="complex-header-row nested-json-header">
                <span
                  class="tree-nested-badge is-expanded"
                  @click.stop="toggleNestedExpand([entry.isIndex ? Number(entry.key) : entry.key])"
                  @mouseenter="onNestedBadgeEnter([entry.isIndex ? Number(entry.key) : entry.key], entry.value, entry.key, $event)"
                  @mouseleave="onNestedBadgeLeave"
                >
                  <Braces class="capsule-icon" />
                </span>
                <span class="preview-text">嵌套 JSON (已转义展开)</span>
              </div>
              <JsonTableView
                :data="detectNestedJson(entry.value).parsed"
                :rawInput="props.rawInput"
                :depth="depth + 1"
                :hoveredPath="hoveredPath"
                :selectedPath="currentSelectedPath"
                :pathPrefix="getFullPath([entry.isIndex ? Number(entry.key) : entry.key])"
                @hover-path="handleChildHover"
                @click-path="handleChildClick"
              />
            </div>

            <!-- 2.2 对象数组属性 (Array of Objects - 核心行转列 2D 表格) -->
            <div v-else-if="isArrayOfObjects(entry.value)" class="complex-grid-wrap">
              <!-- 折叠状态 -->
              <div v-if="!isPathExpanded([entry.isIndex ? Number(entry.key) : entry.key])" class="complex-header-row padding-box">
                <button
                  class="toggle-btn"
                  @click.stop="toggleExpandPath([entry.isIndex ? Number(entry.key) : entry.key])"
                  data-tooltip="展开子层级"
                >
                  <span class="toggle-icon">▶</span>
                  <span class="preview-text">[ {{ entry.value.length }} 项 ]</span>
                </button>
                <button
                  class="copy-subtree-btn"
                  @click.stop="handleCopySubtree(entry.value)"
                  data-tooltip="点击复制子树 JSON"
                >
                  <Copy class="copy-subtree-icon" />
                </button>
              </div>

              <!-- 展开状态: 内嵌 2D 矩阵表格 (支持虚拟滚动) -->
              <div
                v-else
                class="inner-grid-container"
                :class="{ 'is-inner-virtual': entry.value.length > INNER_VIRTUAL_THRESHOLD }"
                @scroll.passive="onInnerGridScroll($event, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key])))"
              >
                <table class="inner-grid-table">
                  <thead>
                    <tr class="inner-grid-header-row">
                      <th class="inner-grid-th inner-grid-index-th">#</th>
                      <th
                        v-for="col in getColumnsFromObjectArray(entry.value)"
                        :key="col"
                        class="inner-grid-th"
                        :class="{
                          'is-selected': isColSelected(col, [entry.isIndex ? Number(entry.key) : entry.key]),
                          'is-hovered': isColHovered(col, [entry.isIndex ? Number(entry.key) : entry.key])
                        }"
                        @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key, 0, col], 'key')"
                        @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key, 0, col])"
                        @mouseleave.stop="emitHover(null)"
                      >
                        <div class="grid-th-content">
                          <span
                            class="grid-col-header-text"
                            data-tooltip="点击复制键名"
                            @click.stop="handleCopyKey(col); emitClick([entry.isIndex ? Number(entry.key) : entry.key, 0, col], 'key')"
                            v-html="highlightText(col, searchQuery)"
                          ></span>
                          <button
                            class="copy-col-btn"
                            @click.stop="handleCopyColumn(entry.value, col)"
                            data-tooltip="复制整列数据"
                          >
                            <Copy class="copy-col-icon" />
                          </button>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- Top Spacer for Virtual Scroll -->
                    <tr
                      v-if="getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).topSpacer > 0"
                      class="virtual-spacer-row"
                      :style="{ height: getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).topSpacer + 'px' }"
                    >
                      <td :colspan="getColumnsFromObjectArray(entry.value).length + 1" class="virtual-spacer-cell"></td>
                    </tr>

                    <tr
                      v-for="(subObj, localIdx) in getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rows"
                      :key="getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx"
                      class="inner-grid-row"
                      :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx]))"
                    >
                      <td
                        class="inner-grid-td inner-grid-index-cell"
                        :class="{ 'is-selected': isKeySelected([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx]) }"
                        @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx], 'key')"
                        @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx])"
                        @mouseleave.stop="emitHover(null)"
                      >
                        <span
                          class="table-key-text"
                          data-tooltip="点击复制行号"
                          @click.stop="handleCopyIndex(getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx + 1); emitClick([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx], 'key')"
                        >{{ getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx + 1 }}</span>
                      </td>
                      <td
                        v-for="col in getColumnsFromObjectArray(entry.value)"
                        :key="col"
                        class="inner-grid-td"
                        :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col]))"
                        data-type="value"
                        :class="{
                          [`val-${getValueType(subObj?.[col])}`]: true,
                          'is-selected': !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col]) && isValSelected([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col]),
                          'is-hovered': !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col]) && isPathHovered([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col]),
                          'value-cell--complex': !isPrimitive(subObj?.[col]) || isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])
                        }"
                        @mouseenter.stop="(!isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])) ? emitHover([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col]) : null"
                        @mouseleave.stop="(!isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])) ? emitHover(null) : null"
                        @click.stop="(isPrimitive(subObj?.[col]) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])) ? emitClick([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col], 'value') : null"
                      >
                        <template v-if="subObj && subObj[col] !== undefined">
                          <div v-if="isPrimitive(subObj[col]) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])" class="val-primitive-wrap">
                            <span
                              v-if="isColor(subObj[col])"
                              class="table-color-badge"
                            ><span class="table-color-chip-inner" :style="{ backgroundColor: subObj[col] }"></span></span>
                            <span
                              v-else-if="isAudio(subObj[col])"
                              class="tree-img-badge tree-audio-badge"
                              @mouseenter="(e) => onValMouseEnter(subObj[col], e)"
                              @mouseleave="() => onValMouseLeave(subObj[col])"
                              data-tooltip="音频直链 (悬停试听)"
                            ><Volume2 class="img-badge-icon" /></span>
                            <span
                              v-else-if="isVideo(subObj[col])"
                              class="tree-img-badge tree-video-badge"
                              @mouseenter="(e) => onValMouseEnter(subObj[col], e)"
                              @mouseleave="() => onValMouseLeave(subObj[col])"
                              data-tooltip="视频直链 (悬停播放)"
                            ><VideoIcon class="img-badge-icon" /></span>
                            <span
                              v-else-if="isImg(subObj[col])"
                              class="tree-img-badge"
                              @mouseenter="(e) => onValMouseEnter(subObj[col], e)"
                              @mouseleave="() => onValMouseLeave(subObj[col])"
                              data-tooltip="图片链接 (悬停预览)"
                            ><ImageIcon class="img-badge-icon" /></span>
                            <button
                              v-else-if="isHttpLink(subObj[col])"
                              class="url-jump-btn"
                              @click.stop="handleOpenUrl(subObj[col])"
                              data-tooltip="在浏览器中直接打开链接"
                            >
                              <ExternalLink class="url-jump-icon" />
                            </button>

                            <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
                            <button
                              v-if="getCronData(subObj[col])"
                              class="tree-capsule-badge tree-cron-badge"
                              @click.stop="handleCopyValue(subObj[col])"
                            >
                              <CalendarClock class="capsule-icon" />
                              <span class="capsule-text">CRON</span>
                            </button>

                            <!-- 智能数据胶囊 (JWT, HTML) -->
                            <button
                              v-if="getSmartData(subObj[col])"
                              class="tree-capsule-badge"
                              :class="{
                                'tree-jwt-badge': getSmartData(subObj[col]).isJwt,
                                'tree-html-badge': getSmartData(subObj[col]).isHtml
                              }"
                              @mouseenter="onSmartMouseEnter(getSmartData(subObj[col]), $event)"
                              @mouseleave="onSmartMouseLeave"
                              @click.stop="onSmartMouseEnter(getSmartData(subObj[col]), $event)"
                              :title="getSmartData(subObj[col]).isJwt ? 'JWT Token (悬停解码)' : '智能数据 (悬停查看详情)'"
                            >
                              <KeyRound v-if="getSmartData(subObj[col]).isJwt" class="capsule-icon" />
                              <span class="capsule-text">
                                {{ getSmartData(subObj[col]).isJwt ? 'JWT' : 'HTML' }}
                              </span>
                            </button>

                            <!-- Base64 Badge (点击复制 Base64 原值) -->
                            <span
                              v-if="getBase64Data(subObj[col])"
                              class="tree-inline-badge tree-b64-badge"
                              @click.stop="handleCopyRaw(subObj[col], 'Base64 原值')"
                              data-tooltip="点击复制 Base64 原值"
                            >
                              <span class="capsule-symbol">B64</span>
                            </span>

                            <!-- URL 编码 Badge (点击复制 URL 编码原值) -->
                            <span
                              v-if="getUrlEncodedData(subObj[col])"
                              class="tree-inline-badge tree-urldec-badge"
                              @click.stop="handleCopyRaw(subObj[col], 'URL 编码原值')"
                              data-tooltip="点击复制 URL 编码原值"
                            >
                              <span class="capsule-symbol">%</span>
                            </span>

                            <!-- 时间戳胶囊 -->
                            <button
                              v-if="detectTimestamp(subObj[col])"
                              class="tree-capsule-badge tree-time-badge"
                              @mouseenter="onTimeBadgeEnter(detectTimestamp(subObj[col]), $event)"
                              @mouseleave="onTimeBadgeLeave"
                              @click.stop="openTimeMenu(detectTimestamp(subObj[col]), $event)"
                              title="悬停查看与复制时间格式"
                            >
                              <Clock class="capsule-icon" />
                              <span class="capsule-text">{{ detectTimestamp(subObj[col]).beijingStr }}</span>
                            </button>

                            <!-- Unicode 徽标 -->
                            <span
                              v-if="detectUnicode(subObj[col], props.rawInput, [entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])"
                              class="tree-unicode-badge"
                              @click.stop="handleCopyUnicode(detectUnicode(subObj[col], props.rawInput, [entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col]))"
                              title="点击复制 Unicode 原文"
                            >
                              <span class="capsule-symbol">\u</span>
                            </span>

                            <!-- 嵌套 JSON 徽标 -->
                            <span
                              v-if="detectNestedJson(subObj[col])"
                              class="tree-nested-badge"
                              @click.stop="toggleNestedExpand([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])"
                              @mouseenter="onNestedBadgeEnter([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col], subObj[col], col, $event)"
                              @mouseleave="onNestedBadgeLeave"
                              title="嵌套 JSON 字符串，悬停展开或新 Tab 打开"
                            >
                              <Braces class="capsule-icon" />
                            </span>

                            <span
                              :class="[getValueColorClass(getValueType(subObj[col])), 'copyable-val', { 'is-image-url': isImg(subObj[col]), 'is-web-url': isHttpLink(subObj[col]) }]"
                              @mouseenter="(e) => onValMouseEnter(subObj[col], e)"
                              @mouseleave="() => onValMouseLeave(subObj[col])"
                              @click.stop="handleCopyValue(subObj[col]); emitClick([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col], 'value')"
                              :data-tooltip="getValTooltip(subObj[col])"
                              v-html="highlightText(getPreview(subObj[col]), searchQuery)"
                            ></span>
                          </div>

                          <!-- 嵌套 JSON 就地展开表格 -->
                          <div v-else-if="detectNestedJson(subObj[col]) && isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])" class="complex-cell-container">
                            <div class="complex-header-row nested-json-header">
                              <span
                                class="tree-nested-badge is-expanded"
                                @click.stop="toggleNestedExpand([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])"
                                @mouseenter="onNestedBadgeEnter([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col], subObj[col], col, $event)"
                                @mouseleave="onNestedBadgeLeave"
                              >
                                <Braces class="capsule-icon" />
                              </span>
                              <span class="preview-text">嵌套 JSON (已转义展开)</span>
                            </div>
                            <JsonTableView
                              :data="detectNestedJson(subObj[col]).parsed"
                              :rawInput="props.rawInput"
                              :depth="depth + 1"
                              :hoveredPath="hoveredPath"
                              :selectedPath="currentSelectedPath"
                              :pathPrefix="getFullPath([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])"
                              @hover-path="handleChildHover"
                              @click-path="handleChildClick"
                            />
                          </div>

                          <div v-else class="complex-cell-container">
                            <JsonTableView
                              :data="subObj[col]"
                              :rawInput="props.rawInput"
                              :depth="depth + 1"
                              :hoveredPath="hoveredPath"
                              :selectedPath="currentSelectedPath"
                              :pathPrefix="getFullPath([entry.isIndex ? Number(entry.key) : entry.key, getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).rowOffset + localIdx, col])"
                              @hover-path="handleChildHover"
                              @click-path="handleChildClick"
                            />
                          </div>
                        </template>
                        <span v-else class="val-empty">-</span>
                      </td>
                    </tr>

                    <!-- Bottom Spacer for Virtual Scroll -->
                    <tr
                      v-if="getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).bottomSpacer > 0"
                      class="virtual-spacer-row"
                      :style="{ height: getInnerGridVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).bottomSpacer + 'px' }"
                    >
                      <td :colspan="getColumnsFromObjectArray(entry.value).length + 1" class="virtual-spacer-cell"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 2.3 普通嵌套对象或纯值数组 (Nested Object / Array of Primitives) -->
            <div v-else class="complex-cell-container">
              <!-- 折叠状态 -->
              <div v-if="!isPathExpanded([entry.isIndex ? Number(entry.key) : entry.key])" class="complex-header-row padding-box">
                <button
                  class="toggle-btn"
                  @click.stop="toggleExpandPath([entry.isIndex ? Number(entry.key) : entry.key])"
                  data-tooltip="展开子层级"
                >
                  <span class="toggle-icon">▶</span>
                  <span class="preview-text">{{ getPreview(entry.value) }}</span>
                </button>
                <button
                  class="copy-subtree-btn"
                  @click.stop="handleCopySubtree(entry.value)"
                  data-tooltip="点击复制子树 JSON"
                >
                  <Copy class="copy-subtree-icon" />
                </button>
              </div>

              <!-- 展开状态: 内嵌规整子表格 (支持虚拟滚动) -->
              <div
                v-else
                class="nested-table-container"
                :class="{ 'is-inner-virtual': (Array.isArray(entry.value) ? entry.value.length : Object.keys(entry.value).length) > INNER_VIRTUAL_THRESHOLD }"
                @scroll.passive="onInnerGridScroll($event, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key])))"
              >
                <table class="inner-kv-table">
                  <tbody>
                    <!-- Top Spacer for Virtual Scroll -->
                    <tr
                      v-if="getInnerKvVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).topSpacer > 0"
                      class="virtual-spacer-row"
                      :style="{ height: getInnerKvVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).topSpacer + 'px' }"
                    >
                      <td colspan="2" class="virtual-spacer-cell"></td>
                    </tr>

                    <tr
                      v-for="[subK, subVal] in getInnerKvVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).items"
                      :key="subK"
                      class="inner-kv-row"
                      :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subK]))"
                    >
                      <!-- 子键名 / 索引 -->
                      <td
                        class="inner-key-cell"
                        :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subK]))"
                        data-type="key"
                        :class="{ 
                          'inner-index-cell': Array.isArray(entry.value),
                          'is-selected': isKeySelected([entry.isIndex ? Number(entry.key) : entry.key, subK]),
                          'is-hovered': isPathHovered([entry.isIndex ? Number(entry.key) : entry.key, subK])
                        }"
                        @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key, subK], 'key')"
                        @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key, subK])"
                        @mouseleave.stop="emitHover(null)"
                      >
                        <span
                          class="table-key-text"
                          data-tooltip="点击复制键名"
                          @click.stop="handleCopyKey(subK); emitClick([entry.isIndex ? Number(entry.key) : entry.key, subK], 'key')"
                          v-html="highlightText(subK, searchQuery)"
                        ></span>
                      </td>

                      <!-- 子键值 -->
                      <td
                        class="inner-val-cell"
                        :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subK]))"
                        data-type="value"
                        :class="{
                          [`val-${getValueType(subVal)}`]: true,
                          'is-selected': !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, subK]) && isValSelected([entry.isIndex ? Number(entry.key) : entry.key, subK]),
                          'is-hovered': !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, subK]) && isPathHovered([entry.isIndex ? Number(entry.key) : entry.key, subK]),
                          'value-cell--complex': !isPrimitive(subVal) || isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, subK])
                        }"
                        @click.stop="(isPrimitive(subVal) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, subK])) ? emitClick([entry.isIndex ? Number(entry.key) : entry.key, subK], 'value') : null"
                        @mouseenter.stop="(isPrimitive(subVal) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, subK])) ? emitHover([entry.isIndex ? Number(entry.key) : entry.key, subK]) : null"
                        @mouseleave.stop="emitHover(null)"
                      >
                        <div v-if="isPrimitive(subVal) && !isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, subK])" class="val-primitive-wrap">
                          <span
                            v-if="isColor(subVal)"
                            class="table-color-badge"
                          ><span class="table-color-chip-inner" :style="{ backgroundColor: subVal }"></span></span>
                          <span
                            v-else-if="isAudio(subVal)"
                            class="tree-img-badge tree-audio-badge"
                            @mouseenter="(e) => onValMouseEnter(subVal, e)"
                            @mouseleave="() => onValMouseLeave(subVal)"
                            data-tooltip="音频直链 (悬停试听)"
                          ><Volume2 class="img-badge-icon" /></span>
                          <span
                            v-else-if="isVideo(subVal)"
                            class="tree-img-badge tree-video-badge"
                            @mouseenter="(e) => onValMouseEnter(subVal, e)"
                            @mouseleave="() => onValMouseLeave(subVal)"
                            data-tooltip="视频直链 (悬停播放)"
                          ><VideoIcon class="img-badge-icon" /></span>
                          <span
                            v-else-if="isImg(subVal)"
                            class="tree-img-badge"
                            @mouseenter="(e) => onValMouseEnter(subVal, e)"
                            @mouseleave="() => onValMouseLeave(subVal)"
                            data-tooltip="图片链接 (悬停预览)"
                          ><ImageIcon class="img-badge-icon" /></span>
                          <button
                            v-else-if="isHttpLink(subVal)"
                            class="url-jump-btn"
                            @click.stop="handleOpenUrl(subVal)"
                            data-tooltip="在浏览器中直接打开链接"
                          >
                            <ExternalLink class="url-jump-icon" />
                          </button>

                          <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
                          <button
                            v-if="getCronData(subVal)"
                            class="tree-capsule-badge tree-cron-badge"
                            @click.stop="handleCopyValue(subVal)"
                          >
                            <CalendarClock class="capsule-icon" />
                            <span class="capsule-text">CRON</span>
                          </button>

                          <!-- 智能数据胶囊 (JWT, HTML) -->
                          <button
                            v-if="getSmartData(subVal)"
                            class="tree-capsule-badge"
                            :class="{
                              'tree-jwt-badge': getSmartData(subVal).isJwt,
                              'tree-html-badge': getSmartData(subVal).isHtml
                            }"
                            @mouseenter="onSmartMouseEnter(getSmartData(subVal), $event)"
                            @mouseleave="onSmartMouseLeave"
                            @click.stop="onSmartMouseEnter(getSmartData(subVal), $event)"
                            :title="getSmartData(subVal).isJwt ? 'JWT Token (悬停解码)' : '智能数据 (悬停查看详情)'"
                          >
                            <KeyRound v-if="getSmartData(subVal).isJwt" class="capsule-icon" />
                            <span class="capsule-text">
                              {{ getSmartData(subVal).isJwt ? 'JWT' : 'HTML' }}
                            </span>
                          </button>

                          <!-- Base64 Badge (点击复制 Base64 原值) -->
                          <span
                            v-if="getBase64Data(subVal)"
                            class="tree-inline-badge tree-b64-badge"
                            @click.stop="handleCopyRaw(subVal, 'Base64 原值')"
                            data-tooltip="点击复制 Base64 原值"
                          >
                            <span class="capsule-symbol">B64</span>
                          </span>

                          <!-- URL 编码 Badge (点击复制 URL 编码原值) -->
                          <span
                            v-if="getUrlEncodedData(subVal)"
                            class="tree-inline-badge tree-urldec-badge"
                            @click.stop="handleCopyRaw(subVal, 'URL 编码原值')"
                            data-tooltip="点击复制 URL 编码原值"
                          >
                            <span class="capsule-symbol">%</span>
                          </span>

                          <!-- 时间戳胶囊 -->
                          <button
                            v-if="detectTimestamp(subVal)"
                            class="tree-capsule-badge tree-time-badge"
                            @mouseenter="onTimeBadgeEnter(detectTimestamp(subVal), $event)"
                            @mouseleave="onTimeBadgeLeave"
                            @click.stop="openTimeMenu(detectTimestamp(subVal), $event)"
                            title="悬停查看与复制时间格式"
                          >
                            <Clock class="capsule-icon" />
                            <span class="capsule-text">{{ detectTimestamp(subVal).beijingStr }}</span>
                          </button>

                          <!-- Unicode 徽标 -->
                          <span
                            v-if="detectUnicode(subVal, props.rawInput, [entry.isIndex ? Number(entry.key) : entry.key, subK])"
                            class="tree-unicode-badge"
                            @click.stop="handleCopyUnicode(detectUnicode(subVal, props.rawInput, [entry.isIndex ? Number(entry.key) : entry.key, subK]))"
                            title="点击复制 Unicode 原文"
                          >
                            <span class="capsule-symbol">\u</span>
                          </span>

                          <!-- 嵌套 JSON 徽标 -->
                          <span
                            v-if="detectNestedJson(subVal)"
                            class="tree-nested-badge"
                            @click.stop="toggleNestedExpand([entry.isIndex ? Number(entry.key) : entry.key, subK])"
                            @mouseenter="onNestedBadgeEnter([entry.isIndex ? Number(entry.key) : entry.key, subK], subVal, subK, $event)"
                            @mouseleave="onNestedBadgeLeave"
                            title="嵌套 JSON 字符串，悬停展开或新 Tab 打开"
                          >
                            <Braces class="capsule-icon" />
                          </span>

                          <span
                            :class="[getValueColorClass(getValueType(subVal)), 'copyable-val', { 'is-image-url': isImg(subVal), 'is-web-url': isHttpLink(subVal) }]"
                            @mouseenter="(e) => onValMouseEnter(subVal, e)"
                            @mouseleave="() => onValMouseLeave(subVal)"
                            @click.stop="handleCopyValue(subVal); emitClick([entry.isIndex ? Number(entry.key) : entry.key, subK], 'value')"
                            :data-tooltip="getValTooltip(subVal)"
                            v-html="highlightText(getPreview(subVal), searchQuery)"
                          ></span>
                        </div>

                        <!-- 嵌套 JSON 就地展开表格 -->
                        <div v-else-if="detectNestedJson(subVal) && isCellNestedExpanded([entry.isIndex ? Number(entry.key) : entry.key, subK])" class="complex-cell-container">
                          <div class="complex-header-row nested-json-header">
                            <span
                              class="tree-nested-badge is-expanded"
                              @click.stop="toggleNestedExpand([entry.isIndex ? Number(entry.key) : entry.key, subK])"
                              @mouseenter="onNestedBadgeEnter([entry.isIndex ? Number(entry.key) : entry.key, subK], subVal, subK, $event)"
                              @mouseleave="onNestedBadgeLeave"
                            >
                              <Braces class="capsule-icon" />
                            </span>
                            <span class="preview-text">嵌套 JSON (已转义展开)</span>
                          </div>
                          <JsonTableView
                            :data="detectNestedJson(subVal).parsed"
                            :rawInput="props.rawInput"
                            :depth="depth + 1"
                            :hoveredPath="hoveredPath"
                            :selectedPath="currentSelectedPath"
                            :pathPrefix="getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subK])"
                            @hover-path="handleChildHover"
                            @click-path="handleChildClick"
                          />
                        </div>

                        <div v-else class="complex-cell-container">
                          <JsonTableView
                            :data="subVal"
                            :rawInput="props.rawInput"
                            :depth="depth + 1"
                            :hoveredPath="hoveredPath"
                            :selectedPath="currentSelectedPath"
                            :pathPrefix="getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subK])"
                            @hover-path="handleChildHover"
                            @click-path="handleChildClick"
                          />
                        </div>
                      </td>
                    </tr>
                    <!-- Bottom Spacer for Virtual Scroll -->
                    <tr
                      v-if="getInnerKvVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).bottomSpacer > 0"
                      class="virtual-spacer-row"
                      :style="{ height: getInnerKvVirtualData(entry.value, JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))).bottomSpacer + 'px' }"
                    >
                      <td colspan="2" class="virtual-spacer-cell"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
        <!-- Bottom Spacer for Virtual Scroll -->
        <tr v-if="entriesBottomSpacerHeight > 0" class="virtual-spacer-row" :style="{ height: entriesBottomSpacerHeight + 'px' }">
          <td colspan="2" class="virtual-spacer-cell"></td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- Floating Table Scale Controls (Root Only, Absolute overlay pinned at bottom-right) -->
    <div v-if="depth === 0" class="table-scale-controls">
      <button class="table-ctrl-btn" @click.stop="tableZoomIn" data-tooltip-left="放大表格比例 (Ctrl + 滚轮)">
        ＋
      </button>
      <span
        class="table-ctrl-badge"
        :data-tooltip-left="`当前比例: ${Math.round(tableScale * 100)}%`"
      >
        {{ Math.round(tableScale * 100) }}%
      </span>
      <button class="table-ctrl-btn" @click.stop="tableZoomOut" data-tooltip-left="缩小表格比例 (Ctrl + 滚轮)">
        －
      </button>
      <button
        v-if="tableScale !== DEFAULT_TABLE_SCALE"
        class="table-ctrl-btn reset-btn"
        @click.stop="resetTableScale"
        data-tooltip-left="重置为 90% 默认比例"
      >
        ⊡
      </button>
    </div>

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
.virtual-spacer-row {
  pointer-events: none;
  border: none !important;
  background: transparent !important;
}

.virtual-spacer-cell {
  padding: 0 !important;
  border: none !important;
  height: inherit !important;
  background: transparent !important;
}

.table-view-root:not(.is-nested-child) {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.table-view-root.is-nested-child {
  position: static;
  width: 100%;
  height: auto;
  overflow: visible;
  display: block;
  flex: none;
}

.table-view-wrapper {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
  background-color: var(--bg-panel);
  background-image: 
    linear-gradient(to right, var(--grid-line-color, rgba(0, 0, 0, 0.05)) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-line-color, rgba(0, 0, 0, 0.05)) 1px, transparent 1px);
  background-size: 16px 16px;
}

/* 彻底隐藏原生滚动条上下/左右三角箭头按钮 (▲ ▼ ◀ ▶) */
.table-view-wrapper::-webkit-scrollbar-button,
.inner-grid-container.is-inner-virtual::-webkit-scrollbar-button,
.nested-table-container.is-inner-virtual::-webkit-scrollbar-button {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* 对齐左侧 CodeMirror 编辑区 1:1 的饱满圆角滚动条体验 (7px) */
.table-view-wrapper::-webkit-scrollbar,
.inner-grid-container.is-inner-virtual::-webkit-scrollbar,
.nested-table-container.is-inner-virtual::-webkit-scrollbar {
  width: 7px !important;
  height: 7px !important;
}

.table-view-wrapper::-webkit-scrollbar-track,
.inner-grid-container.is-inner-virtual::-webkit-scrollbar-track,
.nested-table-container.is-inner-virtual::-webkit-scrollbar-track {
  background: transparent !important;
}

.table-view-wrapper::-webkit-scrollbar-thumb,
.inner-grid-container.is-inner-virtual::-webkit-scrollbar-thumb,
.nested-table-container.is-inner-virtual::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.45) !important;
  border-radius: 4px !important;
  transition: background-color 0.15s ease;
}

.table-view-wrapper::-webkit-scrollbar-thumb:hover,
.inner-grid-container.is-inner-virtual::-webkit-scrollbar-thumb:hover,
.nested-table-container.is-inner-virtual::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.8) !important;
}

.table-view-wrapper.nested-wrapper {
  padding: 0;
  background: transparent;
  background-image: none;
  width: 100%;
  height: auto;
  overflow: visible;
  flex: none;
}

.table-view-wrapper:not(.nested-wrapper) {
  min-height: 100%;
}

.json-table {
  border-collapse: separate;
  border-spacing: 0;
  font-family: var(--font-sans);
  font-size: var(--table-font-size, 13px);
  width: max-content;
  min-width: auto;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.json-table th,
.json-table td {
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  box-sizing: border-box;
  vertical-align: top;
}

.json-table tr > th:last-child,
.json-table tr > td:last-child {
  border-right: none;
}

.json-table tbody tr:last-child > td {
  border-bottom: none;
}

.nested-wrapper .json-table tbody tr:last-child > td {
  border-bottom: 1px solid var(--border-color) !important;
}

/* 2D Data Grid Column Header */
.grid-col-header {
  position: static;
  background-color: var(--table-header-bg, #f1f5f9) !important;
  color: var(--table-subkey-fg, #991b1b);
  font-family: var(--font-mono);
  font-size: var(--table-font-size, 13px);
  font-weight: 500;
  padding: var(--table-header-padding-y, 7px) var(--table-header-padding-x, 12px);
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.grid-col-header.is-sticky-header {
  position: sticky !important;
  top: 0 !important;
  z-index: 20 !important;
}

.inner-grid-th {
  background: var(--table-header-bg, #f1f5f9);
  color: var(--table-subkey-fg, #991b1b);
  font-family: var(--font-mono);
  font-size: var(--table-font-size, 13px);
  font-weight: 500;
  padding: var(--table-header-padding-y, 7px) var(--table-header-padding-x, 12px);
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: background-color 0.15s ease, color 0.15s ease;
}

:global(.dark-mode) .grid-col-header,
:global(.dark-mode) .inner-grid-th {
  background: #26262b !important;
  color: var(--table-subkey-fg, #f43f5e);
}

.grid-col-header:last-child,
.inner-grid-th:last-child {
  border-right: none;
}

.inner-grid-index-th {
  width: var(--table-index-width, 42px);
  min-width: var(--table-index-width, 42px);
  max-width: var(--table-index-width, 42px);
  text-align: center;
  color: var(--text-muted);
}

.grid-th-content {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.grid-col-header-text {
  display: inline-block;
  cursor: pointer;
}

.grid-col-header-text:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.copy-col-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted, #9ca3af);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease, background-color 0.15s ease;
  flex-shrink: 0;
}

.grid-col-header:hover .copy-col-btn,
.inner-grid-th:hover .copy-col-btn {
  opacity: 0.85;
}

.copy-col-btn:hover {
  opacity: 1 !important;
  color: var(--json-key, #4f46e5);
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.08));
}

:global(.dark-mode) .copy-col-btn:hover {
  background-color: rgba(255, 255, 255, 0.12);
}

.copy-col-icon {
  width: 13px;
  height: 13px;
}

.grid-index-header {
  position: static;
  width: var(--table-index-width, 48px);
  min-width: var(--table-index-width, 48px);
  text-align: center;
  background-color: var(--table-header-bg, #f1f5f9) !important;
  box-shadow: 1px 0 0 var(--border-color);
}

.grid-index-header.is-sticky-header {
  position: sticky !important;
  top: 0 !important;
  left: 0 !important;
  z-index: 30 !important;
}

:global(.dark-mode) .grid-index-header {
  background-color: #26262b !important;
}

.grid-index-cell {
  position: static;
  color: var(--json-number, #2563eb);
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: center;
  padding: var(--table-padding-y, 6px) 8px;
  font-size: var(--table-font-size, 13px);
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  width: var(--table-index-width, 48px);
  min-width: var(--table-index-width, 48px);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  box-shadow: 1px 0 0 var(--border-color);
}

.grid-index-cell.is-sticky-index {
  position: sticky !important;
  left: 0 !important;
  z-index: 12 !important;
}

.grid-index-cell:not(.is-selected):not(.is-hovered) {
  background-color: var(--bg-panel, #ffffff) !important;
}

:global(.dark-mode) .grid-index-cell:not(.is-selected):not(.is-hovered) {
  background-color: #1e1e22 !important;
}

/* 内嵌子表格中的表头与序号列、根键列不应跨级粘滞脱离父级，避免外层横向滚动时浮动错位与吃字 */
.nested-wrapper .grid-index-header,
.nested-wrapper .grid-index-cell,
.nested-wrapper .grid-col-header,
.nested-wrapper .root-key-cell,
.nested-wrapper .root-index-cell,
.is-nested-child .grid-index-header,
.is-nested-child .grid-index-cell,
.is-nested-child .grid-col-header,
.is-nested-child .root-key-cell,
.is-nested-child .root-index-cell {
  position: static !important;
  top: auto !important;
  left: auto !important;
  z-index: auto !important;
  box-shadow: none !important;
}

/* Root key cell styling */
.root-key-cell {
  position: static;
  color: var(--table-root-fg, #991b1b);
  padding: var(--table-header-padding-y, 7px) var(--table-header-padding-x, 12px);
  font-size: var(--table-font-size, 13px);
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  width: auto;
  min-width: var(--table-min-key-width, 110px);
  max-width: 280px;
  letter-spacing: 0.01em;
  transition: background-color 0.15s ease, color 0.15s ease;
  box-shadow: 1px 0 0 var(--border-color);
}

.root-key-cell.is-sticky-root {
  position: sticky !important;
  left: 0 !important;
  z-index: 20 !important;
}

.root-key-cell:not(.is-selected):not(.is-hovered) {
  background-color: var(--bg-panel, #ffffff) !important;
}

:global(.dark-mode) .root-key-cell {
  color: var(--table-root-fg, #61afef);
}

:global(.dark-mode) .root-key-cell:not(.is-selected):not(.is-hovered) {
  background-color: #1e1e22 !important;
}

.root-key-cell.root-index-cell {
  width: var(--table-root-index-width, 50px);
  min-width: var(--table-root-index-width, 50px);
  text-align: center;
  font-family: var(--font-mono);
  color: var(--json-number, #2563eb);
}

.table-key-text {
  display: inline-block;
  cursor: pointer;
}

.table-key-text:hover {
  text-decoration: underline;
  opacity: 0.85;
}

/* Value cell */
.value-cell {
  padding: var(--table-padding-y, 6px) var(--table-padding-x, 12px);
  font-family: var(--font-mono);
  font-size: var(--table-font-size, 13px);
  color: var(--text-primary);
  word-break: break-word;
  background: transparent;
  vertical-align: top;
  min-width: var(--table-min-val-width, 140px);
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.value-cell:not(.value-cell--complex) {
  cursor: pointer;
}

.value-cell.value-cell--complex {
  padding: 0 !important;
  background: transparent !important;
}

.nested-wrapper .json-table {
  border: none;
  background: transparent;
  width: 100% !important;
  border-collapse: collapse;
}

/* Complex cell container */
.complex-cell-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  justify-content: flex-start;
}

.complex-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: transparent;
  transition: background-color 0.15s ease;
}

.complex-header-row.padding-box {
  padding: var(--table-compact-padding-y, 4px) var(--table-compact-padding-x, 10px);
}

.complex-header-row.nested-json-header {
  border-bottom: 1px solid var(--border-color);
  padding: 4px 8px;
  width: 100%;
  box-sizing: border-box;
  background: var(--table-header-bg, rgba(0, 0, 0, 0.02));
}

:global(.dark-mode) .complex-header-row.nested-json-header {
  background: var(--table-header-bg, rgba(255, 255, 255, 0.02));
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--table-font-small, 11px);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.toggle-btn:hover {
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--text-primary);
}

.toggle-icon {
  font-size: 10px;
  color: var(--text-muted);
}

.preview-text {
  opacity: 0.8;
  font-style: italic;
  font-size: var(--table-font-small, 11px);
}

.copy-subtree-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted, #9ca3af);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.copy-subtree-btn:hover {
  opacity: 1;
  color: var(--json-key, #4f46e5);
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.06));
}

.copy-subtree-icon {
  width: 12px;
  height: 12px;
}

/* Nested inner tables */
.nested-table-container,
.complex-grid-wrap,
.inner-grid-container {
  width: 100%;
}

.inner-grid-container.is-inner-virtual,
.nested-table-container.is-inner-virtual {
  max-height: clamp(350px, 68vh, 750px);
  overflow: auto;
  position: relative;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px var(--border-color);
}

.inner-grid-container.is-inner-virtual .inner-grid-header-row th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--table-header-bg, #f1f5f9) !important;
}

:global(.dark-mode) .inner-grid-container.is-inner-virtual .inner-grid-header-row th {
  background: #26262b !important;
}

.inner-grid-container.is-inner-virtual .inner-grid-index-th {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 15;
}

.inner-grid-container.is-inner-virtual .inner-grid-index-cell {
  position: sticky;
  left: 0;
  z-index: 5;
  background-color: var(--table-header-bg, #f1f5f9) !important;
}

:global(.dark-mode) .inner-grid-container.is-inner-virtual .inner-grid-index-cell {
  background-color: #26262b !important;
}

.inner-grid-table,
.inner-kv-table {
  width: 100%;
  border-collapse: collapse;
  background: transparent;
}

.inner-grid-row {
  border-bottom: 1px solid var(--border-color);
}

.inner-grid-row:last-child {
  border-bottom: none;
}

.inner-grid-td {
  padding: var(--table-padding-y, 6px) var(--table-padding-x, 12px);
  font-family: var(--font-mono);
  font-size: var(--table-font-size, 13px);
  border-right: 1px solid var(--border-color);
  vertical-align: top;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.inner-grid-td.value-cell--complex {
  padding: 0 !important;
}

.inner-grid-td:last-child {
  border-right: none;
}

.inner-grid-index-cell {
  width: var(--table-index-width, 42px);
  min-width: var(--table-index-width, 42px);
  max-width: var(--table-index-width, 42px);
  text-align: center;
  color: var(--text-muted);
  font-family: var(--font-mono);
  user-select: none;
  cursor: pointer;
  background-color: var(--table-header-bg, rgba(0, 0, 0, 0.03));
}

:global(.dark-mode) .inner-grid-index-cell {
  background-color: var(--table-header-bg, rgba(255, 255, 255, 0.03));
}

.inner-kv-row {
  border-bottom: 1px solid var(--border-color);
}

.inner-kv-row:last-child {
  border-bottom: none;
}

.inner-key-cell {
  width: auto;
  min-width: 80px;
  max-width: 220px;
  color: var(--table-subkey-fg, #991b1b);
  /* font-weight: 500; */
  padding: var(--table-padding-y, 6px) var(--table-padding-x, 12px);
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: transparent;
  vertical-align: top;
  font-family: var(--font-sans);
  font-size: var(--table-font-size, 13px);
  transition: background-color 0.15s ease, color 0.15s ease;
}

:global(.dark-mode) .inner-key-cell {
  color: var(--table-subkey-fg, #f43f5e);
}

.inner-val-cell {
  padding: var(--table-padding-y, 6px) var(--table-padding-x, 12px);
  font-family: var(--font-mono);
  font-size: var(--table-font-size, 13px);
  vertical-align: top;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.inner-val-cell:not(.value-cell--complex) {
  cursor: pointer;
}

.inner-val-cell.value-cell--complex {
  padding: 0 !important;
}

/* ── Precision Single Cell Hover Highlight (No giant row block hover) ── */
.root-key-cell:hover,
.inner-key-cell:hover,
.grid-index-cell:hover,
.inner-grid-index-cell:hover,
.root-key-cell.is-hovered,
.inner-key-cell.is-hovered,
.grid-index-cell.is-hovered,
.inner-grid-index-cell.is-hovered {
  /* 带有 sticky 特性的固定列使用实体白底衬底，保证 100% 实心不透底 */
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.14)), var(--json-hover-bg, rgba(99, 102, 241, 0.14))), var(--bg-panel, #ffffff) !important;
  color: var(--json-key) !important;
}

:global(.dark-mode) .root-key-cell:hover,
:global(.dark-mode) .inner-key-cell:hover,
:global(.dark-mode) .grid-index-cell:hover,
:global(.dark-mode) .inner-grid-index-cell:hover,
:global(.dark-mode) .root-key-cell.is-hovered,
:global(.dark-mode) .inner-key-cell.is-hovered,
:global(.dark-mode) .grid-index-cell.is-hovered,
:global(.dark-mode) .inner-grid-index-cell.is-hovered {
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.14)), var(--json-hover-bg, rgba(99, 102, 241, 0.14))), #1e1e22 !important;
  color: var(--json-key) !important;
}

.grid-col-header:hover,
.inner-grid-th:hover,
.grid-index-header:hover,
.grid-col-header.is-hovered,
.inner-grid-th.is-hovered,
.grid-index-header.is-hovered,
.inner-grid-container.is-inner-virtual .inner-grid-header-row th:hover,
.inner-grid-container.is-inner-virtual .inner-grid-header-row th.is-hovered {
  /* 表头吸顶单元格使用表头实体底色衬底，垂直/水平滚动时 100% 遮挡 */
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.14)), var(--json-hover-bg, rgba(99, 102, 241, 0.14))), var(--table-header-bg, #f1f5f9) !important;
  color: var(--json-key, #4f46e5) !important;
}

:global(.dark-mode) .grid-col-header:hover,
:global(.dark-mode) .inner-grid-th:hover,
:global(.dark-mode) .grid-index-header:hover,
:global(.dark-mode) .grid-col-header.is-hovered,
:global(.dark-mode) .inner-grid-th.is-hovered,
:global(.dark-mode) .grid-index-header.is-hovered,
:global(.dark-mode) .inner-grid-container.is-inner-virtual .inner-grid-header-row th:hover,
:global(.dark-mode) .inner-grid-container.is-inner-virtual .inner-grid-header-row th.is-hovered {
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.14)), var(--json-hover-bg, rgba(99, 102, 241, 0.14))), #26262b !important;
  color: #61afef !important;
}

.value-cell:not(.value-cell--complex):hover,
.inner-val-cell:not(.value-cell--complex):hover,
.inner-grid-td:not(.value-cell--complex):hover,
.value-cell:not(.value-cell--complex).is-hovered,
.inner-val-cell:not(.value-cell--complex).is-hovered,
.inner-grid-td:not(.value-cell--complex).is-hovered {
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.14)), var(--json-hover-bg, rgba(99, 102, 241, 0.14))), var(--bg-panel, #ffffff) !important;
  box-shadow: inset 0 0 0 1px var(--json-key, #6366f1);
}

:global(.dark-mode) .value-cell:not(.value-cell--complex):hover,
:global(.dark-mode) .inner-val-cell:not(.value-cell--complex):hover,
:global(.dark-mode) .inner-grid-td:not(.value-cell--complex):hover,
:global(.dark-mode) .value-cell:not(.value-cell--complex).is-hovered,
:global(.dark-mode) .inner-val-cell:not(.value-cell--complex).is-hovered,
:global(.dark-mode) .inner-grid-td:not(.value-cell--complex).is-hovered {
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.14)), var(--json-hover-bg, rgba(99, 102, 241, 0.14))), #1e1e22 !important;
  box-shadow: inset 0 0 0 1px var(--json-key, #6366f1);
}

/* ── Selected Cell Highlight (Single Focus Cell Only) ── */
.root-key-cell.is-selected,
.inner-key-cell.is-selected,
.grid-index-cell.is-selected,
.inner-grid-index-cell.is-selected {
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.18)), var(--json-hover-bg, rgba(99, 102, 241, 0.18))), var(--bg-panel, #ffffff) !important;
  color: var(--json-key, #4f46e5) !important;
  font-weight: 700 !important;
}

.grid-col-header.is-selected,
.inner-grid-th.is-selected,
.grid-index-header.is-selected,
.inner-grid-container.is-inner-virtual .inner-grid-header-row th.is-selected {
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.22)), var(--json-hover-bg, rgba(99, 102, 241, 0.22))), var(--table-header-bg, #f1f5f9) !important;
  color: var(--json-key, #4f46e5) !important;
  font-weight: 700 !important;
  box-shadow: inset 0 0 0 2px var(--json-key, #6366f1) !important;
}

:global(.dark-mode .table-view-root .root-key-cell.is-selected),
:global(.dark-mode .table-view-root .inner-key-cell.is-selected),
:global(.dark-mode .table-view-root .grid-index-cell.is-selected),
:global(.dark-mode .table-view-root .inner-grid-index-cell.is-selected) {
  background: linear-gradient(rgba(97, 175, 239, 0.32), rgba(97, 175, 239, 0.32)), #1e1e22 !important;
  color: #61afef !important;
  box-shadow: inset 0 0 0 1.5px #61afef !important;
}

:global(.dark-mode .table-view-root .grid-col-header.is-selected),
:global(.dark-mode .table-view-root .inner-grid-th.is-selected),
:global(.dark-mode .table-view-root .grid-index-header.is-selected),
:global(.dark-mode) .inner-grid-container.is-inner-virtual .inner-grid-header-row th.is-selected {
  background: linear-gradient(rgba(97, 175, 239, 0.35), rgba(97, 175, 239, 0.35)), #26262b !important;
  color: #61afef !important;
  box-shadow: inset 0 0 0 2px #61afef !important;
}

.value-cell:not(.value-cell--complex).is-selected,
.inner-grid-td:not(.value-cell--complex).is-selected,
.inner-val-cell:not(.value-cell--complex).is-selected {
  background: linear-gradient(var(--json-hover-bg, rgba(99, 102, 241, 0.18)), var(--json-hover-bg, rgba(99, 102, 241, 0.18))), var(--bg-panel, #ffffff) !important;
}

:global(.dark-mode .table-view-root .value-cell:not(.value-cell--complex).is-selected),
:global(.dark-mode .table-view-root .inner-grid-td:not(.value-cell--complex).is-selected),
:global(.dark-mode .table-view-root .inner-val-cell:not(.value-cell--complex).is-selected) {
  background: linear-gradient(rgba(97, 175, 239, 0.32), rgba(97, 175, 239, 0.32)), #1e1e22 !important;
  box-shadow: inset 0 0 0 1.5px #61afef !important;
}

/* Complex cell containers are completely transparent and excluded from hover/selection backgrounds */
.value-cell--complex,
.value-cell--complex.is-selected,
.value-cell--complex.is-hovered,
.value-cell--complex:hover,
.inner-val-cell.value-cell--complex,
.inner-val-cell.value-cell--complex.is-selected,
.inner-val-cell.value-cell--complex.is-hovered,
.inner-val-cell.value-cell--complex:hover,
.inner-grid-td.value-cell--complex,
.inner-grid-td.value-cell--complex.is-selected,
.inner-grid-td.value-cell--complex.is-hovered,
.inner-grid-td.value-cell--complex:hover,
.json-table-row.row--complex,
.json-table-row.row--complex:hover,
.json-table-row.row--complex.is-selected,
.inner-kv-row.row--complex,
.inner-kv-row.row--complex:hover,
.inner-kv-row.row--complex.is-selected {
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Value Types */
.val-string, .tree-string   { color: var(--json-string); }
.val-number, .tree-number   { color: var(--json-number); }
.val-boolean, .tree-boolean { color: var(--json-boolean);  }
.val-null, .tree-null       { color: var(--json-null); }
.val-object                 { color: var(--text-secondary); font-family: var(--font-sans); }

.val-primitive-wrap {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  vertical-align: middle;
}

.copyable-val {
  cursor: pointer;
  transition: opacity 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 420px;
  display: inline-block;
  vertical-align: middle;
}

.copyable-val:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.is-image-url {
  text-decoration: underline dotted var(--accent-color, #6366f1) !important;
  text-underline-offset: 3px;
  cursor: pointer;
}

.is-web-url {
  text-decoration: underline dotted var(--text-secondary, #9ca3af) !important;
  text-underline-offset: 3px;
}

.table-color-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(12px * var(--table-scale, 0.9));
  height: calc(12px * var(--table-scale, 0.9));
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

.table-color-badge:hover {
  transform: scale(1.25);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.table-color-chip-inner {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 2px;
}

:global(.dark-mode) .table-color-badge {
  border-color: rgba(255, 255, 255, 0.3);
  background-image: linear-gradient(45deg, #555 25%, transparent 25%),
                    linear-gradient(-45deg, #555 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #555 75%),
                    linear-gradient(-45deg, transparent 75%, #555 75%);
}

.table-img-badge {
  font-size: var(--table-font-size, 13px);
  margin-right: 4px;
  margin-left: 1px;
  cursor: pointer;
  vertical-align: middle;
  opacity: 0.85;
  transition: transform 0.15s ease, opacity 0.15s ease;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #0284c7;
}

:global(.dark-mode) .table-img-badge {
  color: #38bdf8;
}

.img-badge-icon {
  width: 14px;
  height: 14px;
  stroke-width: 2;
}

.table-img-badge:hover {
  transform: scale(1.15);
  opacity: 1;
}

.url-jump-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.88rem;
  height: 0.88rem;
  margin-right: 4px;
  margin-left: 1px;
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

.url-jump-btn:hover {
  background: rgba(37, 99, 235, 0.15);
  color: #2563eb;
  opacity: 1;
  transform: scale(1.15);
}

:global(.dark-mode) .url-jump-btn {
  background: transparent;
  border: none !important;
  color: #38bdf8;
  opacity: 1;
}

:global(.dark-mode) .url-jump-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  box-shadow: none;
}

.url-jump-icon {
  width: 11px;
  height: 11px;
}

.complex-cell-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}

.complex-header-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: var(--table-font-small, 11px);
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 4px;
  transition: background-color 0.15s, color 0.15s;
}

.toggle-btn:hover {
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--text-primary);
}

.toggle-icon {
  font-size: 8px;
  color: var(--text-muted);
}

.preview-text {
  color: var(--text-secondary);
  font-size: var(--table-font-small, 11px);
}

.copy-subtree-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.copy-subtree-btn:hover {
  background: var(--border-color, rgba(255, 255, 255, 0.1));
  color: var(--accent-color, #6366f1);
  border-color: rgba(99, 102, 241, 0.2);
  opacity: 1;
  transform: scale(1.1);
}

.copy-subtree-icon {
  width: 11px;
  height: 11px;
}

/* ── Table Scale / Density Floating Controls (方案一) ── */
.table-scale-controls {
  position: absolute;
  bottom: clamp(12px, 2vh, 20px);
  right: clamp(12px, 2vw, 20px);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 3px;
  background: var(--bg-panel, #ffffff);
  padding: 4px 6px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #cbd5e1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  user-select: none;
  backdrop-filter: blur(8px);
  transition: all 0.2s ease;
}

:global(.dark-mode) .table-scale-controls {
  background: #1e1e24;
  border-color: #3f4452;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.table-ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  border-radius: 5px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.table-ctrl-btn:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--json-key, #4f46e5);
}

:global(.dark-mode) .table-ctrl-btn:hover {
  background: #334155;
  color: #38bdf8;
}

.table-ctrl-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  height: 22px;
  min-width: 42px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  color: var(--text-primary, #0f172a);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  user-select: none;
}

:global(.dark-mode) .table-ctrl-badge {
  background: #27272a;
  border-color: #3f4452;
  color: #f1f5f9;
}

.table-ctrl-btn.reset-btn {
  font-size: 12px;
  color: var(--accent-color, #6366f1);
}
</style>
