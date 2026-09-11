import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const pkgPath = path.join(ROOT, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const version = pkg.version

if (!version) {
  console.error('[VersionSync] 未能在 package.json 中找到 version 字段')
  process.exit(1)
}

// 1. 同步 src-tauri/Cargo.toml
const cargoPath = path.join(ROOT, 'src-tauri', 'Cargo.toml')
if (fs.existsSync(cargoPath)) {
  const content = fs.readFileSync(cargoPath, 'utf-8')
  const updated = content.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`)
  if (updated !== content) {
    fs.writeFileSync(cargoPath, updated, 'utf-8')
    console.log(`[VersionSync] 已自动将 package.json 版本 (${version}) 同步至 src-tauri/Cargo.toml`)
  }
}

// 2. 确保 src-tauri/tauri.conf.json 保持指向 ../package.json
const tauriConfPath = path.join(ROOT, 'src-tauri', 'tauri.conf.json')
if (fs.existsSync(tauriConfPath)) {
  try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'))
    if (tauriConf.version !== '../package.json') {
      tauriConf.version = '../package.json'
      fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8')
      console.log(`[VersionSync] 已确认 src-tauri/tauri.conf.json 统一指向 ../package.json`)
    }
  } catch (e) {}
}
