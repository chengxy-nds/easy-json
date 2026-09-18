import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'

export function useTabsDrag(activeId, editingTabId) {
  const tabsListRef = ref(null)
  const tabsOverflow = ref(false)
  const drag = { active: false, startX: 0, scrollLeft: 0 }

  // ── Tab 溢出省略时才展示 Tooltip ──
  const hoveredTabTooltip = ref({ id: null, text: null })

  const handleTabMouseEnter = (e, tab) => {
    if (editingTabId?.value === tab.id) {
      hoveredTabTooltip.value = { id: null, text: null }
      return
    }
    const textEl = e.currentTarget?.querySelector('.tab-title-text')
    // 检查文字内容真实宽度是否超出当前可见容器宽度（发生单行截断省略）
    if (textEl && textEl.scrollWidth > textEl.clientWidth + 1) {
      hoveredTabTooltip.value = { id: tab.id, text: tab.title }
    } else {
      hoveredTabTooltip.value = { id: null, text: null }
    }
  }

  const handleTabMouseLeave = (tabId) => {
    if (hoveredTabTooltip.value.id === tabId) {
      hoveredTabTooltip.value = { id: null, text: null }
    }
  }

  const getTabTooltip = (tabId) => {
    return hoveredTabTooltip.value.id === tabId ? hoveredTabTooltip.value.text : null
  }

  const checkOverflow = () => {
    const el = tabsListRef.value
    if (!el) return
    tabsOverflow.value = el.scrollWidth > el.clientWidth
  }

  let resizeObs = null

  const onMouseDown = (e) => {
    if (e.target.closest('.tab-close-btn')) return
    const el = tabsListRef.value
    if (!el) return
    drag.active = true
    drag.startX = e.pageX
    drag.scrollLeft = el.scrollLeft
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }

  const onMouseMove = (e) => {
    if (!drag.active) return
    const el = tabsListRef.value
    if (!el) return
    el.scrollLeft = drag.scrollLeft - (e.pageX - drag.startX)
  }

  const onMouseUp = () => {
    if (!drag.active) return
    drag.active = false
    const el = tabsListRef.value
    if (!el) return
    el.style.cursor = ''
    el.style.userSelect = ''
  }

  const onWheel = (e) => {
    const el = tabsListRef.value
    if (el) {
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
  }

  const scrollToEnd = () => {
    nextTick(() => {
      const el = tabsListRef.value
      if (el) {
        el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
      }
      checkOverflow()
    })
  }

  const scrollToActive = () => {
    nextTick(() => {
      const el = tabsListRef.value
      if (!el) return
      const active = el.querySelector('.compare-tab.active')
      if (!active) return
      const elRect = el.getBoundingClientRect()
      const tabRect = active.getBoundingClientRect()
      if (tabRect.left < elRect.left) {
        el.scrollTo({ left: el.scrollLeft + (tabRect.left - elRect.left) - 16, behavior: 'smooth' })
      } else if (tabRect.right > elRect.right) {
        el.scrollTo({ left: el.scrollLeft + (tabRect.right - elRect.right) + 16, behavior: 'smooth' })
      }
    })
  }

  onMounted(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    nextTick(() => {
      const el = tabsListRef.value
      if (el) {
        resizeObs = new ResizeObserver(checkOverflow)
        resizeObs.observe(el)
      }
      checkOverflow()
    })
  })

  onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    if (resizeObs) resizeObs.disconnect()
  })

  if (activeId) {
    watch(activeId, () => scrollToActive())
  }

  return {
    tabsListRef,
    tabsOverflow,
    onMouseDown,
    onWheel,
    scrollToEnd,
    scrollToActive,
    checkOverflow,
    handleTabMouseEnter,
    handleTabMouseLeave,
    getTabTooltip
  }
}
