<script setup>
import { ref, computed, watch, nextTick, inject } from 'vue'
import {
  Check,
  Copy,
  ExternalLink,
  Code2,
  CalendarClock,
  Clock,
  FileText,
  KeyRound,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  Braces
} from 'lucide-vue-next'
import { openExternalUrl, isHttpUrl } from '../utils/imageDetector.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  data: {
    type: Object,
    default: null
  },
  targetRect: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'enter', 'leave'])
const showToast = inject('showToast', null)

const popoverRef = ref(null)
const copied = ref(false)
const popoverPos = ref({ top: 0, left: 0, placement: 'bottom' })

// 计算卡片类型与徽标信息（100% 对齐 Video/图片弹窗）
const typeInfo = computed(() => {
  if (!props.data) return { tag: 'DATA', meta: '' }
  if (props.data.isJwt) {
    return { tag: 'JWT', meta: props.data.header?.alg ? `${props.data.header.alg}` : 'Token' }
  }
  if (props.data.isBase64Text) {
    const len = props.data.decoded?.length || 0
    return { tag: 'BASE64', meta: `${len} 字符` }
  }
  if (props.data.isUrlEncoded) {
    const len = props.data.decoded?.length || 0
    return { tag: 'URL', meta: `${len} 字符` }
  }
  if (props.data.isCron) {
    return { tag: 'CRON', meta: props.data.expression || '表达式' }
  }
  if (props.data.isHtml) {
    const len = props.data.raw?.length || 0
    return { tag: 'HTML', meta: `${len} 字符` }
  }
  return { tag: 'DATA', meta: '' }
})

// 计算默认复制内容与标签
const copyTargetContent = computed(() => {
  if (!props.data) return ''
  if (props.data.isJwt) return props.data.payloadStr
  if (props.data.isBase64Text || props.data.isUrlEncoded) return props.data.decoded
  if (props.data.isCron) return props.data.translation
  return props.data.raw || ''
})

const copyTargetLabel = computed(() => {
  if (!props.data) return '内容'
  if (props.data.isJwt) return 'Payload JSON'
  if (props.data.isBase64Text) return '解码明文'
  if (props.data.isUrlEncoded) return '解码文本'
  if (props.data.isCron) return '中文说明'
  return '内容'
})

// 判断解码后是否为有效网页链接
const isDecodedHttpUrl = computed(() => {
  if (!props.data?.isUrlEncoded && !props.data?.isBase64Text) return false
  const str = (props.data.decoded || '').trim()
  return isHttpUrl(str)
})

const openDecodedUrl = () => {
  if (isDecodedHttpUrl.value) {
    openExternalUrl(props.data.decoded.trim())
  }
}

// 一键复制内容
const handleCopyContent = async (text, label = '内容') => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text))
    copied.value = true
    if (showToast) showToast(`已复制${label}`)
    setTimeout(() => { copied.value = false }, 1800)
  } catch (e) {
    if (showToast) showToast('复制失败', 'error')
  }
}

// 安全过滤 HTML 内容
const sanitizeHtml = (rawHtml) => {
  if (!rawHtml) return ''
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, 'data-disabled=')
    .replace(/javascript:/gi, 'blocked:')
}

// 智能定位卡片
const updatePosition = () => {
  if (!props.targetRect || !popoverRef.value) return

  const rect = props.targetRect
  const el = popoverRef.value
  const popWidth = Math.min(420, Math.max(290, el.offsetWidth || 340))
  const popHeight = el.offsetHeight || 180

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const padding = 12

  let left = rect.left + (rect.width / 2) - (popWidth / 2)
  if (left < padding) left = padding
  if (left + popWidth > viewportWidth - padding) {
    left = viewportWidth - popWidth - padding
  }

  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top

  let top = 0
  let placement = 'bottom'

  if (spaceBelow >= popHeight + 10 || spaceBelow >= spaceAbove) {
    top = rect.bottom + 8
    placement = 'bottom'
    if (top + popHeight > viewportHeight - padding) {
      top = viewportHeight - popHeight - padding
    }
  } else {
    top = rect.top - popHeight - 8
    placement = 'top'
    if (top < padding) top = padding
  }

  popoverPos.value = { top, left, placement }
}

watch([() => props.visible, () => props.targetRect], async ([vis]) => {
  if (vis) {
    await nextTick()
    updatePosition()
  }
})

const onPopoverEnter = () => emit('enter')
const onPopoverLeave = () => emit('leave')
</script>

<template>
  <Teleport to="body">
    <Transition name="popover-fade">
      <div
        v-if="visible && data"
        ref="popoverRef"
        class="ej-smart-popover"
        :class="[`place-${popoverPos.placement}`]"
        :style="{
          top: `${popoverPos.top}px`,
          left: `${popoverPos.left}px`
        }"
        @mouseenter="onPopoverEnter"
        @mouseleave="onPopoverLeave"
      >
        <!-- 头部信息栏：100% 对齐 Video/图片弹窗 -->
        <div class="popover-header">
          <div class="badge-group">
            <span class="type-badge">{{ typeInfo.tag }}</span>
            <span v-if="typeInfo.meta" class="dimension-badge">{{ typeInfo.meta }}</span>
          </div>

          <div class="action-group">
            <!-- 复制按钮 -->
            <button
              class="icon-action-btn"
              :class="{ 'primary-open-btn': !isDecodedHttpUrl }"
              @click.stop="handleCopyContent(copyTargetContent, copyTargetLabel)"
              :title="copied ? '已复制到剪贴板' : `复制${copyTargetLabel}`"
            >
              <Check v-if="copied" class="action-icon success" />
              <Copy v-else class="action-icon" />
            </button>

            <!-- 解码结果若是网页链接，展示经典高亮紫色跳转小方块 -->
            <button
              v-if="isDecodedHttpUrl"
              class="icon-action-btn primary-open-btn"
              @click.stop="openDecodedUrl"
              title="在新标签页中打开链接"
            >
              <ExternalLink class="action-icon" />
            </button>
          </div>
        </div>

        <!-- 预览主体区：统一深色质感与微内嵌卡片 -->
        <div class="popover-body">
          <!-- 1. URL 解码文本 -->
          <div v-if="data.isUrlEncoded" class="smart-content-pane">
            <div class="code-box-wrapper">{{ data.decoded }}</div>
          </div>

          <!-- 2. Base64 解码文本 -->
          <div v-else-if="data.isBase64Text" class="smart-content-pane">
            <div class="code-box-wrapper">{{ data.decoded }}</div>
          </div>

          <!-- 3. JWT 呈现 -->
          <div v-else-if="data.isJwt" class="jwt-view">
            <div v-if="data.hasExp" class="jwt-status-bar" :class="{ 'is-expired': data.isExpired, 'is-valid': !data.isExpired }">
              <ShieldAlert v-if="data.isExpired" class="status-icon" />
              <ShieldCheck v-else class="status-icon" />
              <span class="status-text">
                {{ data.isExpired ? `已过期 (${data.remainingTimeStr})` : `有效中 (${data.remainingTimeStr})` }}
              </span>
              <span class="expire-time">到期: {{ data.expireDateStr }}</span>
            </div>

            <div class="jwt-section">
              <div class="section-title">
                <span>Payload (载荷明文)</span>
                <span v-if="data.payload?.sub" class="sub-badge">sub: {{ data.payload.sub }}</span>
              </div>
              <pre class="code-box-wrapper payload-box">{{ data.payloadStr }}</pre>
            </div>

            <div class="jwt-section header-section">
              <div class="section-title">Header (头部元数据)</div>
              <pre class="code-box-wrapper header-box">{{ data.headerStr }}</pre>
            </div>
          </div>

          <!-- 4. Cron 自然语言翻译 -->
          <div v-else-if="data.isCron" class="cron-view">
            <div class="cron-translation-card">
              <Clock class="cron-clock-icon" />
              <div class="cron-desc">{{ data.translation }}</div>
            </div>
            <div class="cron-expression-tag">
              <span class="tag-label">表达式:</span>
              <code>{{ data.expression }}</code>
            </div>
          </div>

          <!-- 5. HTML 代码片段 -->
          <div v-else-if="data.isHtml" class="html-view">
            <div class="html-preview-container" v-html="sanitizeHtml(data.raw)"></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ─── 100% 复刻 ImagePreviewPopover 的深邃质感容器系统 ─── */
.ej-smart-popover {
  position: fixed;
  z-index: 99999;
  width: 330px;
  max-width: calc(100vw - 24px);
  background: #1e1e2e !important;
  background-color: color-mix(in srgb, #1e1e2e 92%, transparent) !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 12px !important;
  box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) !important;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  user-select: text;
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
}

/* ─── 头部信息栏（与 Video 弹窗一模一样） ─── */
.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.08);
}

.badge-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-color, #6366f1);
  color: #ffffff;
  letter-spacing: 0.5px;
}

.dimension-badge {
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
  font-family: var(--font-mono, monospace);
}

.action-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-action-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.icon-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #f3f4f6);
}

.icon-action-btn.primary-open-btn {
  background: var(--accent-color, #6366f1);
  color: #ffffff;
}

.icon-action-btn.primary-open-btn:hover {
  background: #4f46e5;
  color: #ffffff;
  opacity: 0.95;
}

.action-icon {
  width: 13px;
  height: 13px;
}

.action-icon.success {
  color: #10b981;
}

/* ─── 主体内容区 ─── */
.popover-body {
  padding: 8px 10px;
  background-color: #121218;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.smart-content-pane {
  display: flex;
  flex-direction: column;
}

.code-box-wrapper {
  margin: 0;
  padding: 8px 10px;
  background: #181924;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: #e2e8f0;
  max-height: 200px;
  overflow-y: auto;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* JWT 专属样式 */
.jwt-status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 11px;
  margin-bottom: 6px;
}

.jwt-status-bar.is-valid {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.jwt-status-bar.is-expired {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.jwt-status-bar .status-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.jwt-status-bar .status-text {
  font-weight: 600;
}

.jwt-status-bar .expire-time {
  margin-left: auto;
  font-size: 10px;
  opacity: 0.85;
}

.jwt-section {
  margin-bottom: 6px;
}

.jwt-section:last-child {
  margin-bottom: 0;
}

.jwt-section .section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 3px;
}

.sub-badge {
  font-size: 9.5px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  padding: 1px 4px;
  border-radius: 3px;
}

/* Cron 专属样式 */
.cron-translation-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.2) 100%);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 8px;
  margin-bottom: 6px;
}

.cron-clock-icon {
  width: 18px;
  height: 18px;
  color: #818cf8;
  flex-shrink: 0;
}

.cron-desc {
  font-size: 13px;
  font-weight: 600;
  color: #a5b4fc;
  line-height: 1.4;
}

.cron-expression-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.cron-expression-tag code {
  padding: 2px 6px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  font-weight: 600;
  color: #818cf8;
}

/* HTML 专属样式 */
.html-preview-container {
  padding: 8px 10px;
  border-radius: 8px;
  background: #181924;
  border: none !important;
  box-shadow: none !important;
  font-size: 12px;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
  color: #cbd5e1;
}

/* 统一动画过渡（与图片/Video弹窗完全一致） */
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(4px);
}
</style>
