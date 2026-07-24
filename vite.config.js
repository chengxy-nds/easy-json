import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue(), react()],
  assetsInclude: ['**/*.glb'],
  build: {
    rollupOptions: {
      onLog(level, log, handler) {
        // 屏蔽 @vueuse/core 的 PURE annotation 无害警告
        if (log.code === 'INVALID_ANNOTATION' && log.message?.includes('@vueuse')) return
        handler(level, log)
      }
    }
  },
})
