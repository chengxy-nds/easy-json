<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import {
  Braces, Split, Zap, Lock, ShieldCheck, Eye, ArrowRight,
  ChevronDown, ChevronRight, FileCode, Layers, Table2, Network, ListTree,
  ClipboardPaste, HelpCircle, Chrome, Laptop, Terminal,
  Check, Plus, X, ArrowUpDown, MousePointerClick, RefreshCw
} from 'lucide-vue-next'
import { extractJsonFromText } from '../utils/jsonExtractor.js'
import { useHeroParticles } from '../composables/useHeroParticles.js'

const heroRef = ref(null)
const heroParticles = useHeroParticles()

const emit = defineEmits(['go-to-app'])

const openFaq = ref(null)

const toggleFaq = (index) => {
  openFaq.value = openFaq.value === index ? null : index
}

// ─── Preset Template Data for Live Playground ───
const presets = {
  standardJson: {
    name: '标准 JSON',
    raw: `{
  "status": "success",
  "data": {
    "user_id": 1002,
    "roles": ["admin", "editor"],
    "is_active": true
  }
}`,
    format: '标准 JSON'
  },
  lombok: {
    name: 'Java 对象',
    raw: `User(id=9928, name=张三, profile=Profile{city=杭州, tags=[dev, ops]}, active=true, extra=null)`,
    format: 'Java toString'
  },
  python: {
    name: 'Python 对象',
    raw: `OrderedDict([('status', 'success'), ('data', {'user_id': 1002, 'roles': ('admin', 'editor'), 'is_active': True})])`,
    format: 'Python dict'
  },
  looseJs: {
    name: 'JS/TS 对象',
    raw: `{
  id: 42,
  name: "Antigravity",
  /* metadata comment */
  version: "1.0.0",
  features: ["extract", "format"],
}`,
    format: 'JS 对象'
  },
  yaml: {
    name: 'YAML 配置',
    raw: `server:
  port: 8080
  enable_cors: true
  database:
    host: localhost
    pool: 10`,
    format: 'YAML'
  },
  xml: {
    name: 'XML 响应',
    raw: `<response><status>success</status><data><id>1002</id><name>EASY JSON</name></data></response>`,
    format: 'XML'
  },
  jsonp: {
    name: 'JSONP 回调',
    raw: `callback({
  "status": "ok",
  "data": {
    "items": ["a", "b", "c"],
    "total": 3
  }
});`,
    format: 'JSONP'
  },
  url: {
    name: 'URL 参数',
    raw: `https://api.easyjson.dev/v1/format?query=smart_extract&active=true&tags[]=editor&tags[]=diff`,
    format: 'URL 参数'
  },
  csv: {
    name: 'CSV 数据',
    raw: `id,username,email,role
1,chengxy,cheng@example.com,admin
2,antigravity,anti@example.com,dev`,
    format: 'CSV'
  },
  toml: {
    name: 'TOML 配置',
    raw: `[server]
host = "0.0.0.0"
port = 8080

[database]
host = "127.0.0.1"
port = 3306`,
    format: 'TOML'
  },
  properties: {
    name: 'Properties 配置',
    raw: `server.port=8080
server.host=0.0.0.0
database.url=jdbc:mysql://localhost:3306/mydb
database.username=root`,
    format: 'Properties'
  },
  ini: {
    name: 'INI 配置',
    raw: `[server]
host = 0.0.0.0
port = 8080

[database]
host = 127.0.0.1
port = 3306`,
    format: 'INI'
  },
  log: {
    name: '混杂日志',
    raw: `[2026-06-12 07:12:43] INFO [sys] - Payload received: {"meta":{"req_id":"a8b9c"},"data":{"status":200}} - processing_time=12ms`,
    format: '混合文本'
  },
  jsonc: {
    name: 'JSONC',
    raw: `{
  // 数据库连接配置
  "host": "127.0.0.1",
  "port": 3306,
  /* 连接池设置
     最大连接数 */
  "pool": {
    "max": 20,
    "min": 5, // 最小空闲连接
  }
}`,
    format: 'JSONC'
  },
  markdownTable: {
    name: 'Markdown 表格',
    raw: `| 姓名   | 部门   | 职位         | 月薪   | 入职日期   |
|--------|--------|-------------|--------|-----------|
| 王伟   | 技术部 | 高级前端工程师 | 35000  | 2021-03-15 |
| 陈静   | 产品部 | 产品经理     | 32000  | 2020-08-01 |
| 刘洋   | 技术部 | 后端工程师   | 28000  | 2022-01-10 |
| 赵敏   | 设计部 | UI 设计师   | 26000  | 2021-11-20 |`,
    format: 'Markdown Table'
  },
  rubyHash: {
    name: 'Ruby Hash',
    raw: `{:status => "success", :data => {:user_id => 1002, :name => "张三", :roles => ["admin", "editor"], :active => true, :meta => nil}}`,
    format: 'Ruby Hash'
  },
  phpArray: {
    name: 'PHP print_r',
    raw: `Array
(
    [status] => success
    [data] => Array
        (
            [user_id] => 1002
            [name] => 张三
            [roles] => Array
                (
                    [0] => admin
                    [1] => editor
                )
            [active] => 1
        )
)`,
    format: 'PHP print_r'
  },
  mongoShell: {
    name: 'MongoDB Shell',
    raw: `{
  "_id": ObjectId("5f7b3a1b9d3e2a1b3c4d5e6f"),
  "username": "张三",
  "email": "zhangsan@example.com",
  "createdAt": ISODate("2024-01-15T09:30:00.000Z"),
  "loginCount": NumberLong(2853),
  "balance": NumberDecimal("199.99"),
  "isVip": true
}`,
    format: 'MongoDB Shell'
  },
  unescapeJson: {
    name: '转义 JSON',
    raw: `"{\\"userId\\":1001,\\"name\\":\\"张三\\",\\"tags\\":[\\"dev\\",\\"backend\\"],\\"active\\":true,\\"meta\\":null}"`,
    format: '转义 JSON'
  },
  goMap: {
    name: 'Go map',
    raw: `map[string]any{"code":200,"data":nil,"ok":true}`,
    format: 'Go map'
  }
}

// ─── Live Extraction Playground State ───
const playgroundInput = ref(presets.standardJson.raw)
const playgroundOutput = ref('')
const playgroundFormat = ref('')
const playgroundError = ref('')
const isParsing = ref(false)
const activePresetKey = ref('standardJson')

const handleParse = (text) => {
  if (!text || !text.trim()) {
    playgroundOutput.value = ''
    playgroundFormat.value = ''
    playgroundError.value = ''
    return
  }

  isParsing.value = true
  // Simulate extraction animation delay for visual satisfaction
  setTimeout(() => {
    try {
      const result = extractJsonFromText(text)
      let formatted = result.json
      try {
        const parsed = JSON.parse(result.json)
        formatted = JSON.stringify(parsed, null, 2)
      } catch (e) {}
      playgroundOutput.value = formatted
      playgroundFormat.value = result.format
      playgroundError.value = ''
    } catch (err) {
      playgroundOutput.value = ''
      playgroundFormat.value = ''
      playgroundError.value = err.message
    } finally {
      isParsing.value = false
    }
  }, 200)
}

// ─── Premium JSON Syntax Highlighting ───
const tokenColors = {
  key: '#881280',
  string: '#1a6e1a',
  number: '#b55717',
  boolean: '#0066cc',
  null: '#808080',
  punctuation: '#4a5568',
}

const highlightJson = (raw) => {
  if (!raw) return ''
  // Tokenize JSON: keys, strings, numbers, booleans, null, punctuation
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /("(?:\\.|[^"\\])*?"\s*:)|("(?:\\.|[^"\\])*?")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b(?:true|false)\b)|(\bnull\b)|([{}[\],:])/g,
    (match, key, str, num, bool, nil, punct) => {
      if (key) return `<span class="json-key">${key}</span>`
      if (str) return `<span class="json-string">${str}</span>`
      if (num) return `<span class="json-number">${num}</span>`
      if (bool) return `<span class="json-bool">${bool}</span>`
      if (nil) return `<span class="json-null">${nil}</span>`
      if (punct) return `<span class="json-punct">${punct}</span>`
      return match
    }
  )
}

const highlightedOutput = computed(() => highlightJson(playgroundOutput.value))

// Highlight input — always attempt JSON token coloring (best-effort for all formats)
const highlightedInput = computed(() => highlightJson(playgroundInput.value || ''))

const syncInputScroll = (e) => {
  const ta = e.target
  const hl = ta.parentElement.querySelector('.playground-highlight-bg')
  if (hl) { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft }
}

const selectPreset = (key) => {
  activePresetKey.value = key
  playgroundInput.value = presets[key].raw
  handleParse(presets[key].raw)
}

const handleInput = (e) => {
  playgroundInput.value = e.target.value
  handleParse(e.target.value)
}

// ─── 20 种 Formats Cards Grid ───
const formatCards = [
  { key: 'standardJson', name: '标准 JSON', desc: '标准 JSON 格式化、压缩、校验，支持深层嵌套对象与数组。' },
  { key: 'jsonc', name: 'JSONC / JSON5', desc: '自动剥离 // 和 /* */ 注释、尾逗号，VS Code / ESLint / TSConfig 标配。' },
  { key: 'lombok', name: 'Java toString()', desc: '支持 Lombok、HashMap、嵌套数组、Optional 等输出格式。' },
  { key: 'python', name: 'Python Dict/Repr', desc: '支持 OrderedDict、defaultdict、True/False/None 常量转换。' },
  { key: 'looseJs', name: 'JS/TS 宽松对象', desc: '无引号 Key、单双引号混合、尾逗号、as const、注释自动剥离。' },
  { key: 'rubyHash', name: 'Ruby Hash', desc: '支持 :symbol、=> 哈希火箭、nil 常量，Rails / Sidekiq 日志直接粘贴。' },
  { key: 'yaml', name: 'YAML', desc: '缩进层级、块状标量自动转为结构化 JSON 嵌套。' },
  { key: 'xml', name: 'XML', desc: '自动解析并转换 XML 节点层级为树状 JSON 结构。' },
  { key: 'jsonp', name: 'JSONP', desc: '自动剥离回调函数包装，提取内部 JSON 数据。' },
  { key: 'url', name: 'URL 参数', desc: '提取 URL 参数，自动转码，支持数组格式 key[]=val 解析。' },
  { key: 'markdownTable', name: 'Markdown 表格', desc: '自动识别 | 分隔的 Markdown 表格，提取表头转为对象数组。' },
  { key: 'csv', name: 'CSV / TSV', desc: '自动检测分隔符，提取表头，转化为 JSON 数组对象。' },
  { key: 'toml', name: 'TOML', desc: '解析 TOML 配置文件，自动转为 JSON 结构。' },
  { key: 'properties', name: 'Properties', desc: '解析 .properties 和 .env 格式的键值对配置。' },
  { key: 'ini', name: 'INI', desc: '解析 INI 配置文件的节（section）和键值对。' },
  { key: 'phpArray', name: 'PHP print_r', desc: '解析 PHP Array( [key] => value ) 和嵌套数组输出。' },
  { key: 'mongoShell', name: 'MongoDB Shell', desc: '转换 ObjectId、ISODate、NumberLong 等 MongoDB 特有类型为标准 JSON。' },
  { key: 'unescapeJson', name: '转义 JSON 字符串', desc: '自动识别双编码 JSON 字符串，剥离外层引号和转义，提取内层真实 JSON。' },
  { key: 'goMap', name: 'Go map 语法', desc: '识别 Go map[string]any 格式，剥离类型前缀，nil→null，直接转为标准 JSON。' },
  { key: 'log', name: '混杂日志文本', desc: '扫描混杂文本，从包含任意字符的日志中抓取并剥离出嵌套的 JSON。' }
]

const tryFormat = (key) => {
  const el = document.getElementById('demo')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
  }
  selectPreset(key)
}

// ─── Simulated Semantic Diff State ───
const diffMode = ref('semantic') // 'text' | 'semantic'

// ─── Simulated Multi-View Explorer State ───
const activeViewType = ref('code')
const multiViews = [
  { key: 'code', name: '代码视图', icon: FileCode, img: '/images/codeview.png', desc: 'Premium 语法高亮，格式化 / 压缩 / 转义一键切换' },
  { key: 'tree', name: '树形视图', icon: ListTree, img: '/images/treeview.png', desc: '任意层级一键折叠展开，按节点快速探索深层结构' },
  { key: 'graph', name: '拓扑图谱', icon: Network, img: '/images/拓扑view.png', desc: '脑图式结构可视化，复杂关联一目了然' },
  { key: 'table', name: '表格视图', icon: Table2, img: '/images/tableview.png', desc: '扁平键值对，像 Excel 一样检索、排序、导出' },
]
const activeMultiView = computed(() => multiViews.find(v => v.key === activeViewType.value))

// ─── Auto-Paste Flow Demo State ───
const autoPastePhase = ref(3) // 0: idle, 1: copied, 2: switched, 3: formatted (默认展示完成态)
const autoPasteRunning = ref(false)

const triggerAutoPasteDemo = () => {
  if (autoPasteRunning.value) return
  autoPasteRunning.value = true
  autoPastePhase.value = 1
  setTimeout(() => { autoPastePhase.value = 2 }, 1200)
  setTimeout(() => { autoPastePhase.value = 3 }, 2400)
  setTimeout(() => { autoPasteRunning.value = false }, 4000)
}

// ─── Simulated Multi-Tab State ───
const activeSimTab = ref(1)
const simTabs = ref([
  { id: 1, name: 'api_response.json', type: 'format', size: '1.2 KB' },
  { id: 2, name: 'database_config.yaml', type: 'format', size: '0.8 KB' },
  { id: 3, name: 'Local vs Staging Diff', type: 'compare', size: '2.4 KB' }
])

const closeSimTab = (id, e) => {
  e.stopPropagation()
  if (simTabs.value.length <= 1) return
  simTabs.value = simTabs.value.filter(t => t.id !== id)
  if (activeSimTab.value === id) {
    activeSimTab.value = simTabs.value[0].id
  }
}

const addSimTab = () => {
  const newId = Date.now()
  simTabs.value.push({
    id: newId,
    name: `Untitled_${simTabs.value.length + 1}.json`,
    type: 'format',
    size: '0 KB'
  })
  activeSimTab.value = newId
}


// FAQs list
const faqs = [
  {
    q: '提取是怎么工作的？需要配置吗？',
    a: '不需要。粘贴进来就行。内置十多种解析器（Lombok toString、Python dict、YAML、CSV 等），自动识别格式并转 JSON。'
  },
  {
    q: '支持哪些格式？',
    a: 'Java Lombok toString()、Python dict/repr、宽松 JS 对象、XML、YAML、TOML、CSV/TSV、URL Query、.env/Properties，以及从混杂日志文本中提取嵌套 JSON。'
  },
  {
    q: '浏览器插件怎么用？',
    a: '装好插件后，在任意网页选中包含 JSON 的文本 → 右键 → 用 easyJSON 提取。会在当前标签页直接打开并格式化，不用手动复制粘贴。'
  },
  {
    q: '语义 Diff 和普通文本 Diff 有什么区别？',
    a: '文本 Diff 会把 key 排序不同、缩进不同都标为差异。语义 Diff 先正规化两端 JSON（排序 key、统一格式），再做比较，只高亮值和结构的实际变更。'
  },
  {
    q: '数据安全吗？',
    a: '完全离线。所有数据在本地内存中处理，不发送到任何服务器。'
  }
]

// Pre-computed highlighted JSON for static mockup panels
const staticJsonA = highlightJson('{\n  "id": 100,\n  "name": "easyJSON",\n  "tags": ["formatting", "diff"]\n}')
const staticJsonB_text = highlightJson('{\n  "tags": ["formatting", "diff"],\n  "name": "easyJSON",\n  "id": 100\n}')
const staticJsonB_semantic = highlightJson('{\n  "id": 100,\n  "name": "easyJSON",\n  "tags": ["formatting", "diff"]\n}')
const staticPopupJson = highlightJson('{\n  "id": 8831,\n  "name": "王五",\n  "detail": {\n    "role": "Admin",\n    "isSuper": true\n  }\n}')
const staticCodeViewJson = highlightJson('{\n  "user": "chengxy",\n  "project": "easyJSON",\n  "status": "active",\n  "meta": {\n    "version": "1.0.0",\n    "speed_ms": 12\n  }\n}')
const staticTabJson = highlightJson('{\n  "status": "success",\n  "data": {\n    "user_id": 1002,\n    "roles": ["admin", "editor"]\n  }\n}')
const staticTabYaml = highlightJson('database:\n  host: "127.0.0.1"\n  port: 3306\n  username: "root"\n  pool: 20')
const staticTabCompareA = highlightJson('{\n  "host": "127.0.0.1",\n  "port": 3306,\n  "username": "root"\n}')
const staticTabCompareB = highlightJson('{\n  "host": "0.0.0.0",\n  "port": 8080,\n  "max_conn": 100\n}')

onMounted(() => {
  handleParse(playgroundInput.value)
  if (heroRef.value) heroParticles.mount(heroRef.value)
})

onBeforeUnmount(() => {
  heroParticles.unmount()
})
</script>

<template>
  <div class="home-page">
    <!-- ─── Navbar ─── -->
    <header class="home-nav">
      <nav class="home-nav-inner">
        <!-- Left: Logo + badge -->
        <div class="home-nav-left">
          <a class="home-nav-logo" @click.prevent="$emit('go-to-app')" href="#">
            <img src="/images/logo.png" class="home-nav-logo-icon" alt="easyJSON logo" />
            <span class="home-nav-logo-text">EASY JSON</span>
          </a>
          <span class="home-nav-badge">v1.0.0</span>
          <span class="home-nav-sep" />
        </div>

        <!-- Center: Nav links -->
        <div class="home-nav-links">
          <a href="#demo" class="home-nav-link">智能提取</a>
          <a href="#diff" class="home-nav-link">语义比对</a>
          <a href="#multiview" class="home-nav-link">多维视图</a>
          <a href="#formats" class="home-nav-link">支持格式</a>
        </div>

        <!-- Right: CTA + GitHub -->
        <div class="home-nav-right">
          <button class="home-btn-primary" @click="$emit('go-to-app')" id="home-open-app-btn">
            Editor
          </button>
          <a href="https://github.com/chengxy-nds/easy-json" target="_blank" class="home-nav-ghost-btn" title="GitHub">
            <svg fill="currentColor" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="home-nav-gh-icon">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
          </a>
        </div>
      </nav>
    </header>

    <!-- ─── Main Content ─── -->
    <main class="home-main">
      <div class="home-content-wrap">

        <!-- ─── Hero Section ─── -->
        <section ref="heroRef" class="hero-section animate-fade-in">
          <div class="hero-badge">
            <Terminal class="badge-icon-item" />
            <span>格式化</span>
            <span class="badge-divider">/</span>
            <span>Diff</span>
            <span class="badge-divider">/</span>
            <span>多格式提取</span>  <span class="badge-divider">/</span>
                                          <span>网页右键直接提取</span>
          </div>

          <h1 class="hero-title">
            像 JSON 的字符串都能解析
            <br>
            <span class="hero-title-sub">给开发者的桌面工具箱</span>
          </h1>
          <p class="hero-subtitle">
            丢进来 Lombok toString、Python dict、YAML、CSV 甚至一坨日志，直接吐出标准 JSON。支持语义级 Diff、四种视图、多 Tab 工作区，完全离线，数据不出本机。
          </p>
          <div class="hero-actions">
            <div class="hero-download-wrap">
              <button class="hero-download-btn">
                <svg class="hero-download-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                下载
              </button>
              <div class="hero-download-dropdown">
                <!-- Chrome Extension -->
                <div class="hero-dl-card">
                  <div class="hero-dl-card-icon">
                    <svg viewBox="0 0 1024 1024" width="24" height="24">
                      <path d="M123.648 178.346667C361.642667-98.602667 802.986667-43.946667 967.936 279.68h-396.501333c-71.424 0-117.546667-1.621333-167.509334 24.661333-58.709333 30.933333-102.997333 88.234667-118.485333 155.52L123.648 178.389333z" fill="#EA4335" />
                      <path d="M341.674667 512c0 93.866667 76.330667 170.24 170.154666 170.24 93.866667 0 170.154667-76.373333 170.154667-170.24s-76.330667-170.24-170.154667-170.24c-93.866667 0-170.154667 76.373333-170.154666 170.24z" fill="#4285F4" />
                      <path d="M577.877333 734.848c-95.530667 28.373333-207.274667-3.114667-268.501333-108.8-46.762667-80.64-170.24-295.765333-226.346667-393.557333-196.565333 301.226667-27.136 711.808 329.685334 781.866666l165.12-279.509333z" fill="#34A853" />
                      <path d="M669.866667 341.76a233.130667 233.130667 0 0 1 43.008 286.634667c-40.576 69.973333-170.154667 288.682667-232.96 394.581333 367.658667 22.656 635.733333-337.664 514.645333-681.258667H669.866667z" fill="#FBBC05" />
                      <circle cx="512" cy="512" r="170.24" fill="#4285F4" />
                      <circle cx="512" cy="512" r="102" fill="#fff" />
                    </svg>
                  </div>
                  <h4 class="hero-dl-card-title">Chrome 插件</h4>
                  <p class="hero-dl-card-desc">网页选中文本右键即可提取 JSON</p>
                  <span class="hero-dl-card-meta">Chrome / Edge / Firefox</span>
                  <a href="https://croot-report.oss-cn-beijing.aliyuncs.com/easyjson-plugin.zip" class="hero-dl-card-btn">安装插件</a>
                </div>
                <!-- macOS -->
                <div class="hero-dl-card">
                  <div class="hero-dl-card-icon">
                    <svg viewBox="0 0 1024 1024" width="24" height="24">
                      <path d="M928.768 750.592c-1.536 4.096-21.504 74.24-70.656 145.92-43.008 62.464-87.04 124.928-156.672 125.952-68.608 1.024-90.624-40.96-168.96-40.96s-102.912 39.936-167.936 41.984c-67.072 2.56-118.784-68.096-161.792-130.048C115.2 767.488 47.616 534.528 138.24 378.88c44.544-77.824 124.928-127.488 211.968-129.024 65.536-1.024 128.512 44.544 168.448 44.544 40.96 0 116.736-55.296 196.608-47.104 33.28 1.536 126.976 13.824 186.88 101.376-4.608 3.072-111.616 66.56-110.592 195.072 1.024 155.136 135.68 206.336 137.216 206.848m-266.24-586.24c35.84-44.032 59.904-104.448 53.248-164.352-51.2 2.048-114.176 34.304-151.04 77.824-32.768 37.888-61.952 99.328-53.76 158.72 56.832 3.072 115.712-30.208 151.552-72.192" fill="#040000" />
                    </svg>
                  </div>
                  <h4 class="hero-dl-card-title">macOS 客户端</h4>
                  <p class="hero-dl-card-desc">原生 Electron，支持 Apple Silicon 和 Intel</p>
                  <a href="https://croot-report.oss-cn-beijing.aliyuncs.com/easyjson.dmg" class="hero-dl-card-btn">下载 macOS 版</a>
                </div>
                <!-- Windows -->
                <div class="hero-dl-card">
                  <div class="hero-dl-card-icon">
                    <svg viewBox="0 0 1024 1024" width="24" height="24">
                      <path d="M456 484V160.1l-335.9 72V484H456zM512 484h391.8V64.2l-391.8 84V484zM456 540H120.2v251.9l335.9 72V540zM512 540v335.9l391.8 84V540H512z" fill="#00adef" />
                    </svg>
                  </div>
                  <h4 class="hero-dl-card-title">Windows 客户端</h4>
                  <p class="hero-dl-card-desc">NSIS 安装包，即装即用</p>
                  <span class="hero-dl-card-meta">Windows 10 / 11 · 64位</span>
                  <a href="https://croot-report.oss-cn-beijing.aliyuncs.com/easyjson.exe" class="hero-dl-card-btn">下载 .exe</a>
                </div>
              </div>
            </div>
            <button class="home-btn-primary hero-cta" @click="$emit('go-to-app')" id="hero-try-now-btn">
              开始使用 <ArrowRight class="btn-arrow" />
            </button>
          </div>
        </section>

        <!-- ─── Supported Formats Showroom Grid ─── -->
        <section id="formats" class="formats-section">
          <div class="section-header">
            <h2 class="section-title">智能提取 · 支持 100+ 种格式</h2>
            <p class="section-subtitle-small">粘贴即解析，不用手动剥离引号、去掉日志前缀，直接扔进来就行：</p>
          </div>
          <div class="formats-grid">
            <div
              v-for="card in formatCards.slice(0, 12)"
              :key="card.key"
              class="format-card"
            >
              <div class="format-card-header">
                <Terminal class="format-icon" />
                <h4>{{ card.name }}</h4>
              </div>
              <p>{{ card.desc }}</p>
              <button class="try-card-btn" @click="tryFormat(card.key)">
                try it <MousePointerClick class="try-icon" />
              </button>
            </div>
          </div>
          <div class="formats-more">
            <span class="formats-more-dot"></span>
            <span class="formats-more-dot"></span>
            <span class="formats-more-dot"></span>
            <span class="formats-more-text">and more...</span>
          </div>
        </section>

        <!-- ─── Interactive Live Demo Section ─── -->
        <section id="demo" class="demo-section">
          <div class="presets-bar">
            <span class="presets-label">预设案例：</span>
            <div class="preset-scroll-track">
              <div class="preset-scroll-inner">
                <button
                  v-for="(data, key) in presets"
                  :key="key"
                  class="preset-btn"
                  :class="{ active: activePresetKey === key }"
                  @click="selectPreset(key)"
                >
                  {{ data.name }}
                </button>
                <!-- 副本实现无缝循环 -->
                <button
                  v-for="(data, key) in presets"
                  :key="'dup-'+key"
                  class="preset-btn"
                  :class="{ active: activePresetKey === key }"
                  @click="selectPreset(key)"
                >
                  {{ data.name }}
                </button>
              </div>
            </div>
          </div>

          <!-- Interactive Code Split Panel -->
          <div class="code-mockup-grid">
            <!-- Left panel: Raw input source -->
            <div class="mockup-pane">
              <div class="pane-title">
                <span class="status-dot"></span>
                <span>输入 &mdash; 任意格式</span>
              </div>
              <div class="playground-input-wrapper">
                <pre class="playground-highlight-bg" aria-hidden="true" v-html="highlightedInput"></pre>
                <textarea
                  class="playground-textarea"
                  :value="playgroundInput"
                  @input="handleInput"
                  @scroll="syncInputScroll"
                  placeholder="粘贴任意内容..."
                  spellcheck="false"
                ></textarea>
              </div>
            </div>

            <!-- Arrow middle indicator -->
            <div class="flow-arrow-wrap">
              <div class="arrow-circle" :class="{ 'is-loading': isParsing }">
                <RefreshCw v-if="isParsing" class="arrow-svg spinner" />
                <ArrowRight v-else class="arrow-svg" />
              </div>
            </div>

            <!-- Right panel: Extracted output JSON -->
            <div class="mockup-pane output-pane">
              <div class="pane-title">
                <span class="status-dot green"></span>
                <span v-if="playgroundFormat" class="extracted-format-badge">检测到：{{ playgroundFormat }}</span>
                <span v-else>输出 &mdash; 标准 JSON</span>
              </div>
              <div class="code-container">
                <div v-if="isParsing" class="parsing-overlay">
                  <div class="scanner-line"></div>
                  <span>解析中...</span>
                </div>
                <pre v-if="playgroundOutput" class="pane-code" v-html="highlightedOutput"></pre>
                <div v-else-if="playgroundError" class="pane-code error-code-style">{{ playgroundError }}</div>
                <div v-else class="pane-code empty-code-style">// 等待输入...</div>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Simulated Browser Extension Section (浏览器插件) ─── -->
        <section id="extension" class="interactive-showcase-section">
          <div class="showcase-content">
            <div class="showcase-info">
              <div class="showcase-badge"><Chrome class="mini-icon" /> 浏览器插件</div>
              <h3>网页里选中文本，右键直接提取</h3>
              <p>在 Kibana 看日志、在 Swagger 调接口、在 Console 里 debug — 选中文本右键，easyJSON 浏览器插件直接把 JSON 提出来格式化，不用来回切窗口。</p>
            </div>

            <!-- Simulated Browser UI Visual -->
            <div class="browser-mockup-wrapper">
              <div class="browser-header">
                <div class="browser-dots">
                  <span class="dot-red"></span>
                  <span class="dot-yellow"></span>
                  <span class="dot-green"></span>
                </div>
                <div class="browser-address">https://logging-center.internal/dashboard</div>
              </div>
              <div class="browser-body">
                <!-- Left: Mock logs page -->
                <div class="mock-webpage">
                  <div class="page-title-bar">Kibana 日志查看器</div>
                  <div class="log-lines">
                    <div class="log-line">07:12:40 [INFO] Starting connection pooling...</div>
                    <div class="log-line text-highlight-target is-selected">
                      07:12:43 [DEBUG] Response: User(id=8831, name="王五", detail=Detail{role="Admin", isSuper=true})
                    </div>
                    <div class="log-line">07:12:45 [INFO] Socket closed gracefully.</div>
                  </div>
                </div>

                <!-- Right: Simulated easyJSON Extension Popup -->
                <div class="sim-extension-popup is-active">
                  <div class="popup-header">
                    <img src="/images/logo.png" class="popup-logo" />
                    <span>easyJSON 弹窗</span>
                    <span class="popup-badge">v1.0.0</span>
                  </div>
                  <div class="popup-content">
                    <div class="popup-result">
                      <div class="popup-success-banner">
                        <Check class="banner-check" /> 成功从 Java Lombok 格式提取！
                      </div>
                      <pre class="popup-json-code" v-html="staticPopupJson"></pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Zero-Click Auto Paste Flow Section (自动粘贴) ─── -->
        <section id="auto-paste" class="auto-paste-section">
          <div class="section-header">
            <h2 class="section-title">自动粘贴 — 零操作格式化</h2>
            <p class="section-subtitle-small">复制 → 切回 easyJSON → 自动粘贴并格式化，全程零点击。</p>
          </div>

          <!-- Premium Step Flow -->
          <div class="ap-flow">
            <div class="ap-flow-row">
              <!-- Card 1 -->
              <div class="ap-card" :class="{ 'is-active': autoPastePhase === 1, 'is-done': autoPastePhase >= 2 }">
                <span class="ap-card-watermark">1</span>
                <div class="ap-card-icon-ring" :class="{ 'ring-active': autoPastePhase === 1, 'ring-done': autoPastePhase >= 2 }">
                  <Check v-if="autoPastePhase >= 2" class="ap-card-icon ap-card-icon--check" />
                  <ClipboardPaste v-else class="ap-card-icon" />
                </div>
                <h4 class="ap-card-title">任意位置复制</h4>
                <p class="ap-card-desc">Kibana、Swagger、VS Code、浏览器…<br>任何地方复制含 JSON 的文本</p>
                <div v-if="autoPastePhase === 1" class="ap-card-glow"></div>
              </div>

              <!-- Connector 1→2 -->
              <div class="ap-connector" :class="{ 'is-flowing': autoPastePhase >= 2 }">
                <svg class="ap-connector-svg" viewBox="0 0 80 24" fill="none">
                  <line x1="0" y1="12" x2="80" y2="12" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4" class="ap-dash-line" />
                  <polygon points="74,7 80,12 74,17" fill="currentColor" class="ap-dash-arrow" />
                </svg>
                <div v-if="autoPastePhase >= 2" class="ap-flow-particles">
                  <span class="ap-particle"></span>
                  <span class="ap-particle"></span>
                  <span class="ap-particle"></span>
                </div>
              </div>

              <!-- Card 2 -->
              <div class="ap-card" :class="{ 'is-active': autoPastePhase === 2, 'is-done': autoPastePhase >= 3 }">
                <span class="ap-card-watermark">2</span>
                <div class="ap-card-icon-ring" :class="{ 'ring-active': autoPastePhase === 2, 'ring-done': autoPastePhase >= 3 }">
                  <Check v-if="autoPastePhase >= 3" class="ap-card-icon ap-card-icon--check" />
                  <RefreshCw v-else-if="autoPastePhase === 2" class="ap-card-icon ap-spin" />
                  <MousePointerClick v-else class="ap-card-icon" />
                </div>
                <h4 class="ap-card-title">切回 easyJSON</h4>
                <p class="ap-card-desc">打开 easyJSON 窗口<br>自动检测剪贴板，无需手动粘贴</p>
                <div v-if="autoPastePhase === 2" class="ap-card-glow"></div>
              </div>

              <!-- Connector 2→3 -->
              <div class="ap-connector" :class="{ 'is-flowing': autoPastePhase >= 3 }">
                <svg class="ap-connector-svg" viewBox="0 0 80 24" fill="none">
                  <line x1="0" y1="12" x2="80" y2="12" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4" class="ap-dash-line" />
                  <polygon points="74,7 80,12 74,17" fill="currentColor" class="ap-dash-arrow" />
                </svg>
                <div v-if="autoPastePhase >= 3" class="ap-flow-particles">
                  <span class="ap-particle"></span>
                  <span class="ap-particle"></span>
                  <span class="ap-particle"></span>
                </div>
              </div>

              <!-- Card 3 -->
              <div class="ap-card ap-card--final" :class="{ 'is-active': autoPastePhase === 3, 'is-done': autoPastePhase >= 3 }">
                <span class="ap-card-watermark">3</span>
                <div class="ap-card-icon-ring" :class="{ 'ring-active': autoPastePhase === 3, 'ring-done': autoPastePhase >= 3 }">
                  <Zap class="ap-card-icon" />
                </div>
                <h4 class="ap-card-title">自动格式化完成</h4>
                <p class="ap-card-desc">解析、格式化、高亮一步到位<br>直接呈现干净的结构化 JSON</p>
                <div v-if="autoPastePhase === 3" class="ap-card-glow ap-card-glow--success"></div>
              </div>
            </div>

          </div>
        </section>


        <!-- ─── Diff Preview Image Section (语义对比) ─── -->
        <section id="diff" class="diff-preview-section">
          <div class="diff-preview-card">
            <div class="diff-preview-info">
              <div class="showcase-badge"><Split class="mini-icon" /> 语义级对比</div>
              <h3>忽略 key 排序和缩进<br>只看真正的数据变更</h3>
              <p>传统文本 Diff 对 JSON 毫无意义 — 换个 key 顺序就全红。easyJSON 先正规化再 Diff，智能识别新增、删除、修改，字符级差异高亮。</p>
              <ul class="diff-preview-features">
                <li><Check class="dp-check" /> 自动排序 key，统一缩进格式</li>
                <li><Check class="dp-check" /> 值变化精确到字符高亮</li>
                <li><Check class="dp-check" /> 左右分栏同步滚动对比</li>
              </ul>
            </div>
            <div class="diff-preview-image">
              <img src="/images/diff.png" alt="easyJSON 语义对比" />
            </div>
          </div>
        </section>

        <!-- ─── Multi-View Section (多维视图) ─── -->
        <section id="multiview" class="multiview-section">
          <div class="section-header">
            <h2 class="section-title">一份数据，四种看法</h2>
            <p class="section-subtitle-small">代码、树形、拓扑、表格 — 一键切换视角，不用切工具</p>
          </div>

          <!-- View Switcher Card -->
          <div class="mv-viewer-card">
            <!-- Segmented Control -->
            <div class="mv-segmented-bar">
            <div class="mv-segmented">
              <button
                v-for="v in multiViews"
                :key="v.key"
                class="mv-seg-btn"
                :class="{ active: activeViewType === v.key }"
                @click="activeViewType = v.key"
              >
                <component :is="v.icon" class="mv-seg-icon" />
                <span>{{ v.name }}</span>
              </button>
              <div class="mv-seg-indicator" :class="'mv-seg-pos--' + activeViewType"></div>
            </div>
          </div>

          <!-- Screenshot Area -->
          <div class="mv-screenshot-area">
            <Transition name="mv-fade" mode="out-in">
              <img
                :key="activeViewType"
                :src="activeMultiView.img"
                :alt="activeMultiView.name"
                class="mv-screenshot"
              />
            </Transition>
          </div>

          <!-- Description -->
          <p class="mv-view-desc">{{ activeMultiView.desc }}</p>
          </div>
        </section>

        <!-- ─── Multi-Tab Section (多标签页) ─── -->
        <section id="tabs" class="tabs-section">
          <div class="section-header">
            <h2 class="section-title">多 Tab 并行工作</h2>
            <p class="section-subtitle-small">调三个接口就开三个 Tab，互不干扰，独立保存状态</p>
          </div>
          <div class="tabs-feature-row">
            <div class="tabs-mockup-visual">
              <div class="tabs-mockup-bar">
                <span class="tmb-tab active">api_response.json <X class="tmb-close" /></span>
                <span class="tmb-tab">db_config.yaml <X class="tmb-close" /></span>
                <span class="tmb-tab">diff_compare.json <X class="tmb-close" /></span>
                <span class="tmb-add">+</span>
              </div>
              <div class="tabs-mockup-code">
                <pre class="pane-code" v-html="staticTabJson"></pre>
              </div>
            </div>
            <div class="tabs-features">
              <div class="tabs-feat">
                <FileCode class="tabs-feat-icon" />
                <div><strong>多格式并存</strong><p>JSON、YAML、Diff 视图各占一个 Tab，随时切换</p></div>
              </div>
              <div class="tabs-feat">
                <ArrowUpDown class="tabs-feat-icon" />
                <div><strong>拖拽排序</strong><p>拖拽重新排列页签，常用 Tab 放在最前面</p></div>
              </div>
              <div class="tabs-feat">
                <ShieldCheck class="tabs-feat-icon" />
                <div><strong>状态持久化</strong><p>每个 Tab 输入缓存，关闭也不丢数据</p></div>
              </div>
            </div>
          </div>
        </section>
        <!-- ─── Core Features Summary Section ─── -->
        <section id="features" class="features-section">
          <h2 class="section-title">为什么选 easyJSON</h2>
          <div class="grid-features-cards">

            <div class="highlight-card">
              <div class="card-icon-box"><Braces class="highlight-icon" /></div>
              <h3>智能提取 · 100+ 格式</h3>
              <p>Java toString、Python dict、YAML、XML、URL 参数、CSV … 粘进来自动识别并转成标准 JSON。</p>
            </div>

            <div class="highlight-card">
              <div class="card-icon-box"><Chrome class="highlight-icon" /></div>
              <h3>浏览器插件 · 右键提取</h3>
              <p>在 Kibana、Swagger、Console 里选中文本右键，直接提取并格式化 JSON，不用来回切窗口。</p>
            </div>

            <div class="highlight-card">
              <div class="card-icon-box"><Lock class="highlight-icon" /></div>
              <h3>100% 离线</h3>
              <p>所有解析都在本地完成，断网照样用。数据不出你的机器，适合处理生产环境的敏感数据。</p>
            </div>

            <div class="highlight-card">
              <div class="card-icon-box"><ClipboardPaste class="highlight-icon" /></div>
              <h3>自动粘贴</h3>
              <p>复制内容后切回 easyJSON，自动检测剪贴板并格式化，全程零点击。</p>
            </div>

            <div class="highlight-card">
              <div class="card-icon-box"><Layers class="highlight-icon" /></div>
              <h3>多 Tab 管理</h3>
              <p>每份数据一个 Tab，随时切换对照，不会互相覆盖，多任务并行处理。</p>
            </div>

            <div class="highlight-card">
              <div class="card-icon-box"><Split class="highlight-icon" /></div>
              <h3>语义对比</h3>
              <p>先 normalize 再 diff — 无视 key 顺序和缩进差异，只标出值和结构的实际变更，字符级高亮。</p>
            </div>

          </div>
        </section>

        <!-- ─── FAQ Section ─── -->
        <section id="faq" class="faq-section">
          <h2 class="section-title">常见问题</h2>

          <div class="faq-list">
            <div
              v-for="(item, index) in faqs"
              :key="index"
              class="faq-item"
            >
              <button
                class="faq-trigger"
                :aria-expanded="openFaq === index"
                @click="toggleFaq(index)"
                :id="`faq-btn-${index}`"
              >
                <HelpCircle class="faq-icon-left" />
                <span>{{ item.q }}</span>
                <svg
                  class="faq-chevron"
                  :class="{ 'faq-chevron--open': openFaq === index }"
                  width="15" height="15" viewBox="0 0 15 15" fill="none"
                >
                  <path d="M3.13523 6.15803C3.3241 5.95657 3.64052 5.94637 3.84197 6.13523L7.5 9.56464L11.158 6.13523C11.3595 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67591 11.842 6.86477L7.84197 10.6148C7.64964 10.7951 7.35036 10.7951 7.15803 10.6148L3.15803 6.86477C2.95657 6.67591 2.94637 6.35949 3.13523 6.15803Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
                </svg>
              </button>
              <div
                class="faq-content"
                :class="{ 'faq-content--open': openFaq === index }"
              >
                <p class="faq-answer">{{ item.a }}</p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>

    <!-- ─── Footer ─── -->
    <footer class="home-footer">
      <div class="home-footer-inner">
        <div class="footer-brand">
          <img src="/images/logo.png" width="20" height="20" alt="easyJSON" style="opacity: 0.5; filter: grayscale(1);" />
          <span>© 2026 easyJSON</span>
        </div>
        <div class="footer-links">
          <a href="https://github.com/chengxy-nds/easy-json" target="_blank" rel="noopener" class="footer-link">GitHub</a>
          <a href="https://github.com/chengxy-nds/easy-json/issues" target="_blank" rel="noopener" class="footer-link">提交反馈</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ── Base Page: design tokens scoped under .home-page ── */
.home-page {
  --accent: #5f5f5f;
  --accent-dim: rgb(220 220 220 / 12%);
  --glass-bg: rgba(255,255,255,0.42);
  --glass-bg-hover: rgba(255,255,255,0.58);
  --glass-border: rgba(255,255,255,0.5);
  --glass-blur: blur(20px) saturate(160%);
  --glass-shadow-sm: 0 1px 2px rgba(0,0,0,0.03),0 2px 6px rgba(0,0,0,0.04);
  --glass-shadow-md: 0 1px 3px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.06);
  --glass-shadow-lg: 0 2px 6px rgba(0,0,0,0.04),0 12px 36px rgba(0,0,0,0.08);
  --glass-bg-dark: rgba(40,42,54,0.48);
  --glass-border-dark: rgba(255,255,255,0.07);

  --section-gap: 3rem;
  --nav-logo-fs: clamp(12px, 1.1vw, 16px);
  --nav-badge-fs: clamp(9px, 0.75vw, 12px);
  --nav-link-fs: clamp(12px, 0.95vw, 14px);
  --nav-btn-fs: clamp(11px, 0.85vw, 13px);
  --hero-title-fs: clamp(20px, 3vw, 48px);
  --hero-sub-fs: clamp(14px, 1.8vw, 28px);
  --hero-desc-fs: clamp(12px, 1.1vw, 17px);
  --hero-cta-fs: clamp(10px, 0.9vw, 14px);
  --sec-title-fs: clamp(17px, 2vw, 30px);
  --sec-sub-fs: clamp(11px, 1vw, 15px);
  --showcase-h3-fs: clamp(16px, 1.8vw, 28px);
  --showcase-p-fs: clamp(11px, 0.85vw, 14px);

  background: #fafbfc;
  background-image:
    radial-gradient(ellipse 70% 50% at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 60%),
    radial-gradient(circle at 0% 100%, rgba(16,185,129,0.03) 0%, transparent 40%);
  background-attachment: fixed;
}
.dark-mode .home-page {
  background: #111214;
  background-image:
    radial-gradient(ellipse 70% 50% at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 60%),
    radial-gradient(circle at 0% 100%, rgba(16,185,129,0.04) 0%, transparent 40%);
}

/* ═══ NAVBAR (Z-10) ═══ */
.home-nav {
  position:sticky;top:0;z-index:10;
  background:rgba(255,255,255,0.65);
  backdrop-filter:blur(24px) saturate(180%);
  -webkit-backdrop-filter:blur(24px) saturate(180%);
  border-bottom:1px solid rgba(0,0,0,0.06);
  height:50px;display:flex;align-items:center;justify-content:center;width:100%;
}
.dark-mode .home-nav{background:rgba(30,30,34,0.7);border-bottom-color:rgba(255,255,255,0.05)}
.home-nav-inner{display:flex;align-items:center;width:100%;max-width:1160px;padding:0 24px;height:100%}
.home-nav-left{display:flex;align-items:center;gap:8px;flex-shrink:0}
.home-nav-logo{display:flex;align-items:center;gap:7px;text-decoration:none;color:var(--text-primary);cursor:pointer}
.home-nav-logo-icon{width:24px;height:24px;flex-shrink:0}
.dark-mode .home-nav-logo-icon{filter:invert(0.9)}
.home-nav-logo-text{font-weight:700;font-size:var(--nav-logo-fs);letter-spacing:-0.02em;color:var(--text-primary)}
.home-nav-badge{display:inline-flex;align-items:center;color:var(--text-secondary);font-size:var(--nav-badge-fs);font-weight:500;border-radius:99px;padding:1px 10px;background:rgba(0,0,0,0.05);line-height:1.5}
.dark-mode .home-nav-badge{background:rgba(255,255,255,0.07)}
.home-nav-sep{display:none}
.home-nav-links{display:flex;align-items:center;gap:20px;margin-left:24px}
.home-nav-link{text-decoration:none;font-size:clamp(13px,1vw,15px);font-weight:500;color:var(--text-secondary);transition:color 0.2s;padding:4px 0;letter-spacing:-0.01em}
.home-nav-link:hover{color:var(--text-primary)}
.home-nav-right{display:flex;align-items:center;gap:8px;margin-left:auto}
.home-nav-ghost-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;color:var(--text-secondary);background:rgba(0,0,0,0.05);transition:all 0.2s cubic-bezier(0.16,1,0.3,1);text-decoration:none}
.home-nav-ghost-btn:hover{background:rgba(0,0,0,0.1);color:var(--text-primary);transform:scale(1.04)}
.home-nav-ghost-btn:active{transform:scale(0.96)}
.home-nav-gh-icon{width:16px;height:16px}
.home-btn-primary{display:inline-flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);color:#fafafa;font-size:var(--nav-btn-fs);font-weight:500;border:none;border-radius:8px;padding:0 16px;height:30px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.1);transition:all 0.2s cubic-bezier(0.16,1,0.3,1);white-space:nowrap}
.home-btn-primary:hover{background:rgba(0,0,0,0.92);transform:translateY(-0.5px);box-shadow:0 3px 8px rgba(0,0,0,0.16)}
.home-btn-primary:active{transform:scale(0.97);box-shadow:0 1px 2px rgba(0,0,0,0.1)}

/* ═══ MAIN LAYOUT ═══ */
.home-main{flex:1;display:flex;justify-content:center;padding:0 24px;position:relative;z-index:1}
.home-content-wrap{width:100%;max-width:1160px;display:flex;flex-direction:column;align-items:center;margin-top:0;margin-bottom:90px}
.home-content-wrap > section{margin-bottom:var(--section-gap, 100px);border-radius:12px;padding:24px clamp(24px,4vw,48px)}
.home-content-wrap > section.hero-section{background:transparent;border-radius:0;box-shadow:none;padding:0}
.home-content-wrap > section:last-child{margin-bottom:0}
.dark-mode .home-content-wrap > section{}

/* ═══ HERO ═══ */
.hero-section{position:relative;width:100%;min-height:66vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 0 96px;overflow:hidden}
.hero-section > *:not(canvas){position:relative;z-index:1}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:var(--glass-bg);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12px;font-weight:500;font-family:var(--font-sans);padding:5px 16px;border-radius:99px;margin:48px 0 24px;box-shadow:var(--glass-shadow-sm)}
.dark-mode .hero-badge{background:var(--glass-bg-dark);border-color:var(--glass-border-dark)}
.badge-icon-item{width:13px;height:13px;color:var(--text-secondary)}
.badge-divider{color:rgba(0,0,0,0.15);margin:0 2px}
.dark-mode .badge-divider{color:rgba(255,255,255,0.12)}
.hero-title{font-size:var(--hero-title-fs);font-weight:600;letter-spacing:-0.04em;line-height:1.1;color:var(--text-primary);margin-bottom:18px;max-width:860px}
.hero-title-sub{font-size:var(--hero-sub-fs);font-weight:500;color:var(--text-secondary);letter-spacing:-0.01em}
.hero-subtitle{font-size:clamp(14px,1.2vw,18px);color:var(--text-secondary);max-width:680px;line-height:1.7;margin-bottom:36px;font-weight:400}
.hero-actions{display:flex;align-items:center;gap:12px}
.hero-cta{font-size:var(--hero-cta-fs);height:42px;padding:0 28px;border-radius:8px;gap:8px}
.btn-arrow{width:14px;height:14px;transition:transform 0.2s ease}
.hero-cta:hover .btn-arrow{transform:translateX(3px)}

/* Download button + horizontal dropdown panel */
.hero-download-wrap{position:relative}
.hero-download-btn{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 24px;border:none;background:linear-gradient(180deg,rgba(255,255,255,0.92) 0%,rgba(242,242,246,0.72) 100%);color:var(--text-primary);font-size:var(--hero-cta-fs);font-weight:600;font-family:var(--font-mono);letter-spacing:0.02em;border-radius:8px;cursor:pointer;transition:all 0.35s cubic-bezier(0.16,1,0.3,1);white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.05),0 4px 20px rgba(175,180,195,0.28),0 0 50px rgba(185,190,205,0.15),0 0 90px rgba(195,200,215,0.07)}
.hero-download-btn:hover{background:linear-gradient(180deg,rgba(255,255,255,0.98) 0%,rgba(248,248,252,0.88) 100%);box-shadow:0 1px 2px rgba(0,0,0,0.05),0 6px 28px rgba(170,175,195,0.38),0 0 70px rgba(180,185,205,0.22),0 0 120px rgba(190,195,215,0.12),0 0 180px rgba(200,205,220,0.06)}
.hero-download-icon{width:15px;height:15px;opacity:0.6}
.hero-download-dropdown{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,0.12);opacity:0;visibility:hidden;transition:all 0.2s cubic-bezier(0.16,1,0.3,1);z-index:50;display:flex;gap:14px}
.hero-download-wrap:hover .hero-download-dropdown{opacity:1;visibility:visible}

/* Horizontal card per platform */
.hero-dl-card{display:flex;flex-direction:column;align-items:center;text-align:center;width:190px;padding:18px 14px;border-radius:8px;border:1px solid transparent;transition:all 0.2s;cursor:default;gap:8px}
.hero-dl-card:hover{border-color:rgba(0,0,0,0.06);background:rgba(0,0,0,0.015)}
.hero-dl-card-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-bottom:2px}
.dark-mode .hero-dl-card-icon{opacity:0.9}
.hero-dl-card-title{font-size:13px;font-weight:700;color:var(--text-primary);margin:0}
.hero-dl-card-desc{font-size:11px;color:var(--text-secondary);margin:0;line-height:1.4}
.hero-dl-card-meta{font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin:0}
.hero-dl-card-btns{display:flex;gap:6px;margin-top:4px}
.hero-dl-card-btn{display:inline-flex;align-items:center;justify-content:center;padding:5px 14px;border-radius:5px;font-size:11px;font-weight:600;font-family:var(--font-mono);text-decoration:none;background:var(--accent);color:#fff;border:none;cursor:pointer;transition:all 0.15s;white-space:nowrap}
.hero-dl-card-btn:hover{background:#059669;box-shadow:0 2px 6px rgba(16,185,129,0.25)}
.hero-dl-card-btn--alt{background:transparent;color:var(--text-primary);border:1px solid rgba(0,0,0,0.12)}
.hero-dl-card-btn--alt:hover{background:rgba(0,0,0,0.04);box-shadow:none;color:var(--text-primary)}
.dark-mode .hero-download-btn{background:linear-gradient(180deg,rgba(40,44,55,0.85) 0%,rgba(30,32,40,0.75) 100%);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,0.2),0 4px 24px rgba(160,165,180,0.2),0 0 55px rgba(170,175,190,0.1),0 0 100px rgba(180,185,200,0.05)}
.dark-mode .hero-download-btn:hover{background:linear-gradient(180deg,rgba(50,55,68,0.92) 0%,rgba(38,42,52,0.85) 100%);box-shadow:0 1px 2px rgba(0,0,0,0.2),0 6px 32px rgba(155,160,180,0.3),0 0 75px rgba(165,170,190,0.18),0 0 130px rgba(175,180,200,0.08)}
.dark-mode .hero-download-dropdown{background:#1c1e24;border-color:rgba(255,255,255,0.08)}
.dark-mode .hero-dl-card:hover{background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.06)}
.dark-mode .hero-dl-card-btn--alt{color:var(--text-primary);border-color:rgba(255,255,255,0.12)}
.dark-mode .hero-dl-card-btn--alt:hover{background:rgba(255,255,255,0.04)}

/* ═══ SECTION HEADERS ═══ */
.section-header{text-align:center;margin-bottom:36px;width:100%}
.section-title{font-size:var(--sec-title-fs);font-weight:500;letter-spacing:-0.03em;color:var(--text-primary);text-align:center;margin-bottom:14px;width:100%;line-height:1.2}
.section-subtitle-small{font-size:clamp(13px,1.1vw,16px);color:var(--text-secondary);max-width:650px;margin:0 auto;line-height:1.6;font-weight:400}

/* ═══ DEMO (macOS Window) ═══ */
.demo-section{width:100%;position:relative;z-index:1}



.presets-bar{display:flex;align-items:center;gap:12px;padding:10px 18px;background:rgba(248,250,252,0.3);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);overflow:hidden}
.dark-mode .presets-bar{background:rgba(30,34,42,0.3);border-bottom-color:rgba(255,255,255,0.03)}
.presets-label{font-size:10px;font-family:var(--font-mono);color:var(--text-muted);white-space:nowrap;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0;z-index:1;padding-right:10px}
.preset-scroll-track{flex:1;overflow:hidden;mask-image:linear-gradient(to right,transparent 0%,black 8px,black calc(100% - 8px),transparent 100%)}
.preset-scroll-inner{display:flex;gap:6px;width:max-content;animation:preset-scroll 40s linear infinite}
.preset-scroll-track:hover .preset-scroll-inner{animation-play-state:paused}
@keyframes preset-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.preset-btn{border:1px solid transparent;background:transparent;color:var(--text-secondary);font-size:11px;font-weight:500;padding:4px 10px;border-radius:6px;cursor:pointer;transition:all 0.2s cubic-bezier(0.16,1,0.3,1);white-space:nowrap;flex-shrink:0}
.preset-btn:hover{background:rgba(0,0,0,0.05);color:var(--text-primary)}
.dark-mode .preset-btn:hover{background:rgba(255,255,255,0.06)}
.preset-btn.active{background:rgba(0,0,0,0.07);color:var(--text-primary);font-weight:600}
.dark-mode .preset-btn.active{background:rgba(255,255,255,0.1)}

.code-mockup-grid{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;background:rgba(255,255,255,0.2);min-height:300px}
.dark-mode .code-mockup-grid{background:rgba(30,34,42,0.2)}
.mockup-pane{display:flex;flex-direction:column;padding:16px;min-width:0;box-sizing:border-box}
.mockup-pane.output-pane{background:rgba(245,245,247,0.3);border-left:1px solid rgba(0,0,0,0.05)}
.dark-mode .mockup-pane.output-pane{background:rgba(35,37,46,0.3);border-left-color:rgba(255,255,255,0.04)}
.pane-title{display:flex;align-items:center;gap:8px;font-size:10.5px;font-weight:600;font-family:var(--font-mono);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;height:20px}
.extracted-format-badge{color:var(--text-secondary);background:rgba(0,0,0,0.05);padding:1px 7px;border-radius:4px;font-weight:600;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.04em}
.status-dot{width:6px;height:6px;background:#ff5f57;border-radius:50%}
.status-dot.green{background:#28c840}

.playground-input-wrapper{position:relative;flex-grow:1;display:flex;min-height:0;background:rgba(255,255,255,0.5);border:1px solid rgba(0,0,0,0.06);border-radius:8px;overflow:hidden;transition:border-color 0.2s}
.playground-input-wrapper:focus-within{border-color:var(--accent)}
.playground-highlight-bg{position:absolute;top:0;left:0;right:0;bottom:0;margin:0;padding:12px;font-family:var(--font-mono);font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-all;overflow:auto;pointer-events:none;background:transparent;border:none;box-sizing:border-box}
.playground-textarea{position:relative;width:100%;flex-grow:1;background:transparent;border:none;color:transparent;caret-color:var(--text-primary);font-family:var(--font-mono);font-size:12.5px;line-height:1.5;padding:12px;border-radius:0;resize:none;outline:none;box-sizing:border-box;z-index:1}
.playground-textarea::placeholder{color:var(--text-muted);opacity:1}
.code-container{position:relative;flex-grow:1;background:rgba(255,255,255,0.5);border:1px solid rgba(0,0,0,0.06);border-radius:8px;padding:12px;overflow:auto;min-height:200px;display:flex;flex-direction:column}
.parsing-overlay{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.5);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-size:12px;color:var(--accent);font-weight:600;z-index:10}
.scanner-line{width:80%;height:2px;background:linear-gradient(90deg,transparent,var(--accent),transparent);animation:scan 1s infinite alternate}
@keyframes scan{from{transform:translateY(-20px)}to{transform:translateY(20px)}}
.pane-code{font-family:var(--font-mono);font-size:12.5px;line-height:1.55;margin:0;white-space:pre-wrap;word-break:break-all}
.error-code-style{color:#ff3b30;font-style:italic;font-size:11.5px}
.empty-code-style{color:var(--text-muted)}

.flow-arrow-wrap{display:flex;align-items:center;justify-content:center;padding:0 12px;background:rgba(248,248,250,0.3)}
.arrow-circle{width:34px;height:34px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:var(--glass-shadow-sm);transition:transform 0.3s ease}
.arrow-circle.is-loading{border-color:var(--accent)}
.arrow-svg{width:14px;height:14px;color:var(--text-secondary)}
.arrow-svg.spinner{animation:spin 1s infinite linear;color:var(--accent)}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* ═══ FORMAT CARDS ═══ */
.formats-section{width:100%}
.formats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;width:100%}
.format-card{background:rgba(255,255,255,0.6);border:1px solid rgba(0,0,0,0.06);border-radius:8px;padding:20px;box-sizing:border-box;display:flex;flex-direction:column;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);box-shadow:var(--glass-shadow-sm);border-left:3px solid transparent}
.dark-mode .format-card{background:rgba(22,24,30,0.7);border-color:rgba(255,255,255,0.06)}
.format-card:hover{transform:translateY(-2px);border-color:rgba(0,0,0,0.1);border-left-color:var(--accent);box-shadow:var(--glass-shadow-md)}
.dark-mode .format-card:hover{background:rgba(30,33,44,0.8);border-color:rgba(255,255,255,0.1);border-left-color:var(--accent)}
.format-card:active{transform:scale(0.99)}
.format-card-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.format-icon{width:24px;height:24px;padding:4px;border-radius:4px;background:var(--accent-dim);color:var(--accent)}
.format-card h4{font-size:14px;font-weight:700;color:var(--text-primary);margin:0;letter-spacing:-0.01em}
.format-card p{font-size:var(--text-small);line-height:1.55;color:var(--text-secondary);margin:0 0 16px;flex-grow:1}
.try-card-btn{align-self:flex-start;background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;font-family:var(--font-mono);display:flex;align-items:center;gap:4px;cursor:pointer;padding:0;transition:gap 0.2s;letter-spacing:0.02em}
.try-card-btn:hover{gap:8px}
.try-icon{width:11px;height:11px}

/* Continuation hint */
.formats-more{display:flex;align-items:center;justify-content:center;gap:6px;padding-top:20px;color:var(--text-muted);font-family:var(--font-mono);font-size:12px}
.formats-more-dot{width:5px;height:5px;border-radius:50%;background:var(--text-muted);opacity:0.4}
.formats-more-dot:nth-child(2){opacity:0.25}
.formats-more-dot:nth-child(3){opacity:0.12}
.formats-more-text{opacity:0.4;font-style:italic}

/* ═══ DIFF PREVIEW ═══ */
.diff-preview-section{width:100%}
.diff-preview-card{display:grid;grid-template-columns:1fr 2.5fr;gap:32px;align-items:center;-webkit-backdrop-filter:var(--glass-blur);}
.dark-mode .diff-preview-card{background:var(--glass-bg-dark);border-color:var(--glass-border-dark)}
.diff-preview-info h3{font-size:clamp(18px,2vw,28px);font-weight:600;line-height:1.2;color:var(--text-primary);margin:12px 0 8px;letter-spacing:-0.02em}
.diff-preview-info p{font-size:clamp(11px,0.85vw,14px);line-height:1.55;color:var(--text-secondary);margin:0 0 16px}
.diff-preview-features{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.diff-preview-features li{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary)}
.dp-check{width:14px;height:14px;color:#28c840;flex-shrink:0}
.diff-preview-image{border-radius:10px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08),0 2px 6px rgba(0,0,0,0.04)}
.diff-preview-image img{width:100%;height:auto;display:block}

/* ═══ MULTI-VIEW ═══ */
.multiview-section{width:100%}

/* View Switcher Card */
.mv-viewer-card{width:100%;max-width:860px;margin:0 auto;background:rgba(255,255,255,0.55);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,0.5);border-radius:12px;overflow:hidden;box-shadow:var(--glass-shadow-lg)}
.dark-mode .mv-viewer-card{background:rgba(44,46,58,0.6);border-color:rgba(255,255,255,0.06);box-shadow:var(--glass-shadow-lg)}

/* Segmented Control */
.mv-segmented-bar{display:flex;justify-content:center;padding:16px 20px 0}
.mv-segmented{position:relative;display:inline-flex;background:var(--segmented-bg, rgba(0,0,0,0.04));border-radius:8px;padding:3px;gap:2px}
.dark-mode .mv-segmented{background:rgba(255,255,255,0.04)}
.mv-seg-btn{position:relative;z-index:1;display:flex;align-items:center;gap:6px;padding:7px 16px;border:none;background:transparent;color:var(--text-secondary);font-size:12.5px;font-weight:500;font-family:inherit;border-radius:6px;cursor:pointer;transition:color 0.2s;white-space:nowrap}
.mv-seg-btn:hover{color:var(--text-primary)}
.mv-seg-btn.active{color:var(--text-primary);font-weight:600}
.mv-seg-icon{width:14px;height:14px}
.mv-seg-indicator{position:absolute;top:3px;height:calc(100% - 6px);border-radius:6px;background:rgba(255,255,255,0.9);box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:left 0.25s cubic-bezier(0.16,1,0.3,1),width 0.25s cubic-bezier(0.16,1,0.3,1);z-index:0}
.dark-mode .mv-seg-indicator{background:rgba(80,80,90,0.8);box-shadow:0 1px 3px rgba(0,0,0,0.2)}
/* Indicator positions — approximate, based on 4 equal-width segments */
.mv-seg-pos--code{left:3px;width:calc(25% - 3.5px)}
.mv-seg-pos--tree{left:calc(25% + 1px);width:calc(25% - 3.5px)}
.mv-seg-pos--graph{left:calc(50% + 1px);width:calc(25% - 3.5px)}
.mv-seg-pos--table{left:calc(75% + 1px);width:calc(25% - 3.5px)}

/* Screenshot */
.mv-screenshot-area{position:relative;margin:16px 20px 0;border-radius:8px;overflow:hidden;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.04);min-height:300px}
.dark-mode .mv-screenshot-area{background:rgba(0,0,0,0.15);border-color:rgba(255,255,255,0.03)}
.mv-screenshot{width:100%;height:auto;display:block}

/* Transition */
.mv-fade-enter-active,.mv-fade-leave-active{transition:opacity 0.2s ease}
.mv-fade-enter-from,.mv-fade-leave-to{opacity:0}

/* Description */
.mv-view-desc{text-align:center;font-size:13px;color:var(--text-secondary);padding:14px 20px 20px;margin:0;line-height:1.5}

/* ═══ MULTI-TAB ═══ */
.tabs-section{width:100%}
.tabs-feature-row{display:grid;grid-template-columns:1.2fr 1fr;gap:40px;align-items:center}
.tabs-mockup-visual{background:var(--glass-bg);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border);border-radius:12px;overflow:hidden;box-shadow:var(--glass-shadow-md)}
.dark-mode .tabs-mockup-visual{background:var(--glass-bg-dark);border-color:var(--glass-border-dark)}
.tabs-mockup-bar{display:flex;align-items:center;gap:2px;padding:8px 10px 0;background:rgba(248,250,252,0.35);border-bottom:1px solid rgba(0,0,0,0.04)}
.tmb-tab{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-family:var(--font-mono);padding:5px 10px;border-radius:6px 6px 0 0;background:rgba(0,0,0,0.03);color:var(--text-muted)}
.tmb-tab.active{background:rgba(255,255,255,0.8);color:var(--text-primary);font-weight:600;border:1px solid rgba(0,0,0,0.05);border-bottom-color:transparent}
.tmb-close{width:9px;height:9px;opacity:0.35}
.tmb-add{font-size:13px;color:var(--text-muted);padding:4px 7px}
.tabs-mockup-code{padding:14px}
.tabs-mockup-code .pane-code{font-size:11px}
.tabs-features{display:flex;flex-direction:column;gap:18px}
.tabs-feat{display:flex;align-items:flex-start;gap:14px}
.tabs-feat-icon{width:18px;height:18px;color:var(--accent);flex-shrink:0;margin-top:2px}
.tabs-feat strong{display:block;font-size:13.5px;color:var(--text-primary);margin-bottom:2px}
.tabs-feat p{font-size:12px;color:var(--text-secondary);margin:0}

/* ═══ BROWSER EXTENSION MOCKUP ═══ */
.browser-mockup-wrapper{background:rgba(255,255,255,0.6);border:1px solid rgba(0,0,0,0.06);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;height:290px;box-shadow:var(--glass-shadow-md)}
.dark-mode .browser-mockup-wrapper{background:rgba(22,24,30,0.7);border-color:rgba(255,255,255,0.06)}
.browser-header{height:30px;background:rgba(0,0,0,0.025);display:flex;align-items:center;padding:0 10px;gap:8px;border-bottom:1px solid rgba(0,0,0,0.06)}
.dark-mode .browser-header{background:rgba(0,0,0,0.2);border-bottom-color:rgba(255,255,255,0.05)}
.browser-dots{display:flex;gap:5px;flex-shrink:0}
.browser-dots span{width:7px;height:7px;border-radius:50%}
.dot-red{background:#ff5f57}.dot-yellow{background:#febc2e}.dot-green{background:#28c840}
.browser-address{flex:1;height:18px;background:rgba(255,255,255,0.5);border-radius:3px;font-size:9px;color:var(--text-muted);display:flex;align-items:center;padding:0 6px;font-family:var(--font-mono)}
.dark-mode .browser-address{background:rgba(0,0,0,0.25);color:var(--text-muted)}
.browser-body{flex:1;display:grid;grid-template-columns:1.2fr 1fr;overflow:hidden}
.mock-webpage{background:rgba(255,255,255,0.6);padding:12px;overflow:hidden;border-right:1px solid rgba(0,0,0,0.04);position:relative}
.dark-mode .mock-webpage{background:rgba(22,24,30,0.5);border-right-color:rgba(255,255,255,0.05)}
.page-title-bar{font-size:9px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.04em;font-family:var(--font-mono)}
.log-line{font-family:var(--font-mono);font-size:9px;color:var(--text-muted);line-height:1.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log-line.text-highlight-target{color:var(--text-primary);font-weight:500}
.log-line.is-selected{background:var(--accent-dim);border-radius:2px;padding:1px 4px;margin:0 -4px}

.sim-extension-popup{background:rgba(255,255,255,0.7);border-left:1px solid rgba(0,0,0,0.06);display:flex;flex-direction:column;opacity:0.6;transition:opacity 0.4s}
.dark-mode .sim-extension-popup{background:rgba(22,24,30,0.6);border-left-color:rgba(255,255,255,0.05)}
.sim-extension-popup.is-active{opacity:1}
.popup-header{display:flex;align-items:center;gap:6px;padding:7px 10px;background:rgba(0,0,0,0.025);border-bottom:1px solid rgba(0,0,0,0.04);font-size:10px;font-weight:600;color:var(--text-secondary);font-family:var(--font-mono)}
.dark-mode .popup-header{background:rgba(0,0,0,0.2)}
.popup-logo{width:12px;height:12px}
.popup-badge{font-size:8px;background:var(--accent-dim);padding:1px 5px;border-radius:3px;color:var(--accent);margin-left:auto;font-family:var(--font-mono)}
.popup-content{flex:1;display:flex;align-items:center;justify-content:center;padding:10px;overflow:hidden}
.popup-result{width:100%}
.popup-success-banner{display:flex;align-items:center;gap:4px;font-size:9px;font-weight:600;color:var(--accent);margin-bottom:8px;font-family:var(--font-mono)}
.banner-check{width:10px;height:10px}
.popup-json-code{font-family:var(--font-mono);font-size:9px;line-height:1.5;color:var(--text-primary);background:rgba(0,0,0,0.015);padding:6px 8px;border-radius:4px;overflow:hidden;white-space:pre-wrap;margin:0}
.dark-mode .popup-json-code{background:rgba(0,0,0,0.2)}

.spinner{animation:spin 1s linear infinite}

/* ═══ SHOWCASE ═══ */
.interactive-showcase-section{width:100%;border-top:none;padding-top:60px}
.showcase-content{display:grid;grid-template-columns:1.1fr 1.3fr;gap:48px;align-items:center}
.interactive-showcase-section.reverse .showcase-content{grid-template-columns:1.3fr 1.1fr}
.showcase-info{display:flex;flex-direction:column;align-items:flex-start;gap:16px}
.showcase-badge{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;font-family:var(--font-mono);color:var(--text-secondary);background:rgba(0,0,0,0.04);padding:5px 12px;border-radius:99px;border:1px solid rgba(0,0,0,0.06);text-transform:uppercase;letter-spacing:0.03em}
.dark-mode .showcase-badge{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.06)}
.showcase-info h3{font-size:var(--showcase-h3-fs);font-weight:600;line-height:1.25;color:var(--text-primary);margin:0}
.showcase-info p{font-size:var(--showcase-p-fs);line-height:1.6;color:var(--text-secondary);margin:0}
.mini-icon{width:12px;height:12px}

/* ═══ AUTO PASTE ═══ */
.auto-paste-section{width:100%}
.ap-flow{display:flex;flex-direction:column;align-items:center;gap:24px}
.ap-flow-row{display:flex;align-items:center;gap:0;width:100%;justify-content:center}
.ap-card{position:relative;width:220px;text-align:center;padding:24px 16px;background:var(--glass-bg);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border);border-radius:14px;transition:all 0.4s cubic-bezier(0.16,1,0.3,1);box-shadow:var(--glass-shadow-sm)}
.dark-mode .ap-card{background:var(--glass-bg-dark);border-color:var(--glass-border-dark)}
.ap-card:hover{transform:translateY(-2px);box-shadow:var(--glass-shadow-md)}
.ap-card.is-active{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,113,227,0.06),var(--glass-shadow-md)}
.ap-card.is-done{border-color:rgba(40,200,64,0.25)}
.ap-card-watermark{position:absolute;top:8px;left:12px;font-size:40px;font-weight:600;color:rgba(0,0,0,0.03);font-family:var(--font-sans);line-height:1;pointer-events:none}
.dark-mode .ap-card-watermark{color:rgba(255,255,255,0.02)}
.ap-card-icon-ring{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;background:rgba(0,0,0,0.04);border:2px solid rgba(0,0,0,0.06);transition:all 0.4s cubic-bezier(0.16,1,0.3,1)}
.ap-card-icon-ring.ring-active{background:rgba(0,113,227,0.06);border-color:var(--accent);box-shadow:0 0 0 6px rgba(0,113,227,0.04)}
.ap-card-icon-ring.ring-done{background:rgba(40,200,64,0.06);border-color:#28c840}
.ap-card-icon{width:18px;height:18px;color:var(--text-muted)}
.ring-active .ap-card-icon{color:var(--accent)}
.ap-card-icon--check{color:#28c840}
.ap-card-title{font-size:14px;font-weight:700;color:var(--text-primary);margin:0 0 4px}
.ap-card-desc{font-size:11.5px;color:var(--text-secondary);margin:0;line-height:1.5}
.ap-card-glow{position:absolute;inset:0;border-radius:14px;background:radial-gradient(circle at 50% 0%,rgba(0,113,227,0.06) 0%,transparent 70%);pointer-events:none;animation:apGlowPulse 2s ease-in-out infinite}
.ap-card-glow--success{background:radial-gradient(circle at 50% 0%,rgba(40,200,64,0.06) 0%,transparent 70%)}
@keyframes apGlowPulse{0%,100%{opacity:0.6}50%{opacity:1}}
.ap-connector{width:80px;display:flex;align-items:center;justify-content:center;position:relative;color:rgba(0,0,0,0.12)}
.dark-mode .ap-connector{color:rgba(255,255,255,0.08)}
.ap-connector.is-flowing{color:var(--accent)}
.ap-connector-svg{width:80px;height:24px}
.ap-dash-line{stroke:currentColor}
.ap-dash-arrow{fill:currentColor}
.ap-flow-particles{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.ap-particle{position:absolute;top:50%;left:10%;width:3px;height:3px;border-radius:50%;background:var(--accent);animation:apParticleMove 1.2s linear infinite;opacity:0}
.ap-particle:nth-child(2){animation-delay:0.4s}
.ap-particle:nth-child(3){animation-delay:0.8s}
@keyframes apParticleMove{0%{transform:translateX(0);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateX(70px);opacity:0}}
.ap-spin{animation:apSpinAnim 1s linear infinite}
@keyframes apSpinAnim{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* ═══ FEATURES / DOWNLOAD / FAQ ═══ */
.features-section{width:100%}
.grid-features-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.highlight-card{background:var(--glass-bg);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border);border-radius:14px;padding:28px 24px;box-sizing:border-box;box-shadow:var(--glass-shadow-sm);transition:all 0.3s cubic-bezier(0.16,1,0.3,1)}
.dark-mode .highlight-card{background:var(--glass-bg-dark);border-color:var(--glass-border-dark)}
.highlight-card:hover{transform:translateY(-4px);background:rgba(255,255,255,0.6);box-shadow:var(--glass-shadow-md)}
.card-icon-box{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;background:var(--accent-dim)}
.dark-mode .card-icon-box{background:rgba(16,185,129,0.1)}
.highlight-icon{width:18px;height:18px;color:var(--accent)}
.highlight-card h3{font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px;letter-spacing:-0.02em}
.highlight-card p{font-size:var(--text-body);line-height:1.6;color:var(--text-secondary);margin:0}


.faq-section{width:100%}
.faq-list{width:100%;background:var(--glass-bg);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border);border-radius:14px;overflow:hidden;box-shadow:var(--glass-shadow-sm)}
.dark-mode .faq-list{background:var(--glass-bg-dark);border-color:var(--glass-border-dark)}
.faq-item{border-bottom:1px solid rgba(0,0,0,0.04)}
.dark-mode .faq-item{border-bottom-color:rgba(255,255,255,0.03)}
.faq-item:last-child{border-bottom:none}
.faq-trigger{display:flex;width:100%;align-items:center;gap:12px;padding:18px 22px;border:none;background:none;font-family:inherit;font-size:14px;font-weight:600;color:var(--text-primary);cursor:pointer;text-align:left;transition:background 0.15s}
.faq-trigger:hover{background:rgba(0,0,0,0.02)}
.faq-icon-left{width:16px;height:16px;color:var(--accent);flex-shrink:0}
.faq-chevron{width:14px;height:14px;color:var(--text-muted);margin-left:auto;transition:transform 0.2s}
.faq-chevron--open{transform:rotate(180deg)}
.faq-content{max-height:0;overflow:hidden;transition:max-height 0.3s ease}
.faq-content--open{max-height:200px}
.faq-answer{font-size:13px;line-height:1.6;color:var(--text-secondary);padding:0 22px 18px;margin:0}

/* ═══ FOOTER ═══ */
.home-footer{width:100%;border-top:1px solid rgba(0,0,0,0.05);padding:28px 0;display:flex;align-items:center;justify-content:center}
.dark-mode .home-footer{border-top-color:rgba(255,255,255,0.04)}
.home-footer-inner{display:flex;align-items:center;justify-content:space-between;width:100%;max-width:1160px;padding:0 24px}
.footer-brand{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted)}
.footer-links{display:flex;gap:20px}
.footer-link{font-size:12px;color:var(--text-muted);text-decoration:none;transition:color 0.15s}
.footer-link:hover{color:var(--text-primary)}

/* ═══ UTILITY / LEGACY ────────────────────────────────── */
.text-green{color:var(--accent)}
.ap-card--final{border-color:rgba(40,200,64,0.2)}
.sim-tab-icon{width:14px;height:14px;color:var(--text-muted)}
.sim-tab-doc-icon{width:12px;height:12px;color:var(--text-muted)}
.sim-tab-close-icon{width:10px;height:10px;color:var(--text-muted);cursor:pointer;opacity:0.5;flex-shrink:0}
.sim-tab-close-icon:hover{opacity:1}
.sim-compare-grid{display:grid;grid-template-columns:1fr 1fr}
.border-left{border-left:1px solid rgba(0,0,0,0.06)}
.sim-workspace-info-bar{display:flex;justify-content:space-between;padding:6px 12px;font-size:9.5px;color:var(--text-muted);font-family:var(--font-mono);background:rgba(0,0,0,0.015)}
.sim-workspace-path{color:var(--text-secondary)}.sim-workspace-size{color:var(--text-muted)}
.sim-add-tab-btn{background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px 6px;font-size:14px;line-height:1}
.dark-mode .border-left{border-left-color:rgba(255,255,255,0.05)}
.dark-mode .sim-workspace-info-bar{background:rgba(255,255,255,0.015)}

/* ═══ ANIMATIONS ═══ */
.animate-fade-in{animation:fadeIn 0.6s ease-out both}
.animate-fade-in-quick{animation:fadeInQuick 0.2s ease-out forwards}
@keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeInQuick{from{opacity:0;transform:scale(0.98)}to{opacity:1;transform:scale(1)}}

/* ═══ RESPONSIVE ═══ */
@media(max-width:768px){
  .home-page{--section-gap:60px} .home-content-wrap{margin-bottom:60px} .home-content-wrap > section{margin-bottom:var(--section-gap, 60px);padding:32px clamp(16px,4vw,32px)}
  .hero-section{padding:0 0 48px}
  .hero-badge{margin-top:32px}
  .grid-features-cards{grid-template-columns:repeat(2,1fr)}
  .showcase-content,.interactive-showcase-section.reverse .showcase-content{grid-template-columns:1fr;gap:32px}
  .mv-cards{grid-template-columns:repeat(2,1fr)}
  .tabs-feature-row{grid-template-columns:1fr}
}
@media(max-width:990px){.home-nav-links{display:none}}
@media(max-width:860px){
  .code-mockup-grid{grid-template-columns:1fr}
  .flow-arrow-wrap{padding:8px 0}
  .diff-preview-card{grid-template-columns:1fr;gap:28px;padding:28px}
}

</style>
