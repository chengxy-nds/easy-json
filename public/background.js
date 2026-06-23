// easyJSON — Chrome Extension Background Service Worker
// Handles right-click context menu for smart JSON extraction

// SW 每次冷启动时尝试创建右键菜单。
// Chrome 会自动还原旧的菜单项，这里重复 create 会触发 duplicate-id 错误，
// 用 callback 吞掉即可 — 菜单项实际只有一个，不影响使用。
chrome.contextMenus.create({
  id: 'extract-json',
  title: '用 easyJSON 智能提取',
  contexts: ['selection']
}, () => void chrome.runtime.lastError)

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
  if (info.menuItemId === 'extract-json' && info.selectionText) {
    chrome.storage.local.set({ ej_extract_text: info.selectionText }, () => {
      const extensionUrl = chrome.runtime.getURL('index.html')
      chrome.tabs.query({ url: extensionUrl + '*' }, (tabs) => {
        if (tabs.length > 0) {
          // Reuse existing tab — reload to trigger extract
          chrome.tabs.update(tabs[0].id, { active: true, url: extensionUrl + '?action=extract' })
        } else {
          chrome.tabs.create({ url: extensionUrl + '?action=extract' })
        }
      })
    })
  }
})
