// src/utils/tabStorage.js
// 针对海量文本（如 80,000 行 JSON，数兆至数十兆）的 IndexedDB 异步本地持久化存储
// 突破 localStorage 5MB 配额限制与同步阻塞问题，保证新建标签页与大文件刷新时不丢失

const DB_NAME = 'easy_json_db'
const DB_VERSION = 1
const STORE_NAME = 'formatter_tab_contents'

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
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }

      request.onsuccess = (event) => {
        resolve(event.target.result)
      }

      request.onerror = (err) => {
        console.warn('[tabStorage] IndexedDB open error:', err)
        resolve(null)
      }
    } catch (e) {
      console.warn('[tabStorage] IndexedDB initialization failed:', e)
      resolve(null)
    }
  })

  return dbPromise
}

/**
 * 异步保存单个 tab 的完整文本到 IndexedDB
 * @param {number|string} tabId 
 * @param {string} content 
 */
export async function saveTabContentToDb(tabId, content) {
  try {
    const db = await getDB()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put({ id: String(tabId), content: content || '', updatedAt: Date.now() })
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

/**
 * 批量异步保存所有 tabs 的内容到 IndexedDB
 * @param {Array<{ id: number|string, inputText: string }>} tabList 
 */
export async function saveAllTabsContentToDb(tabList) {
  try {
    const db = await getDB()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      tabList.forEach(t => {
        store.put({ id: String(t.id), content: t.inputText || '', updatedAt: Date.now() })
      })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

/**
 * 异步获取单个 tab 的完整文本
 * @param {number|string} tabId 
 * @returns {Promise<string|null>}
 */
export async function getTabContentFromDb(tabId) {
  try {
    const db = await getDB()
    if (!db) return null
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(String(tabId))
      req.onsuccess = (e) => {
        const result = e.target.result
        resolve(result ? result.content : null)
      }
      req.onerror = () => resolve(null)
    })
  } catch (e) {
    return null
  }
}

/**
 * 异步获取所有保存的 tabs 内容映射: Map<tabId, content>
 * @returns {Promise<Map<string, string>>}
 */
export async function getAllTabsContentFromDb() {
  const contentMap = new Map()
  try {
    const db = await getDB()
    if (!db) return contentMap
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = (e) => {
        const list = e.target.result || []
        list.forEach(item => {
          if (item && item.id !== undefined) {
            contentMap.set(String(item.id), item.content || '')
          }
        })
        resolve(contentMap)
      }
      req.onerror = () => resolve(contentMap)
    })
  } catch (e) {
    return contentMap
  }
}

/**
 * 删除单个 tab 的存储文本
 * @param {number|string} tabId 
 */
export async function deleteTabContentFromDb(tabId) {
  try {
    const db = await getDB()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(String(tabId))
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

/**
 * 清理已关闭或不再存在的 tabs 数据
 * @param {Array<number|string>} validTabIds 
 */
export async function cleanOrphanTabsInDb(validTabIds) {
  try {
    const db = await getDB()
    if (!db) return
    const validSet = new Set(validTabIds.map(String))
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAllKeys()
    req.onsuccess = (e) => {
      const allKeys = e.target.result || []
      allKeys.forEach(key => {
        if (!validSet.has(String(key))) {
          store.delete(key)
        }
      })
    }
  } catch (e) {}
}
