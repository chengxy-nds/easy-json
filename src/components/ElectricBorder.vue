<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import './ElectricBorder.css'

const props = defineProps({
  color: { type: String, default: '#5227FF' },
  speed: { type: Number, default: 1 },
  chaos: { type: Number, default: 0.12 },
  borderRadius: { type: Number, default: 24 }
})

const canvasRef = ref(null)
const containerRef = ref(null)
let animationId = null
let time = 0
let lastFrameTime = 0
let resizeObserver = null

// Noise
function random(x) {
  return (Math.sin(x * 12.9898) * 43758.5453) % 1
}

function noise2D(x, y) {
  const i = Math.floor(x), j = Math.floor(y)
  const fx = x - i, fy = y - j
  const a = random(i + j * 57)
  const b = random(i + 1 + j * 57)
  const c = random(i + (j + 1) * 57)
  const d = random(i + 1 + (j + 1) * 57)
  const ux = fx * fx * (3.0 - 2.0 * fx)
  const uy = fy * fy * (3.0 - 2.0 * fy)
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
}

function octavedNoise(x, octaves, lacunarity, gain, baseAmplitude, baseFrequency, time, seed, baseFlatness) {
  let y = 0
  let amplitude = baseAmplitude
  let frequency = baseFrequency
  for (let i = 0; i < octaves; i++) {
    let octaveAmplitude = amplitude
    if (i === 0) octaveAmplitude *= baseFlatness
    y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3)
    frequency *= lacunarity
    amplitude *= gain
  }
  return y
}

function getCornerPoint(centerX, centerY, radius, startAngle, arcLength, progress) {
  const angle = startAngle + progress * arcLength
  return { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) }
}

function getRoundedRectPoint(t, left, top, width, height, radius) {
  const straightWidth = width - 2 * radius
  const straightHeight = height - 2 * radius
  const cornerArc = (Math.PI * radius) / 2
  const totalPerimeter = 2 * straightWidth + 2 * straightHeight + 4 * cornerArc
  const distance = t * totalPerimeter

  let accumulated = 0
  if (distance <= accumulated + straightWidth)
    return { x: left + radius + ((distance - accumulated) / straightWidth) * straightWidth, y: top }
  accumulated += straightWidth
  if (distance <= accumulated + cornerArc)
    return getCornerPoint(left + width - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2, (distance - accumulated) / cornerArc)
  accumulated += cornerArc
  if (distance <= accumulated + straightHeight)
    return { x: left + width, y: top + radius + ((distance - accumulated) / straightHeight) * straightHeight }
  accumulated += straightHeight
  if (distance <= accumulated + cornerArc)
    return getCornerPoint(left + width - radius, top + height - radius, radius, 0, Math.PI / 2, (distance - accumulated) / cornerArc)
  accumulated += cornerArc
  if (distance <= accumulated + straightWidth)
    return { x: left + width - radius - ((distance - accumulated) / straightWidth) * straightWidth, y: top + height }
  accumulated += straightWidth
  if (distance <= accumulated + cornerArc)
    return getCornerPoint(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI / 2, (distance - accumulated) / cornerArc)
  accumulated += cornerArc
  if (distance <= accumulated + straightHeight)
    return { x: left, y: top + height - radius - ((distance - accumulated) / straightHeight) * straightHeight }
  accumulated += straightHeight
  return getCornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, (distance - accumulated) / cornerArc)
}

function startAnimation() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const octaves = 10
  const lacunarity = 1.6
  const gain = 0.7
  const amplitude = props.chaos
  const frequency = 10
  const baseFlatness = 0
  const displacement = 60
  const borderOffset = 60
  let width, height
  let lastDpr = Math.min(window.devicePixelRatio || 1, 2)

  function updateSize() {
    const rect = container.getBoundingClientRect()
    width = rect.width + borderOffset * 2
    height = rect.height + borderOffset * 2
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    return { width, height }
  }

  updateSize()

  function drawElectricBorder(currentTime) {
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (dpr !== lastDpr) {
      lastDpr = dpr
      updateSize()
    }
    const deltaTime = (currentTime - lastFrameTime) / 1000
    time += deltaTime * props.speed
    lastFrameTime = currentTime

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const effectiveRadius = Math.min(props.borderRadius, Math.min(width - 2 * borderOffset, height - 2 * borderOffset) / 2)
    ctx.strokeStyle = props.color
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const left = borderOffset
    const top = borderOffset
    const borderWidth = width - 2 * borderOffset
    const borderHeight = height - 2 * borderOffset
    const approximatePerimeter = 2 * (borderWidth + borderHeight) + 2 * Math.PI * effectiveRadius
    const sampleCount = Math.floor(approximatePerimeter / 2)

    ctx.beginPath()
    for (let i = 0; i <= sampleCount; i++) {
      const progress = i / sampleCount
      const point = getRoundedRectPoint(progress, left, top, borderWidth, borderHeight, effectiveRadius)
      const xNoise = octavedNoise(progress * 8, octaves, lacunarity, gain, amplitude, frequency, time, 0, baseFlatness)
      const yNoise = octavedNoise(progress * 8, octaves, lacunarity, gain, amplitude, frequency, time, 1, baseFlatness)
      const displacedX = point.x + xNoise * displacement
      const displacedY = point.y + yNoise * displacement
      if (i === 0) ctx.moveTo(displacedX, displacedY)
      else ctx.lineTo(displacedX, displacedY)
    }
    ctx.closePath()
    ctx.stroke()

    animationId = requestAnimationFrame(drawElectricBorder)
  }

  resizeObserver = new ResizeObserver(() => updateSize())
  resizeObserver.observe(container)

  lastFrameTime = performance.now()
  animationId = requestAnimationFrame(drawElectricBorder)
}

function stopAnimation() {
  if (animationId) { cancelAnimationFrame(animationId); animationId = null }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
}

onMounted(() => nextTick(() => startAnimation()))
onBeforeUnmount(() => stopAnimation())

watch(() => [props.color, props.speed, props.chaos, props.borderRadius], () => {
  stopAnimation()
  nextTick(() => startAnimation())
})
</script>

<template>
  <div
    ref="containerRef"
    class="electric-border"
    :style="{
      '--electric-border-color': color,
      borderRadius: borderRadius + 'px'
    }"
  >
    <div class="eb-canvas-container">
      <canvas ref="canvasRef" class="eb-canvas" />
    </div>
    <div class="eb-layers">
      <div class="eb-glow-1" />
      <div class="eb-glow-2" />
      <div class="eb-background-glow" />
    </div>
    <div class="eb-content">
      <slot />
    </div>
  </div>
</template>
