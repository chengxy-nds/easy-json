import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initAnalytics } from './utils/analytics.js'

initAnalytics()

const app = createApp(App)

app.config.errorHandler = (err, instance, info) => {
  console.error('[easyJSON Global Error]:', err, info)
}

// 过滤浏览器良性的 ResizeObserver 布局帧延期警告（W3C 标准良性提示，不影响业务与运行）
const ignoredErrors = [
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded'
]
window.addEventListener('error', (event) => {
  if (ignoredErrors.some(msg => event.message?.includes(msg))) {
    event.stopImmediatePropagation()
    event.preventDefault()
  }
}, true)

app.mount('#app')

