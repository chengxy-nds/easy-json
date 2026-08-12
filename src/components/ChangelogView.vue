<script setup>
import { ref } from 'vue'
import { ArrowLeft, History, Sparkles, Bug, Zap, Plus, Wrench, ChevronDown } from 'lucide-vue-next'

const emit = defineEmits(['go-back'])

const changelog = [
  {
    version: 'v1.0.3',
    date: '2026-08-10',
    sections: [
      {
        icon: Bug,
        title: '问题修复',
        iconClass: 'cl-section-bug',
        items: [
          '修复大整数（超过 16 位数字）在 JSON 格式化时丢失精度的问题，如 2086639615434764289 不再被错误转换为 2086639615434764300',
          '修复连续大整数数组中仅首个数字被保护的边界情况',
          '修复 safeStringify 对负大整数去引号时遗漏负号前缀的匹配问题'
        ]
      },
      {
        icon: Sparkles,
        title: '功能改进',
        iconClass: 'cl-section-sparkle',
        items: [
          '新增更新记录页面，方便用户了解每次更新的内容',
          '优化 Vercel 异常流量处理逻辑'
        ]
      }
    ]
  },
  {
    version: 'v1.0.2',
    date: '2026-07-28',
    sections: [
      {
        icon: Sparkles,
        title: '功能新增',
        iconClass: 'cl-section-sparkle',
        items: [
          '新增 VS Code 插件支持：在编辑器中右键选中文本即可提取并格式化 JSON',
          '新增 uTools 插件字符自动匹配功能，支持超长 JSON 文本的无损导入'
        ]
      },
      {
        icon: Wrench,
        title: '体验优化',
        iconClass: 'cl-section-wrench',
        items: [
          '优化自动粘贴检测逻辑，降低 CPU 占用',
          '改进首页预设案例滚动动画，新增 10+ 格式预设',
          '修复语法高亮在深色主题下个别 token 配色偏移的问题'
        ]
      }
    ]
  },
  {
    version: 'v1.0.1',
    date: '2026-07-15',
    sections: [
      {
        icon: Plus,
        title: '平台扩展',
        iconClass: 'cl-section-plus',
        items: [
          '新增 uTools 插件版本，支持快捷键呼出即用即走',
          '新增 Chrome / Edge / Firefox 浏览器扩展，网页选中文本右键一键提取 JSON',
          '新增 Windows NSIS 安装包与 macOS DMG 安装包'
        ]
      },
      {
        icon: Zap,
        title: '性能优化',
        iconClass: 'cl-section-zap',
        items: [
          '优化大型 JSON（>10MB）的格式化性能，减少 60% 主线程阻塞时间',
          '语义 Diff 算法重构：先正规化再对比，忽略 key 排序与缩进差异',
          '多 Tab 状态持久化：关闭后重新打开恢复上一次的工作区布局'
        ]
      }
    ]
  },
  {
    version: 'v1.0.0',
    date: '2026-07-01',
    sections: [
      {
        icon: Sparkles,
        title: '首次发布',
        iconClass: 'cl-section-sparkle',
        items: [
          '智能 JSON 提取：支持 100+ 种常见日志/序列化格式自动识别并转 JSON',
          '四种视图模式：代码视图、树形视图、拓扑图谱、表格视图一键切换',
          '语义级 JSON 对比：字符级差异高亮，仅标记真实数据变更',
          '自动粘贴与格式化：复制内容后切回应用，自动检测剪贴板并完成格式化',
          '100% 离线运行：所有数据在本地处理，零网络请求，安全可靠'
        ]
      }
    ]
  }
]

const expandedVersion = ref(changelog[0].version)

const toggleVersion = (version) => {
  expandedVersion.value = expandedVersion.value === version ? null : version
}
</script>

<template>
  <div class="changelog-page">
    <!-- 顶栏 -->
    <header class="cl-topbar">
      <button class="cl-back-btn" @click="emit('go-back')">
        <ArrowLeft :size="16" />
        <span>返回</span>
      </button>
      <div class="cl-topbar-title">
        <History :size="18" class="cl-topbar-icon" />
        <span>更新记录</span>
      </div>
      <div class="cl-topbar-spacer"></div>
    </header>

    <!-- 主体 -->
    <main class="cl-main">
      <!-- 左侧介绍卡片 -->
      <aside class="cl-sidebar">
        <div class="cl-card">
          <div class="cl-card-icon">
            <History :size="28" />
          </div>
          <h1 class="cl-card-title">更新记录</h1>
          <p class="cl-card-desc">
            记录 <strong>easyJSON</strong> 每个版本的更新内容，包括新功能、问题修复与体验优化。
          </p>
          <div class="cl-card-stats">
            <div class="cl-stat-item">
              <span class="cl-stat-num">{{ changelog.length }}</span>
              <span class="cl-stat-label">个版本</span>
            </div>
            <div class="cl-stat-divider"></div>
            <div class="cl-stat-item">
              <span class="cl-stat-num">2026</span>
              <span class="cl-stat-label">年启程</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧版本列表 -->
      <section class="cl-content">
        <div class="cl-list">
          <div
            v-for="(entry, index) in changelog"
            :key="entry.version"
            class="cl-entry"
            :class="{ 'is-expanded': expandedVersion === entry.version, 'is-latest': index === 0 }"
            @click="toggleVersion(entry.version)"
          >
            <!-- 版本头部 -->
            <div class="cl-entry-header">
              <div class="cl-entry-header-left">
                <div class="cl-version-badge" :class="{ 'is-latest': index === 0 }">
                  {{ entry.version }}
                  <span v-if="index === 0" class="cl-latest-tag">最新</span>
                </div>
                <span class="cl-date">{{ entry.date }}</span>
              </div>
              <ChevronDown
                :size="16"
                class="cl-expand-icon"
                :class="{ 'is-open': expandedVersion === entry.version }"
              />
            </div>

            <!-- 展开内容 -->
            <div v-if="expandedVersion === entry.version" class="cl-entry-body">
              <div
                v-for="(section, si) in entry.sections"
                :key="si"
                class="cl-section"
              >
                <div class="cl-section-title">
                  <component :is="section.icon" :size="14" :class="section.iconClass" />
                  <span>{{ section.title }}</span>
                </div>
                <ul class="cl-section-list">
                  <li v-for="(item, ii) in section.items" :key="ii">
                    <span class="cl-bullet"></span>
                    {{ item }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.changelog-page {
  min-height: 100vh;
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
}

/* ─── 顶栏 ─── */
.cl-topbar {
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 48px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.cl-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 12px;
  border: none;
  background-color: var(--action-btn-bg);
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 500;
  font-family: var(--font-sans);
  border-radius: 6px;
  cursor: pointer;
  height: 28px;
  transition: transform 0.1s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.cl-back-btn:hover {
  background-color: var(--bg-app);
  border-color: var(--border-color-active);
}
.cl-back-btn:active {
  transform: scale(0.96);
}
.cl-topbar-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 auto;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.cl-topbar-icon {
  color: var(--text-secondary);
}
.cl-topbar-spacer {
  width: 68px;
}

/* ─── 主体布局 ─── */
.cl-main {
  display: flex;
  flex: 1;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px;
  gap: 32px;
  align-items: flex-start;
}

/* ─── 左侧卡片 ─── */
.cl-sidebar {
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 32px;
}
.cl-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 28px 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
  transition: all 0.3s ease;
}
.cl-card:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.04);
}
.cl-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #8b5cf6, #a78bfa);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
}
.cl-card-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}
.cl-card-desc {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
  margin: 0 0 24px;
}
.cl-card-desc strong {
  color: var(--text-primary);
}
.cl-card-stats {
  display: flex;
  align-items: center;
  gap: 0;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
.cl-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 2px;
}
.cl-stat-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: -0.02em;
}
.cl-stat-label {
  font-size: 11px;
  color: var(--text-muted);
}
.cl-stat-divider {
  width: 1px;
  height: 32px;
  background: var(--border-color);
  flex-shrink: 0;
}

/* ─── 右侧版本列表 ─── */
.cl-content {
  flex: 1;
  min-width: 0;
}
.cl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ─── 版本条目 ─── */
.cl-entry {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
}
.cl-entry:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.04);
  border-color: rgba(139, 92, 246, 0.2);
}
.cl-entry.is-expanded {
  border-color: rgba(139, 92, 246, 0.3);
  box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.06), 0 6px 24px rgba(0, 0, 0, 0.04);
}
.cl-entry.is-latest {
  border-color: rgba(139, 92, 246, 0.15);
}

/* ─── 版本头部 ─── */
.cl-entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  user-select: none;
}
.cl-entry-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cl-version-badge {
  font-size: 13px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.cl-version-badge.is-latest {
  color: #8b5cf6;
}
.cl-latest-tag {
  font-size: 9px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #8b5cf6;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.cl-date {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}
.cl-expand-icon {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.cl-expand-icon.is-open {
  transform: rotate(180deg);
}

/* ─── 展开内容 ─── */
.cl-entry-body {
  padding: 0 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: clFadeIn 0.25s ease;
}
@keyframes clFadeIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── 分区 ─── */
.cl-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cl-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}
.cl-section-bug { color: #f59e0b; }
.cl-section-sparkle { color: #8b5cf6; }
.cl-section-zap { color: #3b82f6; }
.cl-section-wrench { color: #6366f1; }
.cl-section-plus { color: #10b981; }

.cl-section-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cl-section-list li {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  padding-left: 16px;
  position: relative;
}
.cl-bullet {
  position: absolute;
  left: 4px;
  top: 10px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.5;
}

/* ─── 响应式 ─── */
@media (max-width: 780px) {
  .cl-main {
    flex-direction: column;
    padding: 16px;
    gap: 16px;
  }
  .cl-sidebar {
    width: 100%;
    position: static;
  }
}
</style>
