<script setup>
import { ref, computed, inject, watch, onMounted, onBeforeUnmount } from 'vue'
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, Clock, Braces, X, UnfoldVertical, FoldVertical, Volume2, Video as VideoIcon, KeyRound, FileCode, Code2, CalendarClock } from 'lucide-vue-next'
import { safeStringify } from '../utils/jsonBigInt.js'
import { isImageUrl, isHttpUrl, isColorValue, openExternalUrl } from '../utils/imageDetector.js'
import { detectTimestamp, detectUnicode, detectNestedJson, getFormatNow } from '../utils/capsuleDetector.js'
import { detectMedia, detectJwt, detectBase64Text, detectUrlEncoded, detectCron, detectHtml } from '../utils/advancedDetectors.js'

const props = defineProps({
  value: null,
  name: String,
  rawInput: {
    type: String,
    default: ''
  },
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
const isDark = inject('isDark', ref(true))
const searchQuery = inject('searchQuery', ref(''))
const setHoveredPath = inject('setHoveredPath', null)
const setSelectedPath = inject('setSelectedPath', null)
const imagePreview = inject('imagePreview', null)
const smartPreview = inject('smartPreview', null)
const openNestedJsonTab = inject('openNestedJsonTab', null)

// 嵌套 JSON 本地展开状态
const isNestedExpanded = ref(false)

const isColor = computed(() => {
  return typeof props.value === 'string' && isColorValue(props.value)
})

const mediaData = computed(() => {
  return typeof props.value === 'string' && !isColor.value ? detectMedia(props.value) : null
})

const isImageValue = computed(() => {
  return typeof props.value === 'string' && !isColor.value && !mediaData.value && isImageUrl(props.value)
})

const isOtherUrlValue = computed(() => {
  return typeof props.value === 'string' && !isColor.value && !mediaData.value && !isImageValue.value && isHttpUrl(props.value)
})

const currentKeyPath = computed(() => {
  if (props.name !== undefined && props.name !== null) {
    return [...props.path, props.name]
  }
  return props.path
})

const timeData = computed(() => detectTimestamp(props.value))
const unicodeData = computed(() => detectUnicode(props.value, props.rawInput, currentKeyPath.value))
const nestedJsonData = computed(() => detectNestedJson(props.value))

const base64Data = computed(() => {
  if (typeof props.value !== 'string' || isColor.value || mediaData.value || nestedJsonData.value) return null
  return detectBase64Text(props.value)
})

const urlEncodedData = computed(() => {
  if (typeof props.value !== 'string' || isColor.value || mediaData.value || nestedJsonData.value || base64Data.value) return null
  return detectUrlEncoded(props.value)
})

const displayValue = computed(() => {
  let disp = props.value
  if (unicodeData.value && unicodeData.value.decodedText && unicodeData.value.decodedText !== props.value) {
    disp = unicodeData.value.decodedText
  }
  if (base64Data.value) return base64Data.value.decoded
  if (urlEncodedData.value) return urlEncodedData.value.decoded
  return disp
})

const cronData = computed(() => {
  if (typeof props.value !== 'string') return null
  if (isColor.value || isImageValue.value || mediaData.value || nestedJsonData.value || base64Data.value || urlEncodedData.value) return null
  return detectCron(displayValue.value)
})

const smartData = computed(() => {
  if (typeof props.value !== 'string') return null
  if (isColor.value || isImageValue.value || mediaData.value || nestedJsonData.value || base64Data.value || urlEncodedData.value || cronData.value) return null
  return detectJwt(props.value) || detectHtml(props.value)
})

const onSmartMouseEnter = (sData, e) => {
  if (smartPreview && sData) smartPreview.show(sData, e.currentTarget)
}
const onSmartMouseLeave = () => {
  if (smartPreview) smartPreview.hide()
}

const handleOpenUrl = (url) => {
  openExternalUrl(url)
  if (showToast) {
    showToast('已在浏览器打开链接')
  }
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

const openTimeMenu = (tData, event) => {
  if (!tData || !event || !event.currentTarget) return
  startNowTimer()
  const rect = event.currentTarget.getBoundingClientRect()
  const popWidth = 290
  const popHeight = tData.isIso ? 180 : 155
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
    timeData: tData
  }
}

const onTimeBadgeEnter = (tData, event) => {
  if (timeMenuTimer) {
    clearTimeout(timeMenuTimer)
    timeMenuTimer = null
  }
  openTimeMenu(tData, event)
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

// 嵌套 JSON 悬浮操作菜单与展开/收起控制
const activeNestedMenu = ref(null)
let nestedMenuTimer = null

const openNestedMenu = (event) => {
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
    left
  }
}

const onNestedBadgeEnter = (event) => {
  if (nestedMenuTimer) {
    clearTimeout(nestedMenuTimer)
    nestedMenuTimer = null
  }
  openNestedMenu(event)
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

const toggleNestedExpand = () => {
  isNestedExpanded.value = !isNestedExpanded.value
  if (isNestedExpanded.value) {
    isExpanded.value = true
    if (showToast) {
      showToast('已转义展开为子树')
    }
  } else {
    if (showToast) {
      showToast('已还原为转义字符串')
    }
  }
  activeNestedMenu.value = null
}

const handleOpenInNewTab = () => {
  const val = props.value
  const title = props.name || '嵌套 JSON'
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

onMounted(() => {
  document.addEventListener('click', closeTimeMenu)
  document.addEventListener('click', closeNestedMenu)
  window.addEventListener('resize', closeTimeMenu)
  window.addEventListener('resize', closeNestedMenu)
})

onBeforeUnmount(() => {
  if (timeMenuTimer) {
    clearTimeout(timeMenuTimer)
    timeMenuTimer = null
  }
  if (nestedMenuTimer) {
    clearTimeout(nestedMenuTimer)
    nestedMenuTimer = null
  }
  document.removeEventListener('click', closeTimeMenu)
  document.removeEventListener('click', closeNestedMenu)
  window.removeEventListener('resize', closeTimeMenu)
  window.removeEventListener('resize', closeNestedMenu)
})

const handleCopyUnicode = (uData) => {
  if (!uData) return
  navigator.clipboard.writeText(uData.originalUnicode).then(() => {
    if (showToast) {
      showToast(`已复制 Unicode 原文: ${uData.originalUnicode}`)
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

const onValueMouseEnter = (e) => {
  if (mediaData.value && imagePreview) {
    imagePreview.show(props.value, e.currentTarget)
    return
  }
  if (isImageValue.value && imagePreview) {
    imagePreview.show(props.value, e.currentTarget)
    return
  }
  if (smartData.value && smartPreview) {
    smartPreview.show(smartData.value, e.currentTarget)
    return
  }
}

const onValueMouseLeave = () => {
  if (imagePreview) imagePreview.hide()
  if (smartPreview) smartPreview.hide()
}

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

const effectiveValue = computed(() => {
  if (isNestedExpanded.value && nestedJsonData.value) {
    return nestedJsonData.value.parsed
  }
  return props.value
})

const isObject = computed(() => {
  return effectiveValue.value !== null && typeof effectiveValue.value === 'object'
})

const isArray = computed(() => {
  return Array.isArray(effectiveValue.value)
})

const objectKeys = computed(() => {
  if (isObject.value && !isArray.value) {
    return Object.keys(effectiveValue.value)
  }
  return []
})

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

const formatValue = (val) => {
  if (typeof val === 'string') return JSON.stringify(val)
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
  const currentVal = effectiveValue.value
  if (typeof currentVal === 'object' && currentVal !== null) {
    text = safeStringify(currentVal, null, 2)
  } else if (typeof currentVal === 'string') {
    text = currentVal
  } else if (currentVal === null) {
    text = 'null'
  } else {
    text = String(currentVal)
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
        <!-- 嵌套 JSON 展开状态徽标 -->
        <span
          v-if="isNestedExpanded"
          class="tree-nested-badge is-expanded"
          @click.stop="toggleNestedExpand"
          @mouseenter="onNestedBadgeEnter($event)"
          @mouseleave="onNestedBadgeLeave"
        >
          <Braces class="capsule-icon" />
        </span>
        <span class="node-bracket" @click.stop="handleCopyValue" data-tooltip="点击复制子树 JSON">{{ isArray ? '[' : '{' }}</span>
        
        <span v-if="!isExpanded" class="node-collapsed-summary" @click.stop="handleCopyValue" data-tooltip="点击复制子树 JSON">
          {{ isArray ? `Array(${effectiveValue.length})` : `Object(${Object.keys(effectiveValue).length})` }}
          <span class="node-bracket">{{ isArray ? ']' : '}' }}</span>
          <span v-if="!isLast" class="node-comma">,</span>
        </span>
      </div>

      <div v-if="isExpanded" class="node-children">
        <!-- Array elements -->
        <template v-if="isArray">
          <JsonTreeNode 
            v-for="(item, index) in effectiveValue" 
            :key="index"
            :value="item"
            :depth="depth + 1"
            :is-last="index === effectiveValue.length - 1"
            :path="[...path, index]"
          />
        </template>
        <!-- Object elements -->
        <template v-else>
          <JsonTreeNode 
            v-for="(key, index) in objectKeys" 
            :key="key"
            :name="key"
            :value="effectiveValue[key]"
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
      
      <!-- 前置图标：色块 / 多媒体 / 链接一键跳转 / 智能胶囊 -->
      <span
        v-if="isColor"
        class="tree-color-badge"
      >
        <span class="tree-color-chip-inner" :style="{ backgroundColor: value }"></span>
      </span>
      <span
        v-else-if="mediaData?.mediaType === 'audio'"
        class="tree-img-badge tree-audio-badge"
        @mouseenter="onValueMouseEnter"
        @mouseleave="onValueMouseLeave"
        data-tooltip="音频直链 (悬停试听)"
      >
        <Volume2 class="img-badge-icon" />
      </span>
      <span
        v-else-if="mediaData?.mediaType === 'video'"
        class="tree-img-badge tree-video-badge"
        @mouseenter="onValueMouseEnter"
        @mouseleave="onValueMouseLeave"
        data-tooltip="视频直链 (悬停播放)"
      >
        <VideoIcon class="img-badge-icon" />
      </span>
      <span
        v-else-if="isImageValue"
        class="tree-img-badge"
        @mouseenter="onValueMouseEnter"
        @mouseleave="onValueMouseLeave"
        data-tooltip="图片链接 (悬停预览)"
      >
        <ImageIcon class="img-badge-icon" />
      </span>
      <button
        v-else-if="isOtherUrlValue"
        class="url-jump-btn"
        @click.stop="handleOpenUrl(value)"
        data-tooltip="在浏览器中直接打开链接"
      >
        <ExternalLink class="url-jump-icon" />
      </button>

      <!-- Cron 表达式胶囊 (图标不加 tooltip，点击正常复制) -->
      <button
        v-if="cronData"
        class="tree-capsule-badge tree-cron-badge"
        @click.stop="handleCopyValue(props.value)"
      >
        <CalendarClock class="capsule-icon" />
        <span class="capsule-text">CRON</span>
      </button>

      <!-- 智能数据胶囊 (JWT, HTML) -->
      <button
        v-if="smartData"
        class="tree-capsule-badge"
        :class="{
          'tree-jwt-badge': smartData.isJwt,
          'tree-html-badge': smartData.isHtml
        }"
        @mouseenter="onSmartMouseEnter(smartData, $event)"
        @mouseleave="onSmartMouseLeave"
        @click.stop="onSmartMouseEnter(smartData, $event)"
        :title="smartData.isJwt ? 'JWT Token (悬停解码)' : '智能数据 (悬停查看详情)'"
      >
        <KeyRound v-if="smartData.isJwt" class="capsule-icon" />
        <span class="capsule-text">
          {{ smartData.isJwt ? 'JWT' : 'HTML' }}
        </span>
      </button>

      <!-- Base64 Badge (点击复制 Base64 原值) -->
      <span
        v-if="base64Data"
        class="tree-inline-badge tree-b64-badge"
        @click.stop="handleCopyRaw(props.value, 'Base64 原值')"
        data-tooltip="点击复制 Base64 原值"
      >
        <span class="capsule-symbol">B64</span>
      </span>

      <!-- URL 编码 Badge (点击复制 URL 编码原值) -->
      <span
        v-if="urlEncodedData"
        class="tree-inline-badge tree-urldec-badge"
        @click.stop="handleCopyRaw(props.value, 'URL 编码原值')"
        data-tooltip="点击复制 URL 编码原值"
      >
        <span class="capsule-symbol">%</span>
      </span>

      <!-- 时间戳胶囊 (直接展示东八区时间，悬停出现浮窗，点击亦可打开) -->
      <button
        v-if="timeData"
        class="tree-capsule-badge tree-time-badge"
        @mouseenter="onTimeBadgeEnter(timeData, $event)"
        @mouseleave="onTimeBadgeLeave"
        @click.stop="openTimeMenu(timeData, $event)"
        title="悬停查看与复制时间格式"
      >
        <Clock class="capsule-icon" />
        <span class="capsule-text">{{ timeData.beijingStr }}</span>
      </button>

      <!-- Unicode 徽标 (无 tooltip，仅保留图标，点击复制原文，与图片 URL 图标一致) -->
      <span
        v-if="unicodeData"
        class="tree-unicode-badge"
        @click.stop="handleCopyUnicode(unicodeData)"
        title="点击复制 Unicode 原文"
      >
        <span class="capsule-symbol">\u</span>
      </span>

      <!-- 嵌套 JSON 徽标 (悬停出现操作按钮：转义展开 / 新 Tab 打开) -->
      <span
        v-if="nestedJsonData"
        class="tree-nested-badge"
        @click.stop="toggleNestedExpand"
        @mouseenter="onNestedBadgeEnter($event)"
        @mouseleave="onNestedBadgeLeave"
        title="嵌套 JSON 字符串，悬停展开或新 Tab 打开"
      >
        <Braces class="capsule-icon" />
      </span>

      <!-- 键值文本与逗号无缝连接 (展示解码后的内容，点击复制解码值) -->
      <span
        :class="[valueClass, 'copyable-value', { 'is-image-url': isImageValue || !!mediaData, 'is-web-url': isOtherUrlValue }]"
        @click.stop="handleCopyValue(displayValue)"
        @mouseenter="onValueMouseEnter"
        @mouseleave="onValueMouseLeave"
        :data-tooltip="cronData ? ('' + cronData.translation) : (mediaData?.mediaType === 'audio' ? '音频直链 (悬停试听，点击复制)' : (mediaData?.mediaType === 'video' ? '视频直链 (悬停播放，点击复制)' : (isImageValue ? '图片链接 (悬停预览，点击复制)' : (isOtherUrlValue ? '点击复制键值，点击左侧图标可直接打开' : '点击复制键值'))))"
        v-html="highlightValue(displayValue)"
      ></span><span v-if="!isLast" class="node-comma">,</span>
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
            :class="{ 'is-expanded': isNestedExpanded }"
            @click.stop="toggleNestedExpand"
          >
            <FoldVertical v-if="isNestedExpanded" class="btn-icon" />
            <UnfoldVertical v-else class="btn-icon" />
            <span>{{ isNestedExpanded ? '还原收起' : '转义展开' }}</span>
          </button>
          <button
            class="nested-action-btn secondary"
            @click.stop="handleOpenInNewTab"
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
.tree-node {
  font-family: var(--font-mono);
  font-size: var(--editor-font-size, 13px);
  line-height: var(--editor-line-height, 20px);
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
  min-height: var(--editor-line-height, 20px);
}

.node-header {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  border-radius: 6px;
  padding: 0 4px;
  user-select: none;
  width: fit-content;
  min-height: var(--editor-line-height, 20px);
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
  transition: all 0.15s ease;
  border-radius: 2px;
}

.copyable-value:hover {
  background-color: var(--json-hover-bg, rgba(99, 102, 241, 0.08));
  opacity: 0.9;
}

.is-image-url {
  text-decoration: underline dotted var(--accent-color, #6366f1) !important;
  text-underline-offset: 4px;
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
  width: 0.88rem;
  height: 0.88rem;
  margin-right: 4px;
  margin-left: 1px;
  padding: 0;
  background: transparent;
  border: none !important;
  outline: none !important;
  border-radius: 3px !important;
  color: #2563eb;
  cursor: pointer;
  opacity: 0.95;
  vertical-align: middle;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.url-jump-btn:hover {
  background: rgba(37, 99, 235, 0.15);
  color: #2563eb;
  opacity: 1;
  transform: scale(1.15);
}

:global(.dark-mode) .url-jump-btn {
  background: transparent;
  border: none !important;
  color: #38bdf8;
  opacity: 1;
}

:global(.dark-mode) .url-jump-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  box-shadow: none;
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
  margin-left: 1px;
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

/* 时间戳徽标 */
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
  border: none !important;
  gap: 3px;
}
:global(.dark-mode) .tree-cron-badge {
  background-color: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.tree-html-badge {
  background-color: rgba(244, 63, 94, 0.12);
  color: #e11d48;
  border: none !important;
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
  margin-left: 1px;
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
:global(.dark-mode) .tree-unicode-badge:hover {
  background-color: rgba(168, 85, 247, 0.35);
  color: #e9d5ff;
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
  margin-left: 1px;
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
</style>
