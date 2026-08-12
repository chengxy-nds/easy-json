<script setup>
import { ref, computed } from 'vue'
import { Play, CheckCircle, XCircle, ChevronDown, ChevronRight, RotateCcw, Clipboard, ClipboardCheck } from 'lucide-vue-next'
import { testFixtures, testCategories } from '../utils/testFixtures.js'
import { extractJsonFromText } from '../utils/jsonExtractor.js'
import { safeParse } from '../utils/jsonBigInt.js'

const emit = defineEmits(['go-back'])

const activeCategory = ref('all')
const expandedId = ref(null)
const isRunningAll = ref(false)
const copiedId = ref(null)  // 记录刚复制的是哪个字段

const results = ref({})

async function copyText(text, id) {
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = id
    setTimeout(() => { copiedId.value = null }, 1500)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copiedId.value = id
    setTimeout(() => { copiedId.value = null }, 1500)
  }
}

const filteredTests = computed(() => {
  if (activeCategory.value === 'all') return testFixtures
  return testFixtures.filter(t => t.category === activeCategory.value)
})

const stats = computed(() => {
  const vals = Object.values(results.value)
  return {
    total: testFixtures.length,
    ran: vals.length,
    pass: vals.filter(r => r.pass).length,
    fail: vals.filter(r => !r.pass).length,
  }
})

function runSingle(tc) {
  try {
    const { json, format } = extractJsonFromText(tc.input)
    const parsed = safeParse(json)
    const expectedFormats = tc.expectFormat.split('|')
    const formatOk = expectedFormats.some(ef => format.includes(ef) || ef.includes(format))
    const keysOk = !tc.expectKeys || tc.expectKeys.every(k => k in parsed)
    results.value[tc.id] = { pass: formatOk && keysOk, format, json, error: null, formatOk, keysOk }
  } catch (e) {
    results.value[tc.id] = { pass: false, format: null, json: null, error: e.message, formatOk: false, keysOk: false }
  }
}

async function runAll() {
  isRunningAll.value = true
  results.value = {}
  for (let i = 0; i < testFixtures.length; i++) {
    runSingle(testFixtures[i])
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0))
  }
  isRunningAll.value = false
}

function resetAll() {
  results.value = {}
  expandedId.value = null
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function getStatus(id) {
  if (!results.value[id]) return 'pending'
  return results.value[id].pass ? 'pass' : 'fail'
}
</script>

<template>
  <div class="test-page">
    <header class="test-header">
      <div class="test-header-left">
        <button class="test-back-btn" @click="emit('go-back')">← 返回</button>
        <h1 class="test-title">JSON 提取测试</h1>
        <span class="test-count">{{ testFixtures.length }} 个用例</span>
      </div>
      <div class="test-header-right">
        <div class="test-stats" v-if="stats.ran > 0">
          <span class="stat-pass">✓ {{ stats.pass }}</span>
          <span class="stat-fail" v-if="stats.fail > 0">✗ {{ stats.fail }}</span>
          <span class="stat-total">/ {{ stats.total }}</span>
        </div>
        <button class="test-action-btn reset-btn" @click="resetAll" :disabled="isRunningAll">
          <RotateCcw :size="14" /> 重置
        </button>
        <button class="test-action-btn run-all-btn" @click="runAll" :disabled="isRunningAll">
          <Play :size="14" /> {{ isRunningAll ? '运行中...' : '全部运行' }}
        </button>
      </div>
    </header>

    <div class="test-filters">
      <button
        class="filter-chip"
        :class="{ active: activeCategory === 'all' }"
        @click="activeCategory = 'all'"
      >
        全部 ({{ testFixtures.length }})
      </button>
      <button
        v-for="cat in testCategories"
        :key="cat"
        class="filter-chip"
        :class="{ active: activeCategory === cat }"
        @click="activeCategory = cat"
      >
        {{ cat }} ({{ testFixtures.filter(t => t.category === cat).length }})
      </button>
    </div>

    <div class="test-list">
      <div
        v-for="tc in filteredTests"
        :key="tc.id"
        class="test-card"
        :class="getStatus(tc.id)"
      >
        <div class="test-card-row" @click="toggleExpand(tc.id)">
          <div class="test-card-left">
            <component
              :is="getStatus(tc.id) === 'pass' ? CheckCircle : getStatus(tc.id) === 'fail' ? XCircle : ChevronRight"
              :size="16"
              class="test-status-icon"
              :class="getStatus(tc.id)"
            />
            <span class="test-category-badge">{{ tc.category }}</span>
            <span class="test-label">{{ tc.label }}</span>
            <span class="test-id">{{ tc.id }}</span>
          </div>
          <div class="test-card-right">
            <span v-if="results[tc.id]" class="test-format-tag">{{ results[tc.id].format || 'ERROR' }}</span>
            <button class="test-run-btn" @click.stop="runSingle(tc)">
              <Play :size="12" /> 运行
            </button>
            <ChevronDown v-if="expandedId === tc.id" :size="14" class="expand-icon" />
            <ChevronRight v-else :size="14" class="expand-icon" />
          </div>
        </div>

        <div v-if="expandedId === tc.id" class="test-card-detail">
          <div class="detail-section">
            <div class="detail-label">
              输入
              <button class="detail-copy-btn" @click.stop="copyText(tc.input, tc.id + '-input')" :title="copiedId === tc.id + '-input' ? '已复制' : '复制输入'">
                <ClipboardCheck v-if="copiedId === tc.id + '-input'" :size="12" class="copy-icon-done" />
                <Clipboard v-else :size="12" />
              </button>
            </div>
            <pre class="detail-code input-code">{{ tc.input }}</pre>
          </div>
          <div class="detail-row">
            <div class="detail-section half">
              <div class="detail-label">期望格式</div>
              <code class="detail-tag">{{ tc.expectFormat }}</code>
            </div>
            <div class="detail-section half" v-if="tc.expectKeys">
              <div class="detail-label">期望顶层 Key</div>
              <code class="detail-tag" v-for="k in tc.expectKeys" :key="k">{{ k }}</code>
            </div>
          </div>
          <template v-if="results[tc.id]">
            <div class="detail-section" v-if="results[tc.id].error">
              <div class="detail-label error-label">错误</div>
              <pre class="detail-code error-code">{{ results[tc.id].error }}</pre>
            </div>
            <div class="detail-section" v-else>
              <div class="detail-label">
                实际格式:
                <code class="detail-tag" :class="{ 'tag-pass': results[tc.id].formatOk, 'tag-fail': !results[tc.id].formatOk }">
                  {{ results[tc.id].format }}
                </code>
                <button class="detail-copy-btn" @click.stop="copyText(results[tc.id].json, tc.id + '-output')" :title="copiedId === tc.id + '-output' ? '已复制' : '复制输出'">
                  <ClipboardCheck v-if="copiedId === tc.id + '-output'" :size="12" class="copy-icon-done" />
                  <Clipboard v-else :size="12" />
                </button>
              </div>
              <pre class="detail-code output-code">{{ results[tc.id].json }}</pre>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-page {
  min-height: 100vh;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 0;
}

.test-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
}
.test-header-left { display: flex; align-items: center; gap: 12px; }
.test-header-right { display: flex; align-items: center; gap: 10px; }

.test-back-btn {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.test-back-btn:hover { color: var(--text-primary); border-color: var(--text-secondary); }

.test-title { font-size: 18px; font-weight: 700; margin: 0; letter-spacing: -0.02em; color: var(--text-primary); }
.test-count { font-size: 12px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; }

.test-stats { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
.stat-pass { color: #3fb950; }
.stat-fail { color: #f85149; }
.stat-total { color: var(--text-secondary); }

.test-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s;
}
.test-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.run-all-btn { background: #238636; color: #fff; border-color: #2ea043; }
.run-all-btn:hover:not(:disabled) { background: #2ea043; }

.reset-btn { background: transparent; color: var(--text-secondary); }
.reset-btn:hover:not(:disabled) { color: var(--text-primary); }

.test-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-color);
}

.filter-chip {
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.filter-chip:hover { border-color: var(--text-secondary); color: var(--text-primary); }
.filter-chip.active { background: #388bfd26; border-color: #388bfd; color: #58a6ff; }

.test-list { padding: 12px 24px; display: flex; flex-direction: column; gap: 4px; }

.test-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.test-card.pass { border-color: #23863640; }
.test-card.fail { border-color: #f8514940; }

.test-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.1s;
}
.test-card-row:hover { background: var(--bg-hover); }

.test-card-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.test-card-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.test-status-icon { flex-shrink: 0; color: var(--text-muted); }
.test-status-icon.pass { color: #3fb950; }
.test-status-icon.fail { color: #f85149; }

.test-category-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  background: #388bfd15;
  color: #58a6ff;
  white-space: nowrap;
}

.test-label { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }

.test-id {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}

.test-format-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  background: #23863620;
  color: #3fb950;
}
.fail .test-format-tag { background: #f8514920; color: #f85149; }

.test-run-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.test-run-btn:hover { background: #238636; color: #fff; border-color: #2ea043; }

.expand-icon { color: var(--text-muted); flex-shrink: 0; }

.test-card-detail {
  padding: 12px 14px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-input);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-section { display: flex; flex-direction: column; gap: 4px; }
.detail-row { display: flex; gap: 16px; }
.detail-section.half { flex: 1; }

.detail-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.error-label { color: #f85149; }

.detail-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
  margin-left: 2px;
  transition: color 0.15s, background 0.15s;
}
.detail-copy-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.copy-icon-done { color: #3fb950; }

.detail-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  background: #388bfd15;
  color: #58a6ff;
  margin-right: 4px;
}
.detail-tag.tag-pass { background: #23863620; color: #3fb950; }
.detail-tag.tag-fail { background: #f8514920; color: #f85149; }

.detail-code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow-y: auto;
}

.input-code { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); }
.output-code { background: var(--diff-added-bg); color: var(--success-text, #3fb950); border: 1px solid var(--diff-added-border); }
.error-code { background: var(--error-bg); color: var(--error-text, #f85149); border: 1px solid var(--diff-removed-border); }
</style>
