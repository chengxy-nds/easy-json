// src/utils/historyStorage.js
// 全局历史记录持久化管理 (采用独立 IndexedDB 数据库，解耦且零风险)

const DB_NAME = 'easy_json_history_db'
const DB_VERSION = 1
const STORE_NAME = 'history_records'
const MAX_TAB_HISTORY_ITEMS = 20 // 每个 Tab 历史版本严格只保留最近的 20 个版本 (先进先出FIFO)
const MAX_HISTORY_ITEMS = 200 // 全局兜底最大保留条数

let dbPromise = null

function getDB() {
  if (dbPromise) return dbPromise
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null)
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }

      request.onsuccess = (event) => {
        resolve(event.target.result)
      }

      request.onerror = (err) => {
        console.warn('[historyStorage] IndexedDB open error:', err)
        resolve(null)
      }
    } catch (e) {
      console.warn('[historyStorage] IndexedDB initialization failed:', e)
      resolve(null)
    }
  })

  return dbPromise
}

/**
 * 获取所有历史记录 (按创建时间倒序)
 * @returns {Promise<Array>}
 */
export async function getAllHistoryRecords() {
  try {
    const db = await getDB()
    if (!db) return []
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const list = req.result || []
        // 按时间从新到旧排序
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        resolve(list)
      }
      req.onerror = () => resolve([])
    })
  } catch (e) {
    return []
  }
}

/**
 * 获取指定 Tab 的历史记录 (按创建时间倒序)
 * @param {string|number} tabId
 * @returns {Promise<Array>}
 */
export async function getHistoryRecordsByTabId(tabId) {
  const all = await getAllHistoryRecords()
  if (tabId == null) return all.slice(0, MAX_TAB_HISTORY_ITEMS)
  const target = String(tabId)
  const list = all.filter(item => item.tabId === target)
  if (list.length > MAX_TAB_HISTORY_ITEMS) {
    const toDelete = list.slice(MAX_TAB_HISTORY_ITEMS)
    getDB().then(db => {
      if (!db) return
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      toDelete.forEach(item => store.delete(item.id))
    }).catch(() => {})
    return list.slice(0, MAX_TAB_HISTORY_ITEMS)
  }
  return list
}

/**
 * 记录一条历史 (支持格式化与对比两种类型，并关联具体 Tab)
 * @param {Object} param0
 * @param {string} [param0.type] 'format' | 'compare'
 * @param {string} param0.content JSON 文本内容 (或合并摘要)
 * @param {string} [param0.leftContent] 对比左侧文本
 * @param {string} [param0.rightContent] 对比右侧文本
 * @param {string} [param0.title] 标题或来源提示
 * @param {string|number} [param0.tabId] 关联的 Tab ID
 * @param {string} [param0.tabTitle] 关联的 Tab 名称
 * @param {number} [param0.lines] 行数
 * @param {string} [param0.sizeText] 大小描述 (如 1.2 KB)
 * @returns {Promise<Object|null>} 新增的记录
 */
export async function addHistoryRecord({
  type = 'format',
  content = '',
  leftContent = '',
  rightContent = '',
  title = '',
  tabId = null,
  tabTitle = '',
  lines = 1,
  sizeText = ''
}) {
  const isCompare = type === 'compare'
  const trimmed = content ? content.trim() : ''
  const trimmedLeft = leftContent ? leftContent.trim() : ''
  const trimmedRight = rightContent ? rightContent.trim() : ''
  const targetTabId = tabId != null ? String(tabId) : null

  if (isCompare) {
    if (!trimmedLeft && !trimmedRight) return null
  } else {
    if (!trimmed) return null
  }

  try {
    const db = await getDB()
    if (!db) return null

    const currentList = await getAllHistoryRecords()
    if (currentList.length > 0) {
      // 优先在当前 Tab 中查找最近的一条历史记录进行内容查重，避免重复保存
      const latestInTab = currentList.find(item => item.tabId === targetTabId)
      if (latestInTab) {
        const isSameContent = isCompare
          ? (latestInTab.type === 'compare' && latestInTab.leftContent === trimmedLeft && latestInTab.rightContent === trimmedRight)
          : (latestInTab.type !== 'compare' && latestInTab.content?.trim() === trimmed)

        if (isSameContent) {
          latestInTab.createdAt = Date.now()
          latestInTab.lines = lines
          latestInTab.sizeText = sizeText
          latestInTab.title = title || latestInTab.title
          latestInTab.tabTitle = tabTitle || latestInTab.tabTitle || ''

          return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite')
            const store = tx.objectStore(STORE_NAME)
            const req = store.put(latestInTab)
            req.onsuccess = () => resolve(latestInTab)
            req.onerror = () => resolve(null)
          })
        }
      }
    }

    // 计算当前 Tab 的自增不可变版本号 (避免因删除某条导致其他版本号漂移)
    const tabRecords = currentList.filter(item => item.tabId === targetTabId)
    let maxVersion = 0
    tabRecords.forEach(item => {
      if (typeof item.versionNumber === 'number' && item.versionNumber > maxVersion) {
        maxVersion = item.versionNumber
      }
    })
    if (maxVersion === 0 && tabRecords.length > 0) {
      maxVersion = tabRecords.length
    }
    const versionNumber = maxVersion + 1

    // 生成新记录
    const totalBytes = isCompare
      ? (trimmedLeft.length + trimmedRight.length)
      : trimmed.length

    const newRecord = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      type: isCompare ? 'compare' : 'format',
      tabId: targetTabId,
      tabTitle: tabTitle || '',
      title: title || (isCompare ? '对比记录' : (tabTitle || '格式化记录')),
      content: isCompare ? (trimmedLeft || trimmedRight) : trimmed,
      leftContent: trimmedLeft,
      rightContent: trimmedRight,
      lines: lines || (isCompare ? (trimmedLeft.split('\n').length + trimmedRight.split('\n').length) : trimmed.split('\n').length),
      sizeText: sizeText || formatSize(totalBytes),
      versionNumber,
      createdAt: Date.now()
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.add(newRecord)

      req.onsuccess = async () => {
        // 单个 Tab 严格最多只保留最新的 MAX_TAB_HISTORY_ITEMS (15) 条历史记录
        if (targetTabId) {
          const tabRecords = currentList.filter(item => item.tabId === targetTabId)
          if (tabRecords.length >= MAX_TAB_HISTORY_ITEMS) {
            const toDelete = tabRecords.slice(MAX_TAB_HISTORY_ITEMS - 1)
            const cleanTx = db.transaction(STORE_NAME, 'readwrite')
            const cleanStore = cleanTx.objectStore(STORE_NAME)
            toDelete.forEach(item => cleanStore.delete(item.id))
          }
        } else {
          if (currentList.length >= MAX_TAB_HISTORY_ITEMS) {
            const toDelete = currentList.slice(MAX_TAB_HISTORY_ITEMS - 1)
            const cleanTx = db.transaction(STORE_NAME, 'readwrite')
            const cleanStore = cleanTx.objectStore(STORE_NAME)
            toDelete.forEach(item => cleanStore.delete(item.id))
          }
        }
        resolve(newRecord)
      }
      req.onerror = () => resolve(null)
    })
  } catch (e) {
    console.error('[historyStorage] addHistoryRecord failed:', e)
    return null
  }
}

/**
 * 删除单条历史记录
 * @param {string} id
 */
export async function deleteHistoryRecord(id) {
  try {
    const db = await getDB()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(id)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

/**
 * 删除其他历史记录 (只保留当前条目，清除其余全部；若传了 tabId 则只清除同 Tab 下的其他记录)
 * @param {string} keepId
 * @param {string|number} [tabId]
 */
export async function deleteOtherHistoryRecords(keepId, tabId = null) {
  try {
    const db = await getDB()
    if (!db) return false
    const all = await getAllHistoryRecords()
    const targetTabId = tabId != null ? String(tabId) : null
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      all.forEach(item => {
        if (item.id !== keepId) {
          if (targetTabId == null || item.tabId === targetTabId) {
            store.delete(item.id)
          }
        }
      })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

/**
 * 清空历史记录 (若提供 tabId 则只清空属于该 Tab 的历史记录)
 * @param {string|number} [tabId]
 */
export async function clearTabHistoryRecords(tabId = null) {
  if (tabId == null) {
    return clearAllHistoryRecords()
  }
  try {
    const db = await getDB()
    if (!db) return false
    const all = await getAllHistoryRecords()
    const targetTabId = String(tabId)
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      all.forEach(item => {
        if (item.tabId === targetTabId) {
          store.delete(item.id)
        }
      })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

/**
 * 保留最近 N 条历史记录，清理其余旧记录
 * @param {number} keepCount 保留条数，默认 5 条
 * @param {string|number} [tabId] 若传 tabId 则仅在对应 Tab 内保留最新 N 条
 */
export async function keepLatestRecords(keepCount = 5, tabId = null) {
  try {
    const db = await getDB()
    if (!db) return false
    const all = await getAllHistoryRecords()
    const targetTabId = tabId != null ? String(tabId) : null
    
    // 找出目标列表 (默认按时间从新到旧排列)
    const filtered = targetTabId != null
      ? all.filter(item => item.tabId === targetTabId)
      : all
      
    if (filtered.length <= keepCount) return true
    
    // 超出保留数量的旧记录即为待删除项
    const toDelete = filtered.slice(keepCount)
    const deleteIds = new Set(toDelete.map(item => item.id))
    
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      deleteIds.forEach(id => store.delete(id))
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (e) {
    console.error('[historyStorage] keepLatestRecords failed:', e)
    return false
  }
}

/**
 * 清空所有历史记录
 */
export async function clearAllHistoryRecords() {
  try {
    const db = await getDB()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.clear()
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
