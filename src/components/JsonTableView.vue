<script setup>
import { ref, computed, watch, inject } from 'vue'

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
// absent from set = expanded (default); present = collapsed
const collapsedPaths = ref(new Set())

const toggleExpandPath = (path) => {
  const pathStr = JSON.stringify(path)
  if (collapsedPaths.value.has(pathStr)) {
    collapsedPaths.value.delete(pathStr)
  } else {
    collapsedPaths.value.add(pathStr)
  }
}

const isPathExpanded = (path) => {
  return !collapsedPaths.value.has(JSON.stringify(path))
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
            v-html="highlightText(row.rootKey, searchQuery)"
          >
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
              v-html="highlightText(row.subKey, searchQuery)"
            >
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
              <span v-if="isPrimitive(row.rawVal)" :class="getValueColorClass(row.valueType)" v-html="highlightText(row.value, searchQuery)">
              </span>
              
              <!-- Complex sub-value (with expand/collapse) -->
              <div v-else class="complex-cell-container">
                <button 
                  class="toggle-btn" 
                  @click.stop="toggleExpandPath(getCellPath(row))"
                  :title="isPathExpanded(getCellPath(row)) ? '收起子层级' : '展开子层级'"
                >
                  <span class="toggle-icon">{{ isPathExpanded(getCellPath(row)) ? '▼' : '▶' }}</span>
                  <span class="preview-text" v-html="highlightText(row.value, searchQuery)"></span>
                </button>
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
              <span v-if="isPrimitive(row.rawVal)" :class="getValueColorClass(row.valueType)" v-html="highlightText(row.value, searchQuery)">
              </span>

              <!-- Complex root value (e.g. empty object/array) -->
              <div v-else class="complex-cell-container">
                <button 
                  class="toggle-btn" 
                  @click.stop="toggleExpandPath(getCellPath(row))"
                  :title="isPathExpanded(getCellPath(row)) ? '收起子层级' : '展开子层级'"
                >
                  <span class="toggle-icon">{{ isPathExpanded(getCellPath(row)) ? '▼' : '▶' }}</span>
                  <span class="preview-text" v-html="highlightText(row.value, searchQuery)"></span>
                </button>
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
            v-html="highlightText(entry.key, searchQuery)"
          >
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
            <span v-if="isPrimitive(entry.value)" :class="getValueColorClass(getValueType(entry.value))" v-html="highlightText(getPreview(entry.value), searchQuery)">
            </span>

            <!-- Complex nested value -->
            <div v-else class="complex-cell-container">
              <button 
                class="toggle-btn" 
                @click.stop="toggleExpandPath(getNestedCellPath(entry.key, entry.isIndex))"
                :title="isPathExpanded(getNestedCellPath(entry.key, entry.isIndex)) ? '收起子层级' : '展开子层级'"
              >
                <span class="toggle-icon">{{ isPathExpanded(getNestedCellPath(entry.key, entry.isIndex)) ? '▼' : '▶' }}</span>
                <span class="preview-text" v-html="highlightText(getPreview(entry.value), searchQuery)"></span>
              </button>
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
  min-width: 110px;
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
  min-width: 80px;
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
  min-width: 80px;
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
  align-items: stretch;
  width: 100%;
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
</style>
