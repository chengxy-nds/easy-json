<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  sparkColor: {
    type: String,
    default: '#fff'
  },
  sparkSize: {
    type: Number,
    default: 10
  },
  sparkRadius: {
    type: Number,
    default: 15
  },
  sparkCount: {
    type: Number,
    default: 8
  },
  duration: {
    type: Number,
    default: 400
  },
  easing: {
    type: String,
    default: 'ease-out'
  },
  extraScale: {
    type: Number,
    default: 1.0
  }
})

const containerRef = ref(null)
const canvasRef = ref(null)
const sparks = ref([])
let animationId = null
let resizeObserver = null

const easeFunc = (t) => {
  switch (props.easing) {
    case 'linear':
      return t
    case 'ease-in':
      return t * t
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    default: // ease-out
      return t * (2 - t)
  }
}

const resizeCanvas = () => {
  const container = containerRef.value
  const canvas = canvasRef.value
  if (!container || !canvas) return
  const rect = container.getBoundingClientRect()
  if (canvas.width !== rect.width || canvas.height !== rect.height) {
    canvas.width = rect.width
    canvas.height = rect.height
  }
}

const draw = (timestamp) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  sparks.value = sparks.value.filter((spark) => {
    const elapsed = timestamp - spark.startTime
    if (elapsed >= props.duration) {
      return false
    }

    const progress = elapsed / props.duration
    const eased = easeFunc(progress)

    const distance = eased * props.sparkRadius * props.extraScale
    const lineLength = props.sparkSize * (1 - eased)

    const x1 = spark.x + distance * Math.cos(spark.angle)
    const y1 = spark.y + distance * Math.sin(spark.angle)
    const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle)
    const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle)

    ctx.strokeStyle = spark.color || props.sparkColor
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    return true
  })

  if (sparks.value.length > 0) {
    animationId = requestAnimationFrame(draw)
  } else {
    animationId = null
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}

const startAnimation = () => {
  if (!animationId) {
    animationId = requestAnimationFrame(draw)
  }
}

const handleClick = (e) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const now = performance.now()
  const newSparks = Array.from({ length: props.sparkCount }, (_, i) => ({
    x,
    y,
    angle: (2 * Math.PI * i) / props.sparkCount,
    startTime: now,
    color: props.sparkColor
  }))

  sparks.value.push(...newSparks)
  startAnimation()
}

onMounted(() => {
  const container = containerRef.value
  if (container) {
    let resizeTimeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(resizeCanvas, 100)
    }
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    resizeCanvas()
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="click-spark-container"
    @click="handleClick"
  >
    <canvas
      ref="canvasRef"
      class="click-spark-canvas"
    />
    <slot />
  </div>
</template>

<style scoped>
.click-spark-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.click-spark-canvas {
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 9999;
}
</style>
