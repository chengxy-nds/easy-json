import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let win = null
let tray = null
let isQuitting = false

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'easyJSON',
    icon: path.join(__dirname, '../dist/favicon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 关闭窗口时隐藏到托盘而非退出
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (process.env.NODE_ENV === 'dev') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createTray() {
  const iconPath = process.env.NODE_ENV === 'dev'
    ? path.join(__dirname, '../public/icons/icon-16.png')
    : path.join(__dirname, '../dist/icons/icon-16.png')

  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('easyJSON')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { win.show(); win.focus() } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ]))

  tray.on('click', () => { win.show(); win.focus() })
  tray.on('double-click', () => { win.show(); win.focus() })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (win) {
    win.show()
    win.focus()
  } else {
    createWindow()
  }
})
