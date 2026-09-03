<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } from 'vue'
import { ExternalLink, Check, Image as ImageIcon, AlertCircle, Loader2, Maximize2, ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-vue-next'
import { getImageType, openExternalUrl } from '../utils/imageDetector.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  url: {
    type: String,
    default: ''
  },
  targetRect: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'enter', 'leave'])

const showToast = inject('showToast', null)

const popoverRef = ref(null)
const imgElRef = ref(null)
const isLoading = ref(true)
const isError = ref(false)
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const copiedImage = ref(false)

// 放大预览模态框状态
const showZoomModal = ref(false)
const zoomScale = ref(1)

const openZoomModal = () => {
  zoomScale.value = 1
  showZoomModal.value = true
}

const closeZoomModal = () => {
  showZoomModal.value = false
  zoomScale.value = 1
}

const zoomIn = () => {
  zoomScale.value = Math.min(3, +(zoomScale.value + 0.25).toFixed(2))
}

const zoomOut = () => {
  zoomScale.value = Math.max(0.5, +(zoomScale.value - 0.25).toFixed(2))
}

const resetZoom = () => {
  zoomScale.value = 1
}

const handleKeyDown = (e) => {
  if (showZoomModal.value && e.key === 'Escape') {
    closeZoomModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

const popoverPos = ref({ top: 0, left: 0, placement: 'bottom' })

const imageFormat = computed(() => getImageType(props.url))

const dimensionText = computed(() => {
  if (naturalWidth.value && naturalHeight.value) {
    return `${naturalWidth.value} × ${naturalHeight.value} px`
  }
  return ''
})

// 重置与加载新图片
watch(() => props.url, (newUrl) => {
  if (!newUrl) return
  isLoading.value = true
  isError.value = false
  naturalWidth.value = 0
  naturalHeight.value = 0
}, { immediate: true })

const handleImageLoad = (e) => {
  isLoading.value = false
  isError.value = false
  const img = e.target
  naturalWidth.value = img.naturalWidth || 0
  naturalHeight.value = img.naturalHeight || 0
  updatePosition()
}

const handleImageError = () => {
  isLoading.value = false
  isError.value = true
  updatePosition()
}

const convertBlobToPng = (blob) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || 200
      canvas.height = img.naturalHeight || 200
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob)
        else reject(new Error('Canvas toBlob failed'))
      }, 'image/png')
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

// 复制图片本身到系统剪贴板（可直接在微信/钉钉/文档/设计软件中粘贴）
const copyImage = async () => {
  if (!props.url) return

  try {
    // 1. 如果是 Base64 Data URI
    if (props.url.startsWith('data:image/')) {
      const res = await fetch(props.url)
      const blob = await res.blob()
      let pngBlob = blob
      if (blob.type !== 'image/png') {
        pngBlob = await convertBlobToPng(blob)
      }
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ])
      copiedImage.value = true
      if (showToast) showToast('已成功复制图片到剪贴板')
      setTimeout(() => { copiedImage.value = false }, 1800)
      return
    }

    // 2. 尝试从已加载的 <img> 节点绘制到 Canvas
    const img = imgElRef.value
    if (img && img.complete && img.naturalWidth > 0) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ])
          copiedImage.value = true
          if (showToast) showToast('已成功复制图片到剪贴板')
          setTimeout(() => { copiedImage.value = false }, 1800)
          return
        }
      } catch (canvasErr) {
        // Tainted canvas due to CORS
      }
    }

    // 3. 尝试直接 fetch
    const res = await fetch(props.url, { mode: 'cors' })
    const rawBlob = await res.blob()
    const pngBlob = rawBlob.type === 'image/png' ? rawBlob : await convertBlobToPng(rawBlob)
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ])
    copiedImage.value = true
    if (showToast) showToast('已成功复制图片到剪贴板')
    setTimeout(() => { copiedImage.value = false }, 1800)
  } catch (err) {
    console.warn('Direct image clipboard write error:', err)
    try {
      await navigator.clipboard.writeText(props.url)
      copiedImage.value = true
      if (showToast) showToast('受浏览器跨域限制无法写入图片数据，已复制图片链接', 'info')
      setTimeout(() => { copiedImage.value = false }, 1800)
    } catch (err2) {
      if (showToast) showToast('复制图片失败', 'error')
    }
  }
}

const openInNewTab = () => {
  if (!props.url) return
  // Base64 或 普通 URL
  if (props.url.startsWith('data:image/')) {
    const win = window.open()
    if (win) {
      win.document.write(`<iframe src="${props.url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`)
    }
  } else {
    openExternalUrl(props.url)
  }
}

// 智能计算卡片位置（自适应视口边缘）
const updatePosition = () => {
  if (!props.targetRect || !popoverRef.value) return

  const rect = props.targetRect
  const popoverEl = popoverRef.value
  const popWidth = popoverEl.offsetWidth || 280
  const popHeight = popoverEl.offsetHeight || 220

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const padding = 12

  // 默认水平居中对齐目标元素
  let left = rect.left + (rect.width / 2) - (popWidth / 2)
  // 限制左右边界
  if (left < padding) left = padding
  if (left + popWidth > viewportWidth - padding) {
    left = viewportWidth - popWidth - padding
  }

  // 垂直方向判断：下方空间是否足够，不够则放上方
  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top

  let top = 0
  let placement = 'bottom'

  if (spaceBelow >= popHeight + 10 || spaceBelow >= spaceAbove) {
    // 放在下方
    top = rect.bottom + 8
    placement = 'bottom'
    // 若超出底部则向上贴齐
    if (top + popHeight > viewportHeight - padding) {
      top = viewportHeight - popHeight - padding
    }
  } else {
    // 放在上方
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

const onPopoverEnter = () => {
  emit('enter')
}

const onPopoverLeave = () => {
  emit('leave')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="popover-fade">
      <div
        v-if="visible && url"
        ref="popoverRef"
        class="ej-image-preview-popover"
        :class="[`place-${popoverPos.placement}`]"
        :style="{
          top: `${popoverPos.top}px`,
          left: `${popoverPos.left}px`
        }"
        @mouseenter="onPopoverEnter"
        @mouseleave="onPopoverLeave"
      >
        <!-- 头部信息栏 -->
        <div class="popover-header">
          <div class="badge-group">
            <span class="type-badge">{{ imageFormat }}</span>
            <span v-if="dimensionText" class="dimension-badge">{{ dimensionText }}</span>
          </div>

          <div class="action-group">
            <button
              class="icon-action-btn primary-copy-btn"
              @click.stop="copyImage"
              :title="copiedImage ? '已复制图片' : '复制图片 (可直接粘贴)'"
            >
              <Check v-if="copiedImage" class="action-icon success" />
              <ImageIcon v-else class="action-icon" />
            </button>
            <button
              class="icon-action-btn"
              @click.stop="openZoomModal"
              title="放大查看大图"
            >
              <Maximize2 class="action-icon" />
            </button>
            <button
              class="icon-action-btn"
              @click.stop="openInNewTab"
              title="在新标签页打开原图"
            >
              <ExternalLink class="action-icon" />
            </button>
          </div>
        </div>

        <!-- 图片预览主体区 -->
        <div class="popover-body">
          <!-- Loading 骨架 -->
          <div v-if="isLoading" class="state-container loading-state">
            <Loader2 class="spinner-icon" />
            <span class="state-text">图片加载中...</span>
          </div>

          <!-- 加载失败 -->
          <div v-if="isError" class="state-container error-state">
            <AlertCircle class="error-icon" />
            <span class="state-text">图片无法直接预览</span>
            <span class="sub-text">可能存在防盗链或链接已失效</span>
            <button class="retry-link-btn" @click.stop="openInNewTab">
              尝试直接打开 <ExternalLink class="btn-sm-icon" />
            </button>
          </div>

          <!-- 真实图片（带 no-referrer 规避大部分防盗链） -->
          <div class="image-wrapper" :class="{ 'img-loaded': !isLoading && !isError }">
            <img
              ref="imgElRef"
              :src="url"
              referrerpolicy="no-referrer"
              crossorigin="anonymous"
              alt="Preview"
              @load="handleImageLoad"
              @error="handleImageError"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- 全屏放大查看图片模态框 -->
    <Transition name="modal-fade">
      <div
        v-if="showZoomModal && url"
        class="ej-image-zoom-overlay"
        @click.self="closeZoomModal"
      >
        <div class="zoom-toolbar">
          <div class="zoom-meta">
            <span class="type-badge">{{ imageFormat }}</span>
            <span v-if="dimensionText" class="dimension-badge">{{ dimensionText }}</span>
            <span class="scale-badge">{{ Math.round(zoomScale * 100) }}%</span>
          </div>

          <div class="zoom-actions">
            <button class="zoom-btn" @click="zoomIn" title="放大">
              <ZoomIn class="action-icon" />
            </button>
            <button class="zoom-btn" @click="zoomOut" title="缩小">
              <ZoomOut class="action-icon" />
            </button>
            <button class="zoom-btn" @click="resetZoom" title="重置缩放">
              <RotateCcw class="action-icon" />
            </button>
            <button class="zoom-btn" @click="copyImage" :title="copiedImage ? '已复制图片' : '复制图片'">
              <Check v-if="copiedImage" class="action-icon success" />
              <ImageIcon v-else class="action-icon" />
            </button>
            <button class="zoom-btn" @click="openInNewTab" title="在新标签页打开">
              <ExternalLink class="action-icon" />
            </button>
            <button class="zoom-btn close-btn" @click="closeZoomModal" title="关闭 (Esc)">
              <X class="action-icon" />
            </button>
          </div>
        </div>

        <div class="zoom-image-container" @click.self="closeZoomModal">
          <img
            :src="url"
            referrerpolicy="no-referrer"
            crossorigin="anonymous"
            class="zoom-image"
            :style="{ transform: `scale(${zoomScale})` }"
            alt="Enlarged preview"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ej-image-preview-popover {
  position: fixed;
  z-index: 99999;
  width: 290px;
  max-width: calc(100vw - 24px);
  background: var(--bg-card, #1e1e2e);
  background-color: color-mix(in srgb, var(--bg-card, #1e1e2e) 90%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 12px;
  box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  user-select: none;
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
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
  background: var(--border-color, rgba(255, 255, 255, 0.1));
  color: var(--text-primary, #f3f4f6);
}

.action-icon {
  width: 13px;
  height: 13px;
}

.action-icon.success {
  color: #10b981;
}

.popover-body {
  position: relative;
  min-height: 140px;
  max-height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-app, #121218);
  /* 棋盘背景，方便透视透明 PNG/SVG */
  background-image: linear-gradient(45deg, rgba(128, 128, 128, 0.08) 25%, transparent 25%),
                    linear-gradient(-45deg, rgba(128, 128, 128, 0.08) 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, rgba(128, 128, 128, 0.08) 75%),
                    linear-gradient(-45deg, transparent 75%, rgba(128, 128, 128, 0.08) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  overflow: hidden;
}

.image-wrapper {
  width: 100%;
  height: 100%;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 6px;
}

.image-wrapper.img-loaded {
  display: flex;
}

.image-wrapper img {
  max-width: 100%;
  max-height: 230px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px 14px;
  text-align: center;
}

.loading-state .spinner-icon {
  width: 22px;
  height: 22px;
  color: var(--accent-color, #6366f1);
  animation: ej-spin 1s linear infinite;
}

.state-text {
  font-size: 12px;
  color: var(--text-primary, #e5e7eb);
  font-weight: 500;
}

.error-state .error-icon {
  width: 22px;
  height: 22px;
  color: #ef4444;
}

.error-state .sub-text {
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
}

.retry-link-btn {
  margin-top: 4px;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--accent-color, #6366f1);
  color: #ffffff;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: opacity 0.15s ease;
}

.retry-link-btn:hover {
  opacity: 0.9;
}

.btn-sm-icon {
  width: 11px;
  height: 11px;
}

@keyframes ej-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 弹窗动效 */
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(4px);
}

/* ── 全屏大图模态框 ── */
.ej-image-zoom-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  background-color: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.zoom-toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 16px;
  background: rgba(26, 27, 38, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 30px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  z-index: 10;
}

.zoom-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scale-badge {
  font-size: 11px;
  color: #a5b4fc;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
}

.zoom-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zoom-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  color: #e5e7eb;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.zoom-btn:hover {
  background: var(--accent-color, #6366f1);
  color: #ffffff;
  transform: scale(1.08);
}

.zoom-btn.close-btn:hover {
  background: #ef4444;
  color: #ffffff;
}

.zoom-image-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 60px 24px 24px 24px;
  /* 棋盘透明底 */
  background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
                    linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%),
                    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

.zoom-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center center;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
