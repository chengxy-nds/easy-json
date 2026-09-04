<script setup>
import { ref, computed, watch } from 'vue'
import {
  ChevronDown, ChevronRight, Search, CheckSquare, Square,
  MinusSquare, Maximize2, Minimize2, Check, Trash2, ListTree
} from 'lucide-vue-next'

const props = defineProps({
  data: {
    type: [Object, Array],
    default: null
  },
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'toggle-key'])

const searchQuery = ref('')
const expandedNodes = ref(new Set())
const isAllExpanded = ref(true)

// 将传入的任意 JSON 转换为树形节点结构
const buildTree = (val, keyName = '', path = [], depth = 0) => {
  const currentPath = keyName !== '' ? [...path, keyName] : path
  const id = currentPath.join('.') || '__root__'
  const isArr = Array.isArray(val)
  const isObj = val !== null && typeof val === 'object' && !isArr
  let type = typeof val
  if (val === null) type = 'null'
  else if (isArr) type = 'array'
  else if (isObj) type = 'object'

  let valuePreview = ''
  if (isArr) {
    valuePreview = `[${val.length} 项]`
  } else if (isObj) {
    const keysCount = Object.keys(val).length
    valuePreview = `{${keysCount} 个属性}`
  } else if (type === 'string') {
    valuePreview = `"${val.length > 25 ? val.slice(0, 22) + '...' : val}"`
  } else {
    valuePreview = String(val)
  }

  let children = []
  if (isArr) {
    // 数组：如果是对象数组，提取元素属性或首个元素示例
    val.forEach((item, idx) => {
      if (item !== null && typeof item === 'object') {
        const itemNode = buildTree(item, `[${idx}]`, currentPath, depth + 1)
        if (itemNode.children && itemNode.children.length > 0) {
          children.push(...itemNode.children)
        }
      }
    })
    // 去重相同 key 名字的子节点
    const seenKeys = new Set()
    children = children.filter(child => {
      if (!child.key || seenKeys.has(child.key)) return false
      seenKeys.add(child.key)
      return true
    })
  } else if (isObj) {
    children = Object.keys(val).map(k => buildTree(val[k], k, currentPath, depth + 1))
  }

  return {
    id,
    key: keyName,
    type,
    valuePreview,
    children,
    depth,
    isContainer: (isArr || isObj) && children.length > 0
  }
}

const rawTree = computed(() => {
  if (!props.data) return []
  const root = buildTree(props.data)
  return root.children.length > 0 ? root.children : (root.key ? [root] : [])
})

// 默认全展开所有容器节点
const initExpanded = (nodes) => {
  nodes.forEach(node => {
    if (node.isContainer) {
      expandedNodes.value.add(node.id)
      if (node.children && node.children.length > 0) {
        initExpanded(node.children)
      }
    }
  })
}

watch(rawTree, (nodes) => {
  expandedNodes.value.clear()
  initExpanded(nodes)
}, { immediate: true })

const toggleExpand = (nodeId) => {
  if (expandedNodes.value.has(nodeId)) {
    expandedNodes.value.delete(nodeId)
  } else {
    expandedNodes.value.add(nodeId)
  }
}

const expandAll = () => {
  const addAll = (nodes) => {
    nodes.forEach(n => {
      if (n.isContainer) {
        expandedNodes.value.add(n.id)
        if (n.children) addAll(n.children)
      }
    })
  }
  addAll(rawTree.value)
  isAllExpanded.value = true
}

const collapseAll = () => {
  expandedNodes.value.clear()
  isAllExpanded.value = false
}

// 提取某个子树下的所有 Key 名（排除数组索引）
const collectAllKeys = (node, result = new Set()) => {
  if (node.key && !/^\[\d+\]$/.test(node.key)) {
    result.add(node.key)
  }
  if (node.children) {
    node.children.forEach(c => collectAllKeys(c, result))
  }
  return result
}

// 收集全部可用 Key
const allAvailableKeys = computed(() => {
  const keys = new Set()
  rawTree.value.forEach(node => collectAllKeys(node, keys))
  return Array.from(keys)
})

const isKeySelected = (key) => {
  if (!key) return false
  return props.modelValue.includes(key)
}

// 计算容器节点的勾选状态 (0: 未选, 1: 部分选, 2: 全选)
const getContainerCheckState = (node) => {
  const keys = Array.from(collectAllKeys(node))
  if (keys.length === 0) return 0
  const selectedCount = keys.filter(k => isKeySelected(k)).length
  if (selectedCount === 0) return 0
  if (selectedCount === keys.length) return 2
  return 1 // 半选
}

const toggleKey = (key) => {
  if (!key || /^\[\d+\]$/.test(key)) return
  const current = [...props.modelValue]
  const idx = current.indexOf(key)
  if (idx > -1) {
    current.splice(idx, 1)
  } else {
    current.push(key)
  }
  emit('update:modelValue', current)
  emit('toggle-key', key)
}

const toggleContainer = (node) => {
  const subKeys = Array.from(collectAllKeys(node))
  if (subKeys.length === 0) return
  const state = getContainerCheckState(node)
  const current = new Set(props.modelValue)
  
  if (state === 2) {
    // 已经全选 -> 取消全选
    subKeys.forEach(k => current.delete(k))
  } else {
    // 未选或半选 -> 全部勾选
    subKeys.forEach(k => current.add(k))
  }
  emit('update:modelValue', Array.from(current))
}

const selectAllKeys = () => {
  const current = new Set(props.modelValue)
  allAvailableKeys.value.forEach(k => current.add(k))
  emit('update:modelValue', Array.from(current))
}

const clearAllKeys = () => {
  emit('update:modelValue', [])
}

// 搜索过滤与扁平化渲染（支持任意深度的嵌套）
const filterNode = (node, query) => {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const keyMatches = node.key && node.key.toLowerCase().includes(lowerQuery)
  const valMatches = node.valuePreview && node.valuePreview.toLowerCase().includes(lowerQuery)
  if (keyMatches || valMatches) return true
  if (node.children && node.children.length > 0) {
    return node.children.some(child => filterNode(child, query))
  }
  return false
}

// 扁平化展示列表，支持无限制层级
const flatVisibleNodes = computed(() => {
  const q = searchQuery.value.trim()
  const result = []

  const traverse = (nodes, currentDepth = 0) => {
    for (const node of nodes) {
      if (!filterNode(node, q)) continue

      result.push({
        ...node,
        renderDepth: currentDepth,
        isExpanded: expandedNodes.value.has(node.id) || !!q
      })

      // 如果节点展开（或者有搜索词），递归渲染子节点
      if (node.children && node.children.length > 0) {
        if (expandedNodes.value.has(node.id) || q) {
          traverse(node.children, currentDepth + 1)
        }
      }
    }
  }

  traverse(rawTree.value, 0)
  return result
})
</script>

<template>
  <div class="mask-key-tree-picker">
    <!-- 顶部操作工具栏 -->
    <div class="tree-picker-toolbar">
      <div class="tree-search-wrap">
        <Search class="tree-search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索 JSON 字段名..."
          class="tree-search-input"
        />
        <button v-if="searchQuery" class="tree-clear-btn" @click="searchQuery = ''">
          ×
        </button>
      </div>

      <div class="tree-actions-wrap">
        <button class="tree-tool-btn" @click="selectAllKeys" title="全选当前所有字段">
          <Check class="tool-icon" />
          <span>全选</span>
        </button>
        <button class="tree-tool-btn" @click="clearAllKeys" title="清空全部勾选">
          <Trash2 class="tool-icon" />
          <span>清空</span>
        </button>
        <div class="tool-divider"></div>
        <button v-if="isAllExpanded" class="tree-tool-btn icon-only" @click="collapseAll" title="折叠全部">
          <Minimize2 class="tool-icon" />
        </button>
        <button v-else class="tree-tool-btn icon-only" @click="expandAll" title="展开全部">
          <Maximize2 class="tool-icon" />
        </button>
      </div>
    </div>

    <!-- 树节点展示容器 -->
    <div class="tree-nodes-container">
      <template v-if="flatVisibleNodes.length > 0">
        <div
          v-for="node in flatVisibleNodes"
          :key="node.id"
          class="tree-node-item"
          :style="{ paddingLeft: (node.renderDepth * 1 + 0.5) + 'rem' }"
          @click="node.isContainer ? toggleContainer(node) : toggleKey(node.key)"
        >
          <!-- 展开/收起箭头 -->
          <button
            v-if="node.isContainer && node.children && node.children.length > 0"
            class="tree-expand-btn"
            @click.stop="toggleExpand(node.id)"
          >
            <ChevronDown v-if="node.isExpanded" class="expand-icon is-open" />
            <ChevronRight v-else class="expand-icon" />
          </button>
          <span v-else class="tree-expand-placeholder"></span>

          <!-- 节点 Checkbox -->
          <div class="tree-checkbox-wrap" @click.stop="node.isContainer ? toggleContainer(node) : toggleKey(node.key)">
            <template v-if="node.isContainer">
              <CheckSquare v-if="getContainerCheckState(node) === 2" class="checkbox-icon checked" />
              <MinusSquare v-else-if="getContainerCheckState(node) === 1" class="checkbox-icon partial" />
              <Square v-else class="checkbox-icon" />
            </template>
            <template v-else>
              <CheckSquare v-if="isKeySelected(node.key)" class="checkbox-icon checked" />
              <Square v-else class="checkbox-icon" />
            </template>
          </div>

          <!-- Key 名称 -->
          <span
            class="tree-key-name"
            :class="{ 'is-selected': isKeySelected(node.key) }"
          >
            {{ node.key }}
          </span>

          <!-- 类型标签 Badge -->
          <span class="tree-type-tag" :class="node.type">
            {{ node.type }}
          </span>

          <!-- 值预览 -->
          <span class="tree-val-preview" :title="node.valuePreview">
            {{ node.valuePreview }}
          </span>
        </div>
      </template>

      <!-- 搜索空状态 -->
      <div v-else class="tree-empty-state">
        <ListTree class="empty-icon" />
        <span>未找到匹配的字段</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask-key-tree-picker {
  display: flex;
  flex-direction: column;
  background: var(--bg-app, #f8fafc);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  border-radius: 0.5rem;
  overflow: hidden;
  margin-top: 0.375rem;
  animation: pickerSlideDown 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

:global(.dark-mode) .mask-key-tree-picker {
  background: rgba(30, 30, 36, 0.85);
  border-color: rgba(255, 255, 255, 0.08);
}

@keyframes pickerSlideDown {
  from { opacity: 0; transform: translateY(-0.25rem); }
  to { opacity: 1; transform: translateY(0); }
}

/* 顶部工具栏 */
.tree-picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  background: var(--bg-panel, #ffffff);
  border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
}

:global(.dark-mode) .tree-picker-toolbar {
  background: rgba(38, 38, 44, 0.95);
}

.tree-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 13.75rem;
}

.tree-search-icon {
  position: absolute;
  left: 0.4375rem;
  width: 0.75rem;
  height: 0.75rem;
  color: var(--text-muted, #94a3b8);
  pointer-events: none;
}

.tree-search-input {
  width: 100%;
  height: 1.5rem;
  padding: 0 1.25rem 0 1.5rem;
  font-size: 0.6875rem;
  font-family: var(--font-sans, inherit);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 0.25rem;
  background: var(--bg-app, #f8fafc);
  color: var(--text-primary, #0f172a);
  outline: none;
  transition: border-color 0.15s ease;
}

.tree-search-input:focus {
  border-color: var(--primary-color, #6366f1);
}

:global(.dark-mode) .tree-search-input {
  background: rgba(20, 20, 24, 0.6);
  border-color: rgba(255, 255, 255, 0.1);
  color: #f1f5f9;
}

.tree-clear-btn {
  position: absolute;
  right: 0.3125rem;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
  line-height: 1;
}

.tree-actions-wrap {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.tree-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.1875rem;
  height: 1.5rem;
  padding: 0 0.375rem;
  font-size: 0.6875rem;
  border: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-panel, #ffffff);
  color: var(--text-secondary, #475569);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tree-tool-btn:hover {
  border-color: var(--primary-color, #6366f1);
  color: var(--primary-color, #6366f1);
}

:global(.dark-mode) .tree-tool-btn {
  background: rgba(45, 45, 52, 0.8);
  border-color: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.tool-icon {
  width: 0.75rem;
  height: 0.75rem;
}

.tree-tool-btn.icon-only {
  padding: 0 0.3125rem;
}

.tool-divider {
  width: 1px;
  height: 0.875rem;
  background: var(--border-color, #e2e8f0);
  margin: 0 0.125rem;
}

/* 节点容器 */
.tree-nodes-container {
  max-height: 11.25rem;
  overflow-y: auto;
  padding: 0.25rem 0;
  font-family: var(--font-mono, monospace);
  font-size: 0.71875rem;
}

.tree-node-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.1875rem 0.5rem;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.1s ease;
}

.tree-node-item:hover {
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

:global(.dark-mode) .tree-node-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.tree-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  height: 0.875rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.expand-icon {
  width: 0.75rem;
  height: 0.75rem;
  transition: transform 0.15s ease;
}

.tree-expand-placeholder {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.tree-checkbox-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  height: 0.875rem;
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-icon {
  width: 0.875rem;
  height: 0.875rem;
  color: var(--text-muted, #94a3b8);
  transition: color 0.1s ease;
}

.checkbox-icon.checked {
  color: var(--primary-color, #6366f1);
}

.checkbox-icon.partial {
  color: var(--primary-color, #6366f1);
  opacity: 0.85;
}

.tree-key-name {
  font-weight: 500;
  color: var(--text-primary, #1e293b);
  white-space: nowrap;
  flex-shrink: 0;
}

:global(.dark-mode) .tree-key-name {
  color: #e2e8f0;
}

.tree-key-name.is-selected {
  color: var(--primary-color, #6366f1);
  font-weight: 600;
}

.tree-type-tag {
  font-size: 0.59375rem;
  font-family: var(--font-sans, sans-serif);
  padding: 0.0625rem 0.25rem;
  border-radius: 0.1875rem;
  line-height: 1;
  text-transform: uppercase;
  flex-shrink: 0;
}

.tree-type-tag.string { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
.tree-type-tag.number { background: rgba(249, 115, 22, 0.12); color: #ea580c; }
.tree-type-tag.boolean { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
.tree-type-tag.object { background: rgba(168, 85, 247, 0.12); color: #9333ea; }
.tree-type-tag.array { background: rgba(236, 72, 153, 0.12); color: #db2777; }
.tree-type-tag.null { background: rgba(148, 163, 184, 0.15); color: #64748b; }

.tree-val-preview {
  font-size: 0.6875rem;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.tree-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 1.5rem 0;
  color: var(--text-muted, #94a3b8);
  font-size: 0.71875rem;
}

.empty-icon {
  width: 0.875rem;
  height: 0.875rem;
}
</style>
