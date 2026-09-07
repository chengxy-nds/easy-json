<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import React from 'react'
import { createRoot } from 'react-dom/client'
import Lanyard from './Lanyard.jsx'

const props = defineProps({
  position: { type: Array, default: () => [0, 0, 20] },
  gravity: { type: Array, default: () => [0, -40, 0] },
  fov: { type: Number, default: 20 },
  anchorX: { type: Number, default: null },
  transparent: { type: Boolean, default: true },
  frontImage: { type: String, default: null },
  backImage: { type: String, default: null },
  imageFit: { type: String, default: 'cover' },
  lanyardImage: { type: String, default: null },
  lanyardWidth: { type: Number, default: 1 },
  active: { type: Boolean, default: true }
})

const containerRef = ref(null)
const isLoaded = ref(false)
let root = null
let idleId = null
let timeoutId = null

function isWebGLSupported() {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch (e) {
    return false
  }
}

const handleLanyardLoaded = () => {
  isLoaded.value = true
}

const render3D = () => {
  if (!containerRef.value || !isWebGLSupported()) return
  try {
    if (!root) {
      root = createRoot(containerRef.value)
    }
    root.render(
      React.createElement(Lanyard, {
        position: props.position,
        gravity: props.gravity,
        fov: props.fov,
        anchorX: props.anchorX,
        transparent: props.transparent,
        frontImage: props.frontImage,
        backImage: props.backImage,
        imageFit: props.imageFit,
        lanyardImage: props.lanyardImage,
        lanyardWidth: props.lanyardWidth,
        onLoaded: handleLanyardLoaded,
        active: props.active
      })
    )
  } catch (err) {
    console.warn('Failed to render Lanyard 3D component:', err)
  }
}

watch(() => props.active, () => {
  if (root) {
    render3D()
  }
})

onMounted(() => {
  // 避开首页路由切换、DOM 绘制与 Hero 区粒子初始化的 CPU 峰值
  if ('requestIdleCallback' in window) {
    idleId = requestIdleCallback(() => {
      timeoutId = setTimeout(render3D, 180)
    }, { timeout: 600 })
  } else {
    timeoutId = setTimeout(render3D, 250)
  }
})

onBeforeUnmount(() => {
  if (idleId && 'cancelIdleCallback' in window) {
    cancelIdleCallback(idleId)
  }
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
  if (root) {
    root.unmount()
    root = null
  }
})
</script>

<template>
  <div 
    ref="containerRef" 
    class="lanyard-vue-container"
    :class="{ 'is-ready': isLoaded }"
  ></div>
</template>

<style scoped>
.lanyard-vue-container {
  width: 100%;
  height: 100%;
  min-height: 480px;
  position: relative;
  overflow: visible;
  opacity: 0;
  transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity;
}

.lanyard-vue-container.is-ready {
  opacity: 1;
}
</style>

