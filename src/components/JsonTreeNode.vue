<script setup>
import { ref, computed, inject, watch } from 'vue'
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-vue-next'
import { safeStringify } from '../utils/jsonBigInt.js'
import { isImageUrl, isHttpUrl, openExternalUrl } from '../utils/imageDetector.js'

const props = defineProps({
  value: null,
  name: String,
  depth: {
    type: Number,
    default: 0
  },
  isLast: {
    type: Boolean,
    default: true
  },
  path: {
    type: Array,
    default: () => []
  }
})

// 展开/折叠全部 toggle（初始全部展开）
const treeExpanded = inject('treeExpanded', ref(true))
const isExpanded = ref(true)
watch(treeExpanded, (val) => { isExpanded.value = val ? true : props.depth < 1 })

const showToast = inject('showToast')
const searchQuery = inject('searchQuery', ref(''))
const setHoveredPath = inject('setHoveredPath', null)
const setSelectedPath = inject('setSelectedPath', null)
const imagePreview = inject('imagePreview', null)

const isImageValue = computed(() => {
  return typeof props.value === 'string' && isImageUrl(props.value)
})

const isOtherUrlValue = computed(() => {
  return typeof props.value === 'string' && !isImageValue.value && isHttpUrl(props.value)
})

const handleOpenUrl = (url) => {
  openExternalUrl(url)
  if (showToast) {
    showToast('已在浏览器打开链接')
  }
}

const onValueMouseEnter = (e) => {
  if (isImageValue.value && imagePreview) {
    imagePreview.show(props.value, e.currentTarget)
  }
}

const onValueMouseLeave = () => {
  if (isImageValue.value && imagePreview) {
    imagePreview.hide()
  }
}

const currentKeyPath = computed(() => {
  if (props.name !== undefined && props.name !== null) {
    return [...props.path, props.name]
  }
  return props.path
})

const onKeyMouseEnter = () => {
  if (setHoveredPath && currentKeyPath.value && currentKeyPath.value.length > 0) {
    setHoveredPath(currentKeyPath.value)
  }
}

const onKeyMouseLeave = () => {
  if (setHoveredPath) {
    setHoveredPath(null)
  }
}

const onKeyClick = () => {
  if (setSelectedPath && currentKeyPath.value && currentKeyPath.value.length > 0) {
    setSelectedPath(currentKeyPath.value)
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

const highlightKey = (name) => {
  return `"${highlightText(name, searchQuery.value)}"`
}

const highlightValue = (val) => {
  const formatted = formatValue(val)
  return highlightText(formatted, searchQuery.value)
}

const isObject = computed(() => {
  return props.value !== null && typeof props.value === 'object'
})

const isArray = computed(() => {
  return Array.isArray(props.value)
})

const objectKeys = computed(() => {
  if (isObject.value && !isArray.value) {
    return Object.keys(props.value)
  }
  return []
})

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

const formatValue = (val) => {
  if (typeof val === 'string') return `"${val}"`
  if (val === null) return 'null'
  return String(val)
}

const valueClass = computed(() => {
  const val = props.value
  if (typeof val === 'string') return 'tree-string'
  if (typeof val === 'number' || typeof val === 'bigint') return 'tree-number'
  if (typeof val === 'boolean') return 'tree-boolean'
  if (val === null) return 'tree-null'
  return ''
})

const handleCopyKey = (e) => {
  if (!props.name) return
  onKeyClick()
  navigator.clipboard.writeText(props.name).then(() => {
    if (showToast) {
      showToast(`已复制键名: ${props.name}`)
    }
  })
}

const handleCopyValue = (e) => {
  onKeyClick()
  let text = ''
  if (typeof props.value === 'object' && props.value !== null) {
    text = safeStringify(props.value, null, 2)
  } else {
    text = typeof props.value === 'string' ? props.value : String(props.value)
  }
  
  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      const truncated = text.length > 20 ? text.substring(0, 20) + '...' : text
      showToast(`已复制键值: ${truncated}`)
    }
  })
}
</script>

<template>
  <div class="tree-node">
    <!-- If object or array -->
    <div v-if="isObject" class="node-row">
      <div
        class="node-header expandable"
        @click="toggleExpand(); onKeyClick()"
        @mouseenter="onKeyMouseEnter"
        @mouseleave="onKeyMouseLeave"
      >
        <span class="icon-wrapper">
          <ChevronDown v-if="isExpanded" class="toggle-icon" />
          <ChevronRight v-else class="toggle-icon" />
        </span>
        
        <span v-if="name" class="node-key" @click.stop="handleCopyKey" data-tooltip="点击复制键名" v-html="highlightKey(name)"></span>
        <span v-if="name" class="node-colon">: </span>
        
        <span class="node-bracket" @click.stop="handleCopyValue" data-tooltip="点击复制子树 JSON">{{ isArray ? '[' : '{' }}</span>
        
        <span v-if="!isExpanded" class="node-collapsed-summary" @click.stop="handleCopyValue" data-tooltip="点击复制子树 JSON">
          {{ isArray ? `Array(${value.length})` : `Object(${Object.keys(value).length})` }}
          <span class="node-bracket">{{ isArray ? ']' : '}' }}</span>
          <span v-if="!isLast" class="node-comma">,</span>
        </span>
      </div>

      <div v-if="isExpanded" class="node-children">
        <!-- Array elements -->
        <template v-if="isArray">
          <JsonTreeNode 
            v-for="(item, index) in value" 
            :key="index"
            :value="item"
            :depth="depth + 1"
            :is-last="index === value.length - 1"
            :path="[...path, index]"
          />
        </template>
        <!-- Object elements -->
        <template v-else>
          <JsonTreeNode 
            v-for="(key, index) in objectKeys" 
            :key="key"
            :name="key"
            :value="value[key]"
            :depth="depth + 1"
            :is-last="index === objectKeys.length - 1"
            :path="[...path, key]"
          />
        </template>
      </div>

      <div v-if="isExpanded" class="node-footer">
        <span class="node-bracket" @click.stop="handleCopyValue" data-tooltip="点击复制子树 JSON">{{ isArray ? ']' : '}' }}</span>
        <span v-if="!isLast" class="node-comma">,</span>
      </div>
    </div>

    <!-- If primitive -->
    <div
      v-else
      class="node-row primitive"
      @click="onKeyClick"
      @mouseenter="onKeyMouseEnter"
      @mouseleave="onKeyMouseLeave"
    >
      <span class="icon-spacer"></span>
      <span v-if="name" class="node-key" @click.stop="handleCopyKey" data-tooltip="点击复制键名" v-html="highlightKey(name)"></span>
      <span v-if="name" class="node-colon">: </span>
      
      <!-- 前置图标：图片悬停徽标 / 链接一键跳转 -->
      <span v-if="isImageValue" class="tree-img-badge" @mouseenter="onValueMouseEnter" @mouseleave="onValueMouseLeave" data-tooltip="图片链接 (悬停预览)"><ImageIcon class="img-badge-icon" /></span>
      <button
        v-else-if="isOtherUrlValue"
        class="url-jump-btn"
        @click.stop="handleOpenUrl(value)"
        data-tooltip="在浏览器中直接打开链接"
      >
        <ExternalLink class="url-jump-icon" />
      </button>

      <!-- 键值文本 -->
      <span
        :class="[valueClass, 'copyable-value', { 'is-image-url': isImageValue, 'is-web-url': isOtherUrlValue }]"
        @click.stop="handleCopyValue"
        @mouseenter="onValueMouseEnter"
        @mouseleave="onValueMouseLeave"
        :data-tooltip="isImageValue ? '悬停预览图片，点击复制键值' : (isOtherUrlValue ? '点击复制键值，点击左侧图标可直接打开' : '点击复制键值')"
        v-html="highlightValue(value)"
      ></span>
      <span v-if="!isLast" class="node-comma">,</span>
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  text-align: left;
  white-space: nowrap;
}

.node-row {
  display: flex;
  flex-direction: column;
}

.node-row.primitive {
  flex-direction: row;
  align-items: center;
  padding-left: 4px;
  white-space: nowrap;
  width: max-content;
  min-height: 20px;
}

.node-header {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  border-radius: 6px;
  padding: 0 4px;
  user-select: none;
  width: fit-content;
  min-height: 20px;
}

.node-header:hover {
  background-color: var(--border-color);
}

.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  color: var(--text-muted);
}

.icon-spacer {
  width: 18px; /* matches icon-wrapper + margin-right */
  flex-shrink: 0;
}

.toggle-icon {
  width: 12px;
  height: 12px;
}

.node-key {
  color: var(--json-key);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.node-key:hover {
  text-decoration: underline;
  opacity: 0.8;
}

.node-colon {
  color: var(--text-secondary);
  margin-right: 4px;
  flex-shrink: 0;
}

.node-bracket {
  color: var(--json-bracket);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.node-bracket:hover {
  text-decoration: underline;
  opacity: 0.8;
}

.node-collapsed-summary {
  background-color: var(--bg-app);
  color: var(--text-muted);
  font-size: 11px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  margin-left: 6px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.node-collapsed-summary:hover {
  border-color: var(--border-color-active);
  background-color: var(--border-color);
}

.node-children {
  border-left: 1px dashed var(--border-color);
  margin-left: 10px;
  padding-left: 16px;
}

.node-footer {
  padding-left: 18px;
}

.tree-string {
  color: var(--json-string);
  white-space: nowrap;
}

.tree-number {
  color: var(--json-number);
  white-space: nowrap;
}

.tree-boolean {
  color: var(--json-boolean);
  white-space: nowrap;
}

.tree-null {
  color: var(--json-null);
  white-space: nowrap;
}

.node-comma {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.copyable-value {
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.copyable-value:hover {
  text-decoration: underline;
  opacity: 0.8;
}

.is-image-url {
  text-decoration: underline dotted var(--accent-color, #6366f1) !important;
  text-underline-offset: 3px;
}

.tree-img-badge {
  font-size: 13px;
  line-height: 1;
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

:global(.dark-mode) .tree-img-badge {
  color: #38bdf8;
}

.img-badge-icon {
  width: 14px;
  height: 14px;
  stroke-width: 2;
}

.tree-img-badge:hover {
  transform: scale(1.15);
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
</style>
