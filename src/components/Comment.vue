<template>
  <div class="comment-page">
    <!-- 顶栏 -->
    <header class="comment-topbar">
      <div class="comment-topbar-inner">
        <button class="comment-back-btn" @click="$emit('go-back')">
          <ArrowLeft :size="16" />
          <span>返回</span>
        </button>
        <div class="comment-topbar-title">
          <MessageCircle :size="18" class="comment-topbar-icon" />
          <span>评论交流</span>
        </div>
        <div class="comment-topbar-spacer"></div>
      </div>
    </header>

    <!-- 主体 -->
    <main class="comment-main">
      <!-- 左侧介绍卡片 -->
      <aside class="comment-sidebar">
        <div class="comment-card">
          <div class="comment-card-icon">
            <MessageCircle :size="28" />
          </div>
          <h1 class="comment-card-title">畅所欲言</h1>
          <p class="comment-card-desc">
            欢迎你对 <strong>easyJSON</strong> 提出任何想法、建议或反馈。支持 Markdown 语法，可以贴代码、放链接。
          </p>
          <div class="comment-card-features">
            <div class="comment-feature-item">
              <Check :size="14" class="comment-feature-check" />
              <span>Markdown 语法支持</span>
            </div>
            <div class="comment-feature-item">
              <Check :size="14" class="comment-feature-check" />
              <span>GitHub 账号登录</span>
            </div>
            <div class="comment-feature-item">
              <Check :size="14" class="comment-feature-check" />
              <span>表情 & 图片上传</span>
            </div>
            <div class="comment-feature-item">
              <Check :size="14" class="comment-feature-check" />
              <span>邮件通知回复</span>
            </div>
          </div>
          <div class="comment-card-footer">
            <span class="comment-stats">
              <span class="waline-comment-count" data-path="/comment" /> 条评论
            </span>
            <span class="comment-stats-divider">·</span>
            <span class="comment-stats">
              <span class="waline-pageview-count" data-path="/comment" /> 次浏览
            </span>
          </div>
        </div>
      </aside>

      <!-- 右侧评论区 -->
      <section class="comment-content">
        <div id="waline"></div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, watch, nextTick } from 'vue'
import { init } from '@waline/client'
import '@waline/client/style'
import { ArrowLeft, MessageCircle, Check } from 'lucide-vue-next'

defineEmits(['go-back'])

const props = defineProps({
  path: {
    type: String,
    default: () => window.location.pathname
  }
})

let walineInstance = null

const initWaline = () => {
  if (walineInstance) walineInstance.destroy()

  walineInstance = init({
    el: '#waline',
    serverURL: 'https://easyjsoncomment.xiaofucode.com',
    path: props.path,
    dark: 'html.dark-mode',
    pageview: true,
    comment: true,
    avatar: 'https://cravatar.cn/avatar/',
    locale: {
      placeholder: '欢迎沟通交流…',
      nick: '昵称',
      mail: '邮箱',
      link: '网址',
      sofa: '还没有评论，来做第一个发言的人吧 ~',
      submit: '提交',
      reply: '回复'
    }
  })
}

onMounted(() => nextTick(() => initWaline()))
watch(() => props.path, () => nextTick(() => initWaline()))
onUnmounted(() => { if (walineInstance) walineInstance.destroy() })
</script>

<style scoped>
.comment-page {
  min-height: 100vh;
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
}

/* ─── 顶栏 ─── */
.comment-topbar {
  height: 48px;
  background: var(--bg-panel);
  flex-shrink: 0;
}
.comment-topbar-inner {
  display: flex;
  align-items: center;
  max-width: 1100px;
  width: 100%;
  height: 100%;
  margin: 0 auto;
  padding: 0 24px;
}
.comment-back-btn {
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
.comment-back-btn:hover {
  background-color: var(--bg-app);
  border-color: var(--border-color-active);
}
.comment-back-btn:active {
  transform: scale(0.96);
}
.comment-topbar-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 auto;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.comment-topbar-icon {
  color: var(--text-secondary);
}
.comment-topbar-spacer {
  width: 68px;
}

/* ─── 主体布局 ─── */
.comment-main {
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
.comment-sidebar {
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 32px;
}
.comment-card {
  background: var(--bg-panel);
  border-radius: 12px;
  padding: 28px 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
  transition: all 0.3s ease;
}
.comment-card:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.04);
}
.comment-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #4fc1ff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}
.comment-card-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}
.comment-card-desc {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
  margin: 0 0 20px;
}
.comment-card-desc strong {
  color: var(--text-primary);
}
.comment-card-features {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}
.comment-feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.comment-feature-check {
  color: var(--success-text, #16a34a);
  flex-shrink: 0;
}
.comment-card-footer {
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
.comment-stats {
  font-size: 12px;
  color: var(--text-muted);
}
.comment-stats-divider {
  margin: 0 6px;
  color: var(--border-color);
}

/* ─── 右侧评论区 ─── */
.comment-content {
  flex: 1;
  min-width: 0;
  background: var(--bg-panel);
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
  transition: all 0.3s ease;
}
.comment-content:hover {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.04);
}

/* ─── Waline 深度样式定制 ─── */
#waline {
  /* Color theme & variables */
  --waline-theme-color: var(--primary-color) !important;
  --waline-active-color: var(--primary-hover) !important;
  --waline-font-size: 13.5px !important;
  --waline-bg-color: var(--bg-input, #ffffff) !important;
  --waline-bg-color-hover: var(--bg-app) !important;
  --waline-bg-color-light: var(--bg-app) !important;
  --waline-border-color: var(--border-color) !important;
  --waline-color: var(--text-primary) !important;
  --waline-light-text-color: var(--text-secondary) !important;
  --waline-disable-bg: var(--bg-app) !important;
  --waline-disable-color: var(--text-muted) !important;
  --waline-badge-color: var(--primary-color) !important;
  --waline-badge-bg: var(--primary-light) !important;
  --waline-avatar-radius: 8px !important;
  --waline-avatar-size: 40px !important;
  --waline-m-avatar-size: 32px !important;
}

/* 隐藏自带水印 */
:deep(.wl-power) {
  display: none !important;
}

/* 输入区域整体卡片 */
:deep(.wl-input-box) {
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  background: var(--bg-input) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) !important;
  transition: all 0.2s ease !important;
  overflow: hidden !important;
}
:deep(.wl-input-box:focus-within) {
  border-color: var(--primary-color) !important;
  box-shadow: 0 0 0 2px var(--primary-light), 0 2px 8px rgba(0, 0, 0, 0.04) !important;
}

/* 输入表头（昵称/邮箱/网址） */
:deep(.wl-header) {
  border-bottom: 1px solid var(--border-color) !important;
  padding: 8px 12px !important;
  background: var(--bg-app) !important;
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
}
:deep(.wl-header .wl-header-item) {
  flex: 1 1 120px !important;
  display: flex !important;
  align-items: center !important;
}
:deep(.wl-header label) {
  font-size: 12px !important;
  font-weight: 500 !important;
  color: var(--text-secondary) !important;
  margin-right: 4px !important;
}
:deep(.wl-header input) {
  font-family: var(--font-sans) !important;
  font-size: 13px !important;
  color: var(--text-primary) !important;
  border-radius: 4px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  padding: 4px 8px !important;
  transition: all 0.15s ease !important;
  width: 100% !important;
}
:deep(.wl-header input:focus) {
  background: var(--bg-panel) !important;
  border-color: var(--primary-color) !important;
}

/* 编辑文本域 */
:deep(.wl-editor) {
  font-family: var(--font-sans) !important;
  font-size: 13.5px !important;
  line-height: 1.6 !important;
  padding: 16px !important;
  color: var(--text-primary) !important;
  background: transparent !important;
  min-height: 110px !important;
  resize: vertical !important;
  border: none !important;
}
:deep(.wl-editor:focus) {
  outline: none !important;
}

/* 底部操作区 */
:deep(.wl-footer) {
  padding: 8px 16px !important;
  border-top: 1px dashed var(--border-color) !important;
  background: var(--bg-panel) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}

/* 表情、Markdown等按钮 */
:deep(.wl-actions) {
  display: flex !important;
  gap: 6px !important;
}
:deep(.wl-actions button) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  color: var(--text-secondary) !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}
:deep(.wl-actions button:hover) {
  background: var(--bg-app) !important;
  color: var(--primary-color) !important;
}

/* 提交/其他普通按钮 */
:deep(.wl-btn) {
  font-family: var(--font-sans) !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
  padding: 6px 16px !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  border: 1px solid var(--border-color) !important;
  background: var(--bg-panel) !important;
  color: var(--text-primary) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03) !important;
}
:deep(.wl-btn:hover) {
  background: var(--bg-app) !important;
  border-color: var(--border-color-active) !important;
}
:deep(.wl-btn:active) {
  transform: scale(0.97) !important;
}

/* 提交按钮（高亮/主要按钮） */
:deep(.wl-btn.wl-btn-primary) {
  background: var(--btn-primary-bg) !important;
  color: var(--btn-primary-text) !important;
  border: 1px solid transparent !important;
}
:deep(.wl-btn.wl-btn-primary:hover) {
  background: var(--btn-primary-hover) !important;
  box-shadow: 0 4px 12px var(--primary-light) !important;
}

/* 评论卡片列表 */
:deep(.wl-cards) {
  margin-top: 24px !important;
}
:deep(.wl-cards .wl-card) {
  border-bottom: 1px solid var(--border-color) !important;
  transition: all 0.2s ease !important;
}
:deep(.wl-cards .wl-card:last-child) {
  border-bottom: none !important;
}

/* 用户头像 */
:deep(.wl-avatar) {
  border: none !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important;
  border-radius: 50% !important;
  overflow: hidden !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23e0e7ff'/%3E%3Cstop offset='100%25' style='stop-color:%23c7d2fe'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' fill='url(%23g)'/%3E%3Ccircle cx='40' cy='30' r='15' fill='%23a5b4fc'/%3E%3Cellipse cx='40' cy='68' rx='32' ry='22' fill='%23a5b4fc'/%3E%3C/svg%3E") !important;
  background-size: cover !important;
}
.dark-mode :deep(.wl-avatar) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23374151'/%3E%3Cstop offset='100%25' style='stop-color:%234B5563'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' fill='url(%23g)'/%3E%3Ccircle cx='40' cy='30' r='15' fill='%236B7280'/%3E%3Cellipse cx='40' cy='68' rx='32' ry='22' fill='%236B7280'/%3E%3C/svg%3E") !important;
}
:deep(.wl-avatar img) {
  border-radius: 50% !important;
  position: relative !important;
  z-index: 1 !important;
}

/* 用户昵称 */
:deep(.wl-nick) {
  font-weight: 600 !important;
  color: var(--text-primary) !important;
  font-size: 13.5px !important;
  transition: color 0.15s ease !important;
}
:deep(.wl-nick:hover) {
  color: var(--primary-color) !important;
}

/* 评论头部元数据 */
:deep(.wl-head) {
  display: flex !important;
  align-items: center !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
}
:deep(.wl-head .wl-time) {
  font-size: 12px !important;
  color: var(--text-muted) !important;
  text-decoration: none !important;
}

/* 浏览器、系统、博主标签等 */
:deep(.wl-meta span) {
  font-size: 11px !important;
  color: var(--text-muted) !important;
  background: var(--bg-app) !important;
  padding: 1px 6px !important;
  border-radius: 4px !important;
  margin-right: 4px !important;
  font-weight: 500 !important;
}
:deep(.wl-meta .wl-badge) {
  background: var(--primary-light) !important;
  color: var(--primary-color) !important;
  border: 1px solid var(--primary-light) !important;
  font-weight: 600 !important;
}

/* 评论文本内容 */
:deep(.wl-content) {
  font-size: 13.5px !important;
  line-height: 1.6 !important;
  color: var(--text-primary) !important;
  margin-top: 12px !important;
}

/* 评论引用回复卡片 */
:deep(.wl-quote) {
  background: var(--bg-app) !important;
  border-radius: 8px !important;
  padding: 12px 16px !important;
  margin-top: 12px !important;
}

/* 评论内链接 */
:deep(.wl-content a) {
  color: var(--primary-color) !important;
  text-decoration: none !important;
  border-bottom: 1px dashed var(--primary-color) !important;
  transition: all 0.15s ease !important;
}
:deep(.wl-content a:hover) {
  color: var(--primary-hover) !important;
  border-bottom-style: solid !important;
}

/* 评论内的代码块 */
:deep(.wl-content pre) {
  background: var(--bg-app) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px !important;
  padding: 12px !important;
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
  overflow-x: auto !important;
}
:deep(.wl-content code) {
  background: var(--bg-app) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
}

/* 回复按钮 */
:deep(.wl-reply) {
  color: var(--text-secondary) !important;
  font-size: 12px !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  transition: all 0.15s ease !important;
  padding: 3px 8px !important;
  border-radius: 4px !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
}
:deep(.wl-reply:hover) {
  color: var(--primary-color) !important;
  background: var(--primary-light) !important;
}

/* 表情弹窗 */
:deep(.wl-emoji-popup) {
  border: 1px solid var(--border-color) !important;
  background: var(--bg-panel) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
  border-radius: 8px !important;
  padding: 12px !important;
}

/* 提示通知/空状态 */
:deep(.wl-info) {
  border-color: var(--border-color) !important;
  background: var(--bg-app) !important;
  color: var(--text-secondary) !important;
  border-radius: 6px !important;
}
:deep(.wl-sofa) {
  color: var(--text-muted) !important;
  font-size: 13.5px !important;
  padding: 48px 0 !important;
  text-align: center !important;
}

/* ─── 响应式 ─── */
@media (max-width: 780px) {
  .comment-main { flex-direction: column; padding: 16px; gap: 16px; }
  .comment-sidebar { width: 100%; position: static; }
  .comment-content { padding: 20px; }
}
</style>

