<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useSplashCursor } from '../composables/useSplashCursor.js'

const props = defineProps({
  SIM_RESOLUTION: { type: Number, default: 128 },
  DYE_RESOLUTION: { type: Number, default: 1440 },
  CAPTURE_RESOLUTION: { type: Number, default: 512 },
  DENSITY_DISSIPATION: { type: Number, default: 3.5 },
  VELOCITY_DISSIPATION: { type: Number, default: 2 },
  PRESSURE: { type: Number, default: 0.1 },
  PRESSURE_ITERATIONS: { type: Number, default: 20 },
  CURL: { type: Number, default: 3 },
  SPLAT_RADIUS: { type: Number, default: 0.2 },
  SPLAT_FORCE: { type: Number, default: 6000 },
  SHADING: { type: Boolean, default: true },
  COLOR_UPDATE_SPEED: { type: Number, default: 10 },
  RAINBOW_MODE: { type: Boolean, default: true },
  COLOR: { type: String, default: '#ff0000' },
  BACK_COLOR: { type: Object, default: () => ({ r: 0.5, g: 0, b: 0 }) },
  TRANSPARENT: { type: Boolean, default: true }
})

const canvasRef = ref(null)
let cursorCtrl = null

onMounted(() => {
  if (!canvasRef.value) return

  const config = {
    SIM_RESOLUTION: props.SIM_RESOLUTION,
    DYE_RESOLUTION: props.DYE_RESOLUTION,
    CAPTURE_RESOLUTION: props.CAPTURE_RESOLUTION,
    DENSITY_DISSIPATION: props.DENSITY_DISSIPATION,
    VELOCITY_DISSIPATION: props.VELOCITY_DISSIPATION,
    PRESSURE: props.PRESSURE,
    PRESSURE_ITERATIONS: props.PRESSURE_ITERATIONS,
    CURL: props.CURL,
    SPLAT_RADIUS: props.SPLAT_RADIUS,
    SPLAT_FORCE: props.SPLAT_FORCE,
    SHADING: props.SHADING,
    COLOR_UPDATE_SPEED: props.COLOR_UPDATE_SPEED,
    RAINBOW_MODE: props.RAINBOW_MODE,
    COLOR: props.COLOR,
    BACK_COLOR: props.BACK_COLOR,
    TRANSPARENT: props.TRANSPARENT
  }

  cursorCtrl = useSplashCursor(canvasRef.value, config)
  cursorCtrl.start()
})

onBeforeUnmount(() => {
  if (cursorCtrl) cursorCtrl.stop()
})
</script>

<template>
  <div class="splash-cursor-wrap">
    <canvas
      ref="canvasRef"
      class="splash-cursor-canvas"
    />
  </div>
</template>

<style scoped>
.splash-cursor-wrap {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  pointer-events: none;
  width: 100%;
  height: 100%;
}

.splash-cursor-canvas {
  width: 100vw;
  height: 100vh;
  display: block;
}
</style>
