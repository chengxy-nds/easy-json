import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initAnalytics } from './utils/analytics.js'

initAnalytics()

const app = createApp(App)

app.config.errorHandler = (err, instance, info) => {
  console.error('[easyJSON Global Error]:', err, info)
}

app.mount('#app')

