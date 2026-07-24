<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
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
  lanyardWidth: { type: Number, default: 1 }
})

const containerRef = ref(null)
let root = null

onMounted(() => {
  if (containerRef.value) {
    root = createRoot(containerRef.value)
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
        lanyardWidth: props.lanyardWidth
      })
    )
  }
})

onBeforeUnmount(() => {
  if (root) {
    root.unmount()
    root = null
  }
})
</script>

<template>
  <div ref="containerRef" class="lanyard-vue-container"></div>
</template>

<style scoped>
.lanyard-vue-container {
  width: 100%;
  height: 100%;
  min-height: 480px;
  position: relative;
  overflow: visible;
}
</style>
