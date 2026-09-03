<script setup>
import { ref, computed, watch, inject } from 'vue'
import { ExternalLink, Copy, Image as ImageIcon } from 'lucide-vue-next'
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
    text = typeof val === 'string' ? val : String(val ?? '')
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
  data: { required: true },
  depth: { type: Number, default: 0 },
  hoveredPath: { type: Array, default: null },
  selectedPath: { type: Array, default: null },
  pathPrefix: { type: Array, default: () => [] }
})

const emit = defineEmits(['hover-path', 'click-path'])

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
const injectedSelectedPath = inject('selectedPath', ref(null))
const currentSelectedPath = computed(() => props.selectedPath || injectedSelectedPath.value)
const userToggledPaths = ref(new Map())

watch(treeExpanded, () => {
  userToggledPaths.value.clear()
})

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

  // 视口垂直平滑居中锚点
  setTimeout(() => {
    const wrapper = document.querySelector('.table-view-wrapper')
    if (!wrapper) return
    const targetStr = JSON.stringify(newPath)
    let targetEl = wrapper.querySelector(`[data-path='${targetStr}']`)
    if (!targetEl) {
      for (let i = newPath.length - 1; i >= 1; i--) {
        const prefixStr = JSON.stringify(newPath.slice(0, i))
        targetEl = wrapper.querySelector(`[data-path='${prefixStr}']`)
        if (targetEl) break
      }
    }
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }
  }, 40)
}, { immediate: true, deep: true })

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

// ─── Path resolution & Hover/Select synchronization helpers ───────────────────
const getFullPath = (subPath) => {
  return [...props.pathPrefix, ...subPath]
}

const isPathSelected = (path) => {
  const target = getFullPath(path)
  const cur = currentSelectedPath.value
  if (!cur || target.length === 0 || target.length > cur.length) return false
  return target.every((v, i) => String(v) === String(cur[i]))
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

const emitClick = (path) => {
  emit('click-path', path ? getFullPath(path) : null)
}

const handleChildClick = (path) => {
  emit('click-path', path)
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

// ─── Helper: 从对象数组中收集全部唯一属性名 ────────────────────────────────────
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

// ─── 判断是否为对象数组 ────────────────────────────────────────────────────────
const isArrayOfObjects = (arr) => {
  return Array.isArray(arr) && arr.length > 0 && arr.some(item => item && typeof item === 'object' && !Array.isArray(item))
}

// ─── 判断根数据是否为顶层直接对象数组 ──────────────────────────────────────────
const isRootDirectArrayOfObjects = computed(() => {
  return props.depth === 0 && isArrayOfObjects(props.data)
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
</script>

<template>
  <div class="table-view-wrapper" :class="{ 'nested-wrapper': depth > 0 }">
    <!-- ─── 场景 1: 顶层数据本身就是对象数组 (Direct 2D Data Grid) ─── -->
    <table v-if="isRootDirectArrayOfObjects" class="json-table data-grid-table">
      <thead>
        <tr class="grid-header-row">
          <th class="grid-col-header grid-index-header">#</th>
          <th
            v-for="col in rootDirectColumns"
            :key="col"
            class="grid-col-header"
            @click.stop="emitClick([col])"
            @mouseenter.stop="emitHover([col])"
            @mouseleave.stop="emitHover(null)"
          >
            <div class="grid-th-content">
              <span
                class="grid-col-header-text"
                data-tooltip="点击复制键名"
                @click.stop="handleCopyKey(col); emitClick([col])"
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
        <tr
          v-for="(item, idx) in data"
          :key="idx"
          class="json-table-row data-grid-row"
          :data-path="JSON.stringify(getFullPath([idx]))"
        >
          <!-- Row Index -->
          <td
            class="grid-index-cell"
            :class="{ 'is-selected': isPathSelected([idx]) }"
            @click.stop="emitClick([idx])"
            @mouseenter.stop="emitHover([idx])"
            @mouseleave.stop="emitHover(null)"
          >
            <span
              class="table-key-text"
              data-tooltip="点击复制键名"
              @click.stop="handleCopyKey(idx); emitClick([idx])"
            >{{ idx }}</span>
          </td>

          <!-- Columns -->
          <td
            v-for="col in rootDirectColumns"
            :key="col"
            class="value-cell grid-data-cell"
            :data-path="JSON.stringify(getFullPath([idx, col]))"
            :class="{
              [`val-${getValueType(item?.[col])}`]: true,
              'is-selected': isPathSelected([idx, col]),
              'is-hovered': isPathHovered([idx, col]),
              'value-cell--complex': !isPrimitive(item?.[col])
            }"
            @mouseenter.stop="emitHover([idx, col])"
            @mouseleave.stop="emitHover(null)"
            @click.stop="emitClick([idx, col])"
          >
            <template v-if="item && item[col] !== undefined">
              <!-- Primitive value in 2D grid -->
              <div v-if="isPrimitive(item[col])" class="val-primitive-wrap">
                <span
                  v-if="isImg(item[col])"
                  class="table-img-badge"
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
                <span
                  :class="[getValueColorClass(getValueType(item[col])), 'copyable-val', { 'is-image-url': isImg(item[col]), 'is-web-url': isHttpLink(item[col]) }]"
                  @mouseenter="(e) => onValMouseEnter(item[col], e)"
                  @mouseleave="() => onValMouseLeave(item[col])"
                  @click.stop="handleCopyValue(item[col]); emitClick([idx, col])"
                  :data-tooltip="getValTooltip(item[col])"
                  v-html="highlightText(getPreview(item[col]), searchQuery)"
                ></span>
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
      </tbody>
    </table>

    <!-- ─── 场景 2: 常规 JSON 对象结构 (统一 2 列主表，支持对象数组行转列) ─── -->
    <table v-else class="json-table main-json-table">
      <tbody>
        <tr
          v-for="entry in rootEntries"
          :key="entry.key"
          class="json-table-row"
          :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key]))"
        >
          <!-- ─── 左侧键名列 (Root Key Column) ─── -->
          <td
            class="root-key-cell"
            :class="{ 
              'root-index-cell': entry.isIndex,
              'is-selected': isPathSelected([entry.isIndex ? Number(entry.key) : entry.key]),
              'is-hovered': isPathHovered([entry.isIndex ? Number(entry.key) : entry.key])
            }"
            @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key])"
            @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key])"
            @mouseleave.stop="emitHover(null)"
          >
            <span
              class="table-key-text"
              data-tooltip="点击复制键名"
              @click.stop="handleCopyKey(entry.key); emitClick([entry.isIndex ? Number(entry.key) : entry.key])"
              v-html="highlightText(entry.key, searchQuery)"
            ></span>
          </td>

          <!-- ─── 右侧键值列 (Value Column) ─── -->
          <td
            class="value-cell"
            :class="{
              [`val-${getValueType(entry.value)}`]: true,
              'is-selected': isPathSelected([entry.isIndex ? Number(entry.key) : entry.key]),
              'is-hovered': isPathHovered([entry.isIndex ? Number(entry.key) : entry.key]),
              'value-cell--complex': !isPrimitive(entry.value)
            }"
            @mouseenter.stop="isPrimitive(entry.value) ? emitHover([entry.isIndex ? Number(entry.key) : entry.key]) : null"
            @mouseleave.stop="emitHover(null)"
          >
            <!-- 2.1 基础单值属性 (Primitive Value) -->
            <div v-if="isPrimitive(entry.value)" class="val-primitive-wrap">
              <span
                v-if="isImg(entry.value)"
                class="table-img-badge"
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
              <span
                :class="[getValueColorClass(getValueType(entry.value)), 'copyable-val', { 'is-image-url': isImg(entry.value), 'is-web-url': isHttpLink(entry.value) }]"
                @mouseenter="(e) => onValMouseEnter(entry.value, e)"
                @mouseleave="() => onValMouseLeave(entry.value)"
                @click.stop="handleCopyValue(entry.value); emitClick([entry.isIndex ? Number(entry.key) : entry.key])"
                :data-tooltip="getValTooltip(entry.value)"
                v-html="highlightText(getPreview(entry.value), searchQuery)"
              ></span>
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

              <!-- 展开状态: 内嵌 2D 矩阵表格 -->
              <div v-else class="inner-grid-container">
                <table class="inner-grid-table">
                  <thead>
                    <tr class="inner-grid-header-row">
                      <th
                        v-for="col in getColumnsFromObjectArray(entry.value)"
                        :key="col"
                        class="inner-grid-th"
                        @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key, col])"
                        @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key, col])"
                        @mouseleave.stop="emitHover(null)"
                      >
                        <div class="grid-th-content">
                          <span
                            class="grid-col-header-text"
                            data-tooltip="点击复制键名"
                            @click.stop="handleCopyKey(col); emitClick([entry.isIndex ? Number(entry.key) : entry.key, col])"
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
                    <tr
                      v-for="(subObj, subIdx) in entry.value"
                      :key="subIdx"
                      class="inner-grid-row"
                      :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subIdx]))"
                    >
                      <td
                        v-for="col in getColumnsFromObjectArray(entry.value)"
                        :key="col"
                        class="inner-grid-td"
                        :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subIdx, col]))"
                        :class="{
                          [`val-${getValueType(subObj?.[col])}`]: true,
                          'is-selected': isPathSelected([entry.isIndex ? Number(entry.key) : entry.key, subIdx, col]),
                          'is-hovered': isPathHovered([entry.isIndex ? Number(entry.key) : entry.key, subIdx, col])
                        }"
                        @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key, subIdx, col])"
                        @mouseleave.stop="emitHover(null)"
                        @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key, subIdx, col])"
                      >
                        <template v-if="subObj && subObj[col] !== undefined">
                          <div v-if="isPrimitive(subObj[col])" class="val-primitive-wrap">
                            <span
                              v-if="isImg(subObj[col])"
                              class="table-img-badge"
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
                            <span
                              :class="[getValueColorClass(getValueType(subObj[col])), 'copyable-val', { 'is-image-url': isImg(subObj[col]), 'is-web-url': isHttpLink(subObj[col]) }]"
                              @mouseenter="(e) => onValMouseEnter(subObj[col], e)"
                              @mouseleave="() => onValMouseLeave(subObj[col])"
                              @click.stop="handleCopyValue(subObj[col]); emitClick([entry.isIndex ? Number(entry.key) : entry.key, subIdx, col])"
                              :data-tooltip="getValTooltip(subObj[col])"
                              v-html="highlightText(getPreview(subObj[col]), searchQuery)"
                            ></span>
                          </div>
                          <div v-else class="complex-cell-container">
                            <JsonTableView
                              :data="subObj[col]"
                              :depth="depth + 1"
                              :hoveredPath="hoveredPath"
                              :selectedPath="currentSelectedPath"
                              :pathPrefix="getFullPath([entry.isIndex ? Number(entry.key) : entry.key, subIdx, col])"
                              @hover-path="handleChildHover"
                              @click-path="handleChildClick"
                            />
                          </div>
                        </template>
                        <span v-else class="val-empty">-</span>
                      </td>
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

              <!-- 展开状态: 内嵌规整子表格 -->
              <div v-else class="nested-table-container">
                <table class="inner-kv-table">
                  <tbody>
                    <tr
                      v-for="(subVal, subK) in (Array.isArray(entry.value) ? entry.value : Object.keys(entry.value).map(k => [k, entry.value[k]]))"
                      :key="Array.isArray(entry.value) ? subK : subVal[0]"
                      class="inner-kv-row"
                      :data-path="JSON.stringify(getFullPath([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]]))"
                    >
                      <!-- 子键名 / 索引 -->
                      <td
                        class="inner-key-cell"
                        :class="{ 
                          'inner-index-cell': Array.isArray(entry.value),
                          'is-selected': isPathSelected([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]]),
                          'is-hovered': isPathHovered([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]])
                        }"
                        @click.stop="emitClick([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]])"
                        @mouseenter.stop="emitHover([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]])"
                        @mouseleave.stop="emitHover(null)"
                      >
                        <span
                          class="table-key-text"
                          data-tooltip="点击复制键名"
                          @click.stop="handleCopyKey(Array.isArray(entry.value) ? subK : subVal[0]); emitClick([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]])"
                          v-html="highlightText(Array.isArray(entry.value) ? subK : subVal[0], searchQuery)"
                        ></span>
                      </td>

                      <!-- 子键值 -->
                      <td
                        class="inner-val-cell"
                        :class="{
                          [`val-${getValueType(Array.isArray(entry.value) ? subVal : subVal[1])}`]: true,
                          'is-selected': isPathSelected([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]]),
                          'is-hovered': isPathHovered([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]]),
                          'value-cell--complex': !isPrimitive(Array.isArray(entry.value) ? subVal : subVal[1])
                        }"
                        @mouseenter.stop="isPrimitive(Array.isArray(entry.value) ? subVal : subVal[1]) ? emitHover([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]]) : null"
                        @mouseleave.stop="emitHover(null)"
                      >
                        <div v-if="isPrimitive(Array.isArray(entry.value) ? subVal : subVal[1])" class="val-primitive-wrap">
                          <span
                            v-if="isImg(Array.isArray(entry.value) ? subVal : subVal[1])"
                            class="table-img-badge"
                            @mouseenter="(e) => onValMouseEnter(Array.isArray(entry.value) ? subVal : subVal[1], e)"
                            @mouseleave="() => onValMouseLeave(Array.isArray(entry.value) ? subVal : subVal[1])"
                            data-tooltip="图片链接 (悬停预览)"
                          ><ImageIcon class="img-badge-icon" /></span>
                          <button
                            v-else-if="isHttpLink(Array.isArray(entry.value) ? subVal : subVal[1])"
                            class="url-jump-btn"
                            @click.stop="handleOpenUrl(Array.isArray(entry.value) ? subVal : subVal[1])"
                            data-tooltip="在浏览器中直接打开链接"
                          >
                            <ExternalLink class="url-jump-icon" />
                          </button>
                          <span
                            :class="[getValueColorClass(getValueType(Array.isArray(entry.value) ? subVal : subVal[1])), 'copyable-val', { 'is-image-url': isImg(Array.isArray(entry.value) ? subVal : subVal[1]), 'is-web-url': isHttpLink(Array.isArray(entry.value) ? subVal : subVal[1]) }]"
                            @mouseenter="(e) => onValMouseEnter(Array.isArray(entry.value) ? subVal : subVal[1], e)"
                            @mouseleave="() => onValMouseLeave(Array.isArray(entry.value) ? subVal : subVal[1])"
                            @click.stop="handleCopyValue(Array.isArray(entry.value) ? subVal : subVal[1]); emitClick([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]])"
                            :data-tooltip="getValTooltip(Array.isArray(entry.value) ? subVal : subVal[1])"
                            v-html="highlightText(getPreview(Array.isArray(entry.value) ? subVal : subVal[1]), searchQuery)"
                          ></span>
                        </div>
                        <div v-else class="complex-cell-container">
                          <JsonTableView
                            :data="Array.isArray(entry.value) ? subVal : subVal[1]"
                            :depth="depth + 1"
                            :hoveredPath="hoveredPath"
                            :selectedPath="currentSelectedPath"
                            :pathPrefix="getFullPath([entry.isIndex ? Number(entry.key) : entry.key, Array.isArray(entry.value) ? subK : subVal[0]])"
                            @hover-path="handleChildHover"
                            @click-path="handleChildClick"
                          />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
  background-color: var(--bg-panel);
  background-image: 
    linear-gradient(to right, var(--grid-line-color, rgba(0, 0, 0, 0.05)) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-line-color, rgba(0, 0, 0, 0.05)) 1px, transparent 1px);
  background-size: 16px 16px;
}

.table-view-wrapper.nested-wrapper {
  padding: 0;
  background: transparent;
  background-image: none;
  width: 100%;
}

.table-view-wrapper:not(.nested-wrapper) {
}

.json-table {
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 13px;
  width: max-content;
  min-width: auto;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.json-table-row {
  border-bottom: 1px solid var(--border-color);
}

.json-table-row:last-child {
  border-bottom: none;
}

/* 2D Data Grid Column Header */
.grid-col-header,
.inner-grid-th {
  background: var(--table-header-bg, rgba(0, 0, 0, 0.08));
  color: var(--table-subkey-fg, #991b1b);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  padding: 7px 12px;
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
  background: var(--table-header-bg, rgba(255, 255, 255, 0.08));
  color: var(--table-subkey-fg, #f43f5e);
}

.grid-col-header:last-child,
.inner-grid-th:last-child {
  border-right: none;
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
  width: 48px;
  min-width: 48px;
  text-align: center;
}

.grid-index-cell {
  background: var(--table-root-bg, rgba(0, 0, 0, 0.05));
  color: var(--json-number, #2563eb);
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: center;
  padding: 6px 8px;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  width: 48px;
  min-width: 48px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

:global(.dark-mode) .grid-index-cell {
  background: rgba(255, 255, 255, 0.03);
}

/* Root key cell styling */
.root-key-cell {
  background: var(--table-root-bg, rgba(0, 0, 0, 0.05));
  color: var(--table-root-fg, #991b1b);
  font-weight: 600;
  padding: 7px 12px;
  border-right: 1px solid var(--border-color);
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  width: auto;
  min-width: 120px;
  max-width: 280px;
  letter-spacing: 0.01em;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.root-key-cell.root-index-cell {
  width: 50px;
  min-width: 50px;
  text-align: center;
  font-family: var(--font-mono);
  color: var(--json-number, #2563eb);
}

:global(.dark-mode) .root-key-cell {
  background: var(--table-root-bg, rgba(255, 255, 255, 0.04));
  color: var(--table-root-fg, #f43f5e);
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
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
  background: transparent;
  vertical-align: middle;
  min-width: 140px;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.value-cell.value-cell--complex {
  padding: 0 !important;
  background: transparent !important;
}

.nested-wrapper .json-table {
  border: none;
  background: transparent;
  width: 100% !important;
}

/* Complex cell container */
.complex-cell-container {
  display: flex;
  flex-direction: column;
  width: 100%;
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
  padding: 4px 10px;
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
  font-size: 12px;
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
.complex-grid-wrap {
  width: 100%;
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
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  border-right: 1px solid var(--border-color);
  vertical-align: middle;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.inner-grid-td:last-child {
  border-right: none;
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
  font-weight: 500;
  padding: 6px 12px;
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: transparent;
  vertical-align: top;
  font-family: var(--font-sans);
  transition: background-color 0.15s ease, color 0.15s ease;
}

:global(.dark-mode) .inner-key-cell {
  color: var(--table-subkey-fg, #f43f5e);
}

.inner-val-cell {
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  vertical-align: middle;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.inner-val-cell.value-cell--complex {
  padding: 0 !important;
}

/* ── Precision Single Cell Hover Highlight (No giant row block hover) ── */
.root-key-cell:hover,
.inner-key-cell:hover,
.grid-index-cell:hover,
.grid-col-header:hover,
.inner-grid-th:hover,
.root-key-cell.is-hovered,
.inner-key-cell.is-hovered {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.14)) !important;
  color: var(--json-key) !important;
}

.value-cell:not(.value-cell--complex):hover,
.inner-val-cell:not(.value-cell--complex):hover,
.inner-grid-td:not(.value-cell--complex):hover,
.value-cell:not(.value-cell--complex).is-hovered,
.inner-val-cell:not(.value-cell--complex).is-hovered,
.inner-grid-td:not(.value-cell--complex).is-hovered {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.14)) !important;
  box-shadow: inset 0 0 0 1px var(--json-key, #6366f1);
}

/* ── Selected Cell Highlight ── */
.root-key-cell.is-selected,
.inner-key-cell.is-selected {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.22)) !important;
  color: var(--json-key, #4f46e5) !important;
  font-weight: 700 !important;
}

.value-cell:not(.value-cell--complex).is-selected,
.inner-grid-td:not(.value-cell--complex).is-selected,
.inner-val-cell:not(.value-cell--complex).is-selected {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.20)) !important;
  box-shadow: inset 0 0 0 1.5px var(--json-key, #6366f1) !important;
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
.val-number, .tree-number   { color: var(--json-number); font-weight: 600; }
.val-boolean, .tree-boolean { color: var(--json-boolean); font-weight: 600; }
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

.table-img-badge {
  font-size: 13px;
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
  width: 17px;
  height: 17px;
  margin-right: 4px;
  margin-left: 1px;
  padding: 0;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.25);
  border-radius: 4px;
  color: #2563eb;
  cursor: pointer;
  opacity: 0.95;
  vertical-align: middle;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.url-jump-btn:hover {
  background: #2563eb;
  color: #ffffff;
  opacity: 1;
  transform: scale(1.15);
}

:global(.dark-mode) .url-jump-btn {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  opacity: 1;
}

:global(.dark-mode) .url-jump-btn:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
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
  font-size: 11px;
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
  font-size: 11px;
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
</style>
