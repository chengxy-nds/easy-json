<script setup>
import { ref, computed, onMounted, watch, inject } from 'vue'
import { ExternalLink, Image as ImageIcon, Table, GitFork, Copy, ArrowLeft, Minus, Plus, Map as MapIcon } from 'lucide-vue-next'
import { safeStringify } from '../utils/jsonBigInt.js'
import { isImageUrl, isHttpUrl, openExternalUrl } from '../utils/imageDetector.js'

const searchQuery = inject('searchQuery', ref(''))
const imagePreview = inject('imagePreview', null)
const showToast = inject('showToast', null)

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
  let text = ''
  if (typeof val === 'object') {
    text = safeStringify(val, null, 2)
  } else {
    text = typeof val === 'string' ? val : String(val)
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

const isImg = (v) => typeof v === 'string' && isImageUrl(v)
const isHttpLink = (v) => typeof v === 'string' && !isImg(v) && isHttpUrl(v)

const handleOpenUrl = (url) => {
  openExternalUrl(url)
  if (showToast) {
    showToast('已在浏览器打开链接')
  }
}

const onValMouseEnter = (v, e) => {
  if (isImg(v) && imagePreview) {
    imagePreview.show(v, e.currentTarget)
  }
}

const onValMouseLeave = (v) => {
  if (isImg(v) && imagePreview) {
    imagePreview.hide()
  }
}

const highlightText = (text, query) => {
  if (text === null || text === undefined) return ''
  const str = String(text)
  if (!query) return str
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  const escapedText = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escapedText.replace(regex, '<mark class="search-match">$1</mark>')
}

const props = defineProps({
  parsedObj: { required: true },
  hoveredPath: { type: Array, default: null }
})

const emit = defineEmits(['hover-path', 'click-path'])

const emitClick = (path) => {
  emit('click-path', path)
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CARD_ROW_H    = 22   // height of each row inside a standard card
const CARD_PAD      = 4    // vertical padding inside standard card
const CARD_GAP      = 24   // vertical gap between cards (prevents crowding)
const COL_GAP       = 130  // horizontal gap between columns (generous channel for non-occluding curves)
const BULLET_R      = 3.5  // bullet circle radius

const SWITCH_BAR_H  = 24   // switch bar height in standard card
const TABLE_TITLE_H = 26   // table node title bar height
const TABLE_THEAD_H = 24   // table node thead row height
const TABLE_ROW_H   = 22   // table node row height

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

const toggleNodeTableMode = (path) => {
  const pathKey = JSON.stringify(path)
  const isCurrentlyTable = isTableModeForNode(path, true)
  nodeTableOverrides.value.set(pathKey, !isCurrentlyTable)
}

const toggleGlobalTableMode = () => {
  globalTableMode.value = !globalTableMode.value
  nodeTableOverrides.value.clear()
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
  if (v === null) return 'null'
  if (Array.isArray(v)) return `[${v.length}]`
  if (typeof v === 'object') return `{${Object.keys(v).length}}`
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
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
  for (const item of arr) {
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
      columns.forEach(col => {
        let maxLen = col.length
        currentObj.forEach(item => {
          const val = item?.[col]
          if (val !== undefined && val !== null) {
            const prev = getPreview(val)
            if (prev.length > maxLen) maxLen = prev.length
          }
        })
        const hasImgOrUrl = currentObj.some(item => isImg(item?.[col]) || isHttpLink(item?.[col]))
        const extraIconW = (hasImgOrUrl ? 22 : 0) + 24
        colWidths[col] = Math.max(84, Math.min(300, Math.round(maxLen * 7.5 + 20 + extraIconW)))
      })

      const indexColW = Math.max(30, String(currentObj.length).length * 8 + 16)
      const totalTableW = indexColW + Object.values(colWidths).reduce((a, b) => a + b, 0) + 2
      const height = TABLE_TITLE_H + TABLE_THEAD_H + currentObj.length * TABLE_ROW_H + 2
      const width = Math.max(160, totalTableW)

      const tableRows = currentObj.map((item, rowIdx) => {
        const cells = columns.map(col => {
          const val = item?.[col]
          const isComplex = val !== null && val !== undefined && typeof val === 'object' && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0)
          const cellPath = [...path, rowIdx, col]
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
        childrenIds: []
      }

      nodesMap.set(nodeId, node)
      if (!nodesByDepth[depth]) nodesByDepth[depth] = []
      nodesByDepth[depth].push(node)

      // Recursively build children for nested complex cells inside table
      tableRows.forEach(row => {
        row.cells.forEach(cell => {
          if (cell.isComplex) {
            node.childrenIds.push(cell.childNodeId)
            buildTreeNodes(cell.value, cell.path, cell.col, nodeId, { isTable: true, rowIdx: row.rowIdx }, depth + 1)
          }
        })
      })

    } else {
      // ─── 场景 B: 标准卡片节点 (Standard Card Node) ───
      const entries = isArray
        ? currentObj.map((v, i) => [String(i), v])
        : Object.keys(currentObj).map(k => [k, currentObj[k]])

      const cardEntries = entries.map(([k, v], idx) => {
        const isComplex = v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)
        const childPath = [...path, isArray ? Number(k) : k]
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

      let maxKLen = 0
      let maxPLen = 0
      cardEntries.forEach(e => {
        if (e.key.length > maxKLen) maxKLen = e.key.length
        if (e.preview.length > maxPLen) maxPLen = e.preview.length
      })

      const keyW = isArray ? Math.max(24, maxKLen * 7 + 8) : Math.max(70, Math.min(300, maxKLen * 7.5 + 12))
      const valW = isArray ? Math.max(40, maxPLen * 7 + 10) : Math.max(60, Math.min(360, maxPLen * 7.5 + 12))
      
      // If node is an array of objects in tree mode, ensure enough width for switch bar [N 项] + 表格化
      const minW = isObjArray ? 148 : (isArray ? 90 : 140)
      const width = isArray ? Math.max(minW, Math.min(640, keyW + valW + 20)) : Math.max(minW, Math.min(700, keyW + valW + 28))
      
      const extraBarH = isObjArray ? SWITCH_BAR_H : 0
      const height = extraBarH + CARD_PAD * 2 + Math.max(cardEntries.length, 1) * CARD_ROW_H

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
        width,
        height,
        depth,
        x: 0,
        y: 0,
        keyW,
        childrenIds: cardEntries.filter(e => e.isComplex).map(e => e.childNodeId)
      }

      nodesMap.set(nodeId, node)
      if (!nodesByDepth[depth]) {
        nodesByDepth[depth] = []
      }
      nodesByDepth[depth].push(node)

      // Recursively build children
      cardEntries.forEach(entry => {
        if (entry.isComplex) {
          const childPath = [...path, isArray ? Number(entry.key) : entry.key]
          buildTreeNodes(entry.value, childPath, entry.key, nodeId, entry.rowIdx, depth + 1)
        }
      })
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
            parentRowY = parentNode.y + TABLE_TITLE_H + TABLE_THEAD_H + rIdx * TABLE_ROW_H + TABLE_ROW_H / 2
          } else if (typeof node.parentRowIdx === 'number') {
            const parentExtraBarH = parentNode.canToggleTable && !parentNode.isTable ? SWITCH_BAR_H : 0
            parentRowY = parentNode.y + parentExtraBarH + CARD_PAD + node.parentRowIdx * CARD_ROW_H + CARD_ROW_H / 2
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
        if (parentNode.isTable && typeof node.parentRowIdx === 'object' && node.parentRowIdx.isTable) {
          const rIdx = node.parentRowIdx.rowIdx ?? 0
          y1 = parentNode.y + TABLE_TITLE_H + TABLE_THEAD_H + rIdx * TABLE_ROW_H + TABLE_ROW_H / 2
        } else if (typeof node.parentRowIdx === 'number') {
          const parentExtraBarH = parentNode.canToggleTable && !parentNode.isTable ? SWITCH_BAR_H : 0
          y1 = parentNode.y + parentExtraBarH + CARD_PAD + node.parentRowIdx * CARD_ROW_H + CARD_ROW_H / 2
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
const DEFAULT_SCALE = 0.75 // 默认展示比例 75% (提供更舒适开阔的拓扑概览)
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
const selectedPath = inject('selectedPath', ref(null))
let panAnimId = null

const animatePanTo = (destTx, destTy, duration = 280) => {
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

const centerOnPath = (path) => {
  if (!path || !layout.value || !containerRef.value) return
  const { nodes } = layout.value

  let matchedNode = null
  let maxMatchLen = -1

  for (const node of nodes) {
    const np = node.path
    if (np.length <= path.length && np.every((v, i) => v === path[i])) {
      if (np.length > maxMatchLen) {
        maxMatchLen = np.length
        matchedNode = node
      }
    }
  }

  if (!matchedNode) return

  let targetX = matchedNode.x + matchedNode.width / 2
  let targetY = matchedNode.y + matchedNode.height / 2

  if (matchedNode.isTable) {
    if (path.length >= matchedNode.path.length + 1) {
      const rowIdx = Number(path[matchedNode.path.length])
      if (!isNaN(rowIdx) && rowIdx >= 0 && rowIdx < matchedNode.tableRows.length) {
        targetY = matchedNode.y + TABLE_TITLE_H + TABLE_THEAD_H + rowIdx * TABLE_ROW_H + TABLE_ROW_H / 2
      }
    }
  } else if (path.length === matchedNode.path.length + 1) {
    const rowKey = String(path[path.length - 1])
    const rowIdx = matchedNode.entries.findIndex(e => String(e.key) === rowKey)
    if (rowIdx !== -1) {
      const extraBarH = matchedNode.canToggleTable && !matchedNode.isTable ? SWITCH_BAR_H : 0
      targetY = matchedNode.y + extraBarH + CARD_PAD + rowIdx * CARD_ROW_H + CARD_ROW_H / 2
    }
  }

  const cw = containerRef.value.clientWidth
  const ch = containerRef.value.clientHeight
  const destTx = cw / 2 - targetX * scale.value
  const destTy = ch * 0.35 - targetY * scale.value

  animatePanTo(destTx, destTy, 280)
}

watch(selectedPath, (newPath) => {
  if (newPath && newPath.length > 0) {
    centerOnPath(newPath)
  }
})

// ─── Hover synchronization helpers ───────────────────────────────────────────
const emitHover = (path) => {
  emit('hover-path', path)
}

const isPathHovered = (path) => {
  const current = props.hoveredPath || selectedPath.value
  if (!current || !path || path.length === 0 || path.length > current.length) return false
  return path.every((v, i) => String(v) === String(current[i]))
}

const isCardHovered = (node) => {
  const current = props.hoveredPath || selectedPath.value
  if (!current || node.path.length > current.length) return false
  return node.path.every((v, i) => String(v) === String(current[i]))
}

const isCardSelected = (node) => {
  const current = props.hoveredPath || selectedPath.value
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
  const current = props.hoveredPath || selectedPath.value
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

// ─── Minimap (右下角交互式小地图) ─────────────────────────────────────────────
const showMinimap = ref(false)
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
  const pointerEvent = e.touches && e.touches[0] ? e.touches[0] : e
  const clickX = Math.max(0, Math.min(rect.width, pointerEvent.clientX - rect.left))
  const clickY = Math.max(0, Math.min(rect.height, pointerEvent.clientY - rect.top))
  
  const scaleX = layout.value.wsW / rect.width
  const scaleY = layout.value.wsH / rect.height
  const targetWsX = clickX * scaleX
  const targetWsY = clickY * scaleY
  
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
              <span class="table-badge">{{ node.tableRows.length }} 项</span>
            </div>
            <button
              class="table-mode-toggle-btn"
              @click.stop="toggleNodeTableMode(node.path)"
              data-tooltip="切换为树形发散模式"
            >
              <GitFork class="table-btn-icon" />
              <span>展开树形</span>
            </button>
          </div>

          <!-- 2D Data Table Grid -->
          <div class="table-card-body">
            <table class="graph-inner-table">
              <thead>
                <tr>
                  <th class="tbl-th tbl-th--index" :style="{ width: node.indexColW + 'px', minWidth: node.indexColW + 'px', maxWidth: node.indexColW + 'px' }">#</th>
                  <th
                    v-for="col in node.columns"
                    :key="col"
                    class="tbl-th"
                    :style="{ width: node.colWidths[col] + 'px', minWidth: node.colWidths[col] + 'px', maxWidth: node.colWidths[col] + 'px' }"
                    @click.stop="handleCopyKey(col); emitClick([...node.path, col])"
                    @mouseenter="emitHover([...node.path, col])"
                    @mouseleave="emitHover(null)"
                  >
                    <div class="tbl-th-content">
                      <span
                        class="tbl-th-text"
                        data-tooltip="点击复制键名"
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
                <tr
                  v-for="row in node.tableRows"
                  :key="row.rowIdx"
                  class="tbl-tr"
                  :class="{ 'is-hovered': isPathHovered(row.path) }"
                  :style="{ height: TABLE_ROW_H + 'px' }"
                >
                  <!-- Row Index -->
                  <td
                    class="tbl-td tbl-td--index"
                    :style="{ width: node.indexColW + 'px', minWidth: node.indexColW + 'px', maxWidth: node.indexColW + 'px' }"
                    @click.stop="handleCopyKey(row.rowIdx); emitClick(row.path)"
                    @mouseenter="emitHover(row.path)"
                    @mouseleave="emitHover(null)"
                  >
                    <span class="tbl-index-text" data-tooltip="点击复制行号">{{ row.rowIdx }}</span>
                  </td>

                  <!-- Data Cells -->
                  <td
                    v-for="cell in row.cells"
                    :key="cell.col"
                    class="tbl-td"
                    :class="{
                      'is-hovered': isPathHovered(cell.path),
                      'tbl-td--complex': cell.isComplex
                    }"
                    :style="{ width: node.colWidths[cell.col] + 'px', minWidth: node.colWidths[cell.col] + 'px', maxWidth: node.colWidths[cell.col] + 'px' }"
                    @click.stop="handleCopyValue(cell.value); emitClick(cell.path)"
                    @mouseenter="emitHover(cell.path)"
                    @mouseleave="emitHover(null)"
                  >
                    <div class="tbl-cell-content">
                      <template v-if="cell.value !== undefined && cell.value !== null">
                        <span
                          v-if="isImg(cell.value)"
                          class="graph-img-badge"
                          @mouseenter="(e) => onValMouseEnter(cell.value, e)"
                          @mouseleave="() => onValMouseLeave(cell.value)"
                          data-tooltip="图片链接 (悬停预览)"
                        ><ImageIcon class="img-badge-icon" /></span>
                        <button
                          v-else-if="isHttpLink(cell.value)"
                          class="graph-url-jump-btn"
                          @click.stop="handleOpenUrl(cell.value)"
                          data-tooltip="在浏览器中直接打开链接"
                        >
                          <ExternalLink class="url-jump-icon" />
                        </button>
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
                          :data-tooltip="isImg(cell.value) ? '悬停预览图片，点击复制键值' : (isHttpLink(cell.value) ? '点击复制键值，点击左侧图标可直接打开' : '点击复制键值')"
                          v-html="highlightText(cell.preview, searchQuery)"
                        ></span>
                      </template>
                      <span v-else class="val-empty">-</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ════════════ 2. 常规卡片节点 (Standard Card Node) ════════════ -->
        <template v-else>
          <!-- Optional array mode switch header for tree arrays of objects -->
          <div v-if="node.canToggleTable" class="card-array-switch-bar">
            <span class="card-switch-label">{{ node.isArray ? `[${node.entries.length} 项]` : '' }}</span>
            <button
              class="table-mode-toggle-btn card-mini-btn"
              @click.stop="toggleNodeTableMode(node.path)"
              data-tooltip="切换为紧凑表格模式"
            >
              <Table class="table-btn-icon" />
              <span>表格化</span>
            </button>
          </div>

          <div v-if="node.entries.length === 0" class="card-row card-row--empty" :style="{ height: CARD_ROW_H + 'px', padding: '0 8px', display: 'flex', alignItems: 'center' }">
            <span class="card-key node-key root-key--complex">{{ node.isArray ? '[] (空数组)' : '{} (空对象)' }}</span>
          </div>
          <div
            v-else
            v-for="entry in node.entries"
            :key="entry.key"
            class="card-row"
            :class="{ 'is-hovered': isPathHovered(getEntryPath(node, entry)), 'card-row--array': node.isArray }"
            :style="{ height: CARD_ROW_H + 'px' }"
            @mouseenter="emitHover(getEntryPath(node, entry))"
            @mouseleave="emitHover(null)"
            @click.stop="emitClick(getEntryPath(node, entry))"
          >
            <span
              class="card-key node-key"
              :class="{ 'card-key--index': node.isArray, 'root-key--complex': entry.isComplex }"
              :style="node.isArray ? {} : { width: node.keyW + 'px', minWidth: node.keyW + 'px', maxWidth: node.keyW + 'px' }"
              @click.stop="handleCopyKey(entry.key); emitClick(getEntryPath(node, entry))"
            >
              <span
                class="card-key-text"
                data-tooltip="点击复制键名"
                v-html="highlightText(entry.key, searchQuery)"
              ></span>
            </span>
            <span
              class="card-val"
              @click.stop="handleCopyValue(entry.value); emitClick(getEntryPath(node, entry))"
            >
              <span
                v-if="isImg(entry.value)"
                class="graph-img-badge"
                @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                @mouseleave="() => onValMouseLeave(entry.value)"
                data-tooltip="图片链接 (悬停预览)"
              ><ImageIcon class="img-badge-icon" /></span>
              <button
                v-else-if="isHttpLink(entry.value)"
                class="graph-url-jump-btn"
                @click.stop="handleOpenUrl(entry.value)"
                data-tooltip="在浏览器中直接打开链接"
              >
                <ExternalLink class="url-jump-icon" />
              </button>
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
                :data-tooltip="isImg(entry.value) ? '悬停预览图片，点击复制键值' : (isHttpLink(entry.value) ? '点击复制键值，点击左侧图标可直接打开' : '点击复制键值')"
                v-html="highlightText(entry.preview, searchQuery)"
              ></span>
            </span>
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
        {{ wheelMode === 'zoom' ? '🔍' : '↕' }}
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
  </div>
</template>

<style scoped>
/* ── Container ── */
.graph-view {
  flex: 1;
  position: relative;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  background-color: var(--bg-app, rgb(252, 252, 252));
  background-image: radial-gradient(var(--graph-dot-color, rgba(119, 119, 119, 0.22)) 0.75px, transparent 0.55px);
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
  padding: 0 12px;
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
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.25);
  border-radius: 3px;
  color: #2563eb;
  cursor: pointer;
  opacity: 0.95;
  vertical-align: middle;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.graph-url-jump-btn:hover {
  background: #2563eb;
  color: #ffffff;
  opacity: 1;
  transform: scale(1.15);
}

:global(.dark-mode) .graph-url-jump-btn {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  opacity: 1;
}

:global(.dark-mode) .graph-url-jump-btn:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
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
  width: clamp(160px, 18vw, 240px);
  height: clamp(110px, 14vh, 165px);
  max-width: min(240px, calc(100vw - 32px), calc(100% - 24px));
  max-height: min(165px, calc(50vh - 32px), calc(50% - 24px));
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

:global(.dark-mode) .graph-minimap-card {
  background: #1e1e24;
  border-color: #3f4452;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
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
  background: #f8fafc;
  cursor: crosshair;
  touch-action: none;
}
:global(.dark-mode) .minimap-body {
  background: #18181b;
}

.minimap-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.mm-edge {
  fill: none;
  stroke: #cbd5e1;
  stroke-width: 2px;
}
:global(.dark-mode) .mm-edge {
  stroke: #475569;
}
.mm-edge.is-active {
  stroke: #0284c7;
  stroke-width: 3.5px;
}
:global(.dark-mode) .mm-edge.is-active {
  stroke: #38bdf8;
}

.mm-node {
  fill: #e2e8f0;
  stroke: #94a3b8;
  stroke-width: 1px;
}
:global(.dark-mode) .mm-node {
  fill: #334155;
  stroke: #475569;
}
.mm-node.is-active {
  fill: #0284c7;
  stroke: #0284c7;
}
:global(.dark-mode) .mm-node.is-active {
  fill: #38bdf8;
  stroke: #38bdf8;
}

.mm-viewport {
  fill: rgba(2, 132, 199, 0.12);
  stroke: #0284c7;
  stroke-width: 3px;
  cursor: move;
}
:global(.dark-mode) .mm-viewport {
  fill: rgba(56, 189, 248, 0.15);
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
</style>
