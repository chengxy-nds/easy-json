<script setup>
import { ref, computed } from 'vue'
import { ArrowLeft, History, Sparkles, Bug, Zap, Plus, Wrench, ChevronDown } from 'lucide-vue-next'
import ElectricBorder from './ElectricBorder.vue'

const electricColor = computed(() => {
  return '#38bdf8'
})

const emit = defineEmits(['go-back'])

const changelog = [
  {
    version: 'v1.0.4',
    date: '2026-08-28',
    sections: [
      {
        icon: Sparkles,
        title: '功能新增',
        iconClass: 'cl-section-sparkle',
        items: [
          '支持悬停/点击查看字段完整路径，并可一键复制',
          '拓扑图支持鼠标滚轮自由缩放画布'
        ]
      },
      {
        icon: Zap,
        title: '性能与体验',
        iconClass: 'cl-section-zap',
        items: [
          '超大 JSON 秒级解析与格式化，打字编辑更流畅',
          '优化暗色搜索高亮、查找平滑定位与分栏拖拽体验'
        ]
      }
    ]
  },
  {
    version: 'v1.0.3',
    date: '2026-08-10',
    sections: [
      {
        icon: Bug,
        title: '问题修复',
        iconClass: 'cl-section-bug',
        items: [
          '修复超大整数 JSON 格式化精度丢失的问题',
          '修复连续大整数数组仅首个数字被保护的边界情况',
          '修复负数大整数格式化异常的问题'
        ]
      },
      {
        icon: Sparkles,
        title: '功能改进',
        iconClass: 'cl-section-sparkle',
        items: [
          '新增更新历史页面',
          '优化服务稳定性'
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
          '新增 VS Code 插件：右键选中文本即可提取并格式化 JSON',
          '新增 uTools 插件：支持超长 JSON 文本无损导入'
        ]
      },
      {
        icon: Wrench,
        title: '体验优化',
        iconClass: 'cl-section-wrench',
        items: [
          '优化自动粘贴检测，降低 CPU 占用',
          '首页预设案例新增 10+ 格式，滚动更流畅',
          '修复深色主题下语法高亮个别颜色偏移'
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
          '新增 uTools 插件版本',
          '新增 Chrome / Edge / Firefox 浏览器扩展',
          '新增 Windows 安装包与 macOS 安装包'
        ]
      },
      {
        icon: Zap,
        title: '性能优化',
        iconClass: 'cl-section-zap',
        items: [
          '大文件格式化性能提升 60%',
          'JSON 对比支持忽略 key 顺序和缩进差异',
          '多 Tab 工作区关闭后自动恢复'
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
          '智能 JSON 提取：支持 100+ 种常见格式自动识别',
          '四种视图模式：代码、树形、图谱、表格',
          '语义级 JSON 对比：精准标记数据变更',
          '复制即格式化：自动检测剪贴板内容',
          '100% 离线运行，数据不上传，安全可靠'
        ]
      }
    ]
  }
]

const expandedVersion = ref(changelog.map(e => e.version))

const toggleVersion = (version) => {
  const arr = expandedVersion.value
  const idx = arr.indexOf(version)
  if (idx === -1) {
    arr.push(version)
  } else {
    arr.splice(idx, 1)
  }
}
</script>

<template>
  <div class="changelog-page">
    <!-- 顶栏 -->
    <header class="cl-topbar">
      <div class="cl-topbar-inner">
        <button class="cl-back-btn" @click="emit('go-back')">
          <ArrowLeft :size="16" />
          <span>返回</span>
        </button>
        <div class="cl-topbar-title">
          <History :size="18" class="cl-topbar-icon" />
          <span>更新记录</span>
        </div>
        <div class="cl-topbar-spacer"></div>
      </div>
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

      <!-- 右侧时间轴 -->
      <section class="cl-content">
        <div class="cl-timeline">
          <div
            v-for="(entry, index) in changelog"
            :key="entry.version"
            class="cl-entry"
            :class="{ 'is-expanded': expandedVersion.includes(entry.version), 'is-latest': index === 0 }"
            @click="toggleVersion(entry.version)"
          >
            <!-- 时间轴节点 -->
            <div class="cl-timeline-node">
              <div class="cl-dot" :class="{ 'is-latest': index === 0 }"></div>
              <div v-if="index < changelog.length - 1" class="cl-line"></div>
            </div>

            <!-- 版本卡片 -->
            <ElectricBorder
              v-if="index === 0"
              :color="electricColor"
              :speed="1"
              :chaos="0.12"
              :border-radius="12"
              style="flex:1;min-width:0;margin-bottom:16px;"
            >
              <div class="cl-card-wrap is-latest-card">
                <div class="cl-entry-header">
                  <div class="cl-entry-header-left">
                    <div class="cl-version-badge is-latest">
                      {{ entry.version }}
                      <span class="cl-latest-tag">最新</span>
                    </div>
                    <span class="cl-date">{{ entry.date }}</span>
                  </div>
                  <ChevronDown
                    :size="16"
                    class="cl-expand-icon"
                    :class="{ 'is-open': expandedVersion.includes(entry.version) }"
                  />
                </div>
                <div v-if="expandedVersion.includes(entry.version)" class="cl-entry-body">
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
            </ElectricBorder>

            <div v-else class="cl-card-wrap">
              <div class="cl-entry-header">
                <div class="cl-entry-header-left">
                  <div class="cl-version-badge">
                    {{ entry.version }}
                  </div>
                  <span class="cl-date">{{ entry.date }}</span>
                </div>
                <ChevronDown
                  :size="16"
                  class="cl-expand-icon"
                  :class="{ 'is-open': expandedVersion.includes(entry.version) }"
                />
              </div>
              <div v-if="expandedVersion.includes(entry.version)" class="cl-entry-body">
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
  height: 48px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.cl-topbar-inner {
  display: flex;
  align-items: center;
  max-width: 1100px;
  width: 100%;
  height: 100%;
  margin: 0 auto;
  padding: 0 24px;
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
  background: linear-gradient(135deg, var(--primary-color), #4fc1ff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px var(--primary-light);
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

/* ─── 右侧时间轴 ─── */
.cl-content {
  flex: 1;
  min-width: 0;
}
.cl-timeline {
  position: relative;
}

/* ─── 版本条目 ─── */
.cl-entry {
  display: flex;
  gap: 18px;
  cursor: pointer;
}
.cl-entry:last-child .cl-card-wrap,
.cl-entry:last-child .electric-border {
  margin-bottom: 0 !important;
}

/* ─── 时间轴节点 ─── */
.cl-timeline-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
  padding-top: 22px;
}
.cl-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--border-color-active);
  border: 2px solid var(--bg-app);
  flex-shrink: 0;
  transition: all 0.25s ease;
}
.cl-dot.is-latest {
  width: 14px;
  height: 14px;
  background: var(--primary-color);
  box-shadow: 0 0 0 4px var(--primary-light);
}
.cl-line {
  width: 2px;
  flex: 1;
  min-height: 24px;
  background: var(--border-color);
  margin: 6px 0;
}
.cl-entry.is-expanded .cl-line {
  background: color-mix(in srgb, var(--primary-color) 25%, transparent);
}

/* ─── 版本卡片 ─── */
.cl-card-wrap {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 16px;
  transition: all 0.2s ease;
  box-shadow: none;
  cursor: pointer;
}
.cl-card-wrap.is-latest-card {
  background: var(--bg-panel);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0;
}
.cl-entry:hover .cl-card-wrap {
  background: var(--bg-panel);
}
.cl-entry.is-expanded .cl-card-wrap {
  background: var(--bg-panel);
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
  color: var(--primary-color);
}
.cl-latest-tag {
  font-size: 9px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--primary-color);
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
.cl-section-sparkle { color: var(--primary-color); }
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
  .cl-timeline-node {
    width: 16px;
  }
  .cl-dot {
    width: 10px;
    height: 10px;
  }
  .cl-dot.is-latest {
    width: 12px;
    height: 12px;
  }
}
</style>
