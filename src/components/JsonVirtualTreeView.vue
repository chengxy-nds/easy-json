<script setup>
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, Clock, Braces, X, UnfoldVertical, FoldVertical, Volume2, Video as VideoIcon, KeyRound, FileCode, Code2, CalendarClock } from 'lucide-vue-next'
import { safeStringify, isLosslessNumber } from '../utils/jsonBigInt.js'
import { isImageUrl, isHttpUrl, isColorValue, openExternalUrl } from '../utils/imageDetector.js'
import { detectTimestamp, detectUnicode, detectNestedJson, getFormatNow } from '../utils/capsuleDetector.js'
import { detectMedia, detectJwt, detectBase64Text, detectUrlEncoded, detectCron, detectHtml } from '../utils/advancedDetectors.js'

const props = defineProps({
  data: {
    required: true
  },
  rawInput: {
    type: String,
    default: ''
  },
  hoveredPath: {
    type: Array,
    default: null
  },
  selectedPath: {
    type: Array,
    default: null
  }
})

const emit = defineEmits(['scroll', 'hover-path', 'click-path', 'toggle-fold'])

// Injected properties
const isDark = inject('isDark', ref(true))
const treeExpanded = inject('treeExpanded', ref(true))
const showToast = inject('showToast', (msg) => console.log(msg))
const searchQuery = inject('searchQuery', ref(''))
const setHoveredPath = inject('setHoveredPath', null)
const setSelectedPath = inject('setSelectedPath', null)
const imagePreview = inject('imagePreview', null)
const smartPreview = inject('smartPreview', null)
const openNestedJsonTab = inject('openNestedJsonTab', null)

const editorFontSize = inject('editorFontSize', ref(13))
const editorWordWrap = inject('editorWordWrap', ref('wrap'))
const isWrap = computed(() => editorWordWrap.value === 'wrap')

const editorLineHeight = computed(() => {
  const size = Number(editorFontSize.value) || 13
  const map = { 10: 16, 11: 18, 12: 20, 13: 20, 14: 22, 15: 23, 16: 24, 18: 26, 20: 28, 22: 30, 24: 32 }
  return map[size] || Math.round(size * 1.6)
})

// Expanded state tracking using a Set of node path keys
const expandedKeys = ref(new Set())
const collapsedKeys = ref(new Set())
// 嵌套 JSON 局部展开状态管理
const expandedNestedKeys = ref(new Set())
watch(() => props.data, () => {
  expandedNestedKeys.value.clear()
})

// Helper to generate unique ID for a path
const getPathId = (path) => {
  if (!path || path.length === 0) return 'root'
  return 'root.' + path.join('.')
}

// Initialize expanded keys
const initExpandedState = () => {
  if (treeExpanded.value) {
    collapsedKeys.value.clear()
  } else {
    expandedKeys.value.clear()
    // 全部折叠时直接折叠根节点
  }
}

watch(treeExpanded, () => {
  initExpandedState()
}, { immediate: true })

const isNodeExpanded = (id, depth) => {
  if (treeExpanded.value) {
    return !collapsedKeys.value.has(id)
  }
  return expandedKeys.value.has(id)
}

const toggleNode = (id, depth, path) => {
  const isRoot = !path || path.length === 0 || id === 'root'
  let isNowFolded = false
  if (isRoot) {
    if (treeExpanded.value) {
      if (collapsedKeys.value.has('root')) {
        collapsedKeys.value.clear()
        isNowFolded = false
      } else {
        collapsedKeys.value.add('root')
        isNowFolded = true
      }
    } else {
      if (expandedKeys.value.has('root')) {
        expandedKeys.value.clear()
        isNowFolded = true
      } else {
        expandedKeys.value.clear()
        collapsedKeys.value.clear()
        treeExpanded.value = true
        isNowFolded = false
      }
    }
  } else {
    if (treeExpanded.value) {
      if (collapsedKeys.value.has(id)) {
        collapsedKeys.value.delete(id)
        isNowFolded = false
      } else {
        collapsedKeys.value.add(id)
        isNowFolded = true
      }
    } else {
      if (expandedKeys.value.has(id)) {
        expandedKeys.value.delete(id)
        isNowFolded = true
      } else {
        expandedKeys.value.add(id)
        isNowFolded = false
      }
    }
  }
  emit('toggle-fold', { path: path || [], isFolded: isNowFolded })
}

const setNodeFold = (path, isFolded) => {
  const isRoot = !path || path.length === 0
  const id = getPathId(path)
  if (isRoot) {
    if (isFolded) {
      if (treeExpanded.value) {
        collapsedKeys.value.add('root')
      } else {
        expandedKeys.value.clear()
      }
    } else {
      collapsedKeys.value.clear()
      expandedKeys.value.clear()
      treeExpanded.value = true
    }
  } else {
    if (treeExpanded.value) {
      if (isFolded) {
        collapsedKeys.value.add(id)
      } else {
        collapsedKeys.value.delete(id)
      }
    } else {
      if (isFolded) {
        expandedKeys.value.delete(id)
      } else {
        expandedKeys.value.add(id)
      }
    }
  }
}

const foldAll = () => {
  collapsedKeys.value.clear()
  expandedKeys.value.clear()
  treeExpanded.value = false
}

const unfoldAll = () => {
  collapsedKeys.value.clear()
  expandedKeys.value.clear()
  treeExpanded.value = true
}

const expandToLevel = (targetLevel) => {
  collapsedKeys.value.clear()
  expandedKeys.value.clear()
  treeExpanded.value = true

  if (!props.data || typeof props.data !== 'object' || isLosslessNumber(props.data)) return

  const traverse = (val, path, depth) => {
    if (val === null || typeof val !== 'object' || isLosslessNumber(val)) return
    const id = getPathId(path)
    const isArr = Array.isArray(val)

    // 深度达到或超过目标层级时折叠该节点
    // 根节点 depth 为 0，展开至第 1 层即 depth 0 展开，depth 1 及更深折叠
    if (depth >= targetLevel) {
      collapsedKeys.value.add(id)
      return
    }

    if (isArr) {
      for (let i = 0; i < val.length; i++) {
        traverse(val[i], [...path, i], depth + 1)
      }
    } else {
      const keys = Object.keys(val)
      for (let i = 0; i < keys.length; i++) {
        traverse(val[keys[i]], [...path, keys[i]], depth + 1)
      }
    }
  }

  traverse(props.data, [], 0)
}

// Tree Flattening Engine: converts arbitrary nested JSON into a 1D flat list of visible rows
// Tree Flattening Engine: converts arbitrary nested JSON into a 1D flat list of visible rows (极速轻量平铺引擎，保障10万行秒开)
const flatRows = computed(() => {
  const rootData = props.data
  if (rootData === undefined) return []

  const rows = []

  const traverse = (val, name, path, depth, isLast) => {
    const id = getPathId(path)
    // 惰性检测：只有用户主动点击展开过该嵌套节点时，才需要将其作为子树展开
    const isNestedExpanded = expandedNestedKeys.value.size > 0 && expandedNestedKeys.value.has(id) && typeof val === 'string'
    const nestedData = isNestedExpanded ? detectNestedJson(val) : null
    const isObj = (val !== null && typeof val === 'object' && !isLosslessNumber(val)) || (isNestedExpanded && nestedData)
    const targetVal = isNestedExpanded && nestedData ? nestedData.parsed : val
    const isArr = Array.isArray(targetVal)

    if (isObj) {
      const isExpanded = isNodeExpanded(id, depth)
      const keys = isArr ? null : Object.keys(targetVal)
      const childCount = isArr ? targetVal.length : keys.length

      // Opening bracket row
      rows.push({
        id,
        path,
        depth,
        name,
        value: targetVal,
        type: isArr ? 'array' : 'object',
        isExpanded,
        childCount,
        isLast,
        isNestedExpanded: !!isNestedExpanded,
        rawNestedValue: isNestedExpanded ? val : undefined,
        nestedJsonData: nestedData
      })

      if (isExpanded) {
        if (isArr) {
          for (let i = 0; i < targetVal.length; i++) {
            traverse(targetVal[i], undefined, [...path, i], depth + 1, i === targetVal.length - 1)
          }
        } else {
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i]
            traverse(targetVal[k], k, [...path, k], depth + 1, i === keys.length - 1)
          }
        }

        // Closing bracket row
        rows.push({
          id: id + '._close',
          path,
          depth,
          name: undefined,
          value: undefined,
          type: 'closing',
          closingBracket: isArr ? ']' : '}',
          isLast
        })
      }
    } else {
      // Primitive value row: 保持极速轻量平铺，不在全量遍历中做重型探测（重型胶囊探测惰性延迟到可见行）
      const isColor = typeof val === 'string' && isColorValue(val)
      const isImg = typeof val === 'string' && !isColor && isImageUrl(val)
      const isUrl = typeof val === 'string' && !isColor && !isImg && isHttpUrl(val)

      let valClass = ''
      if (typeof val === 'string') valClass = 'tree-string'
      else if (typeof val === 'number' || typeof val === 'bigint' || isLosslessNumber(val)) valClass = 'tree-number'
      else if (typeof val === 'boolean') valClass = 'tree-boolean'
      else if (val === null) valClass = 'tree-null'

      rows.push({
        id,
        path,
        depth,
        name,
        value: val,
        type: 'primitive',
        isColorValue: isColor,
        isImageValue: isImg,
        isOtherUrlValue: isUrl,
        valueClass: valClass,
        isLast
      })
    }
  }

  traverse(rootData, undefined, [], 0, true)
  return rows
})

// Virtual Scrolling Engine & Dimension Tracking
const containerRef = ref(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)
const containerWidth = ref(800)
const bufferCount = 10

// Dynamic row height map for wrap mode (non-reactive cache with version trigger)
const rowHeightMap = new Map()
const rowHeightVersion = ref(0)
const maxLineWidth = ref(800)
let rafId = null
let updateTimer = null

const scheduleOffsetsUpdate = () => {
  const totalCount = flatRows.value.length
  if (totalCount > 2000) {
    if (updateTimer !== null) return
    updateTimer = setTimeout(() => {
      updateTimer = null
      rowHeightVersion.value++
    }, 100)
    return
  }
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    rowHeightVersion.value++
  })
}

// 真实 DOM 元素尺寸测量与监听器
let rowResizeObserver = null

const measureElement = (el, rowId) => {
  if (!el || !rowId || !isWrap.value) return
  const rectH = el.getBoundingClientRect().height
  const h = Math.round(rectH || el.offsetHeight)
  if (h > 0) {
    const oldH = rowHeightMap.get(rowId)
    if (oldH === undefined || Math.abs(oldH - h) >= 1) {
      rowHeightMap.set(rowId, h)
      scheduleOffsetsUpdate()
    }
  }
}

// 自定义指令 v-row-measure，用于精准跟踪挂载与可见行高度
const vRowMeasure = {
  mounted(el, binding) {
    if (!binding.value) return
    el.__rowId = binding.value
    if (rowResizeObserver && isWrap.value) {
      rowResizeObserver.observe(el)
    }
    measureElement(el, binding.value)
  },
  updated(el, binding) {
    if (!binding.value) return
    el.__rowId = binding.value
    measureElement(el, binding.value)
  },
  unmounted(el) {
    if (rowResizeObserver) {
      rowResizeObserver.unobserve(el)
    }
    el.__rowId = null
  }
}

const initRowObserver = () => {
  if (typeof ResizeObserver !== 'undefined') {
    rowResizeObserver = new ResizeObserver((entries) => {
      if (!isWrap.value) return
      let changed = false
      for (const entry of entries) {
        const id = entry.target.__rowId
        if (!id) continue
        const rectH = entry.borderBoxSize?.[0]?.blockSize || entry.target.getBoundingClientRect().height
        const h = Math.round(rectH || entry.target.offsetHeight)
        if (h > 0) {
          const oldH = rowHeightMap.get(id)
          if (oldH === undefined || Math.abs(oldH - h) >= 1) {
            rowHeightMap.set(id, h)
            changed = true
          }
        }
      }
      if (changed) {
        scheduleOffsetsUpdate()
      }
    })
  }
}

const updateDimensions = () => {
  if (containerRef.value) {
    viewportHeight.value = containerRef.value.clientHeight || 600
    const newW = containerRef.value.clientWidth || 800
    if (Math.abs(containerWidth.value - newW) > 2) {
      containerWidth.value = newW
      if (isWrap.value) {
        rowHeightMap.clear()
        scheduleOffsetsUpdate()
      }
      recalculateMaxLineWidth()
    }
  }
}

const recalculateMaxLineWidth = () => {
  if (isWrap.value) {
    maxLineWidth.value = containerWidth.value
    return
  }
  let maxW = containerWidth.value
  const rows = flatRows.value
  const total = rows.length
  if (total === 0) return

  const fontSize = Number(editorFontSize.value) || 13
  const charWidth = fontSize * 0.62

  // 大文件模式（行数 > 2000）：快速采样前中后行，毫秒级确定合理滚动宽度，杜绝10万行全量阻塞
  if (total > 2000) {
    const step = Math.max(1, Math.floor(total / 100))
    const checkRow = (r) => {
      if (!r) return
      const depthW = r.depth * 14 + 32
      const nameW = r.name ? String(r.name).length * charWidth + 16 : 0
      let valW = 0
      if (r.value !== null && r.value !== undefined) {
        valW = Math.min(1200, String(r.value).length * charWidth + 20)
      } else if (r.type === 'object' || r.type === 'array') {
        valW = 100
      }
      const totalW = depthW + nameW + valW + 30
      if (totalW > maxW) maxW = totalW
    }
    const sampleLimit = Math.min(100, total)
    for (let i = 0; i < sampleLimit; i++) checkRow(rows[i])
    for (let i = Math.max(0, total - sampleLimit); i < total; i++) checkRow(rows[i])
    for (let i = sampleLimit; i < total - sampleLimit; i += step) checkRow(rows[i])
    maxLineWidth.value = Math.ceil(maxW)
    return
  }

  for (let i = 0; i < total; i++) {
    const r = rows[i]
    const depthW = r.depth * 14 + 32
    const nameW = r.name ? String(r.name).length * charWidth + 16 : 0
    let valW = 0
    if (r.value !== null && r.value !== undefined) {
      valW = String(r.value).length * charWidth + 20
    } else if (r.type === 'object' || r.type === 'array') {
      valW = 100
    }
    const totalW = depthW + nameW + valW + 30
    if (totalW > maxW) maxW = totalW
  }
  maxLineWidth.value = Math.ceil(maxW)
}

watch([flatRows, isWrap, editorFontSize], () => {
  rowHeightMap.clear()
  scheduleOffsetsUpdate()
  recalculateMaxLineWidth()
})

const onScroll = (e) => {
  scrollTop.value = e.target.scrollTop
  if (activeTimeMenu.value) activeTimeMenu.value = null
  if (activeNestedMenu.value) activeNestedMenu.value = null
  emit('scroll', e)
}

// Estimate height for unmeasured rows in wrap mode (极速估算，无任何字符级循环，O(1)秒级处理10万行)
const estimateRowHeight = (row) => {
  const lh = editorLineHeight.value
  if (!isWrap.value) return lh

  if (row.type === 'primitive') {
    const val = row.value
    if (val === null || val === undefined) return lh
    const strVal = typeof val === 'string' ? val : String(val)
    // 快速短路：98% 字段长度小于 60，不可能发生换行，直接返回单行高度
    if (strVal.length < 60) return lh

    const fontSize = Number(editorFontSize.value) || 13
    const charWidth = fontSize * 0.62
    const nameLen = row.name ? String(row.name).length + 3 : 0
    const totalLen = nameLen + strVal.length + 2

    // 扣除层级缩进、图标、行右内边距以及垂直滚动条（约14px）
    const availWidth = Math.max(100, containerWidth.value - (row.depth * 14 + 50))
    const charsPerLine = Math.max(10, Math.floor(availWidth / charWidth))
    const lines = Math.max(1, Math.ceil(totalLen / charsPerLine))
    return lines * lh
  }
  return lh
}

// Prefix sum of row offsets for variable row height support in wrap mode
const rowOffsets = computed(() => {
  // 依赖版本触发器，确保测量到真实 DOM 高度后能响应式更新所有后续行的 topPosition
  const _ = rowHeightVersion.value
  const rows = flatRows.value
  const count = rows.length
  const offsets = new Float64Array(count + 1)
  const lh = editorLineHeight.value

  if (!isWrap.value) {
    for (let i = 0; i < count; i++) {
      offsets[i + 1] = offsets[i] + lh
    }
    return offsets
  }

  const map = rowHeightMap
  for (let i = 0; i < count; i++) {
    const row = rows[i]
    const h = map.get(row.id) || estimateRowHeight(row)
    offsets[i + 1] = offsets[i] + h
  }
  return offsets
})

const totalHeight = computed(() => {
  const offsets = rowOffsets.value
  return offsets.length > 0 ? offsets[offsets.length - 1] : 0
})

// Binary search for visible range
const startIndex = computed(() => {
  const offsets = rowOffsets.value
  const target = scrollTop.value
  const total = flatRows.value.length
  if (total === 0) return 0

  let low = 0
  let high = total - 1
  let result = 0

  while (low <= high) {
    const mid = (low + high) >> 1
    if (offsets[mid + 1] > target) {
      result = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return Math.max(0, result - bufferCount)
})

const endIndex = computed(() => {
  const offsets = rowOffsets.value
  const target = scrollTop.value + viewportHeight.value
  const total = flatRows.value.length
  if (total === 0) return 0

  let low = startIndex.value
  let high = total - 1
  let result = total

  while (low <= high) {
    const mid = (low + high) >> 1
    if (offsets[mid] >= target) {
      result = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return Math.min(total, result + bufferCount)
})

// 惰性富化检测：仅在行进入视口时，才对这 30~50 行进行智能数据胶囊探测（毫秒级完成，不影响大数据平铺）
const enrichVisibleRow = (row) => {
  if (row.type !== 'primitive') return row
  const val = row.value
  const isColor = row.isColorValue
  const mediaData = typeof val === 'string' && !isColor ? detectMedia(val) : null
  const isImg = typeof val === 'string' && !isColor && !mediaData && (row.isImageValue || isImageUrl(val))
  const isUrl = typeof val === 'string' && !isColor && !mediaData && !isImg && (row.isOtherUrlValue || isHttpUrl(val))

  const timeData = detectTimestamp(val)
  const unicodeData = detectUnicode(val, props.rawInput, row.path)
  const nestedJsonData = detectNestedJson(val)

  let base64Data = null
  let urlEncodedData = null
  let displayVal = val

  if (typeof val === 'string' && !isColor && !mediaData && !isImg && !nestedJsonData) {
    if (unicodeData && unicodeData.decodedText && unicodeData.decodedText !== val) {
      displayVal = unicodeData.decodedText
    }
    base64Data = detectBase64Text(displayVal)
    if (base64Data) {
      displayVal = base64Data.decoded
    } else {
      urlEncodedData = detectUrlEncoded(displayVal)
      if (urlEncodedData) {
        displayVal = urlEncodedData.decoded
      }
    }
  }

  const isImgVal = typeof displayVal === 'string' && !isColor && !mediaData && isImageUrl(displayVal)
  const isUrlVal = typeof displayVal === 'string' && !isColor && !mediaData && !isImgVal && isHttpUrl(displayVal)

  let cronData = null
  if (typeof val === 'string' && !isColor && !mediaData && !isImg && !nestedJsonData && !base64Data && !urlEncodedData) {
    cronData = detectCron(displayVal)
  }

  let smartData = null
  if (typeof val === 'string' && !isColor && !mediaData && !isImg && !nestedJsonData && !base64Data && !urlEncodedData && !cronData) {
    smartData = detectJwt(val) || detectHtml(val)
  }

  return {
    ...row,
    displayValue: displayVal,
    isImageValue: isImgVal,
    isOtherUrlValue: isUrlVal,
    mediaData,
    cronData,
    smartData,
    base64Data,
    urlEncodedData,
    timeData,
    unicodeData,
    nestedJsonData
  }
}

const visibleRows = computed(() => {
  const offsets = rowOffsets.value
  const slice = flatRows.value.slice(startIndex.value, endIndex.value)
  return slice.map((row, idx) => {
    const actualIdx = startIndex.value + idx
    const enriched = enrichVisibleRow(row)
    return {
      ...enriched,
      actualIndex: actualIdx,
      topPosition: offsets[actualIdx]
    }
  })
})

// Highlighting & Copy Handlers
const highlightText = (text, query) => {
  if (text === null || text === undefined) return ''
  const str = String(text)
  if (!query) return escapeHtml(str)
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  const escapedText = escapeHtml(str)
  return escapedText.replace(regex, '<mark class="search-match">$1</mark>')
}

const escapeHtml = (str) => {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const highlightKey = (name) => {
  return `"${highlightText(name, searchQuery.value)}"`
}

const formatPrimitiveValue = (val) => {
  if (typeof val === 'string') return JSON.stringify(val)
  if (val === null) return 'null'
  return String(val)
}

const highlightPrimitiveValue = (val) => {
  const formatted = formatPrimitiveValue(val)
  return highlightText(formatted, searchQuery.value)
}

const handleCopyKey = (name, path) => {
  if (!name) return
  if (setSelectedPath && path) {
    setSelectedPath(path, 'key')
  }
  emit('click-path', path, 'key')
  navigator.clipboard.writeText(String(name)).then(() => {
    if (showToast) {
      showToast(`已复制键名: ${name}`)
    }
  })
}

const handleCopyValue = (val, path) => {
  if (setSelectedPath && path) {
    setSelectedPath(path, 'value')
  }
  emit('click-path', path, 'value')
  let text = ''
  if (isLosslessNumber(val)) {
    text = String(val)
  } else if (typeof val === 'object' && val !== null) {
    text = safeStringify(val, null, 2)
  } else if (typeof val === 'string') {
    text = val
  } else if (val === null) {
    text = 'null'
  } else {
    text = String(val)
  }
  
  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      const truncated = text.length > 20 ? text.substring(0, 20) + '...' : text
      showToast(`已复制键值: ${truncated}`)
    }
  })
}

const handleOpenUrl = (url) => {
  openExternalUrl(url)
  if (showToast) {
    showToast('已在浏览器打开链接')
  }
}

const handleCopyTime = (timeStr) => {
  if (!timeStr) return
  navigator.clipboard.writeText(timeStr).then(() => {
    if (showToast) {
      showToast(`已复制时间: ${timeStr}`)
    }
  })
}

// 时间戳复制菜单气泡状态与悬停控制
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

const openTimeMenu = (timeData, event) => {
  if (!timeData || !event || !event.currentTarget) return
  startNowTimer()
  const rect = event.currentTarget.getBoundingClientRect()
  const popWidth = 290
  const popHeight = timeData.isIso ? 180 : 155
  const padding = 12

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 水平视口边缘保护（适配各种屏幕宽度与缩放）
  let left = Math.max(padding, Math.min(viewportWidth - popWidth - padding, rect.left))

  // 垂直方向智能自适应（底部空间不足自动翻转至上方）
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
    timeData
  }
}

const onTimeBadgeEnter = (timeData, event) => {
  if (timeMenuTimer) {
    clearTimeout(timeMenuTimer)
    timeMenuTimer = null
  }
  openTimeMenu(timeData, event)
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

const handleCopyUnicode = (unicodeData) => {
  if (!unicodeData) return
  const text = unicodeData.originalUnicode
  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      showToast(`已复制 Unicode 原文: ${text}`)
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

// 嵌套 JSON 悬浮操作菜单与展开/收起控制
const activeNestedMenu = ref(null)
let nestedMenuTimer = null

const openNestedMenu = (row, event) => {
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

  activeNestedMenu.value = {
    top,
    left,
    row,
    isExpanded: expandedNestedKeys.value.has(row.id)
  }
}

const onNestedBadgeEnter = (row, event) => {
  if (nestedMenuTimer) {
    clearTimeout(nestedMenuTimer)
    nestedMenuTimer = null
  }
  openNestedMenu(row, event)
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

const toggleNestedExpand = (row) => {
  if (!row) return
  if (expandedNestedKeys.value.has(row.id)) {
    expandedNestedKeys.value.delete(row.id)
    if (showToast) {
      showToast('已还原为转义字符串')
    }
  } else {
    expandedNestedKeys.value.add(row.id)
    if (collapsedKeys.value.has(row.id)) {
      collapsedKeys.value.delete(row.id)
    }
    expandedKeys.value.add(row.id)
    if (showToast) {
      showToast('已转义展开为子树')
    }
  }
  activeNestedMenu.value = null
}

const handleOpenInNewTab = (row) => {
  if (!row) return
  const val = row.rawNestedValue || row.value
  const title = row.name || '嵌套 JSON'
  if (openNestedJsonTab) {
    openNestedJsonTab(val, title)
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

const onValMouseEnter = (v, e, row) => {
  if (typeof v === 'string') {
    const media = row?.mediaData || detectMedia(v)
    if (media && imagePreview) {
      imagePreview.show(media.url || v, e.currentTarget)
      return
    }
    if (isImageUrl(v) && imagePreview) {
      imagePreview.show(v, e.currentTarget)
      return
    }
    const smart = row?.smartData || detectJwt(v) || detectHtml(v)
    if (smart && smartPreview) {
      smartPreview.show(smart, e.currentTarget)
      return
    }
  }
}

const onValMouseLeave = (v) => {
  if (imagePreview) imagePreview.hide()
  if (smartPreview) smartPreview.hide()
}

const onSmartMouseEnter = (smartData, e) => {
  if (smartPreview && smartData) {
    smartPreview.show(smartData, e.currentTarget)
  }
}

const onSmartMouseLeave = () => {
  if (smartPreview) smartPreview.hide()
}

const onKeyMouseEnter = (path) => {
  if (setHoveredPath && path && path.length > 0) {
    setHoveredPath(path)
  }
}

const onKeyMouseLeave = () => {
  if (setHoveredPath) {
    setHoveredPath(null)
  }
}

const onKeyClick = (path) => {
  if (setSelectedPath && path && path.length > 0) {
    setSelectedPath(path)
  }
}

let resizeObserver = null

onMounted(() => {
  updateDimensions()
  initRowObserver()
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })
    resizeObserver.observe(containerRef.value)
  }
  document.addEventListener('click', closeTimeMenu)
  document.addEventListener('click', closeNestedMenu)
  window.addEventListener('resize', closeTimeMenu)
  window.addEventListener('resize', closeNestedMenu)
})

onBeforeUnmount(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (updateTimer !== null) {
    clearTimeout(updateTimer)
    updateTimer = null
  }
  if (rowResizeObserver) {
    rowResizeObserver.disconnect()
    rowResizeObserver = null
  }
  if (timeMenuTimer) {
    clearTimeout(timeMenuTimer)
    timeMenuTimer = null
  }
  if (nestedMenuTimer) {
    clearTimeout(nestedMenuTimer)
    nestedMenuTimer = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  document.removeEventListener('click', closeTimeMenu)
  document.removeEventListener('click', closeNestedMenu)
  window.removeEventListener('resize', closeTimeMenu)
  window.removeEventListener('resize', closeNestedMenu)
})

// Expose container and DOM compatibility getters/methods for external scrolling sync
defineExpose({
  get scrollTop() {
    return containerRef.value ? containerRef.value.scrollTop : 0
  },
  set scrollTop(val) {
    if (containerRef.value) containerRef.value.scrollTop = val
  },
  get scrollLeft() {
    return containerRef.value ? containerRef.value.scrollLeft : 0
  },
  set scrollLeft(val) {
    if (containerRef.value) containerRef.value.scrollLeft = val
  },
  querySelector(selector) {
    return containerRef.value ? containerRef.value.querySelector(selector) : null
  },
  querySelectorAll(selector) {
    return containerRef.value ? containerRef.value.querySelectorAll(selector) : []
  },
  scrollContainer: containerRef,
  setNodeFold,
  expandToLevel,
  foldAll,
  unfoldAll,
  scrollToTop: () => {
    if (containerRef.value) containerRef.value.scrollTop = 0
  },
  scrollToBottom: () => {
    if (containerRef.value) containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
})
</script>

<template>
  <div
    class="json-virtual-tree-container"
    :class="{ 'is-wrap': isWrap, 'is-nowrap': !isWrap }"
    ref="containerRef"
    @scroll="onScroll"
  >
    <div
      class="virtual-tree-spacer"
      :style="{
        height: `${totalHeight}px`,
        width: isWrap ? '100%' : `${maxLineWidth}px`,
        minWidth: isWrap ? '100%' : `${maxLineWidth}px`
      }"
    >
      <div
        v-for="row in visibleRows"
        :key="row.id"
        v-row-measure="row.id"
        class="virtual-tree-row"
        :style="{
          top: `${row.topPosition}px`,
          height: isWrap ? 'auto' : `${editorLineHeight}px`,
          minHeight: `${editorLineHeight}px`,
          lineHeight: `${editorLineHeight}px`,
          width: isWrap ? '100%' : `${maxLineWidth}px`,
          minWidth: isWrap ? '100%' : `${maxLineWidth}px`,
          paddingLeft: `${row.depth * 14 + 14}px`
        }"
      >
        <!-- Vertical Tree Indentation Guide Lines (层级竖线) -->
        <div
          v-for="lvl in row.depth"
          :key="lvl"
          class="tree-indent-guide"
          :style="{ left: `${(lvl - 1) * 14 + 9}px` }"
        ></div>

        <!-- Object / Array Opening Header Row -->
        <template v-if="row.type === 'object' || row.type === 'array'">
          <div
            class="node-header expandable"
            @click="toggleNode(row.id, row.depth, row.path); onKeyClick(row.path)"
            @mouseenter="onKeyMouseEnter(row.path)"
            @mouseleave="onKeyMouseLeave"
          >
            <span class="icon-wrapper">
              <ChevronDown v-if="row.isExpanded" class="toggle-icon" />
              <ChevronRight v-else class="toggle-icon" />
            </span>

            <span
              v-if="row.name !== undefined && row.name !== null"
              class="node-key"
              @click.stop="handleCopyKey(row.name, row.path)"
              data-tooltip="点击复制键名"
              v-html="highlightKey(row.name)"
            ></span>
            <span v-if="row.name !== undefined && row.name !== null" class="node-colon">:</span>
            <!-- 嵌套 JSON 展开状态徽标 -->
            <span
              v-if="row.isNestedExpanded"
              class="tree-nested-badge is-expanded"
              @click.stop="toggleNestedExpand(row)"
              @mouseenter="onNestedBadgeEnter(row, $event)"
              @mouseleave="onNestedBadgeLeave"
            >
              <Braces class="capsule-icon" />
            </span>
            <span
              class="node-bracket"
              @click.stop="handleCopyValue(row.value, row.path)"
              data-tooltip="点击复制子树 JSON"
            >{{ row.type === 'array' ? '[' : '{' }}</span>

            <!-- Collapsed Summary -->
            <template v-if="!row.isExpanded">
              <span
                class="node-collapsed-summary"
                @click.stop="handleCopyValue(row.value, row.path)"
                data-tooltip="点击复制子树 JSON"
              >{{ row.type === 'array' ? `Array(${row.childCount})` : `Object(${row.childCount})` }}</span>
              <span
                class="node-bracket"
                @click.stop="handleCopyValue(row.value, row.path)"
                data-tooltip="点击复制子树 JSON"
              >{{ row.type === 'array' ? ']' : '}' }}</span>
              <span v-if="!row.isLast" class="node-comma">,</span>
            </template>
          </div>
        </template>

        <!-- Closing Bracket Row -->
        <template v-else-if="row.type === 'closing'">
          <div class="node-closing">
            <span
              class="node-bracket"
              @click.stop="handleCopyValue(row.value, row.path)"
              data-tooltip="点击复制子树 JSON"
            >{{ row.closingBracket }}</span>
            <span v-if="!row.isLast" class="node-comma">,</span>
          </div>
        </template>

        <!-- Primitive Value Row -->
        <template v-else>
          <div
            class="node-primitive"
            @click="onKeyClick(row.path)"
            @mouseenter="onKeyMouseEnter(row.path)"
            @mouseleave="onKeyMouseLeave"
          >
            <span class="icon-spacer"></span>
            
            <span
              v-if="row.name !== undefined && row.name !== null"
              class="node-key"
              @click.stop="handleCopyKey(row.name, row.path)"
              data-tooltip="点击复制键名"
              v-html="highlightKey(row.name)"
            ></span>
            <span v-if="row.name !== undefined && row.name !== null" class="node-colon">:</span>

            <!-- Color chip badge / Image preview badge / Media badges / URL open button / Smart Capsules -->
            <span
              v-if="row.isColorValue"
              class="tree-color-badge"
            >
              <span class="tree-color-chip-inner" :style="{ backgroundColor: row.value }"></span>
            </span>
            <span
              v-else-if="row.mediaData?.mediaType === 'audio'"
              class="tree-img-badge tree-audio-badge"
              @mouseenter="onValMouseEnter(row.value, $event, row)"
              @mouseleave="onValMouseLeave(row.value)"
              data-tooltip="音频直链 (悬停试听)"
            >
              <Volume2 class="img-badge-icon" />
            </span>
            <span
              v-else-if="row.mediaData?.mediaType === 'video'"
              class="tree-img-badge tree-video-badge"
              @mouseenter="onValMouseEnter(row.value, $event, row)"
              @mouseleave="onValMouseLeave(row.value)"
              data-tooltip="视频直链 (悬停播放)"
            >
              <VideoIcon class="img-badge-icon" />
            </span>
            <span
              v-else-if="row.isImageValue"
              class="tree-img-badge"
              @mouseenter="onValMouseEnter(row.value, $event, row)"
              @mouseleave="onValMouseLeave(row.value)"
              data-tooltip="图片链接 (悬停预览)"
            >
              <ImageIcon class="img-badge-icon" />
            </span>
            <button
              v-else-if="row.isOtherUrlValue"
              class="url-jump-btn"
              @click.stop="handleOpenUrl(row.value)"
              data-tooltip="在浏览器中直接打开链接"
            >
              <ExternalLink class="url-jump-icon" />
            </button>

            <!-- 智能数据胶囊 (仅保留复杂结构：JWT, HTML) -->
            <button
              v-if="row.smartData"
              class="tree-capsule-badge"
              :class="{
                'tree-jwt-badge': row.smartData.isJwt,
                'tree-html-badge': row.smartData.isHtml
              }"
              @mouseenter="onSmartMouseEnter(row.smartData, $event)"
              @mouseleave="onSmartMouseLeave"
              @click.stop="onSmartMouseEnter(row.smartData, $event)"
              :data-tooltip="row.smartData.isJwt ? 'JWT Token (悬停解码)' : 'HTML 代码 (悬停预览)'"
            >
              <KeyRound v-if="row.smartData.isJwt" class="capsule-icon" />
              <span class="capsule-text">
                {{ row.smartData.isJwt ? 'JWT' : 'HTML' }}
              </span>
            </button>

            <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
            <button
              v-if="row.cronData"
              class="tree-capsule-badge tree-cron-badge"
              @click.stop="handleCopyValue(row.value, row.path)"
            >
              <CalendarClock class="capsule-icon" />
              <span class="capsule-text">CRON</span>
            </button>

            <!-- Base64 Badge (点击复制 Base64 原值) -->
            <span
              v-if="row.base64Data"
              class="tree-inline-badge tree-b64-badge"
              @click.stop="handleCopyRaw(row.value, 'Base64 原值')"
              data-tooltip="点击复制 Base64 原值"
            >
              <span class="capsule-symbol">B64</span>
            </span>

            <!-- URL 编码 Badge (点击复制 URL 编码原值) -->
            <span
              v-if="row.urlEncodedData"
              class="tree-inline-badge tree-urldec-badge"
              @click.stop="handleCopyRaw(row.value, 'URL 编码原值')"
              data-tooltip="点击复制 URL 编码原值"
            >
              <span class="capsule-symbol">%</span>
            </span>

            <!-- Timestamp Badge (直接展示东八区时间，悬停出现浮窗，点击亦可打开) -->
            <button
              v-if="row.timeData"
              class="tree-capsule-badge tree-time-badge"
              @mouseenter="onTimeBadgeEnter(row.timeData, $event)"
              @mouseleave="onTimeBadgeLeave"
              @click.stop="openTimeMenu(row.timeData, $event)"
            >
              <Clock class="capsule-icon" />
              <span class="capsule-text">{{ row.timeData.beijingStr }}</span>
            </button>

            <!-- Unicode Badge (无 tooltip，仅保留图标，点击复制原文，与图片 URL 图标一致) -->
            <span
              v-if="row.unicodeData"
              class="tree-unicode-badge"
              @click.stop="handleCopyUnicode(row.unicodeData)"
            >
              <span class="capsule-symbol">\u</span>
            </span>

            <!-- Nested JSON Badge (悬停出现操作按钮：转义展开 / 新 Tab 打开) -->
            <span
              v-if="row.nestedJsonData"
              class="tree-nested-badge"
              @click.stop="toggleNestedExpand(row)"
              @mouseenter="onNestedBadgeEnter(row, $event)"
              @mouseleave="onNestedBadgeLeave"
            >
              <Braces class="capsule-icon" />
            </span>

            <!-- Value Text (直接展示解码后的内容，点击复制解码值) -->
            <span
              :class="[row.valueClass, 'copyable-value', { 'is-image-url': row.isImageValue || !!row.mediaData, 'is-web-url': row.isOtherUrlValue }]"
              @click.stop="handleCopyValue(row.displayValue, row.path)"
              @mouseenter="onValMouseEnter(row.value, $event, row)"
              @mouseleave="onValMouseLeave(row.value)"
              :data-tooltip="row.cronData ? `${row.cronData.translation}` : (row.mediaData?.mediaType === 'audio' ? '音频直链 (悬停试听，点击复制)' : (row.mediaData?.mediaType === 'video' ? '视频直链 (悬停播放，点击复制)' : (row.isImageValue ? '图片链接 (悬停预览，点击复制)' : (row.isOtherUrlValue ? '点击复制键值，点击左侧图标可直接打开' : '点击复制键值'))))"
              v-html="highlightPrimitiveValue(row.displayValue)"
            ></span>
            <span v-if="!row.isLast" class="node-comma">,</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Timestamp Copy Menu Popover (配色风格与图片预览弹窗完全一致) -->
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
            <button class="icon-action-btn" @click="activeTimeMenu = null" title="关闭">
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
            @click.stop="toggleNestedExpand(activeNestedMenu.row)"
          >
            <FoldVertical v-if="activeNestedMenu.isExpanded" class="btn-icon" />
            <UnfoldVertical v-else class="btn-icon" />
            <span>{{ activeNestedMenu.isExpanded ? '还原收起' : '转义展开' }}</span>
          </button>
          <button
            class="nested-action-btn secondary"
            @click.stop="handleOpenInNewTab(activeNestedMenu.row)"
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
.json-virtual-tree-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
  box-sizing: border-box;
  padding: 4px 12px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: var(--editor-font-size, 13px);
  user-select: text;
}

/* Nowrap Mode: expands horizontally so container scrolls smoothly */
.json-virtual-tree-container.is-nowrap {
  overflow: auto;
}

.json-virtual-tree-container.is-nowrap .virtual-tree-spacer {
  position: relative;
}

.json-virtual-tree-container.is-nowrap .virtual-tree-row {
  position: absolute;
  left: 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
  box-sizing: border-box;
  padding-right: 32px;
}

.json-virtual-tree-container.is-nowrap .copyable-value,
.json-virtual-tree-container.is-nowrap .node-primitive,
.json-virtual-tree-container.is-nowrap .node-header,
.json-virtual-tree-container.is-nowrap .node-closing {
  white-space: nowrap;
}

/* Wrap Mode: keeps wrapped continuation lines aligned with key start (matching CodeMirror hanging indent) */
.json-virtual-tree-container.is-wrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.json-virtual-tree-container.is-wrap .virtual-tree-spacer {
  width: 100% !important;
  min-width: 100% !important;
  position: relative;
}

.json-virtual-tree-container.is-wrap .virtual-tree-row {
  position: absolute;
  left: 0;
  width: 100% !important;
  min-width: 100% !important;
  display: block;
  box-sizing: border-box;
  padding-right: 16px;
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.json-virtual-tree-container.is-wrap .node-header,
.json-virtual-tree-container.is-wrap .node-closing,
.json-virtual-tree-container.is-wrap .node-primitive {
  display: inline;
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
  line-height: inherit;
}

.json-virtual-tree-container.is-wrap .icon-wrapper {
  display: inline-flex;
  vertical-align: middle;
}

.json-virtual-tree-container.is-wrap .icon-spacer {
  display: inline-block;
  vertical-align: middle;
}

.json-virtual-tree-container.is-wrap .tree-img-badge,
.json-virtual-tree-container.is-wrap .url-jump-btn {
  display: inline-flex;
  vertical-align: middle;
}

.json-virtual-tree-container.is-wrap .copyable-value {
  display: inline;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  line-break: anywhere;
}

.virtual-tree-row:hover {
  background-color: var(--bg-hover, rgba(255, 255, 255, 0.03));
}

/* Vertical Indentation Guide Lines (竖线) */
.tree-indent-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  border-left: 1px dashed rgba(100, 116, 139, 0.4);
  pointer-events: none;
  z-index: 1;
}

:global(.dark-mode) .tree-indent-guide,
:deep(.dark-mode) .tree-indent-guide {
  border-left-color: rgba(148, 163, 184, 0.4);
}

.node-header {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  border-radius: 4px;
  padding: 0 2px;
  user-select: none;
}
.node-header:hover {
  background-color: var(--border-color, rgba(255, 255, 255, 0.08));
}

.node-closing {
  display: inline-flex;
  align-items: center;
  padding: 0 2px;
  margin-left: -7px;
  border-radius: 4px;
}
.node-closing:hover {
  background-color: var(--border-color, rgba(255, 255, 255, 0.08));
}

.node-primitive {
  display: inline-flex;
  align-items: center;
  padding: 0 2px;
  border-radius: 4px;
}

.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  margin-left: -13px;
  margin-right: 1px;
  color: var(--text-muted, #94a3b8);
  flex-shrink: 0;
}

.icon-spacer {
  display: inline-block;
  width: 12px;
  margin-left: -13px;
  margin-right: 1px;
  flex-shrink: 0;
}

.toggle-icon {
  width: 11px;
  height: 11px;
}

.node-key {
  color: var(--json-key, #7dd3fc);
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.node-key:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.node-colon {
  color: var(--text-secondary, #94a3b8);
  margin-right: 4px;
  flex-shrink: 0;
}

.node-bracket {
  color: var(--json-bracket, #f59e0b);
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.node-bracket:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.node-comma {
  color: var(--text-secondary, #94a3b8);
}

.node-collapsed-summary {
  background-color: rgba(0, 0, 0, 0.05);
  color: var(--text-muted, #94a3b8);
  font-family: inherit;
  font-size: 12px;
  height: 18px;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  margin: 0 4px;
  cursor: pointer;
  display: inline-block;
  text-align: center;
  vertical-align: -1px;
  border: none;
  box-sizing: border-box;
  user-select: none;
  transition: background-color 0.15s ease;
}
.node-collapsed-summary:hover {
  background-color: rgba(0, 0, 0, 0.09);
}

:global(.dark-mode) .node-collapsed-summary,
:deep(.dark-mode) .node-collapsed-summary {
  background-color: rgba(255, 255, 255, 0.08);
  color: var(--text-muted, #94a3b8);
}
:global(.dark-mode) .node-collapsed-summary:hover,
:deep(.dark-mode .node-collapsed-summary:hover) {
  background-color: rgba(255, 255, 255, 0.14);
}

/* Value Data Types */
.tree-string {
  color: var(--json-string, #86efac);
}
.tree-number {
  color: var(--json-number, #fcd34d);
}
.tree-boolean {
  color: var(--json-boolean, #f472b6);
}
.tree-null {
  color: var(--json-null, #94a3b8);
  font-style: italic;
}

.copyable-value {
  cursor: pointer;
  border-radius: 2px;
  padding: 0 2px;
  transition: background-color 0.15s ease;
}
.copyable-value:hover {
  background-color: var(--bg-hover, rgba(255, 255, 255, 0.08));
}

.tree-color-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.78rem;
  height: 0.78rem;
  margin-right: 5px;
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
.tree-color-badge:hover {
  transform: scale(1.25);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}
.tree-color-chip-inner {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 2px;
}
:global(.dark-mode) .tree-color-badge {
  border-color: rgba(255, 255, 255, 0.3);
  background-image: linear-gradient(45deg, #555 25%, transparent 25%),
                    linear-gradient(-45deg, #555 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #555 75%),
                    linear-gradient(-45deg, transparent 75%, #555 75%);
}

.tree-img-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.88rem;
  height: 0.88rem;
  border-radius: 3px !important;
  border: none !important;
  outline: none !important;
  background-color: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  margin-right: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.img-badge-icon {
  width: 11px;
  height: 11px;
}

.url-jump-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.88rem;
  height: 0.88rem;
  border-radius: 3px !important;
  border: none !important;
  outline: none !important;
  background: transparent;
  color: var(--primary-color, #38bdf8);
  margin-right: 4px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.url-jump-btn:hover {
  transform: scale(1.15);
  background-color: rgba(56, 189, 248, 0.15);
}
.url-jump-icon {
  width: 11px;
  height: 11px;
}

/* ── Smart Capsules (Timestamp, Unicode, Nested JSON) ── */
.tree-capsule-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.1rem;
  border-radius: 3px !important;
  border: none !important;
  outline: none !important;
  padding: 3px 6px;
  margin-right: 4px;
  cursor: pointer;
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  line-height: 1;
  user-select: none;
  transition: all 0.15s ease;
  vertical-align: middle;
}

.tree-capsule-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 时间戳徽标 (绿色系) */
.tree-time-badge {
  background-color: rgba(16, 185, 129, 0.12);
  color: #10b981;
  gap: 3px;
}
.tree-time-badge:hover {
  background-color: rgba(16, 185, 129, 0.22);
  color: #059669;
}
:global(.dark-mode) .tree-time-badge {
  background-color: rgba(16, 185, 129, 0.18);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.35);
}
:global(.dark-mode) .tree-time-badge:hover {
  background-color: rgba(16, 185, 129, 0.28);
  color: #6ee7b7;
}

/* 音视频媒体徽标 */
.tree-audio-badge {
  background-color: rgba(236, 72, 153, 0.15) !important;
  color: #ec4899 !important;
}
.tree-video-badge {
  background-color: rgba(249, 115, 22, 0.15) !important;
  color: #f97316 !important;
}

/* 智能胶囊配色 */
.tree-jwt-badge {
  background-color: rgba(99, 102, 241, 0.12);
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.25);
  gap: 3px;
}
:global(.dark-mode) .tree-jwt-badge {
  background-color: rgba(99, 102, 241, 0.2);
  color: #818cf8;
}

.tree-b64-badge {
  background-color: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  border-color: rgba(14, 165, 233, 0.25);
  gap: 3px;
}
:global(.dark-mode) .tree-b64-badge {
  background-color: rgba(14, 165, 233, 0.2);
  color: #38bdf8;
}

.tree-urldec-badge {
  background-color: rgba(245, 158, 11, 0.12);
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.25);
  gap: 3px;
}
:global(.dark-mode) .tree-urldec-badge {
  background-color: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.tree-cron-badge {
  background-color: rgba(16, 185, 129, 0.12);
  color: #059669;
  border-color: rgba(16, 185, 129, 0.25);
  gap: 3px;
}
:global(.dark-mode) .tree-cron-badge {
  background-color: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.tree-html-badge {
  background-color: rgba(244, 63, 94, 0.12);
  color: #e11d48;
  border-color: rgba(244, 63, 94, 0.25);
  gap: 3px;
}
:global(.dark-mode) .tree-html-badge {
  background-color: rgba(244, 63, 94, 0.2);
  color: #fb7185;
}

/* Unicode 徽标 (无边框，与图片 URL 图标完全一致) */
.tree-unicode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 3px !important;
  border: none !important;
  outline: none !important;
  background-color: rgba(168, 85, 247, 0.15);
  color: #a855f7;
  margin-right: 4px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  user-select: none;
  transition: transform 0.15s ease, background-color 0.15s ease;
  vertical-align: middle;
}
.tree-unicode-badge:hover {
  transform: scale(1.08);
  background-color: rgba(168, 85, 247, 0.25);
  color: #9333ea;
}
:global(.dark-mode) .tree-unicode-badge {
  background-color: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}
/* Base64 & URL 编码行内图标徽标 (点击复制原值) */
.tree-inline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.1rem;
  border-radius: 3px !important;
  border: none !important;
  outline: none !important;
  margin-right: 4px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0 4px;
  line-height: 1;
  user-select: none;
  transition: transform 0.15s ease, background-color 0.15s ease;
  vertical-align: middle;
}
.tree-inline-badge:hover {
  transform: scale(1.08);
}
.tree-b64-badge {
  background-color: rgba(217, 119, 6, 0.15);
  color: #d97706;
}
.tree-b64-badge:hover {
  background-color: rgba(217, 119, 6, 0.25);
  color: #b45309;
}
:global(.dark-mode) .tree-b64-badge {
  background-color: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}
:global(.dark-mode) .tree-b64-badge:hover {
  background-color: rgba(245, 158, 11, 0.35);
  color: #fef08a;
}

.tree-urldec-badge {
  background-color: rgba(2, 132, 199, 0.15);
  color: #0284c7;
}
.tree-urldec-badge:hover {
  background-color: rgba(2, 132, 199, 0.25);
  color: #0369a1;
}
:global(.dark-mode) .tree-urldec-badge {
  background-color: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}
:global(.dark-mode) .tree-urldec-badge:hover {
  background-color: rgba(56, 189, 248, 0.35);
  color: #bae6fd;
}


/* 嵌套 JSON 徽标 (无边框，与图片 URL 图标完全一致) */
.tree-nested-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 3px !important;
  border: none !important;
  outline: none !important;
  background-color: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  margin-right: 4px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  user-select: none;
  transition: transform 0.15s ease, background-color 0.15s ease;
  vertical-align: middle;
}
.tree-nested-badge:hover {
  transform: scale(1.08);
  background-color: rgba(245, 158, 11, 0.25);
  color: #d97706;
}
:global(.dark-mode) .tree-nested-badge {
  background-color: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}
:global(.dark-mode) .tree-nested-badge:hover {
  background-color: rgba(245, 158, 11, 0.35);
  color: #fde68a;
}

.capsule-icon {
  width: 11px;
  height: 11px;
}

.capsule-symbol {
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1;
}

.capsule-text {
  font-size: 11px;
  max-width: none;
  overflow: visible;
  white-space: nowrap;
}


:deep(.search-match) {
  background-color: rgba(234, 179, 8, 0.35);
  color: inherit;
  border-radius: 2px;
}

:global(.dark-mode) :deep(.search-match) {
  background-color: rgba(250, 204, 21, 0.35);
  color: #fef9c3;
  border-radius: 2px;
}
</style>
