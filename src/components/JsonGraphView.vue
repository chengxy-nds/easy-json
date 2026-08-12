<script setup>
import { ref, computed, onMounted, watch, inject } from 'vue'
import { safeStringify } from '../utils/jsonBigInt.js'

const searchQuery = inject('searchQuery', ref(''))

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
  if (typeof v === 'string') return v.length > 90 ? `"${v.slice(0, 90)}…"` : `"${v}"`
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
  if (type === 'number') return 'tree-number'
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

    const keyW = isArray ? Math.max(20, maxKLen * 6 + 4) : Math.max(100, Math.min(600, maxKLen * 8 + 16))
    const valW = isArray ? Math.max(30, maxPLen * 6 + 4) : Math.max(60, Math.min(600, maxPLen * 8 + 16))
    const width = isArray ? Math.max(75, keyW + valW + 16) : Math.max(140, keyW + valW + 32)
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
  const rootId = JSON.stringify([])
  buildTreeNodes(obj, [], "", null, null, 0)

  // 2. Compute vertical footprint of each subtree (post-order height calculation)
  const subtreeHeights = new Map()
  const computeSubtreeHeights = (nodeId) => {
    const node = nodesMap.get(nodeId)
    if (!node) return 0

    if (node.childrenIds.length === 0) {
      subtreeHeights.set(nodeId, node.height)
      return node.height
    }

    let childrenHeightSum = 0
    node.childrenIds.forEach((childId, idx) => {
      childrenHeightSum += computeSubtreeHeights(childId)
      if (idx < node.childrenIds.length - 1) {
        childrenHeightSum += CARD_GAP
      }
    })

    const totalHeight = Math.max(node.height, childrenHeightSum)
    subtreeHeights.set(nodeId, totalHeight)
    return totalHeight
  }
  computeSubtreeHeights(rootId)

  // 3. Assign positions recursively, centering parent nodes vertically
  const assignCoords = (nodeId, startY, depth) => {
    const node = nodesMap.get(nodeId)
    if (!node) return

    // Calculate x coordinate by summing up max widths of previous columns
    let x = 0
    for (let i = 0; i < depth; i++) {
      x += (maxColWidths[i] || 330) + 90
    }
    node.x = x

    const nodeSubtreeH = subtreeHeights.get(nodeId)

    if (node.childrenIds.length === 0) {
      node.y = startY
      return
    }

    // Align parent to the top of the subtree
    node.y = startY

    // Center children relative to parent if parent card is taller
    let currentChildY = startY
    const totalChildrenH = node.childrenIds.reduce((sum, cid, idx) => {
      return sum + subtreeHeights.get(cid) + (idx < node.childrenIds.length - 1 ? CARD_GAP : 0)
    }, 0)

    if (totalChildrenH < node.height) {
      currentChildY = node.y + (node.height - totalChildrenH) / 2
    }

    node.childrenIds.forEach(childId => {
      assignCoords(childId, currentChildY, depth + 1)
      currentChildY += subtreeHeights.get(childId) + CARD_GAP
    })
  }
  assignCoords(rootId, 0, 0)

  // 4. Bounding box computation & coordinate normalization (shift everything to align with a 20px padding)
  const allNodes = Array.from(nodesMap.values())
  if (allNodes.length === 0) return null

  const minX = Math.min(...allNodes.map(n => n.x))
  const minY = Math.min(...allNodes.map(n => n.y))
  const maxX = Math.max(...allNodes.map(n => n.x + n.width))
  const maxY = Math.max(...allNodes.map(n => n.y + n.height))

  allNodes.forEach(node => {
    node.x = node.x - minX + 20
    node.y = node.y - minY + 20
  })

  const wsW = maxX - minX + 40
  const wsH = maxY - minY + 40

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
const ty = ref(60)
const scale = ref(1)
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

const wheelMode = ref('scroll') // 'zoom' or 'scroll'
const toggleWheelMode = () => {
  wheelMode.value = wheelMode.value === 'zoom' ? 'scroll' : 'zoom'
}

const doZoom = (e) => {
  e.preventDefault()
  if (wheelMode.value === 'zoom') {
    // Smooth zoom speed (slower factor)
    const factor = e.deltaY < 0 ? 1.04 : 0.96
    scale.value = Math.min(3, Math.max(0.1, scale.value * factor))
  } else {
    // Scroll vertically
    ty.value -= e.deltaY * 0.8
  }
}

const zoomIn  = () => { scale.value = Math.min(3,    scale.value * 1.08) }
const zoomOut = () => { scale.value = Math.max(0.10, scale.value / 1.08) }

const fitToScreen = () => {
  if (!containerRef.value || !layout.value) return
  const { wsW, wsH } = layout.value
  const cw = containerRef.value.clientWidth
  const ch = containerRef.value.clientHeight
  
  // Multiply by 0.9 to make the fit slightly smaller/spaced
  let s = Math.min(cw / (wsW + 40), ch / (wsH + 40)) * 0.9
  // Keep it bounded so it doesn't get too large or too small
  s = Math.min(Math.max(s, 1.0), 1.25)
  
  scale.value = s
  // Shift the entire graph slightly to the top-left (using 0.2 factor instead of 0.5 centering)
  tx.value = Math.max(40, (cw - wsW * s) * 0.2)
  ty.value = Math.max(40, (ch - wsH * s) * 0.2)
}

const resetView = () => { tx.value = 60; ty.value = 60; scale.value = 1.1 }

onMounted(fitToScreen)
watch(() => props.parsedObj, fitToScreen)

// ─── Hover synchronization helpers ───────────────────────────────────────────
const emitHover = (path) => {
  emit('hover-path', path)
}

const isPathHovered = (path) => {
  if (!props.hoveredPath || props.hoveredPath.length !== path.length) return false
  return path.every((v, i) => v === props.hoveredPath[i])
}

const isCardHovered = (node) => {
  if (!props.hoveredPath) return false
  const lenH = props.hoveredPath.length
  const lenN = node.path.length
  if (lenH === lenN || lenH === lenN + 1) {
    return node.path.every((v, i) => v === props.hoveredPath[i])
  }
  return false
}

const isCurveHovered = (curve) => {
  if (!props.hoveredPath || props.hoveredPath.length === 0) return false
  try {
    const nodePath = JSON.parse(curve.id)
    if (nodePath.length > props.hoveredPath.length) return false
    return nodePath.every((v, i) => v === props.hoveredPath[i])
  } catch (e) {
    return false
  }
}

const graphViewStyle = computed(() => {
  const s = Math.max(1, scale.value)
  const size = 16 * s
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
          <span class="card-key node-key" :title="entry.key" :class="{ 'card-key--index': node.isArray, 'root-key--complex': entry.isComplex }" :style="node.isArray ? {} : { width: node.keyW + 'px', minWidth: node.keyW + 'px', maxWidth: node.keyW + 'px' }" v-html="highlightText(entry.key, searchQuery)">
          </span>
          <span class="card-val" :title="getTooltipText(entry.value)">
            <span class="val-text" :class="[getValueColorClass(entry.valueType), `cval-${entry.valueType}`, entry.valueType === 'boolean' ? (entry.value ? 'cval-boolean-true' : 'cval-boolean-false') : '']" v-html="highlightText(entry.preview, searchQuery)"></span>
          </span>
        </div>
      </div>
    </div>

    <!-- Zoom controls -->
    <div class="graph-controls">
      <button class="ctrl-btn" @click.stop="zoomIn"     title="放大">＋</button>
      <button class="ctrl-btn" @click.stop="zoomOut"    title="缩小">－</button>
      <button class="ctrl-btn" @click.stop="fitToScreen" title="适应屏幕">⊡</button>
      <button class="ctrl-btn" @click.stop="toggleWheelMode" :title="wheelMode === 'zoom' ? '当前模式: 滚轮缩放 (点击切换为滚动)' : '当前模式: 滚轮滚动 (点击切换为缩放)'">
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
  background-image: radial-gradient(var(--graph-dot-color) 0.8px, transparent 0);
  background-size: 14px 14px;
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
  stroke: var(--border-color);
  stroke-width: 1.5;
}
.graph-bullet {
  fill: var(--text-secondary);
}

/* ── Nodes (shared) ── */
.graph-node {
  position: absolute;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  /* border-radius: 4px; */
  /* box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); */
  overflow: hidden;
}

/* ── Root node special styling ── */
.root-node {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.card-row {
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  cursor: pointer;
  /* border-bottom: 1px solid var(--border-color); */
}
.card-row:last-child { border-bottom: none; }
.card-row--array {
  padding: 0 6px !important;
  gap: 4px !important;
}

.card-key {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--json-key);
  min-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-key--index {
  color: #0000004d;
  font-weight: normal;
  min-width: auto !important;
}
.dark-mode .card-key--index {
  color: rgba(255, 255, 255, 0.3);
}
.card-row--array .card-key,
.card-row--array .val-text {
  color: #0000004d !important;
}
.dark-mode .card-row--array .card-key,
.dark-mode .card-row--array .val-text {
  color: rgba(255, 255, 255, 0.3) !important;
}
.root-key--complex {
  font-weight: 600;
}
.card-val {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.val-text {
  display: inline-block;
  max-width: 100%;
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
.card-row {
  transition: background-color 0.15s ease;
}
.card-row.is-hovered {
  background-color: rgba(249, 115, 22, 0.12);
}
.dark-mode .card-row.is-hovered {
  background-color: rgba(249, 115, 22, 0.22);
}

.graph-edge {
  transition: stroke 0.15s ease, stroke-width 0.15s ease, filter 0.15s ease;
}
.graph-edge.is-hovered {
  stroke: var(--json-key) !important;
  stroke-width: 2.5 !important;
  filter: drop-shadow(0 0 2.5px var(--json-key));
}

.graph-bullet {
  transition: fill 0.15s ease, r 0.15s ease;
}
.graph-bullet.is-hovered {
  fill: var(--json-key) !important;
  r: 6px !important;
}

.graph-node {
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.graph-node.is-hovered {
  border-color: var(--json-key);
  /* box-shadow: 0 0 10px var(--json-hover-bg); */
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
</style>
