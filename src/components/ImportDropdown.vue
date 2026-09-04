<script setup>
import { ref, computed, inject, onMounted, onBeforeUnmount } from 'vue'
import {
  UploadCloud, Terminal, Globe, FileCode, RefreshCw,
  X, FileText, Check, AlertCircle, Copy
} from 'lucide-vue-next'
import { safeParse, safeStringify } from '../utils/jsonBigInt.js'

const props = defineProps({
  hideTrigger: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['import-text'])
const showToast = inject('showToast')
const autoPaste = inject('autoPaste', ref(false))

const panelOpen = ref(false)
const triggerBtnRef = ref(null)

const openPanel = () => {
  panelOpen.value = true
}

const closePanel = () => {
  panelOpen.value = false
}

const togglePanel = (e) => {
  if (e) e.stopPropagation?.()
  panelOpen.value = !panelOpen.value
}

defineExpose({
  openPanel,
  closePanel,
  togglePanel,
  panelOpen
})

const activeTab = ref('file') // 'file' | 'curl' | 'url' | 'base64'
const curlInput = ref('')
const urlInput = ref('')
const base64Input = ref('')
const loading = ref(false)
const rawOutput = ref('') // 原始输出内容

const switchTab = (tab) => {
  activeTab.value = tab
  rawOutput.value = ''
}

// 自动粘贴：焦点进入空输入框时读取剪贴板
const handleCurlAutoPaste = () => handleAutoPaste(curlInput)
const handleUrlAutoPaste = () => handleAutoPaste(urlInput)
const handleBase64AutoPaste = () => handleAutoPaste(base64Input)

const handleAutoPaste = async (targetRef) => {
  if (!autoPaste.value) return
  if (targetRef.value?.trim()) return

  try {
    let text = ''
    if (window.utools && typeof window.utools.readText === 'function') {
      text = window.utools.readText()
    } else if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      text = await invoke('read_clipboard')
    } else {
      text = await navigator.clipboard.readText()
    }

    if (text && text.trim()) {
      targetRef.value = text
      showToast('已自动粘贴')
    }
  } catch (e) {}
}

// ─── 多格式请求解析器（curl / fetch / PowerShell） ───
const extractQuoted = (s) => {
  if (!s) return ''
  s = s.trim()
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1)
  }
  return s
}

const extractJsHeaders = (text) => {
  const headers = {}
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

const detectFormat = (cmd) => {
  const trimmed = cmd.trim()
  if (/^(curl|curl\.exe)\s/i.test(trimmed)) return 'curl'
  if (/^fetch\s*\(/i.test(trimmed) || /^(const\s+|let\s+|var\s+)?(\w+\s*=\s*)?(await\s+)?fetch\s*\(/i.test(trimmed)) return 'fetch'
  if (/^Invoke-(RestMethod|WebRequest)\s/i.test(trimmed)) return 'powershell'
  return 'curl'
}

const parseCurlFormat = (cmd) => {
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

const parseFetchFormat = (cmd) => {
  const urlMatch = cmd.match(/fetch\s*\(\s*(['"])(https?:\/\/[^'"]+)\1/)
  if (!urlMatch) throw new Error('未找到有效的 fetch URL')
  const url = urlMatch[2]

  let method = 'GET'
  const methodMatch = cmd.match(/method\s*:\s*(['"])(\w+)\1/i)
  if (methodMatch) method = methodMatch[2].toUpperCase()

  const headers = extractJsHeaders(cmd)
  let body = ''
  const bodyMatch = cmd.match(/body\s*:\s*(['"])([\s\S]*?)\1\s*[,})]/)
  if (bodyMatch) {
    body = bodyMatch[2]
  } else {
    const stringifyMatch = cmd.match(/body\s*:\s*JSON\.stringify\s*\(([\s\S]*?)\)\s*[,})]/)
    if (stringifyMatch) {
      try {
        const parsed = new Function(`return ${stringifyMatch[1]}`)()
        body = safeStringify(parsed)
      } catch (e) {
        body = stringifyMatch[1].trim()
      }
    } else {
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

const parsePowerShellFormat = (cmd) => {
  const cleaned = cmd.replace(/`\r?\n/g, ' ')
  const uriMatch = cleaned.match(/-Uri\s+(['"]?)(https?:\/\/[^'"\s]+)\1/i)
  const urlMatch = cleaned.match(/-Url\s+(['"]?)(https?:\/\/[^'"\s]+)\1/i)
  const url = (uriMatch?.[2] || urlMatch?.[2] || '').replace(/['"]/g, '')
  if (!url) throw new Error('未找到有效 URL')

  let method = 'GET'
  const methodMatch = cleaned.match(/-Method\s+(['"]?)(\w+)\1/i)
  if (methodMatch) method = methodMatch[2].toUpperCase()

  const headers = {}
  const hdrBlock = cleaned.match(/-Headers\s+(@\{[\s\S]*?\})\s*(-|$)/i)
  if (hdrBlock) {
    const hdrText = hdrBlock[1]
    const pairRe = /(['"]?)([\w-]+)\1\s*=\s*(['"]?)([^'";}]+)\3/g
    let pm
    while ((pm = pairRe.exec(hdrText)) !== null) {
      headers[pm[2]] = pm[4]
    }
  }

  let body = ''
  const bodyMatch = cleaned.match(/-Body\s+(['"])([\s\S]*?)\1\s*(-|$)/)
  if (bodyMatch) {
    body = bodyMatch[2]
  }

  return { url, method, headers, body }
}

const parseCurl = (cmd) => {
  const format = detectFormat(cmd)
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

  try {
    if (result.body) {
      const parsed = safeParse(result.body)
      result.body = safeStringify(parsed, null, 2)
    }
  } catch (e) {}

  return result
}

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
    showToast('请输入 cURL / fetch 命令', 'error')
    return
  }

  loading.value = true
  try {
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

    const res = await fetch(url, opts)
    clearTimeout(timeoutId)

    const text = await res.text()
    if (!res.ok) {
      rawOutput.value = `HTTP ${res.status} ${res.statusText}\n\n${text}`
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }

    emit('import-text', beautify(text))
    showToast('请求完成并已导入')
    panelOpen.value = false
  } catch (e) {
    if (e.name === 'AbortError') {
      showToast('请求超时（30 秒）', 'error')
    } else if (e.message?.includes('Failed to fetch')) {
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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    emit('import-text', beautify(text))
    showToast('请求完成并已导入')
    panelOpen.value = false
  } catch (e) {
    if (e.name === 'AbortError') {
      showToast('请求超时（30 秒）', 'error')
    } else if (e.message?.includes('Failed to fetch')) {
      showToast('请求失败：CORS 跨域限制，请直接在 Network 面板复制响应数据', 'error')
    } else {
      showToast(e.message || '请求失败', 'error')
    }
  } finally {
    loading.value = false
  }
}

// Base64 解码
const handleBase64 = () => {
  let raw = base64Input.value.trim()
  if (!raw) {
    showToast('请输入 Base64 密文', 'error')
    return
  }
  try {
    if (raw.includes(';base64,')) {
      raw = raw.split(';base64,')[1]
    } else if (raw.startsWith('data:')) {
      const commaIdx = raw.indexOf(',')
      if (commaIdx !== -1) raw = raw.slice(commaIdx + 1)
    }
    raw = raw.replace(/\s+/g, '')
    raw = raw.replace(/-/g, '+').replace(/_/g, '/')
    while (raw.length % 4 !== 0) {
      raw += '='
    }

    const binString = atob(raw)
    const len = binString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binString.charCodeAt(i)
    }
    const decodedText = new TextDecoder('utf-8').decode(bytes)

    emit('import-text', beautify(decodedText))
    showToast('Base64 解码并导入成功')
    panelOpen.value = false
  } catch (e) {
    showToast('Base64 解码失败，请检查输入格式是否正确', 'error')
  }
}

const isSubmitDisabled = computed(() => {
  if (activeTab.value === 'curl') return !curlInput.value.trim()
  if (activeTab.value === 'url') return !urlInput.value.trim()
  if (activeTab.value === 'base64') return !base64Input.value.trim()
  return false
})

const submitButtonText = computed(() => {
  if (activeTab.value === 'curl') return loading.value ? '请求中...' : '执行并导入'
  if (activeTab.value === 'url') return loading.value ? '请求中...' : '发送并导入'
  if (activeTab.value === 'base64') return '解码并导入'
  return '导入'
})

const handleSubmit = () => {
  if (activeTab.value === 'curl') handleCurl()
  else if (activeTab.value === 'url') handleUrl()
  else if (activeTab.value === 'base64') handleBase64()
}
</script>

<template>
  <div class="import-btn-wrap" :class="{ 'no-trigger': hideTrigger }">
    <button
      v-if="!hideTrigger"
      ref="triggerBtnRef"
      class="trigger-btn"
      :class="{ 'active': panelOpen }"
      data-tooltip-bottom="导入数据"
      @click.stop="togglePanel"
    >
      <UploadCloud class="trigger-icon" />
      <span class="trigger-label">导入</span>
    </button>

    <!-- 统一模态弹窗风格 (Teleport 到 body，与智能数据脱敏弹窗 UI 保持完全一致) -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="panelOpen" class="ej-modal-backdrop" @click="closePanel">
          <div class="ej-modal-dialog import-modal-dialog" @click.stop>
            
            <!-- 弹窗 Header -->
            <div class="ej-modal-header">
              <div class="ej-modal-title">
                <UploadCloud class="modal-title-icon" />
                <span>数据导入与解析</span>
              </div>
              <button class="ej-modal-close" @click="closePanel" title="关闭">
                <X class="modal-close-icon" />
              </button>
            </div>

            <!-- 弹窗 Body -->
            <div class="ej-modal-body">
              <!-- 顶部分类 Segmented Tabs -->
              <div class="import-tabs-bar">
                <button
                  class="import-tab-item"
                  :class="{ active: activeTab === 'file' }"
                  @click="switchTab('file')"
                >
                  <UploadCloud class="tab-icon" />
                  <span>本地文件</span>
                </button>
                <button
                  class="import-tab-item"
                  :class="{ active: activeTab === 'curl' }"
                  @click="switchTab('curl')"
                >
                  <Terminal class="tab-icon" />
                  <span>cURL / 请求</span>
                </button>
                <button
                  class="import-tab-item"
                  :class="{ active: activeTab === 'url' }"
                  @click="switchTab('url')"
                >
                  <Globe class="tab-icon" />
                  <span>URL 抓取</span>
                </button>
                <button
                  class="import-tab-item"
                  :class="{ active: activeTab === 'base64' }"
                  @click="switchTab('base64')"
                >
                  <FileCode class="tab-icon" />
                  <span>Base64 解码</span>
                </button>
              </div>

              <!-- 面板核心内容区 -->
              <div class="import-pane-wrapper">
                
                <!-- Tab 1: 本地文件上传 -->
                <div v-if="activeTab === 'file'" class="pane-content file-pane">
                  <div class="pane-header-tip">
                    <span>支持拖拽或直接选择本地 <code>.json</code>、<code>.txt</code> 文件导入</span>
                  </div>
                  <label
                    class="file-drop-card"
                    :class="{ dragging: isDragging }"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                    @drop="onDrop"
                  >
                    <div class="drop-icon-box">
                      <UploadCloud class="drop-main-icon" />
                    </div>
                    <div class="drop-text-primary">
                      拖拽 JSON / TXT 文件到此处，或 <span class="browse-highlight">点击浏览</span>
                    </div>
                    <div class="drop-text-secondary">
                      支持标准 .json、.txt 文件，自动完成格式化解析
                    </div>
                    <input type="file" accept=".json,.txt" @change="handleFile" class="hidden-input" />
                  </label>
                </div>

                <!-- Tab 2: cURL / Fetch / PowerShell 导入 -->
                <div v-if="activeTab === 'curl'" class="pane-content">
                  <div class="pane-header-tip">
                    <span>支持标准 <code>curl</code>、<code>fetch()</code>、PowerShell <code>Invoke-RestMethod</code></span>
                    <button v-if="curlInput" class="text-clear-btn" @click="curlInput = ''">清空输入</button>
                  </div>
                  <div class="editor-input-wrap">
                    <textarea
                      v-model="curlInput"
                      placeholder="粘贴 curl 或 fetch 请求命令，如:&#10;curl 'https://api.example.com/data' -H 'Authorization: Bearer token'"
                      class="import-code-textarea"
                      @focus="handleCurlAutoPaste"
                    ></textarea>
                  </div>
                  
                  <!-- 原始响应错误/调试信息 -->
                  <div v-if="rawOutput" class="raw-output-card">
                    <div class="raw-output-header">
                      <div class="raw-output-title">
                        <AlertCircle class="output-icon-warn" />
                        <span>原始响应输出</span>
                      </div>
                      <button class="raw-copy-btn" @click="copyRawOutput">
                        <Copy class="raw-btn-icon" />
                        <span>复制</span>
                      </button>
                    </div>
                    <div class="raw-output-content">{{ rawOutput }}</div>
                  </div>
                </div>

                <!-- Tab 3: URL 抓取 -->
                <div v-if="activeTab === 'url'" class="pane-content">
                  <div class="pane-header-tip">
                    <span>输入开放的 JSON API 地址，发送 <code>GET</code> 请求直接拉取并格式化</span>
                    <button v-if="urlInput" class="text-clear-btn" @click="urlInput = ''">清空输入</button>
                  </div>
                  <div class="editor-input-wrap">
                    <textarea
                      v-model="urlInput"
                      placeholder="请输入目标 URL 地址，按回车直接发送 (如 https://api.github.com/users/octocat)"
                      class="import-code-textarea"
                      @keyup.enter="handleUrl"
                      @focus="handleUrlAutoPaste"
                    ></textarea>
                  </div>
                </div>

                <!-- Tab 4: Base64 解码 -->
                <div v-if="activeTab === 'base64'" class="pane-content">
                  <div class="pane-header-tip">
                    <span>在浏览器本地安全解码 Base64 字符串（支持 UTF-8 中文与 Data URI）</span>
                    <button v-if="base64Input" class="text-clear-btn" @click="base64Input = ''">清空输入</button>
                  </div>
                  <div class="editor-input-wrap">
                    <textarea
                      v-model="base64Input"
                      placeholder="粘贴 Base64 编码数据 (如 eyJuYW1lIjoiZWFzeS1qc29uIn0= 或 data:application/json;base64,...)"
                      class="import-code-textarea"
                      @focus="handleBase64AutoPaste"
                    ></textarea>
                  </div>
                </div>

              </div>
            </div>

            <!-- 弹窗 Footer -->
            <div class="ej-modal-footer">
              <div class="modal-footer-hint">
                <span v-if="activeTab === 'file'">选择或拖入文件后将自动导入</span>
                <span v-else-if="activeTab === 'curl'">解析后将自动格式化并填入编辑器</span>
                <span v-else-if="activeTab === 'url'">如遇跨域限制请直接在控制台复制响应</span>
                <span v-else>数据全程本地处理，不经过任何第三方服务器</span>
              </div>
              <div class="modal-footer-actions">
                <button class="modal-btn outline" @click="closePanel">取消</button>
                <button
                  v-if="activeTab !== 'file'"
                  class="modal-btn primary"
                  :disabled="loading || isSubmitDisabled"
                  @click="handleSubmit"
                >
                  <RefreshCw v-if="loading" class="spinner" />
                  <span>{{ submitButtonText }}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.import-btn-wrap {
  position: relative;
}

/* 顶部工具栏主触发按钮 */
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
  color: var(--text-secondary, #64748b);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans, inherit);
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.trigger-btn:hover {
  background-color: var(--bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--text-primary, #0f172a);
}

:global(.dark-mode) .trigger-btn {
  color: #94a3b8;
}

:global(.dark-mode) .trigger-btn:hover,
:global(.dark-mode) .trigger-btn.active {
  color: #f1f5f9;
  background-color: rgba(255, 255, 255, 0.08);
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

/* ─── 统一模态弹窗样式 (rem 响应式高分辨率自适应) ─── */
.ej-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1.25rem;
  box-sizing: border-box;
}

.ej-modal-dialog {
  background: var(--bg-panel, #ffffff);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  border-radius: 0.75rem;
  box-shadow: 0 1.25rem 3rem -0.5rem rgba(0, 0, 0, 0.22), 0 0.25rem 0.75rem -0.125rem rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  max-width: 90vw;
  max-height: 85vh;
  overflow: hidden;
  animation: modalPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.import-modal-dialog {
  width: min(36.25rem, 90vw);
}

:global(.dark-mode) .ej-modal-dialog {
  background: rgba(30, 30, 36, 0.98);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 1.5rem 3.5rem -0.5rem rgba(0, 0, 0, 0.55), 0 0.25rem 1rem rgba(0, 0, 0, 0.3);
}

@keyframes modalPopIn {
  from { opacity: 0; transform: scale(0.96) translateY(0.5rem); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* 弹窗 Header */
.ej-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
}

:global(.dark-mode) .ej-modal-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.ej-modal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
}

:global(.dark-mode) .ej-modal-title {
  color: #f8fafc;
}

.modal-title-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: var(--primary-color, #6366f1);
}

.ej-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ej-modal-close:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--text-primary, #0f172a);
}

:global(.dark-mode) .ej-modal-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.modal-close-icon {
  width: 1rem;
  height: 1rem;
}

/* 弹窗 Body */
.ej-modal-body {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  overflow-y: auto;
}

/* 顶部 Segmented 选项卡栏 */
.import-tabs-bar {
  display: flex;
  background: var(--bg-app, #f1f5f9);
  border-radius: 0.5rem;
  padding: 0.1875rem;
  gap: 0.1875rem;
}

:global(.dark-mode) .import-tabs-bar {
  background: rgba(20, 20, 24, 0.7);
}

.import-tab-item {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem 0;
  font-size: 0.71875rem;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.16s ease;
}

.import-tab-item:hover {
  color: var(--text-primary, #0f172a);
}

.import-tab-item.active {
  background: var(--bg-panel, #ffffff);
  color: var(--primary-color, #6366f1);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

:global(.dark-mode) .import-tab-item.active {
  background: rgba(45, 45, 52, 0.95);
  color: #818cf8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.tab-icon {
  width: 0.8125rem;
  height: 0.8125rem;
}

/* 核心内容区 */
.import-pane-wrapper {
  display: flex;
  flex-direction: column;
}

.pane-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* 拖拽上传卡片 */
.file-drop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 10.625rem;
  min-height: 10.625rem;
  box-sizing: border-box;
  border: 1.5px dashed var(--border-color, #cbd5e1);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  background: var(--bg-app, #f8fafc);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: center;
}

.file-drop-card:hover,
.file-drop-card.dragging {
  border-color: var(--primary-color, #6366f1);
  background: var(--primary-light, rgba(99, 102, 241, 0.06));
}

:global(.dark-mode) .file-drop-card {
  background: rgba(20, 20, 24, 0.45);
  border-color: rgba(255, 255, 255, 0.12);
}

:global(.dark-mode) .file-drop-card:hover,
:global(.dark-mode) .file-drop-card.dragging {
  border-color: #818cf8;
  background: rgba(99, 102, 241, 0.1);
}

.drop-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--primary-light, rgba(99, 102, 241, 0.1));
  color: var(--primary-color, #6366f1);
  margin-bottom: 0.5rem;
  transition: transform 0.2s ease;
}

.file-drop-card:hover .drop-icon-box {
  transform: translateY(-0.125rem) scale(1.05);
}

.drop-main-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.drop-text-primary {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary, #0f172a);
  margin-bottom: 0.25rem;
}

:global(.dark-mode) .drop-text-primary {
  color: #f1f5f9;
}

.browse-highlight {
  color: var(--primary-color, #6366f1);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

:global(.dark-mode) .browse-highlight {
  color: #818cf8;
}

.drop-text-secondary {
  font-size: 0.6875rem;
  color: var(--text-muted, #94a3b8);
}

.hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

/* 文本/代码输入区 */
.pane-header-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 1.375rem;
  font-size: 0.71875rem;
  color: var(--text-muted, #94a3b8);
}

.pane-header-tip code {
  font-family: var(--font-mono, monospace);
  padding: 0.0625rem 0.25rem;
  background: var(--bg-app, #f1f5f9);
  border-radius: 0.1875rem;
  color: var(--primary-color, #6366f1);
  font-size: 0.6875rem;
}

:global(.dark-mode) .pane-header-tip code {
  background: rgba(255, 255, 255, 0.08);
  color: #818cf8;
}

.text-clear-btn {
  background: transparent;
  border: none;
  color: var(--primary-color, #6366f1);
  font-size: 0.6875rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

:global(.dark-mode) .text-clear-btn {
  color: #818cf8;
}

.editor-input-wrap {
  position: relative;
}

.import-code-textarea {
  width: 100%;
  height: 10.625rem;
  min-height: 10.625rem;
  max-height: 10.625rem;
  box-sizing: border-box;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 0.5rem;
  background: var(--bg-app, #f8fafc);
  color: var(--text-primary, #0f172a);
  font-size: 0.75rem;
  font-family: var(--font-mono, monospace);
  line-height: 1.6;
  outline: none;
  resize: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.import-code-textarea:focus {
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

:global(.dark-mode) .import-code-textarea {
  background: rgba(20, 20, 24, 0.6);
  border-color: rgba(255, 255, 255, 0.1);
  color: #f1f5f9;
}

:global(.dark-mode) .import-code-textarea:focus {
  border-color: #818cf8;
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.18);
}

.import-code-textarea::placeholder {
  color: var(--text-muted, #94a3b8);
  font-family: var(--font-sans, inherit);
  font-size: 0.71875rem;
}

/* 原始错误输出卡片 */
.raw-output-card {
  margin-top: 0.375rem;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 0.5rem;
  overflow: hidden;
  background: rgba(239, 68, 68, 0.04);
}

.raw-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.625rem;
  background: rgba(239, 68, 68, 0.08);
  border-bottom: 1px solid rgba(239, 68, 68, 0.15);
}

.raw-output-title {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #ef4444;
}

.output-icon-warn {
  width: 0.75rem;
  height: 0.75rem;
}

.raw-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.1875rem;
  padding: 0.125rem 0.375rem;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.25rem;
  font-size: 0.625rem;
  color: #ef4444;
  cursor: pointer;
  transition: all 0.15s ease;
}

.raw-copy-btn:hover {
  background: rgba(239, 68, 68, 0.12);
}

.raw-btn-icon {
  width: 0.625rem;
  height: 0.625rem;
}

.raw-output-content {
  padding: 0.5rem 0.625rem;
  font-size: 0.6875rem;
  font-family: var(--font-mono, monospace);
  color: #dc2626;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 7.5rem;
  overflow-y: auto;
  line-height: 1.45;
}

:global(.dark-mode) .raw-output-content {
  color: #f87171;
}

/* 弹窗 Footer */
.ej-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  background: var(--bg-panel, #ffffff);
}

:global(.dark-mode) .ej-modal-footer {
  background: rgba(30, 30, 36, 0.98);
  border-top-color: rgba(255, 255, 255, 0.08);
}

.modal-footer-hint {
  font-size: 0.6875rem;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.modal-footer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3125rem;
  height: 2rem;
  padding: 0 0.875rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.modal-btn.outline {
  background: transparent;
  border: 1px solid var(--border-color, #cbd5e1);
  color: var(--text-secondary, #64748b);
}

.modal-btn.outline:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--text-primary, #0f172a);
}

:global(.dark-mode) .modal-btn.outline {
  border-color: rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
}

:global(.dark-mode) .modal-btn.outline:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.modal-btn.primary {
  background: var(--primary-color, #6366f1);
  border: 1px solid var(--primary-color, #6366f1);
  color: #ffffff;
  box-shadow: 0 1px 2px rgba(99, 102, 241, 0.2);
}

.modal-btn.primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-0.03125rem);
  box-shadow: 0 0.25rem 0.75rem rgba(99, 102, 241, 0.3);
}

.modal-btn.primary:active:not(:disabled) {
  transform: translateY(0);
}

.modal-btn.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none;
}

.spinner {
  width: 0.75rem;
  height: 0.75rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ─── 响应式多分辨率适配 (Responsive Resolution Support) ─── */
@media (max-width: 640px) {
  .ej-modal-backdrop {
    padding: 0.625rem;
  }

  .import-modal-dialog {
    width: 100%;
    max-width: 100%;
    max-height: calc(100vh - 1.25rem);
    border-radius: 0.625rem;
  }

  .ej-modal-header {
    padding: 0.625rem 0.875rem;
  }

  .ej-modal-title {
    font-size: 0.875rem;
  }

  .ej-modal-body {
    padding: 0.75rem 0.875rem;
    gap: 0.625rem;
  }

  .import-tabs-bar {
    gap: 0.125rem;
    padding: 0.125rem;
  }

  .import-tab-item {
    padding: 0.3125rem 0.125rem;
    font-size: 0.6875rem;
    gap: 0.25rem;
  }

  .tab-icon {
    width: 0.75rem;
    height: 0.75rem;
  }

  .file-drop-card {
    height: 9rem;
    min-height: 9rem;
    padding: 1.25rem 0.75rem;
  }

  .drop-icon-box {
    width: 2.25rem;
    height: 2.25rem;
    margin-bottom: 0.375rem;
  }

  .drop-main-icon {
    width: 1.125rem;
    height: 1.125rem;
  }

  .drop-text-primary {
    font-size: 0.75rem;
  }

  .drop-text-secondary {
    font-size: 0.625rem;
  }

  .import-code-textarea {
    height: 9rem;
    min-height: 9rem;
    max-height: 9rem;
    font-size: 0.6875rem;
    padding: 0.5rem 0.625rem;
  }

  .ej-modal-footer {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
  }

  .modal-footer-hint {
    text-align: center;
    white-space: normal;
    font-size: 0.65625rem;
  }

  .modal-footer-actions {
    width: 100%;
  }

  .modal-btn {
    flex: 1;
    height: 2.125rem;
  }
}

@media (max-width: 420px) {
  .import-tabs-bar {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .import-tab-item {
    padding: 0.375rem 0.25rem;
  }
}

@media (max-height: 580px) {
  .ej-modal-backdrop {
    padding: 0.5rem;
  }

  .import-modal-dialog {
    max-height: calc(100vh - 1rem);
  }

  .ej-modal-header {
    padding: 0.5rem 0.875rem;
  }

  .ej-modal-body {
    padding: 0.625rem 0.875rem;
    gap: 0.5rem;
  }

  .file-drop-card {
    height: 7.5rem;
    min-height: 7.5rem;
    padding: 0.875rem 0.625rem;
  }

  .drop-icon-box {
    width: 1.875rem;
    height: 1.875rem;
    margin-bottom: 0.25rem;
  }

  .import-code-textarea {
    height: 7.5rem;
    min-height: 7.5rem;
    max-height: 7.5rem;
  }

  .ej-modal-footer {
    padding: 0.5rem 0.875rem;
  }
}
</style>