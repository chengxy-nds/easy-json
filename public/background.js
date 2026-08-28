// easyJSON — Chrome Extension Background Service Worker
// Handles right-click context menu for smart JSON extraction

// 注册/更新右键菜单（只保留 1 个菜单项，Chrome 将直接展示在右键一级菜单中）
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'extract-json',
      title: '用 easyJSON 智能提取',
      contexts: ['selection']
    })
  })
})

// 点击插件图标 → 在新标签页全屏打开（复用已有标签页）
chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL('index.html?mode=tab')
  chrome.tabs.query({ url: chrome.runtime.getURL('index.html') + '*' }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true })
    } else {
      chrome.tabs.create({ url })
    }
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.selectionText) return

  const extensionUrl = chrome.runtime.getURL('index.html')

  if (info.menuItemId === 'extract-json') {
    chrome.storage.local.set({ ej_extract_text: info.selectionText }, () => {
      chrome.tabs.query({ url: extensionUrl + '*' }, (tabs) => {
        if (tabs.length > 0) {
          // 不设置 url，避免重载，通过 storage.onChanged 推送
          chrome.tabs.update(tabs[0].id, { active: true })
        } else {
          chrome.tabs.create({ url: extensionUrl + '?action=extract' })
        }
      })
    })
  }
})

