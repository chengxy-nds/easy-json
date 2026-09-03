<script setup>
import { ref, inject, onMounted, onBeforeUnmount } from 'vue'
import { UploadCloud, Terminal, Globe, FileCode, RefreshCw } from 'lucide-vue-next'
import { safeParse, safeStringify } from '../utils/jsonBigInt.js'

const emit = defineEmits(['import-text'])
const showToast = inject('showToast')
const autoPaste = inject('autoPaste', ref(false))

const panelOpen = ref(false)
const activeTab = ref('file') // 'file' | 'curl' | 'url' | 'base64'
const curlInput = ref('')
const urlInput = ref('')
const base64Input = ref('')
const loading = ref(false)
const showRawOutput = ref(false) // 是否显示原始输出
const rawOutput = ref('') // 原始输出内容

const switchTab = (tab) => {
  activeTab.value = tab
  curlInput.value = ''
  urlInput.value = ''
  base64Input.value = ''
}

// 自动粘贴：焦点进入空输入框时读取剪贴板
const handleCurlAutoPaste = () => handleAutoPaste(curlInput)
const handleUrlAutoPaste = () => handleAutoPaste(urlInput)
const handleBase64AutoPaste = () => handleAutoPaste(base64Input)

const handleAutoPaste = async (targetRef) => {
  if (!autoPaste.value) return
  // 只往空输入框粘贴
  if (targetRef.value?.trim()) return

  try {
    let text = ''

    // 1. uTools 环境
    if (window.utools && typeof window.utools.readText === 'function') {
      text = window.utools.readText()
    }
    // 2. Tauri 桌面环境
    else if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      text = await invoke('read_clipboard')
    }
    // 3. 标准 Web 环境
    else {
      text = await navigator.clipboard.readText()
    }

    if (text && text.trim()) {
      targetRef.value = text
      showToast('已自动粘贴')
    }
  } catch (e) {
    // 静默忽略，clipboard 权限问题不打扰用户
  }
}

// ─── 多格式请求解析器（curl / fetch / PowerShell） ───

// 提取单引号或双引号字符串内容
const extractQuoted = (s) => {
  if (!s) return ''
  s = s.trim()
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1)
  }
  return s
}

// 从 JS 对象字面量中提取 headers
const extractJsHeaders = (text) => {
  const headers = {}
  // 匹配 headers 块: headers: { ... } 或 headers: { ... }（嵌套括号处理）
  const hdrMatch = text.match(/headers\s*:\s*\{/)
  if (!hdrMatch) return headers
  const start = hdrMatch.index + hdrMatch[0].length
  let depth = 1, i = start, key = '', val = '', inKey = true, inStr = false, strChar = ''
  while (i < text.length && depth > 0) {
    const ch = text[i]
    if (inStr) {
      if (ch === '\\') { i += 2; continue }
      if (ch === strChar) { inStr = false }
      i++; continue
    }
    if (ch === "'" || ch === '"') { inStr = true; strChar = ch; i++; continue }
    if (ch === '{') { depth++; i++; continue }
    if (ch === '}') { depth--; i++; continue }
    if (depth !== 1) { i++; continue }
    if (ch === ':') { inKey = false; i++; continue }
    if (ch === ',' || ch === '\n') {
      if (key && val) {
        headers[extractQuoted(key)] = extractQuoted(val.trim().replace(/,\s*$/, ''))
      }
      key = ''; val = ''; inKey = true; i++; continue
    }
    if (inKey) key += ch; else val += ch
    i++
  }
  if (key && val) headers[extractQuoted(key)] = extractQuoted(val.trim().replace(/,\s*$/, ''))
  return headers
}

// 检测输入格式
const detectFormat = (cmd) => {
  const trimmed = cmd.trim()
  if (/^(curl|curl\.exe)\s/i.test(trimmed)) return 'curl'
  if (/^fetch\s*\(/i.test(trimmed) || /^(const\s+|let\s+|var\s+)?(\w+\s*=\s*)?(await\s+)?fetch\s*\(/i.test(trimmed)) return 'fetch'
  if (/^Invoke-(RestMethod|WebRequest)\s/i.test(trimmed)) return 'powershell'
  // 默认按 curl 处理
  return 'curl'
}

// ─── curl 解析器（bash / cmd / PowerShell curl.exe） ───
const parseCurlFormat = (cmd) => {
  // 清洗折行符：\ (Unix) / ^ (Windows cmd) / ` (PowerShell)
  const cleaned = cmd.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ').replace(/`\r?\n/g, ' ')
  const tokens = []
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g
  let m
  while ((m = re.exec(cleaned)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3])
  }

  let url = '', method = 'GET'
  const headers = {}
  let body = ''
  const cookies = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const n = tokens[i + 1]

    if (t === '-H' || t === '--header') {
      if (n) {
        const idx = n.indexOf(':')
        if (idx > 0) {
          headers[n.slice(0, idx).trim()] = n.slice(idx + 1).trim()
        }
        i++
      }
    } else if (t === '-X' || t === '--request') {
      if (n) { method = n.toUpperCase(); i++ }
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii' || t === '--data-urlencode') {
      if (n) { body = n; if (method === 'GET') method = 'POST'; i++ }
    } else if (t === '-b' || t === '--cookie' || t === '--cookies') {
      if (n && n.includes('=') && !n.includes('/')) { cookies.push(n); i++ }
      else if (n) i++
    } else if (t === '--url') {
      if (n) { url = n; i++ }
    } else if (t === '-u' || t === '--user') {
      if (n) {
        try { headers['Authorization'] = 'Basic ' + btoa(n) } catch (e) {}
        i++
      }
    } else if (t === '-A' || t === '--user-agent') {
      if (n) { headers['User-Agent'] = n; i++ }
    } else if (t.startsWith('http://') || t.startsWith('https://')) {
      url = t
    } else if (/^curl(\.exe)?$/i.test(t) || t.startsWith('-') || t.startsWith('--')) {
      // skip flags like --compressed, -s, -k, --insecure, -L, --location
    } else if (!url && /^[a-zA-Z0-9][-a-zA-Z0-9+&@#/%?=~_|!:,.;]+/.test(t)) {
      url = 'https://' + t
    }
  }

  if (cookies.length > 0) {
    const cs = cookies.join('; ')
    headers['Cookie'] = headers['Cookie'] ? `${headers['Cookie']}; ${cs}` : cs
  }

  if (!url) throw new Error('未找到有效 URL')
  return { url, method, headers, body }
}

// ─── JavaScript/Node.js fetch 解析器 ───
const parseFetchFormat = (cmd) => {
  // 提取 fetch(...) 第一个参数 URL
  const urlMatch = cmd.match(/fetch\s*\(\s*(['"])(https?:\/\/[^'"]+)\1/)
  if (!urlMatch) throw new Error('未找到有效的 fetch URL')
  const url = urlMatch[2]

  // 提取 method
  let method = 'GET'
  const methodMatch = cmd.match(/method\s*:\s*(['"])(\w+)\1/i)
  if (methodMatch) method = methodMatch[2].toUpperCase()

  // 提取 headers
  const headers = extractJsHeaders(cmd)

  // 提取 body
  let body = ''
  // 匹配 body: '...' 或 body: "..." 或 body: JSON.stringify(...)
  const bodyMatch = cmd.match(/body\s*:\s*(['"])([\s\S]*?)\1\s*[,})]/)
  if (bodyMatch) {
    body = bodyMatch[2]
  } else {
    // body: JSON.stringify({...}) 或 body: JSON.stringify("...")
    const stringifyMatch = cmd.match(/body\s*:\s*JSON\.stringify\s*\(([\s\S]*?)\)\s*[,})]/)
    if (stringifyMatch) {
      try {
        // 尝试用 eval 解析（安全风险低，因为是用户自己粘贴的代码）
        const parsed = new Function(`return ${stringifyMatch[1]}`)()
        body = safeStringify(parsed)
      } catch (e) {
        body = stringifyMatch[1].trim()
      }
    } else {
      // body: { ... } 直接是对象字面量
      const objMatch = cmd.match(/body\s*:\s*(\{[\s\S]*?\})\s*[,})]/)
      if (objMatch) {
        try {
          const parsed = new Function(`return ${objMatch[1]}`)()
          body = safeStringify(parsed)
        } catch (e) {
          body = objMatch[1].trim()
        }
      }
    }
  }

  return { url, method, headers, body }
}

// ─── PowerShell Invoke-RestMethod / Invoke-WebRequest 解析器 ───
const parsePowerShellFormat = (cmd) => {
  // 清洗折行符
  const cleaned = cmd.replace(/`\r?\n/g, ' ')

  // 提取 URL
  const uriMatch = cleaned.match(/-Uri\s+(['"]?)(https?:\/\/[^'"\s]+)\1/i)
  const urlMatch = cleaned.match(/-Url\s+(['"]?)(https?:\/\/[^'"\s]+)\1/i)
  const url = (uriMatch?.[2] || urlMatch?.[2] || '').replace(/['"]/g, '')
  if (!url) throw new Error('未找到有效 URL')

  // 提取 Method
  let method = 'GET'
  const methodMatch = cleaned.match(/-Method\s+(['"]?)(\w+)\1/i)
  if (methodMatch) method = methodMatch[2].toUpperCase()

  // 提取 Headers (@{ key = value; ... })
  const headers = {}
  const hdrBlock = cleaned.match(/-Headers\s+(@\{[\s\S]*?\})\s*(-|$)/i)
  if (hdrBlock) {
    const hdrText = hdrBlock[1]
    // 匹配 key = value 或 'key' = 'value' 或 "key" = "value"
    const pairRe = /(['"]?)([\w-]+)\1\s*=\s*(['"]?)([^'";}]+)\3/g
    let pm
    while ((pm = pairRe.exec(hdrText)) !== null) {
      headers[pm[2]] = pm[4]
    }
  }

  // 提取 Body
  let body = ''
  const bodyMatch = cleaned.match(/-Body\s+(['"])([\s\S]*?)\1\s*(-|$)/)
  if (bodyMatch) {
    body = bodyMatch[2]
  }

  return { url, method, headers, body }
}

// ─── 统一入口 ───
const parseCurl = (cmd) => {
  console.log('检测命令格式...')
  const format = detectFormat(cmd)
  console.log('识别为:', format)

  let result
  switch (format) {
    case 'fetch':
      result = parseFetchFormat(cmd)
      break
    case 'powershell':
      result = parsePowerShellFormat(cmd)
      break
    default:
      result = parseCurlFormat(cmd)
  }

  // 尝试格式化 JSON body
  try {
    if (result.body) {
      const parsed = safeParse(result.body)
      result.body = safeStringify(parsed, null, 2)
    }
  } catch (e) {}

  console.log('解析完成:', { url: result.url, method: result.method, headersCount: Object.keys(result.headers).length, hasBody: !!result.body })
  return result
}

// 美化 JSON 文本
const beautify = (text) => {
  try { return safeStringify(safeParse(text), null, 2) } catch { return text }
}

// 本地文件导入
const handleFile = (e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    emit('import-text', beautify(ev.target.result))
    showToast('文件导入成功')
    panelOpen.value = false
  }
  reader.readAsText(file)
}

// 拖拽文件支持
const isDragging = ref(false)
const onDragOver = (e) => {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = true
}
const onDragLeave = () => {
  isDragging.value = false
}
const onDrop = (e) => {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file && (file.type === "application/json" || file.name.endsWith('.json') || file.name.endsWith('.txt'))) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      emit('import-text', beautify(ev.target.result))
      showToast('文件导入成功')
      panelOpen.value = false
    }
    reader.readAsText(file)
  } else {
    showToast('仅支持导入 .json 或 .txt 文件', 'error')
  }
}

// curl 导入
const handleCurl = async () => {
  if (!curlInput.value.trim()) {
    showToast('请输入 curl 命令', 'error')
    return
  }

  loading.value = true

  try {
    console.log('========== 开始处理 curl 命令 ==========')
    const { url, method, headers, body } = parseCurl(curlInput.value)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const opts = {
      method,
      headers: { ...headers },
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal
    }

    if (body && method !== 'GET') {
      opts.body = body
    }

    console.log('发送请求:', { url, method, headersCount: Object.keys(headers).length, hasBody: !!body })

    const res = await fetch(url, opts)
    clearTimeout(timeoutId)
    console.log('响应状态:', res.status, res.statusText)

    const text = await res.text()

    if (!res.ok) {
      rawOutput.value = `HTTP ${res.status} ${res.statusText}\n\n${text}`
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }

    emit('import-text', beautify(text))
    showToast('请求完成')
    panelOpen.value = false

  } catch (e) {
    console.error('curl 请求失败:', e)

    if (e.name === 'AbortError') {
      showToast('请求超时（30 秒）', 'error')
    } else if (e.message.includes('Failed to fetch')) {
      showToast('请求失败：CORS 跨域限制，请直接在 Network 面板复制响应数据', 'error')
    } else {
      showToast(e.message || '请求失败', 'error')
    }
  } finally {
    loading.value = false
  }
}

const copyRawOutput = () => {
  navigator.clipboard.writeText(rawOutput.value).then(() => {
    showToast('已复制原始输出')
  }).catch(() => {
    showToast('复制失败', 'error')
  })
}

// URL 导入
const handleUrl = async () => {
  const raw = urlInput.value.trim()
  if (!raw) {
    showToast('请输入 URL 地址', 'error')
    return
  }
  loading.value = true
  try {
    const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw
    console.log('发送请求到:', url)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    emit('import-text', beautify(text))
    showToast('请求完成')
    panelOpen.value = false
  } catch (e) {
    console.error('请求失败:', e)

    if (e.name === 'AbortError') {
      showToast('请求超时（30 秒）', 'error')
    } else if (e.message?.includes('Failed to fetch')) {
      showToast('请求失败：CORS 跨域限制，请直接在 Network 面板复制响应数据', 'error')
    } else {
      showToast(e.message || '请求失败', 'error')
    }
  } finally { loading.value = false }
}

// ─── UTF-8 / URL-Safe / Data URI 兼容 Base64 解码器 ───
// 通过 Uint8Array 与 TextDecoder 转换原始二进制字节流，100% 解决各种非西欧字符（如中文）解码时的乱码问题
const handleBase64 = () => {
  let raw = base64Input.value.trim()
  if (!raw) {
    showToast('请输入 Base64 密文', 'error')
    return
  }
  try {
    // 1. 兼容去除 Data URI 前缀 (如 data:application/json;base64, 等)
    if (raw.includes(';base64,')) {
      raw = raw.split(';base64,')[1]
    } else if (raw.startsWith('data:')) {
      const commaIdx = raw.indexOf(',')
      if (commaIdx !== -1) raw = raw.slice(commaIdx + 1)
    }
    // 2. 去除所有内部空格与换行符
    raw = raw.replace(/\s+/g, '')
    // 3. 兼容 URL-Safe Base64 (- 转 +, _ 转 /)
    raw = raw.replace(/-/g, '+').replace(/_/g, '/')
    // 4. 自动补齐缺失的 = 填充符
    while (raw.length % 4 !== 0) {
      raw += '='
    }

    console.log('开始解码 Base64，处理后长度:', raw.length)
    const binString = atob(raw)
    const len = binString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binString.charCodeAt(i)
    }
    const decodedText = new TextDecoder('utf-8').decode(bytes)
    console.log('解码成功，结果长度:', decodedText.length)

    emit('import-text', beautify(decodedText))
    showToast('Base64 解码成功')
    panelOpen.value = false
  } catch (e) {
    console.error('Base64 解码失败:', e)
    showToast('Base64 解码失败，请检查输入格式是否正确', 'error')
  }
}

// 外部点击关闭
const onDocClick = (e) => {
  if (panelOpen.value && !e.target.closest('.import-btn-wrap')) {
    panelOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="import-btn-wrap">
    <button
      class="trigger-btn"
      :class="{ 'active': panelOpen }"
      data-tooltip-bottom="导入数据"
      @click.stop="panelOpen = !panelOpen"
    >
      <UploadCloud class="trigger-icon" />
      <span class="trigger-label">导入</span>
    </button>

    <!-- 下拉选项卡面板 -->
    <div class="import-dropdown" :class="{ open: panelOpen }" @click.stop>
      <!-- macOS Inset Segmented Tabs 选项卡 -->
      <div class="import-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'file' }" 
          @click="switchTab('file')"
        >
          <UploadCloud class="tab-icon" />
          <span>文件</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'curl' }" 
          @click="switchTab('curl')"
        >
          <Terminal class="tab-icon" />
          <span>cURL</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'url' }" 
          @click="switchTab('url')"
        >
          <Globe class="tab-icon" />
          <span>URL</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'base64' }" 
          @click="switchTab('base64')"
        >
          <FileCode class="tab-icon" />
          <span>Base64</span>
        </button>
      </div>

      <!-- 面板内容区 -->
      <div class="import-panes">
        
        <!-- Tab 1: 拖拽/点击本地文件上传 -->
        <div v-if="activeTab === 'file'" class="pane-content">
          <label 
            class="file-drop-zone"
            :class="{ dragging: isDragging }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
          >
            <UploadCloud class="drop-icon" />
            <span class="drop-title">拖拽文件到此处，或<span>点击浏览</span></span>
            <span class="drop-desc">支持 .json / .txt 格式</span>
            <input type="file" accept=".json,.txt" @change="handleFile" class="hidden-input" />
          </label>
        </div>

        <!-- Tab 2: cURL 导入 -->
        <div v-if="activeTab === 'curl'" class="pane-content">
          <textarea
            v-model="curlInput"
            placeholder="支持 curl / fetch / PowerShell 格式"
            rows="5"
            class="import-textarea"
            @focus="handleCurlAutoPaste"
          ></textarea>
          <div class="pane-actions">
            <span class="pane-hint"></span>
            <div class="pane-actions-right">
              <button class="clear-btn" @click="curlInput = ''" :disabled="!curlInput">
                <span>清空</span>
              </button>
              <button class="submit-btn" :disabled="loading" @click="handleCurl">
                <RefreshCw v-if="loading" class="spinner" />
                <span>{{ loading ? '请求中' : '执行' }}</span>
              </button>
            </div>
          </div>
          <!-- 原始输出区域 -->
          <div v-if="rawOutput" class="raw-output">
            <div class="raw-output-header">
              <span class="raw-output-title">原始响应</span>
              <button class="copy-btn" @click="copyRawOutput">
                <span>复制</span>
              </button>
            </div>
            <div class="raw-output-content">{{ rawOutput }}</div>
          </div>
        </div>

        <!-- Tab 3: URL 导入 -->
        <div v-if="activeTab === 'url'" class="pane-content">
          <textarea
            v-model="urlInput"
            placeholder="输入 API 地址"
            rows="5"
            class="import-textarea"
            @keyup.enter="handleUrl"
            @focus="handleUrlAutoPaste"
          ></textarea>
          <div class="pane-actions">
            <span class="pane-hint">发送 GET 请求并格式化响应</span>
            <div class="pane-actions-right">
              <button class="clear-btn" @click="urlInput = ''" :disabled="!urlInput">
                <span>清空</span>
              </button>
              <button class="submit-btn" :disabled="loading" @click="handleUrl">
                <RefreshCw v-if="loading" class="spinner" />
                <span>{{ loading ? '请求中' : '发送' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Tab 4: Base64 解码 -->
        <div v-if="activeTab === 'base64'" class="pane-content">
          <textarea
            v-model="base64Input"
            placeholder="粘贴 Base64 密文"
            rows="5"
            class="import-textarea"
            @focus="handleBase64AutoPaste"
          ></textarea>
          <div class="pane-actions">
            <span class="pane-hint">在浏览器本地安全解码</span>
            <div class="pane-actions-right">
              <button class="clear-btn" @click="base64Input = ''" :disabled="!base64Input">
                <span>清空</span>
              </button>
              <button class="submit-btn" @click="handleBase64">
                <span>解码</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ─── CSS 变量容错（如项目中未定义，自动回退到优雅配色） ─── */
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Fira Code", "SF Mono", JetBrains Mono, Monaco, Consolas, monospace;
  --border-color: rgba(0, 0, 0, 0.08);
  --accent: #000000;
  --accent-glow: rgba(0, 0, 0, 0.05);
  --text-primary: #171717;
  --text-secondary: #52525b;
  --text-muted: #8e8e93;
  --bg-panel: rgba(255, 255, 255, 0.85);
  --bg-app: #f4f4f5;
  --bg-input: #ffffff;
}

.import-btn-wrap {
  position: relative;
}

/* 主触发按钮 — 与 toolbar-item 风格统一 */
.trigger-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 2px 8px;
  min-width: 38px;
  height: auto;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans);
  white-space: nowrap;
  transform: scale(1);
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}

:global(.dark-mode) .trigger-btn {
  color: #cbd5e1;
}

.trigger-btn:hover {
  background-color: var(--segmented-indicator-bg);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

:global(.dark-mode) .trigger-btn:hover,
:global(.dark-mode) .trigger-btn.active {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.10);
}
.trigger-btn:active {
  transform: scale(0.95);
}
.trigger-btn.active {
  background-color: var(--segmented-indicator-bg);
  color: var(--text-primary);
}
.trigger-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}
.trigger-label {
  font-size: 10px;
  line-height: 1;
}

/* ─── 下拉气泡面板（Retina 视网膜玻璃材质） ─── */
.import-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 350px; /* 大气的横向宽度，粘贴多行文本极为惬意 */
  background: var(--bg-panel, rgba(255, 255, 255, 0.85));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  box-shadow:
    0 12px 30px -4px rgba(0, 0, 0, 0.08),
    0 4px 12px -2px rgba(0, 0, 0, 0.03);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 999; /* 提高层级避免被遮挡 */
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}
.import-dropdown.open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

/* ─── macOS Inset Segmented Tabs ─── */
.import-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  padding: 2.5px;
  gap: 2px;
}
.dark-mode .import-tabs {
  background: rgba(255, 255, 255, 0.04);
}
.tab-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5.5px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #52525b);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.tab-btn:hover {
  color: var(--text-primary, #111111);
}
.tab-btn.active {
  background: #ffffff;
  color: var(--text-primary, #111111);
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.04), 
    0 1px 1px rgba(0, 0, 0, 0.02);
}
.dark-mode .tab-btn.active {
  background: rgba(255, 255, 255, 0.08);
}
.tab-icon {
  width: 12px;
  height: 12px;
}

/* ─── 统一高度内容区 ─── */
.import-panes {
  display: flex;
  flex-direction: column;
}
.pane-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

/* ─── 拖拽上传区域（UI 深度优化） ─── */
.file-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  padding: 26px 16px;
  background: rgba(0, 0, 0, 0.005);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: center;
}
.file-drop-zone:hover,
.file-drop-zone.dragging {
  border-color: var(--accent, #000000);
  background: rgba(0, 102, 204, 0.015);
}
.drop-icon {
  width: 24px;
  height: 24px;
  color: var(--text-muted, #8e8e93);
  margin-bottom: 8px;
  transition: transform 0.2s, color 0.15s;
}
.file-drop-zone:hover .drop-icon {
  transform: translateY(-2px); /* 高级微动效：小云朵向上悬浮漂流 */
  color: var(--accent, #000000);
}
.drop-title {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-primary, #111111);
  margin-bottom: 2px;
}
.drop-title span {
  color: var(--accent, #000000);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.drop-desc {
  font-size: 10px;
  color: var(--text-muted, #8e8e93);
}

.dark-mode .drop-icon {
  color: var(--text-muted, #a1a1aa);
}
.dark-mode .drop-title {
  color: var(--text-primary, #e4e4e7);
}
.dark-mode .drop-title span {
  color: var(--accent, #60a5fa);
}
.dark-mode .drop-desc {
  color: var(--text-muted, #71717a);
}

/* ─── 终端/代码编辑器风格输入框（亮色） ─── */
.import-textarea,
.import-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #ffffff;
  color: #24292f;
  font-size: 11px;
  font-family: var(--font-mono);
  line-height: 1.6;
  box-sizing: border-box;
  outline: none;
  caret-color: #0969da;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.import-textarea::selection,
.import-input::selection {
  background: rgba(9, 105, 218, 0.15);
}
.import-textarea {
  resize: none;
}
.import-input {
  height: 34px;
}
.import-textarea:focus,
.import-input:focus {
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}

.import-textarea::placeholder,
.import-input::placeholder {
  color: #8c959f;
  opacity: 1;
}

/* ─── 暗色主题输入框 ─── */
.dark-mode .import-textarea,
.dark-mode .import-input {
  background: #0d1117;
  color: #e6edf3;
  border-color: rgba(255, 255, 255, 0.08);
  caret-color: #39ff14;
}
.dark-mode .import-textarea::selection,
.dark-mode .import-input::selection {
  background: rgba(88, 166, 255, 0.25);
}
.dark-mode .import-textarea:focus,
.dark-mode .import-input:focus {
  border-color: #39ff14;
  box-shadow: 0 0 0 3px rgba(57, 255, 20, 0.15);
}
.dark-mode .import-textarea::selection,
.dark-mode .import-input::selection {
  background: rgba(57, 255, 20, 0.25);
}
.dark-mode .import-textarea::placeholder,
.dark-mode .import-input::placeholder {
  color: #484f58;
}

/* ─── 底部 Action 栏 ─── */
.pane-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
}
.pane-hint {
  font-size: 10px;
  color: var(--text-muted, #a1a1aa);
  line-height: 1.35;
  max-width: 50%;
}

.pane-actions-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  border-radius: 6px;
  background: var(--bg-input, #ffffff);
  color: var(--text-secondary, #52525b);
  font-size: 11.5px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.clear-btn:hover:not(:disabled) {
  background: var(--bg-app, #f4f4f5);
  color: var(--text-primary, #111111);
}
.clear-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.clear-btn:disabled {
  opacity: 0.4;
  cursor: default;
}



/* ─── 重新设计的 Linear 风格带微光折折折叠按钮（大气、极度质感） ─── */
.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 16px;
  height: 32px;
  /* 带有极轻微立体感渐变和顶部白边微光的优雅深色物理按键 */
  background: linear-gradient(to bottom, #27272a, #0f172a); 
  border: 1px solid #0f172a;
  color: #ffffff;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.15), 
    0 1px 2px rgba(0, 0, 0, 0.1);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.submit-btn:hover:not(:disabled) {
  background: linear-gradient(to bottom, #3f3f46, #1e293b);
  transform: translateY(-0.5px);
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.2), 
    0 4px 12px rgba(0, 0, 0, 0.08);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.97) translateY(0);
}

.submit-btn:disabled {
  opacity: 0.55;
  cursor: default;
  transform: none !important;
}

/* 暗色模式下按钮变为极致对比亮白按键（Linear 灵魂） */
.dark-mode .submit-btn {
  background: linear-gradient(to bottom, #ffffff, #f4f4f5);
  border: 1px solid #e4e4e7;
  color: #000000;
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.6), 
    0 1px 2px rgba(0, 0, 0, 0.05);
}

.dark-mode .submit-btn:hover:not(:disabled) {
  background: linear-gradient(to bottom, #fafafa, #e4e4e7);
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.8), 
    0 4px 12px rgba(255, 255, 255, 0.08);
}

/* ─── 动效 ─── */
.spinner {
  width: 12px;
  height: 12px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.hidden-input {
  position: absolute;
  width: 0; height: 0;
  opacity: 0;
  pointer-events: none;
}

/* ─── 原始输出区域（亮色） ─── */
.raw-output {
  margin-top: 8px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}
.raw-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #f6f8fa;
  border-bottom: 1px solid #d0d7de;
}
.raw-output-title {
  font-size: 10px;
  font-weight: 600;
  color: #656d76;
}
.copy-btn {
  padding: 3px 10px;
  background: transparent;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  font-size: 10px;
  font-family: var(--font-sans);
  color: #656d76;
  cursor: pointer;
  transition: all 0.15s;
}
.copy-btn:hover {
  background: #f6f8fa;
  color: #24292f;
}
.raw-output-content {
  padding: 10px 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: #24292f;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 140px;
  overflow-y: auto;
  line-height: 1.5;
}

/* ─── 原始输出区域（暗色） ─── */
.dark-mode .raw-output {
  background: #0d1117;
  border-color: rgba(255, 255, 255, 0.08);
}
.dark-mode .raw-output-header {
  background: rgba(255, 255, 255, 0.03);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
.dark-mode .raw-output-title {
  color: #8b949e;
}
.dark-mode .copy-btn {
  border-color: rgba(255, 255, 255, 0.08);
  color: #8b949e;
}
.dark-mode .copy-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e6edf3;
}
.dark-mode .raw-output-content {
  color: #e6edf3;
}

</style>