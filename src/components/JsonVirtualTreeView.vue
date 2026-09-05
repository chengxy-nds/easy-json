<script setup>
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-vue-next'
import { safeStringify } from '../utils/jsonBigInt.js'
import { isImageUrl, isHttpUrl, openExternalUrl } from '../utils/imageDetector.js'

const props = defineProps({
  data: {
    required: true
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

const emit = defineEmits(['scroll', 'hover-path', 'click-path'])

// Injected properties
const treeExpanded = inject('treeExpanded', ref(true))
const showToast = inject('showToast', (msg) => console.log(msg))
const searchQuery = inject('searchQuery', ref(''))
const setHoveredPath = inject('setHoveredPath', null)
const setSelectedPath = inject('setSelectedPath', null)
const imagePreview = inject('imagePreview', null)

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
    expandedKeys.value.add('root')
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

const toggleNode = (id, depth) => {
  if (treeExpanded.value) {
    if (collapsedKeys.value.has(id)) {
      collapsedKeys.value.delete(id)
    } else {
      collapsedKeys.value.add(id)
    }
  } else {
    if (expandedKeys.value.has(id)) {
      expandedKeys.value.delete(id)
    } else {
      expandedKeys.value.add(id)
    }
  }
}

// Tree Flattening Engine: converts arbitrary nested JSON into a 1D flat list of visible rows
const flatRows = computed(() => {
  const rootData = props.data
  if (rootData === undefined) return []

  const rows = []

  const traverse = (val, name, path, depth, isLast) => {
    const id = getPathId(path)
    const isObj = val !== null && typeof val === 'object'
    const isArr = Array.isArray(val)

    if (isObj) {
      const isExpanded = isNodeExpanded(id, depth)
      const keys = isArr ? null : Object.keys(val)
      const childCount = isArr ? val.length : keys.length

      // Opening bracket row
      rows.push({
        id,
        path,
        depth,
        name,
        value: val,
        type: isArr ? 'array' : 'object',
        isExpanded,
        childCount,
        isLast
      })

      if (isExpanded) {
        if (isArr) {
          for (let i = 0; i < val.length; i++) {
            traverse(val[i], undefined, [...path, i], depth + 1, i === val.length - 1)
          }
        } else {
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i]
            traverse(val[k], k, [...path, k], depth + 1, i === keys.length - 1)
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
      // Primitive value row
      const isImg = typeof val === 'string' && isImageUrl(val)
      const isUrl = typeof val === 'string' && !isImg && isHttpUrl(val)

      let valClass = ''
      if (typeof val === 'string') valClass = 'tree-string'
      else if (typeof val === 'number' || typeof val === 'bigint') valClass = 'tree-number'
      else if (typeof val === 'boolean') valClass = 'tree-boolean'
      else if (val === null) valClass = 'tree-null'

      rows.push({
        id,
        path,
        depth,
        name,
        value: val,
        type: 'primitive',
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

// Dynamic row height map for wrap mode
const rowHeightMap = ref(new Map())
const maxLineWidth = ref(800)

const updateDimensions = () => {
  if (containerRef.value) {
    viewportHeight.value = containerRef.value.clientHeight || 600
    containerWidth.value = containerRef.value.clientWidth || 800
    recalculateMaxLineWidth()
  }
}

const recalculateMaxLineWidth = () => {
  if (isWrap.value) {
    maxLineWidth.value = containerWidth.value
    return
  }
  let maxW = containerWidth.value
  const rows = flatRows.value
  const fontSize = Number(editorFontSize.value) || 13
  const charWidth = fontSize * 0.62

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const depthW = r.depth * 18 + 48
    const nameW = r.name ? String(r.name).length * charWidth + 20 : 0
    let valW = 0
    if (r.value !== null && r.value !== undefined) {
      valW = String(r.value).length * charWidth + 24
    } else if (r.type === 'object' || r.type === 'array') {
      valW = 120
    }
    const totalW = depthW + nameW + valW + 40
    if (totalW > maxW) maxW = totalW
  }
  maxLineWidth.value = Math.ceil(maxW)
}

watch([flatRows, isWrap, editorFontSize], () => {
  rowHeightMap.value.clear()
  recalculateMaxLineWidth()
})

const onScroll = (e) => {
  scrollTop.value = e.target.scrollTop
  emit('scroll', e)
}

// Estimate height for unmeasured rows in wrap mode
const estimateRowHeight = (row) => {
  const lh = editorLineHeight.value
  if (!isWrap.value) return lh

  if (row.type === 'primitive') {
    const fontSize = Number(editorFontSize.value) || 13
    const charWidth = fontSize * 0.62
    const nameLen = row.name ? String(row.name).length + 3 : 0
    const valLen = row.value !== null && row.value !== undefined ? String(row.value).length + 2 : 4
    const totalLen = nameLen + valLen
    const availWidth = Math.max(120, containerWidth.value - (row.depth * 18 + 50))
    const charsPerLine = Math.max(12, Math.floor(availWidth / charWidth))
    const lines = Math.max(1, Math.ceil(totalLen / charsPerLine))
    return lines * lh
  }
  return lh
}

// Prefix sum of row offsets for variable row height support in wrap mode
const rowOffsets = computed(() => {
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

  const map = rowHeightMap.value
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

const visibleRows = computed(() => {
  const offsets = rowOffsets.value
  return flatRows.value.slice(startIndex.value, endIndex.value).map((row, idx) => {
    const actualIdx = startIndex.value + idx
    return {
      ...row,
      actualIndex: actualIdx,
      topPosition: offsets[actualIdx]
    }
  })
})

// Update measured heights when DOM renders rows in wrap mode
const rowElementMap = new Map()

const setRowElement = (id, el) => {
  if (el) {
    rowElementMap.set(id, el)
    if (isWrap.value) {
      const h = el.offsetHeight
      if (h > 0 && h !== rowHeightMap.value.get(id)) {
        rowHeightMap.value.set(id, h)
      }
    } else {
      const w = el.scrollWidth + 30
      if (w > maxLineWidth.value) {
        maxLineWidth.value = w
      }
    }
  } else {
    rowElementMap.delete(id)
  }
}

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
  if (typeof val === 'string') return `"${val}"`
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
    setSelectedPath(path)
  }
  navigator.clipboard.writeText(String(name)).then(() => {
    if (showToast) {
      showToast(`已复制键名: ${name}`)
    }
  })
}

const handleCopyValue = (val, path) => {
  if (setSelectedPath && path) {
    setSelectedPath(path)
  }
  let text = ''
  if (typeof val === 'object' && val !== null) {
    text = safeStringify(val, null, 2)
  } else {
    text = typeof val === 'string' ? val : String(val ?? '')
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

const onValMouseEnter = (v, e) => {
  if (typeof v === 'string' && isImageUrl(v) && imagePreview) {
    imagePreview.show(v, e.currentTarget)
  }
}

const onValMouseLeave = (v) => {
  if (typeof v === 'string' && isImageUrl(v) && imagePreview) {
    imagePreview.hide()
  }
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
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
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
        :ref="(el) => setRowElement(row.id, el)"
        class="virtual-tree-row"
        :style="{
          top: `${row.topPosition}px`,
          height: isWrap ? 'auto' : `${editorLineHeight}px`,
          minHeight: `${editorLineHeight}px`,
          lineHeight: `${editorLineHeight}px`,
          width: isWrap ? '100%' : `${maxLineWidth}px`,
          minWidth: isWrap ? '100%' : `${maxLineWidth}px`,
          paddingLeft: `${row.depth * 18 + 26}px`
        }"
      >
        <!-- Vertical Tree Indentation Guide Lines (层级竖线) -->
        <div
          v-for="lvl in row.depth"
          :key="lvl"
          class="tree-indent-guide"
          :style="{ left: `${(lvl - 1) * 18 + 15}px` }"
        ></div>

        <!-- Object / Array Opening Header Row -->
        <template v-if="row.type === 'object' || row.type === 'array'">
          <div
            class="node-header expandable"
            @click="toggleNode(row.id, row.depth); onKeyClick(row.path)"
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
            <span v-if="row.name !== undefined && row.name !== null" class="node-colon">: </span>

            <span
              class="node-bracket"
              @click.stop="handleCopyValue(row.value, row.path)"
              data-tooltip="点击复制子树 JSON"
            >{{ row.type === 'array' ? '[' : '{' }}</span>

            <!-- Collapsed Summary -->
            <span
              v-if="!row.isExpanded"
              class="node-collapsed-summary"
              @click.stop="handleCopyValue(row.value, row.path)"
              data-tooltip="点击复制子树 JSON"
            >
              {{ row.type === 'array' ? `Array(${row.childCount})` : `Object(${row.childCount})` }}
              <span class="node-bracket">{{ row.type === 'array' ? ']' : '}' }}</span>
              <span v-if="!row.isLast" class="node-comma">,</span>
            </span>
          </div>
        </template>

        <!-- Closing Bracket Row -->
        <template v-else-if="row.type === 'closing'">
          <div class="node-closing">
            <span class="icon-spacer"></span>
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
            <span v-if="row.name !== undefined && row.name !== null" class="node-colon">: </span>

            <!-- Image preview badge / URL open button -->
            <span
              v-if="row.isImageValue"
              class="tree-img-badge"
              @mouseenter="onValMouseEnter(row.value, $event)"
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

            <!-- Value Text -->
            <span
              :class="[row.valueClass, 'copyable-value', { 'is-image-url': row.isImageValue, 'is-web-url': row.isOtherUrlValue }]"
              @click.stop="handleCopyValue(row.value, row.path)"
              @mouseenter="onValMouseEnter(row.value, $event)"
              @mouseleave="onValMouseLeave(row.value)"
              :data-tooltip="row.isImageValue ? '悬停预览图片，点击复制键值' : (row.isOtherUrlValue ? '点击复制键值，点击左侧图标可直接打开' : '点击复制键值')"
              v-html="highlightPrimitiveValue(row.value)"
            ></span>
            <span v-if="!row.isLast" class="node-comma">,</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-virtual-tree-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
  box-sizing: border-box;
  padding: 4px;
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
  padding: 0 4px;
  user-select: none;
}
.node-header:hover {
  background-color: var(--border-color, rgba(255, 255, 255, 0.08));
}

.node-closing,
.node-primitive {
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
}

.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: -18px;
  margin-right: 4px;
  color: var(--text-muted, #94a3b8);
  flex-shrink: 0;
}

.icon-spacer {
  display: inline-block;
  width: 18px;
  margin-left: -18px;
  flex-shrink: 0;
}

.toggle-icon {
  width: 12px;
  height: 12px;
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
  background-color: var(--bg-app, rgba(255, 255, 255, 0.06));
  color: var(--text-muted, #94a3b8);
  font-size: 0.9em;
  padding: 0 5px;
  border-radius: 3px;
  margin-left: 6px;
  cursor: pointer;
}
.node-collapsed-summary:hover {
  background-color: var(--bg-hover, rgba(255, 255, 255, 0.1));
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

.tree-img-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
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
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: none;
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
