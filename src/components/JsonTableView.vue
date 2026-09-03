<script setup>
import { ref, computed, watch, inject } from 'vue'
import { ExternalLink, Copy } from 'lucide-vue-next'
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

const handleCopySubtree = (val) => {
  if (val === null || val === undefined) return
  const jsonStr = safeStringify(val, null, 2)
  navigator.clipboard.writeText(jsonStr).then(() => {
    if (showToast) {
      showToast('已复制子树 JSON')
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
  data: { required: true },
  depth: { type: Number, default: 0 },
  hoveredPath: { type: Array, default: null },
  pathPrefix: { type: Array, default: () => [] }
})

const emit = defineEmits(['hover-path'])

const isPrimitive = (v) => v === null || typeof v !== 'object'

const getValueType = (v) => {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number' || typeof v === 'bigint') return 'number'
  if (typeof v === 'string') return 'string'
  return 'object'
}

const getPreview = (v) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `[${v.length} 项]`
  if (typeof v === 'object') return `{${Object.keys(v).length} 属性}`
  if (typeof v === 'string') return v
  return String(v)
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
// Individual user toggles on specific rows: pathStr -> boolean
const userToggledPaths = ref(new Map())

watch(treeExpanded, () => {
  // When global toggle is clicked, reset individual overrides
  userToggledPaths.value.clear()
})

const toggleExpandPath = (path) => {
  const pathStr = JSON.stringify(path)
  const currentlyExpanded = isPathExpanded(path)
  userToggledPaths.value.set(pathStr, !currentlyExpanded)
}

const isPathExpanded = (path) => {
  const pathStr = JSON.stringify(path)
  if (userToggledPaths.value.has(pathStr)) {
    return userToggledPaths.value.get(pathStr)
  }
  return treeExpanded.value
}

// ─── Main flat 3-column table computations (depth === 0) ──────────────────────
const tableRows = computed(() => {
  const obj = props.data
  if (!obj || typeof obj !== 'object') return []

  const rows = []
  const isArray = Array.isArray(obj)
  const rootEntries = isArray
    ? obj.map((v, i) => [String(i), v, true])
    : Object.keys(obj).map(k => [k, obj[k], false])

  for (const [rootKey, rootVal, rootIsIndex] of rootEntries) {
    if (isPrimitive(rootVal)) {
      // Primitive at root level — spans sub-key + value columns
      rows.push({
        rootKey,
        rootIsIndex,
        rootSpan: 1,
        isRootFirst: true,
        subKey: null,
        subIsIndex: false,
        rawVal: rootVal,
        value: getPreview(rootVal),
        valueType: getValueType(rootVal),
        valueColspan: 2
      })
    } else {
      const subIsArray = Array.isArray(rootVal)
      const subEntries = subIsArray
        ? rootVal.map((v, i) => [String(i), v, true])
        : Object.keys(rootVal).map(k => [k, rootVal[k], false])

      if (subEntries.length === 0) {
        rows.push({
          rootKey, rootIsIndex, rootSpan: 1, isRootFirst: true,
          subKey: null, subIsIndex: false,
          rawVal: rootVal,
          value: subIsArray ? '(空数组)' : '(空对象)',
          valueType: 'object', valueColspan: 2
        })
        continue
      }

      subEntries.forEach(([subKey, subVal, subIsIndex], idx) => {
        rows.push({
          rootKey, rootIsIndex,
          rootSpan: subEntries.length,
          isRootFirst: idx === 0,
          subKey,
          subIsIndex,
          rawVal: subVal,
          value: getPreview(subVal),
          valueType: getValueType(subVal),
          valueColspan: 1
        })
      })
    }
  }

  return rows
})

// ─── Nested 2-column table entries computation (depth > 0) ───────────────────
const entries = computed(() => {
  const obj = props.data
  if (!obj || typeof obj !== 'object') return []
  
  const isArray = Array.isArray(obj)
  return isArray
    ? obj.map((v, i) => ({ key: String(i), value: v, isIndex: true }))
    : Object.keys(obj).map(k => ({ key: k, value: obj[k], isIndex: false }))
})

// ─── Path resolution & Hover synchronization helpers ─────────────────────────
const getCellPath = (row) => {
  const rootPart = row.rootIsIndex ? Number(row.rootKey) : row.rootKey
  if (row.subKey === null) {
    return [rootPart]
  }
  const subPart = row.subIsIndex ? Number(row.subKey) : row.subKey
  return [rootPart, subPart]
}

const getNestedCellPath = (key, isIndex) => {
  const parsedKey = isIndex ? Number(key) : key
  return [...props.pathPrefix, parsedKey]
}

const isPathHovered = (path) => {
  if (!props.hoveredPath || props.hoveredPath.length !== path.length) return false
  return path.every((v, i) => v === props.hoveredPath[i])
}

const emitHover = (path) => {
  emit('hover-path', path)
}

const handleChildHover = (path) => {
  emit('hover-path', path)
}

const getValTooltip = (val) => {
  if (isImg(val)) {
    return '悬停预览图片，点击复制键值'
  }
  if (isHttpLink(val)) {
    return '点击复制键值，点击左侧图标可直接打开'
  }
  return '点击复制键值'
}
</script>

<template>
  <div class="table-view-wrapper" :class="{ 'nested-wrapper': depth > 0 }">
    <!-- Depth 0: Main 3-column rowspan table -->
    <table v-if="depth === 0" class="json-table">
      <tbody>
        <tr v-for="(row, idx) in tableRows" :key="idx" class="json-table-row">
          <!-- Root key cell -->
          <td
            v-if="row.isRootFirst"
            :rowspan="row.rootSpan"
            class="root-key-cell"
            :class="{ 
              'root-index-cell': row.rootIsIndex,
              'is-hovered': isPathHovered([row.rootIsIndex ? Number(row.rootKey) : row.rootKey])
            }"
            @mouseenter="emitHover([row.rootIsIndex ? Number(row.rootKey) : row.rootKey])"
            @mouseleave="emitHover(null)"
            @click.stop="handleCopyKey(row.rootKey)"
          >
            <span class="table-key-text" data-tooltip="点击复制键名" v-html="highlightText(row.rootKey, searchQuery)"></span>
          </td>

          <!-- Sub-key cell and value cell -->
          <template v-if="row.subKey !== null">
            <td 
              class="sub-key-cell" 
              :class="{ 
                'sub-index-cell': row.subIsIndex,
                'is-hovered': isPathHovered(getCellPath(row))
              }"
              @mouseenter="emitHover(getCellPath(row))"
              @mouseleave="emitHover(null)"
              @click.stop="handleCopyKey(row.subKey)"
            >
              <span class="table-key-text" data-tooltip="点击复制键名" v-html="highlightText(row.subKey, searchQuery)"></span>
            </td>
            
            <td 
              class="value-cell" 
              :class="{
                [`val-${row.valueType}`]: true,
                'is-hovered': isPathHovered(getCellPath(row)),
                'value-cell--complex': !isPrimitive(row.rawVal)
              }"
              @mouseenter="emitHover(getCellPath(row))"
              @mouseleave="emitHover(null)"
            >
              <!-- Primitive sub-value -->
              <template v-if="isPrimitive(row.rawVal)">
                <div class="val-primitive-wrap">
                  <span v-if="isImg(row.rawVal)" class="table-img-badge" @mouseenter="(e) => onValMouseEnter(row.rawVal, e)" @mouseleave="() => onValMouseLeave(row.rawVal)" data-tooltip="图片链接 (悬停预览)">🖼️</span>
                  <button
                    v-else-if="isHttpLink(row.rawVal)"
                    class="url-jump-btn"
                    @click.stop="handleOpenUrl(row.rawVal)"
                    data-tooltip="在浏览器中直接打开链接"
                  >
                    <ExternalLink class="url-jump-icon" />
                  </button>
                  <span
                    :class="[getValueColorClass(row.valueType), 'copyable-val', { 'is-image-url': isImg(row.rawVal), 'is-web-url': isHttpLink(row.rawVal) }]"
                    @mouseenter="(e) => onValMouseEnter(row.rawVal, e)"
                    @mouseleave="() => onValMouseLeave(row.rawVal)"
                    @click.stop="handleCopyValue(row.rawVal)"
                    :data-tooltip="getValTooltip(row.rawVal)"
                    v-html="highlightText(row.value, searchQuery)"
                  ></span>
                </div>
              </template>
              
              <!-- Complex sub-value (with expand/collapse and copy subtree) -->
              <div v-else class="complex-cell-container">
                <div class="complex-header-row">
                  <button 
                    class="toggle-btn" 
                    @click.stop="toggleExpandPath(getCellPath(row))"
                    :data-tooltip="isPathExpanded(getCellPath(row)) ? '收起子层级' : '展开子层级'"
                  >
                    <span class="toggle-icon">{{ isPathExpanded(getCellPath(row)) ? '▼' : '▶' }}</span>
                    <span class="preview-text" v-html="highlightText(row.value, searchQuery)"></span>
                  </button>
                  <button
                    class="copy-subtree-btn"
                    @click.stop="handleCopySubtree(row.rawVal)"
                    data-tooltip="点击复制子树 JSON"
                  >
                    <Copy class="copy-subtree-icon" />
                  </button>
                </div>
                <div v-if="isPathExpanded(getCellPath(row))" class="nested-table-container">
                  <JsonTableView
                    :data="row.rawVal"
                    :depth="depth + 1"
                    :hoveredPath="hoveredPath"
                    :pathPrefix="getCellPath(row)"
                    @hover-path="handleChildHover"
                  />
                </div>
              </div>
            </td>
          </template>

          <template v-else>
            <!-- Primitive root value spans sub-key + value columns -->
            <td 
              colspan="2" 
              class="value-cell" 
              :class="{
                [`val-${row.valueType}`]: true,
                'is-hovered': isPathHovered(getCellPath(row)),
                'value-cell--complex': !isPrimitive(row.rawVal)
              }"
              @mouseenter="emitHover(getCellPath(row))"
              @mouseleave="emitHover(null)"
            >
              <!-- Primitive root value -->
              <template v-if="isPrimitive(row.rawVal)">
                <div class="val-primitive-wrap">
                  <span v-if="isImg(row.rawVal)" class="table-img-badge" @mouseenter="(e) => onValMouseEnter(row.rawVal, e)" @mouseleave="() => onValMouseLeave(row.rawVal)" data-tooltip="图片链接 (悬停预览)">🖼️</span>
                  <button
                    v-else-if="isHttpLink(row.rawVal)"
                    class="url-jump-btn"
                    @click.stop="handleOpenUrl(row.rawVal)"
                    data-tooltip="在浏览器中直接打开链接"
                  >
                    <ExternalLink class="url-jump-icon" />
                  </button>
                  <span
                    :class="[getValueColorClass(row.valueType), 'copyable-val', { 'is-image-url': isImg(row.rawVal), 'is-web-url': isHttpLink(row.rawVal) }]"
                    @mouseenter="(e) => onValMouseEnter(row.rawVal, e)"
                    @mouseleave="() => onValMouseLeave(row.rawVal)"
                    @click.stop="handleCopyValue(row.rawVal)"
                    :data-tooltip="getValTooltip(row.rawVal)"
                    v-html="highlightText(row.value, searchQuery)"
                  ></span>
                </div>
              </template>

              <!-- Complex root value (e.g. empty object/array) -->
              <div v-else class="complex-cell-container">
                <div class="complex-header-row">
                  <button 
                    class="toggle-btn" 
                    @click.stop="toggleExpandPath(getCellPath(row))"
                    :data-tooltip="isPathExpanded(getCellPath(row)) ? '收起子层级' : '展开子层级'"
                  >
                    <span class="toggle-icon">{{ isPathExpanded(getCellPath(row)) ? '▼' : '▶' }}</span>
                    <span class="preview-text" v-html="highlightText(row.value, searchQuery)"></span>
                  </button>
                  <button
                    class="copy-subtree-btn"
                    @click.stop="handleCopySubtree(row.rawVal)"
                    data-tooltip="点击复制子树 JSON"
                  >
                    <Copy class="copy-subtree-icon" />
                  </button>
                </div>
                <div v-if="isPathExpanded(getCellPath(row))" class="nested-table-container">
                  <JsonTableView
                    :data="row.rawVal"
                    :depth="depth + 1"
                    :hoveredPath="hoveredPath"
                    :pathPrefix="getCellPath(row)"
                    @hover-path="handleChildHover"
                  />
                </div>
              </div>
            </td>
          </template>
        </tr>
      </tbody>
    </table>

    <!-- Depth > 0: Nested 2-column table inside parent cells -->
    <table v-else class="json-table nested-table">
      <tbody>
        <tr v-for="entry in entries" :key="entry.key" class="json-table-row">
          <!-- Key column -->
          <td 
            class="nested-key-cell"
            :class="{
              'index-cell': entry.isIndex,
              'is-hovered': isPathHovered(getNestedCellPath(entry.key, entry.isIndex))
            }"
            @mouseenter="emitHover(getNestedCellPath(entry.key, entry.isIndex))"
            @mouseleave="emitHover(null)"
            @click.stop="handleCopyKey(entry.key)"
          >
            <span class="table-key-text" data-tooltip="点击复制键名" v-html="highlightText(entry.key, searchQuery)"></span>
          </td>

          <!-- Value column -->
          <td 
            class="value-cell" 
            :class="{
              [`val-${getValueType(entry.value)}`]: true,
              'is-hovered': isPathHovered(getNestedCellPath(entry.key, entry.isIndex)),
              'value-cell--complex': !isPrimitive(entry.value)
            }"
            @mouseenter="emitHover(getNestedCellPath(entry.key, entry.isIndex))"
            @mouseleave="emitHover(null)"
          >
            <!-- Primitive nested value -->
            <template v-if="isPrimitive(entry.value)">
              <div class="val-primitive-wrap">
                <span v-if="isImg(entry.value)" class="table-img-badge" @mouseenter="(e) => onValMouseEnter(entry.value, e)" @mouseleave="() => onValMouseLeave(entry.value)" data-tooltip="图片链接 (悬停预览)">🖼️</span>
                <button
                  v-else-if="isHttpLink(entry.value)"
                  class="url-jump-btn"
                  @click.stop="handleOpenUrl(entry.value)"
                  data-tooltip="在浏览器中直接打开链接"
                >
                  <ExternalLink class="url-jump-icon" />
                </button>
                <span
                  :class="[getValueColorClass(getValueType(entry.value)), 'copyable-val', { 'is-image-url': isImg(entry.value), 'is-web-url': isHttpLink(entry.value) }]"
                  @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                  @mouseleave="() => onValMouseLeave(entry.value)"
                  @click.stop="handleCopyValue(entry.value)"
                  :data-tooltip="getValTooltip(entry.value)"
                  v-html="highlightText(getPreview(entry.value), searchQuery)"
                ></span>
              </div>
            </template>

            <!-- Complex nested value -->
            <div v-else class="complex-cell-container">
              <div class="complex-header-row">
                <button 
                  class="toggle-btn" 
                  @click.stop="toggleExpandPath(getNestedCellPath(entry.key, entry.isIndex))"
                  :data-tooltip="isPathExpanded(getNestedCellPath(entry.key, entry.isIndex)) ? '收起子层级' : '展开子层级'"
                >
                  <span class="toggle-icon">{{ isPathExpanded(getNestedCellPath(entry.key, entry.isIndex)) ? '▼' : '▶' }}</span>
                  <span class="preview-text" v-html="highlightText(getPreview(entry.value), searchQuery)"></span>
                </button>
                <button
                  class="copy-subtree-btn"
                  @click.stop="handleCopySubtree(entry.value)"
                  data-tooltip="点击复制子树 JSON"
                >
                  <Copy class="copy-subtree-icon" />
                </button>
              </div>
              <div v-if="isPathExpanded(getNestedCellPath(entry.key, entry.isIndex))" class="nested-table-container">
                <JsonTableView
                  :data="entry.value"
                  :depth="depth + 1"
                  :hoveredPath="hoveredPath"
                  :pathPrefix="getNestedCellPath(entry.key, entry.isIndex)"
                  @hover-path="handleChildHover"
                />
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-view-wrapper {
  flex: 1;
  overflow: auto;
  padding: 16px;
  background: var(--bg-panel);
}

.table-view-wrapper.nested-wrapper {
  padding: 0; /* No outer padding for nested tables to save space */
  background: transparent;
  width: 100%;
}

.json-table {
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 13px;
  min-width: 100%;
  border: 1px solid var(--border-color);
}

.json-table.nested-table {
  border: none;
  margin-top: 4px;
  margin-left: 4px;
  width: calc(100% - 4px);
  background: transparent;
}

:global(.dark-mode) .json-table.nested-table {
  background: transparent;
}

.json-table-row {
  border-bottom: 1px solid var(--border-color);
}
.json-table-row:last-child {
  border-bottom: none;
}

.root-key-cell {
  background: var(--table-root-bg);
  color: var(--table-root-fg);
  font-weight: 600;
  padding: 6px 12px;
  border-right: 1px solid var(--border-color);
  vertical-align: top;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 110px;
  max-width: 300px;
  width: 1%;
  font-family: var(--font-sans);
  letter-spacing: 0.01em;
  transition: background-color 0.15s, color 0.15s;
}

.index-cell {
  font-family: var(--font-mono);
  color: var(--json-number);
}

/* Nested Key Cell (smaller padding, cleaner border structure) */
.nested-key-cell {
  background: transparent;
  color: var(--table-subkey-fg);
  font-weight: 600;
  padding: 4px 8px;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  vertical-align: top;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 80px;
  max-width: 300px;
  width: 1%;
  font-family: var(--font-sans);
  transition: background-color 0.15s, color 0.15s;
}

/* Remove bottom border on the last row of nested table key */
.nested-table tr:last-child .nested-key-cell {
  border-bottom: none;
}

.sub-key-cell {
  color: var(--table-subkey-fg);
  font-weight: 500;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 80px;
  max-width: 300px;
  width: 1%;
  background: var(--bg-panel);
  font-family: var(--font-sans);
  transition: background-color 0.15s, color 0.15s;
}

.sub-index-cell {
  font-family: var(--font-mono);
  color: var(--json-number);
  font-weight: 600;
}

.table-key-text {
  display: inline-block;
  cursor: pointer;
  transition: opacity 0.15s ease, text-decoration 0.15s ease;
}

.table-key-text:hover {
  text-decoration: underline;
  opacity: 0.85;
}

/* Value column */
.value-cell {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  font-family: var(--font-mono);
  font-size: 13px;
  min-width: 160px;
  vertical-align: top;
  transition: background-color 0.15s, box-shadow 0.15s;
}

/* Special styling for nested table values (smaller padding, no right/bottom borders unless internal) */
.nested-table .value-cell {
  padding: 4px 8px;
  background: transparent;
  border-right: none;
  border-top: none;
  border-left: none;
  border-bottom: 1px solid var(--border-color);
}

/* Remove bottom border on the last row of nested table value */
.nested-table tr:last-child .value-cell {
  border-bottom: none;
}

/* Complex value cell: zero side and bottom padding so nested table fits edge-to-edge */
.value-cell.value-cell--complex {
  padding: 4px 0 0 0 !important;
}

.complex-cell-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.complex-header-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.copy-subtree-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
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
  width: 12px;
  height: 12px;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 11px;
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 6px;
  transition: background-color 0.15s, color 0.15s;
  margin-left: 4px; /* Pad the button back to line up with text */
  margin-bottom: 2px;
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
  font-size: 11px;
}

.nested-table-container {
  width: 100%;
  margin-top: 4px;
}

.val-string, .tree-string  { color: var(--json-string); }
.val-number, .tree-number  { color: var(--json-number); font-weight: 600; }
.val-boolean, .tree-boolean { color: var(--json-boolean); font-weight: 600; }
.val-null, .tree-null    { color: var(--json-null); }
.val-object  { color: var(--text-secondary); font-family: var(--font-sans); }

/* Hover active path highlights */
.root-key-cell.is-hovered,
.sub-key-cell.is-hovered,
.nested-key-cell.is-hovered {
  background-color: var(--json-hover-bg) !important;
  color: var(--json-key) !important;
}

.value-cell.is-hovered {
  background-color: var(--json-hover-bg) !important;
  box-shadow: inset 0 0 0 1px var(--json-key);
}

.is-image-url {
  text-decoration: underline dotted var(--accent-color, #6366f1) !important;
  text-underline-offset: 3px;
  cursor: pointer;
}

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
  max-width: 360px;
  display: inline-block;
  vertical-align: middle;
}

.copyable-val:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.root-key-cell, .sub-key-cell, .nested-key-cell {
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.root-key-cell:hover, .sub-key-cell:hover, .nested-key-cell:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.table-img-badge {
  font-size: 13px;
  margin-right: 4px;
  margin-left: 1px;
  cursor: pointer;
  vertical-align: middle;
  opacity: 0.9;
  transition: transform 0.15s ease, opacity 0.15s ease;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.table-img-badge:hover {
  transform: scale(1.2);
  opacity: 1;
}

.is-web-url {
  text-decoration: underline dotted var(--text-secondary, #9ca3af) !important;
  text-underline-offset: 3px;
}

.url-jump-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  margin-right: 4px;
  margin-left: 1px;
  padding: 0;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 4px;
  color: var(--accent-color, #6366f1);
  cursor: pointer;
  opacity: 0.9;
  vertical-align: middle;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.url-jump-btn:hover {
  background: var(--accent-color, #6366f1);
  color: #ffffff;
  opacity: 1;
  transform: scale(1.15);
}

.url-jump-icon {
  width: 11px;
  height: 11px;
}
</style>
