<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { gsap } from 'gsap'
import './TargetCursor.css'

const props = defineProps({
  targetSelector: { type: String, default: '.cursor-target' },
  spinDuration: { type: Number, default: 2 },
  hideDefaultCursor: { type: Boolean, default: true },
  hoverDuration: { type: Number, default: 0.2 },
  parallaxOn: { type: Boolean, default: true },
  cursorColor: { type: String, default: '#ffffff' },
  cursorColorOnTarget: { type: String, default: undefined }
})

const cursorRef = ref(null)
const dotRef = ref(null)
const cornersRef = ref([])
let spinTl = null
let containingBlock = null

const isActiveRef = { current: false }
let targetCornerPositions = null
let tickerFn = null
let activeStrength = { current: 0 }

const isMobile = computed(() => {
  if (typeof window === 'undefined') return false
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isSmallScreen = window.innerWidth <= 768
  const userAgent = navigator.userAgent || navigator.vendor || window.opera || ''
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
  return (hasTouchScreen && isSmallScreen) || mobileRegex.test(userAgent.toLowerCase())
})

const constants = { borderWidth: 1, cornerSize: 10 }

// --- helpers ---
function getContainingBlock(element) {
  let node = element?.parentElement
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    if (
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.willChange.includes('transform') ||
      style.willChange.includes('perspective') ||
      style.willChange.includes('filter') ||
      /paint|layout|strict|content/.test(style.contain)
    ) return node
    node = node.parentElement
  }
  return null
}

function getContainingBlockOffset(block) {
  if (!block) return { x: 0, y: 0 }
  const rect = block.getBoundingClientRect()
  return { x: rect.left + block.clientLeft, y: rect.top + block.clientTop }
}

function moveCursor(x, y) {
  if (!cursorRef.value) return
  const { x: offsetX, y: offsetY } = getContainingBlockOffset(containingBlock)
  gsap.to(cursorRef.value, { x: x - offsetX, y: y - offsetY, duration: 0.1, ease: 'power3.out' })
}

// --- lifecycle ---
let activeTarget = null
let currentLeaveHandler = null
let resumeTimeout = null
let originalCursor = ''

function cleanupTarget(target) {
  if (currentLeaveHandler) { target.removeEventListener('mouseleave', currentLeaveHandler); currentLeaveHandler = null }
}

function createSpinTimeline() {
  if (spinTl) spinTl.kill()
  spinTl = gsap.timeline({ repeat: -1 }).to(cursorRef.value, { rotation: '+=360', duration: props.spinDuration, ease: 'none' })
}

function makeTickerFn() {
  return () => {
    if (!targetCornerPositions || !cursorRef.value || !cornersRef.value.length) return
    const strength = activeStrength.current
    if (strength === 0) return

    const cursorX = gsap.getProperty(cursorRef.value, 'x')
    const cursorY = gsap.getProperty(cursorRef.value, 'y')

    cornersRef.value.forEach((corner, i) => {
      const currentX = gsap.getProperty(corner, 'x')
      const currentY = gsap.getProperty(corner, 'y')
      const targetX = targetCornerPositions[i].x - cursorX
      const targetY = targetCornerPositions[i].y - cursorY
      const finalX = currentX + (targetX - currentX) * strength
      const finalY = currentY + (targetY - currentY) * strength
      const duration = strength >= 0.99 ? (props.parallaxOn ? 0.2 : 0) : 0.05
      gsap.to(corner, { x: finalX, y: finalY, duration, ease: duration === 0 ? 'none' : 'power1.out', overwrite: 'auto' })
    })
  }
}

function onResize() {
  containingBlock = getContainingBlock(cursorRef.value)
}

function onScroll() {
  if (!activeTarget || !cursorRef.value) return
  const { x: offsetX, y: offsetY } = getContainingBlockOffset(containingBlock)
  const mouseX = gsap.getProperty(cursorRef.value, 'x') + offsetX
  const mouseY = gsap.getProperty(cursorRef.value, 'y') + offsetY
  const elementUnderMouse = document.elementFromPoint(mouseX, mouseY)
  const isStillOver = elementUnderMouse &&
    (elementUnderMouse === activeTarget || elementUnderMouse.closest(props.targetSelector) === activeTarget)
  if (!isStillOver && currentLeaveHandler) currentLeaveHandler()
}

function onMouseDown() {
  if (!dotRef.value) return
  gsap.to(dotRef.value, { scale: 0.7, duration: 0.3 })
  gsap.to(cursorRef.value, { scale: 0.9, duration: 0.2 })
}

function onMouseUp() {
  if (!dotRef.value) return
  gsap.to(dotRef.value, { scale: 1, duration: 0.3 })
  gsap.to(cursorRef.value, { scale: 1, duration: 0.2 })
}

function onMove(e) { moveCursor(e.clientX, e.clientY) }

function onEnter(e) {
  const allTargets = []
  let current = e.target
  while (current && current !== document.body) {
    if (current.matches(props.targetSelector)) allTargets.push(current)
    current = current.parentElement
  }
  const target = allTargets[0] || null
  if (!target || !cursorRef.value || !cornersRef.value.length) return
  if (activeTarget === target) return
  if (activeTarget) cleanupTarget(activeTarget)
  if (resumeTimeout) { clearTimeout(resumeTimeout); resumeTimeout = null }

  activeTarget = target
  cornersRef.value.forEach(c => gsap.killTweensOf(c, 'x,y'))
  gsap.killTweensOf(cursorRef.value, 'rotation')
  spinTl?.pause()
  gsap.set(cursorRef.value, { rotation: 0 })

  if (props.cursorColorOnTarget) {
    gsap.to(cornersRef.value, { borderColor: props.cursorColorOnTarget, duration: 0.15, ease: 'power2.out' })
    if (dotRef.value) gsap.to(dotRef.value, { backgroundColor: props.cursorColorOnTarget, duration: 0.15, ease: 'power2.out' })
  }

  const rect = target.getBoundingClientRect()
  const { borderWidth, cornerSize } = constants
  const { x: offsetX, y: offsetY } = getContainingBlockOffset(containingBlock)
  const cursorX = gsap.getProperty(cursorRef.value, 'x')
  const cursorY = gsap.getProperty(cursorRef.value, 'y')

  targetCornerPositions = [
    { x: rect.left - borderWidth - offsetX, y: rect.top - borderWidth - offsetY },
    { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.top - borderWidth - offsetY },
    { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY },
    { x: rect.left - borderWidth - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY }
  ]

  isActiveRef.current = true
  gsap.ticker.add(tickerFn)
  gsap.to(activeStrength, { current: 1, duration: props.hoverDuration, ease: 'power2.out' })

  cornersRef.value.forEach((corner, i) => {
    gsap.to(corner, {
      x: targetCornerPositions[i].x - cursorX,
      y: targetCornerPositions[i].y - cursorY,
      duration: 0.2, ease: 'power2.out'
    })
  })

  const leaveHandler = () => {
    gsap.ticker.remove(tickerFn)
    isActiveRef.current = false
    targetCornerPositions = null
    gsap.set(activeStrength, { current: 0, overwrite: true })
    activeTarget = null

    if (props.cursorColorOnTarget && cornersRef.value.length) {
      gsap.to(cornersRef.value, { borderColor: props.cursorColor, duration: 0.15, ease: 'power2.out' })
      if (dotRef.value) gsap.to(dotRef.value, { backgroundColor: props.cursorColor, duration: 0.15, ease: 'power2.out' })
    }

    if (cornersRef.value.length) {
      gsap.killTweensOf(cornersRef.value, 'x,y')
      const { cornerSize } = constants
      const positions = [
        { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
        { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
        { x: cornerSize * 0.5, y: cornerSize * 0.5 },
        { x: -cornerSize * 1.5, y: cornerSize * 0.5 }
      ]
      const tl = gsap.timeline()
      cornersRef.value.forEach((corner, idx) => {
        tl.to(corner, { x: positions[idx].x, y: positions[idx].y, duration: 0.3, ease: 'power3.out' }, 0)
      })
    }

    resumeTimeout = setTimeout(() => {
      if (!activeTarget && cursorRef.value) {
        const currentRotation = gsap.getProperty(cursorRef.value, 'rotation')
        const normalized = currentRotation % 360
        spinTl?.kill()
        spinTl = gsap.timeline({ repeat: -1 }).to(cursorRef.value, { rotation: '+=360', duration: props.spinDuration, ease: 'none' })
        gsap.to(cursorRef.value, {
          rotation: normalized + 360,
          duration: props.spinDuration * (1 - normalized / 360),
          ease: 'none',
          onComplete: () => spinTl?.restart()
        })
      }
      resumeTimeout = null
    }, 50)

    cleanupTarget(target)
  }

  currentLeaveHandler = leaveHandler
  target.addEventListener('mouseleave', leaveHandler)
}

function setup() {
  if (isMobile.value || !cursorRef.value) return

  originalCursor = document.body.style.cursor
  if (props.hideDefaultCursor) document.body.style.cursor = 'none'

  containingBlock = getContainingBlock(cursorRef.value)
  const initialOffset = getContainingBlockOffset(containingBlock)
  gsap.set(cursorRef.value, {
    xPercent: -50, yPercent: -50,
    x: window.innerWidth / 2 - initialOffset.x,
    y: window.innerHeight / 2 - initialOffset.y
  })

  tickerFn = makeTickerFn()
  createSpinTimeline()

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseover', onEnter, { passive: true })
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
}

function teardown() {
  if (tickerFn) gsap.ticker.remove(tickerFn)
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseover', onEnter)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousedown', onMouseDown)
  window.removeEventListener('mouseup', onMouseUp)
  if (activeTarget) cleanupTarget(activeTarget)
  spinTl?.kill()
  if (props.hideDefaultCursor) document.body.style.cursor = originalCursor
  isActiveRef.current = false
  targetCornerPositions = null
  activeStrength.current = 0
}

onMounted(() => setup())
onBeforeUnmount(() => teardown())

watch(() => props.spinDuration, () => {
  if (isMobile.value || !cursorRef.value || !spinTl) return
  if (spinTl.isActive()) {
    spinTl.kill()
    spinTl = gsap.timeline({ repeat: -1 }).to(cursorRef.value, { rotation: '+=360', duration: props.spinDuration, ease: 'none' })
  }
})
</script>

<template>
  <div v-if="!isMobile" ref="cursorRef" class="target-cursor-wrapper">
    <div ref="dotRef" class="target-cursor-dot" :style="{ backgroundColor: cursorColor }" />
    <div
      v-for="cls in ['corner-tl','corner-tr','corner-br','corner-bl']"
      :key="cls"
      ref="cornersRef"
      class="target-cursor-corner"
      :class="cls"
      :style="{ borderColor: cursorColor }"
    />
  </div>
</template>
