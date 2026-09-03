<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

const visible = ref(false)
const text = ref('')
const placement = ref('top') // default 'top'
const pos = ref({ top: 0, left: 0 })
const arrowPos = ref({ left: '50%', top: '50%' })

let currentTarget = null
let showTimer = null
let hideTimer = null

const getTooltipInfo = (target) => {
  if (!target || !(target instanceof HTMLElement)) return null
  let el = target
  while (el && el !== document.body) {
    const textTop = el.getAttribute('data-tooltip-top') || el.getAttribute('data-tooltip')
    if (textTop) return { el, text: textTop, placement: 'top' }

    const textBottom = el.getAttribute('data-tooltip-bottom')
    if (textBottom) return { el, text: textBottom, placement: 'bottom' }

    const textRight = el.getAttribute('data-tooltip-right')
    if (textRight) return { el, text: textRight, placement: 'right' }

    const textLeft = el.getAttribute('data-tooltip-left')
    if (textLeft) return { el, text: textLeft, placement: 'left' }

    const textBottomRight = el.getAttribute('data-tooltip-bottom-right')
    if (textBottomRight) return { el, text: textBottomRight, placement: 'bottom' }

    const textBottomLeft = el.getAttribute('data-tooltip-bottom-left')
    if (textBottomLeft) return { el, text: textBottomLeft, placement: 'bottom' }

    el = el.parentElement
  }
  return null
}

const updatePosition = () => {
  if (!currentTarget || !visible.value) return
  const rect = currentTarget.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    visible.value = false
    return
  }

  const tooltipEl = document.getElementById('ej-global-floating-tooltip')
  const tipW = tooltipEl ? tooltipEl.offsetWidth : 120
  const tipH = tooltipEl ? tooltipEl.offsetHeight : 28

  let top = 0
  let left = 0
  let place = placement.value

  const GAP = 7 // space between tooltip and element
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  if (place === 'bottom') {
    top = rect.bottom + GAP
    left = rect.left + rect.width / 2 - tipW / 2
    // If overflowing bottom of viewport, flip to top
    if (top + tipH > viewportH - 4) {
      top = rect.top - tipH - GAP
      place = 'top'
    }
  } else if (place === 'top') {
    top = rect.top - tipH - GAP
    left = rect.left + rect.width / 2 - tipW / 2
    // If overflowing top, flip to bottom
    if (top < 4) {
      top = rect.bottom + GAP
      place = 'bottom'
    }
  } else if (place === 'right') {
    top = rect.top + rect.height / 2 - tipH / 2
    left = rect.right + GAP
    if (left + tipW > viewportW - 4) {
      left = rect.left - tipW - GAP
      place = 'left'
    }
  } else if (place === 'left') {
    top = rect.top + rect.height / 2 - tipH / 2
    left = rect.left - tipW - GAP
    if (left < 4) {
      left = rect.right + GAP
      place = 'right'
    }
  }

  // Constrain horizontally within viewport
  left = Math.max(8, Math.min(viewportW - tipW - 8, left))

  // Calculate arrow offset relative to element center
  const elemCenterX = rect.left + rect.width / 2
  const arrowRelX = elemCenterX - left
  const boundedArrowX = Math.max(12, Math.min(tipW - 12, arrowRelX))

  pos.value = { top, left }
  arrowPos.value = { left: `${boundedArrowX}px`, top: '50%' }
  placement.value = place
}

const handleMouseOver = (e) => {
  const info = getTooltipInfo(e.target)
  if (!info || !info.text) {
    if (currentTarget && !e.target.closest?.('[data-tooltip],[data-tooltip-bottom],[data-tooltip-top],[data-tooltip-left],[data-tooltip-right],[data-tooltip-bottom-right],[data-tooltip-bottom-left]')) {
      hideTooltip()
    }
    return
  }

  if (currentTarget === info.el && visible.value && text.value === info.text) {
    return
  }

  currentTarget = info.el
  text.value = info.text
  placement.value = info.placement

  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  if (showTimer) clearTimeout(showTimer)

  // Show immediately / ultra-responsive
  showTimer = setTimeout(() => {
    visible.value = true
    nextTick(() => {
      updatePosition()
    })
  }, 40)
}

const hideTooltip = () => {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    visible.value = false
    currentTarget = null
  }, 40)
}

const handleScrollOrClick = () => {
  if (visible.value) {
    visible.value = false
    currentTarget = null
  }
}

onMounted(() => {
  document.addEventListener('mouseover', handleMouseOver, { passive: true })
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget || !document.body.contains(e.relatedTarget)) {
      hideTooltip()
    }
  }, { passive: true })
  window.addEventListener('scroll', handleScrollOrClick, { passive: true, capture: true })
  window.addEventListener('resize', handleScrollOrClick, { passive: true })
  document.addEventListener('click', handleScrollOrClick, { passive: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('mouseover', handleMouseOver)
  window.removeEventListener('scroll', handleScrollOrClick, { capture: true })
  window.removeEventListener('resize', handleScrollOrClick)
  document.removeEventListener('click', handleScrollOrClick)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ej-tooltip-fade">
      <div
        v-if="visible && text"
        id="ej-global-floating-tooltip"
        class="ej-global-floating-tooltip"
        :class="[`place-${placement}`]"
        :style="{
          top: `${pos.top}px`,
          left: `${pos.left}px`
        }"
      >
        <span class="tooltip-text">{{ text }}</span>
        <div
          class="tooltip-arrow"
          :style="{ left: arrowPos.left }"
        ></div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ej-global-floating-tooltip {
  position: fixed;
  z-index: 9999999;
  pointer-events: none;
  background-color: #0f172a;
  color: #f8fafc;
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.2);
  white-space: pre-line;
  max-width: 360px;
  text-align: center;
  user-select: none;
  will-change: transform, opacity;
}

.tooltip-text {
  position: relative;
  z-index: 1;
}

/* Arrow indicator */
.tooltip-arrow {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  transform: translateX(-50%);
}

/* Top placement arrow (arrow at bottom pointing down) */
.place-top .tooltip-arrow {
  bottom: -5px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #0f172a;
}

/* Bottom placement arrow (arrow at top pointing up) */
.place-bottom .tooltip-arrow {
  top: -5px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid #0f172a;
}

/* Left placement arrow (arrow at right pointing right) */
.place-left .tooltip-arrow {
  right: -5px;
  top: 50%;
  transform: translateY(-50%);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 5px solid #0f172a;
}

/* Right placement arrow (arrow at left pointing left) */
.place-right .tooltip-arrow {
  left: -5px;
  top: 50%;
  transform: translateY(-50%);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 5px solid #0f172a;
}

/* Transitions */
.ej-tooltip-fade-enter-active,
.ej-tooltip-fade-leave-active {
  transition: opacity 0.1s cubic-bezier(0.4, 0, 0.2, 1), transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
}

.ej-tooltip-fade-enter-from,
.ej-tooltip-fade-leave-to {
  opacity: 0;
  transform: scale(0.94);
}
</style>
