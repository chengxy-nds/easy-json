import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PLUGIN_DIR = path.join(ROOT, 'easyjson-plugin')
const FILE_DIR = path.join(ROOT, 'file')

// 1. 读取版本号
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version || '1.0.0'
const zipName = `easyJSON_${version}_plugin.zip`
const zipPath = path.join(FILE_DIR, zipName)

console.log(`[Plugin] Building Chrome extension (v${version})...`)

// 2. 执行 vite 构建
execSync('npx vite build --outDir easyjson-plugin', { cwd: ROOT, stdio: 'inherit' })

if (!fs.existsSync(PLUGIN_DIR)) {
  console.error('[Plugin] Error: easyjson-plugin directory not found!')
  process.exit(1)
}

// 3. 确保 file 目录存在
if (!fs.existsSync(FILE_DIR)) {
  fs.mkdirSync(FILE_DIR, { recursive: true })
}

// 4. 打包为 zip 压缩包
console.log(`[Plugin] Archiving to file/${zipName}...`)

const isWin = process.platform === 'win32'
try {
  if (isWin) {
    // Windows 10+ 自带 tar.exe (bsdtar)，原生支持 zip 打包
    execSync(`tar.exe -a -c -f "${zipPath}" -C "${PLUGIN_DIR}" .`, { stdio: 'inherit' })
  } else {
    // Linux / macOS 使用 zip 命令
    execSync(`cd "${PLUGIN_DIR}" && zip -r "${zipPath}" ./*`, { stdio: 'inherit' })
  }

  const stat = fs.statSync(zipPath)
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2)
  console.log(`\x1b[32m[Plugin] Successfully generated: file/${zipName} (${sizeMb} MB)\x1b[0m`)
} catch (err) {
  console.warn('[Plugin] tar/zip command failed, falling back to PowerShell Compress-Archive...', err.message)
  if (isWin) {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${PLUGIN_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' }
    )
    const stat = fs.statSync(zipPath)
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2)
    console.log(`\x1b[32m[Plugin] Successfully generated: file/${zipName} (${sizeMb} MB)\x1b[0m`)
  } else {
    throw err
  }
}
