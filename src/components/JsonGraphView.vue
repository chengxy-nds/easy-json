<script setup>
import { ref, computed, onMounted, watch, inject } from 'vue'
import { ExternalLink, Image as ImageIcon } from 'lucide-vue-next'
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
  let text = ''
  if (typeof val === 'object' && val !== null) {
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
  if (!text) return ''
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
const CARD_ROW_H  = 18.8 // height of each row inside a card
const CARD_PAD    = 6    // vertical padding inside card
const CARD_KEY_W  = 130  // card key column width
const CARD_VAL_W  = 200  // card value column width
const CARD_GAP    = 12   // vertical gap between cards
const BULLET_R    = 3.5  // bullet circle radius

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isPrimitive = (v) => v === null || typeof v !== 'object'

const getValueType = (v) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  return typeof v
}

const getPreview = (v) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `[${v.length}]`
  if (typeof v === 'object') return `{${Object.keys(v).length}}`
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

const getTooltipText = (v) => {
  if (v === null) return 'null'
  if (typeof v === 'object') {
    return safeStringify(v, null, 2)
  }
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
    const entries = isArray
      ? currentObj.map((v, i) => [String(i), v])
      : Object.keys(currentObj).map(k => [k, currentObj[k]])

    const nodeId = JSON.stringify(path)

    const cardEntries = entries.map(([k, v], idx) => {
      const isComplex = v !== null && typeof v === 'object'
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

    // Calculate dynamic width based on content character lengths
    let maxKLen = 0
    let maxPLen = 0
    cardEntries.forEach(e => {
      if (e.key.length > maxKLen) maxKLen = e.key.length
      if (e.preview.length > maxPLen) maxPLen = e.preview.length
    })

    const keyW = isArray ? Math.max(24, maxKLen * 7 + 8) : Math.max(70, Math.min(300, maxKLen * 7.5 + 12))
    const valW = isArray ? Math.max(40, maxPLen * 7 + 10) : Math.max(60, Math.min(360, maxPLen * 7.5 + 12))
    const width = isArray ? Math.max(90, Math.min(640, keyW + valW + 20)) : Math.max(140, Math.min(700, keyW + valW + 28))
    const height = CARD_PAD * 2 + Math.max(cardEntries.length, 1) * CARD_ROW_H

    // Track max width for this depth level
    if (!maxColWidths[depth] || width > maxColWidths[depth]) {
      maxColWidths[depth] = width
    }

    const node = {
      id: nodeId,
      path,
      key,
      parentId,
      parentRowIdx,
      isArray,
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

    return node
  }

  // Build the root tree
  buildTreeNodes(obj, [], "", null, null, 0)

  // 2. Compute Column X coordinates
  const colX = []
  let curX = 0
  for (let d = 0; d < maxColWidths.length; d++) {
    colX[d] = curX
    curX += (maxColWidths[d] || 260) + 80
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
          const parentRowY = parentNode.y + CARD_PAD + (node.parentRowIdx ?? 0) * CARD_ROW_H + CARD_ROW_H / 2
          idealY = parentRowY - (CARD_PAD + CARD_ROW_H / 2)
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
    node.x = node.x - minX + 24
    node.y = node.y - minY + 24
  })

  const wsW = maxX - minX + 48
  const wsH = maxY - minY + 48

  return { nodes: allNodes, wsW, wsH }
})

// ─── SVG connection lines computation ────────────────────────────────────────
const curves = computed(() => {
  if (!layout.value) return []
  const { nodes } = layout.value

  const connectionList = []
  nodes.forEach(node => {
    if (node.parentId !== null) {
      const parentNode = nodes.find(n => n.id === node.parentId)
      if (parentNode) {
        const x1 = parentNode.x + parentNode.width
        const y1 = parentNode.y + CARD_PAD + node.parentRowIdx * CARD_ROW_H + CARD_ROW_H / 2
        const x2 = node.x
        const y2 = node.y + node.height / 2
        const cx = (x1 + x2) / 2

        connectionList.push({
          id: node.id,
          d: `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`,
          x1, y1, x2, y2
        })
      }
    }
  })
  return connectionList
})

// ─── Pan / Zoom (Adapted for smoother interaction) ──────────────────────────
const containerRef = ref(null)
const tx = ref(60)
const ty = ref(40)
const scale = ref(0.9)
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

const MIN_SCALE = 0.65 // 最小缩小比例 (65%)
const MAX_SCALE = 1.45 // 最大放大比例 (145%)

const wheelMode = ref('zoom') // 'zoom' or 'scroll' (默认滚轮缩放)
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
      
      // 以鼠标光标所在点为缩放中心
      tx.value = mouseX - (mouseX - tx.value) * (newScale / scale.value)
      ty.value = mouseY - (mouseY - ty.value) * (newScale / scale.value)
    }
    
    scale.value = newScale
  } else {
    // Scroll vertically
    ty.value -= e.deltaY * 0.8
  }
}

const zoomIn  = () => { scale.value = Math.min(MAX_SCALE, Number((scale.value * 1.15).toFixed(3))) }
const zoomOut = () => { scale.value = Math.max(MIN_SCALE, Number((scale.value / 1.15).toFixed(3))) }

const fitToScreen = () => {
  scale.value = 0.9
  tx.value = 40
  ty.value = 40
}

const resetView = () => { tx.value = 40; ty.value = 40; scale.value = 0.9 }

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
    // Ease out cubic
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

  if (path.length === matchedNode.path.length + 1) {
    const rowKey = String(path[path.length - 1])
    const rowIdx = matchedNode.entries.findIndex(e => String(e.key) === rowKey)
    if (rowIdx !== -1) {
      targetY = matchedNode.y + CARD_PAD + rowIdx * CARD_ROW_H + CARD_ROW_H / 2
    }
  }

  const cw = containerRef.value.clientWidth
  const ch = containerRef.value.clientHeight
  // 水平正中，垂直方向定位在距离顶部 35% 处
  const destTx = cw / 2 - targetX * scale.value
  const destTy = ch * 0.35 - matchedNode.y * scale.value

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
  if (!current || path.length === 0 || path.length > current.length) return false
  return path.every((v, i) => String(v) === String(current[i]))
}

const isCardHovered = (node) => {
  const current = props.hoveredPath || selectedPath.value
  if (!current || node.path.length > current.length) return false
  return node.path.every((v, i) => String(v) === String(current[i]))
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

const graphViewStyle = computed(() => {
  const s = Math.max(0.2, scale.value)
  const size = BASE_DOT_GRID * s
  return {
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${tx.value}px ${ty.value}px`
  }
})
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

      <!-- Cards (Unified for all levels) -->
      <div
        v-for="node in layout?.nodes"
        :key="node.id"
        class="graph-node"
        :class="{ 
          'root-node': node.parentId === null,
          'is-hovered': isCardHovered(node)
        }"
        :style="{
          left: node.x + 'px',
          top:  node.y + 'px',
          width: node.width + 'px'
        }"
        @click="emitClick(node.path)"
      >
        <div
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
      </div>
    </div>

    <!-- Zoom controls -->
    <div class="graph-controls">
      <button class="ctrl-btn" @click.stop="zoomIn"     data-tooltip-right="放大">＋</button>
      <button class="ctrl-btn" @click.stop="zoomOut"    data-tooltip-right="缩小">－</button>
      <button class="ctrl-btn" @click.stop="fitToScreen" data-tooltip-right="适应屏幕">⊡</button>
      <button class="ctrl-btn" @click.stop="toggleWheelMode" :data-tooltip-right="wheelMode === 'zoom' ? '当前模式: 滚轮缩放 (点击切换为滚动)' : '当前模式: 滚轮滚动 (点击切换为缩放)'">
        {{ wheelMode === 'zoom' ? '🔍' : '↕' }}
      </button>
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
  background-color: var(--bg-panel);
  background-image: radial-gradient(var(--graph-dot-color) 0.75px, transparent 0.75px);
  background-size: 20px 20px;
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

.card-row {
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  cursor: pointer;
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
  font-size: 12px;
  color: var(--json-key);
  min-width: 60px;
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
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
  font-weight: 600;
  min-width: auto !important;
}
:global(.dark-mode) .card-key--index {
  color: var(--json-number, #60a5fa);
}
.root-key--complex {
  font-weight: 500;
}
.card-val {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  overflow: hidden;
}
.val-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  line-height: 1.2;
}
.cval-string  { color: var(--json-string); }
.cval-number  { color: var(--json-number); font-weight: 600; }
.cval-boolean {
  font-weight: 600;
}
.cval-boolean-true {
  color: #16a34a;
}
.dark-mode .cval-boolean-true {
  color: #4ade80;
}
.cval-boolean-false {
  color: #dc2626;
}
.dark-mode .cval-boolean-false {
  color: #fca5a5;
}
.cval-null {
  color: var(--json-null);
  font-style: italic;
  font-weight: 500;
}
.cval-array {
  color: var(--text-secondary);
  font-weight: 600;
}
.cval-object {
  color: var(--text-secondary);
  font-weight: 600;
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

/* ── Hover synchronization styles ── */
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

.card-key {
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.card-key:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.card-val {
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.card-val:hover .val-text {
  text-decoration: underline;
  opacity: 0.85;
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
</style>
