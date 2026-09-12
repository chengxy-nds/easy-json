import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const UTOOLS_SRC = path.join(ROOT, 'utools')
const OUT = path.join(ROOT, 'utools-dist')

console.log('[uTools] Building frontend...')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true })
}
fs.mkdirSync(OUT, { recursive: true })

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

console.log('[uTools] Copying dist...')
copyDir(DIST, OUT)

// 清理 index.html：去除外部脚本（百度统计、51啦统计）、crossorigin 属性、SEO 标签
const indexPath = path.join(OUT, 'index.html')
let html = fs.readFileSync(indexPath, 'utf-8')
html = html.replace(/<script>[^<]*hm\.baidu\.com[^<]*<\/script>\s*/g, '')
html = html.replace(/<script[^>]*src="[^"]*51\.la[^"]*"[^>]*><\/script>\s*/g, '')
html = html.replace(/<script>[^<]*LA\.init[^<]*<\/script>\s*/g, '')
html = html.replace(/ crossorigin/g, '')
html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '')
html = html.replace(/<meta property="og:[^>]*>\s*/g, '')
fs.writeFileSync(indexPath, html, 'utf-8')
console.log('[uTools] Cleaned index.html (removed external refs & crossorigin)')

console.log('[uTools] Copying plugin.json & preload.js...')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version || '1.0.0'

const pluginJson = JSON.parse(fs.readFileSync(path.join(UTOOLS_SRC, 'plugin.json'), 'utf-8'))
pluginJson.version = version
fs.writeFileSync(path.join(OUT, 'plugin.json'), JSON.stringify(pluginJson, null, 2) + '\n', 'utf-8')
fs.copyFileSync(path.join(UTOOLS_SRC, 'preload.js'), path.join(OUT, 'preload.js'))

const logoSrc = path.join(ROOT, 'public', 'icons', 'icon-256.png')
fs.copyFileSync(logoSrc, path.join(OUT, 'logo.png'))
console.log('[uTools] Copied logo.png (256x256)')

// 6. 打包为 zip 压缩包并存放到 file/ 目录
const FILE_DIR = path.join(ROOT, 'file')
if (!fs.existsSync(FILE_DIR)) {
  fs.mkdirSync(FILE_DIR, { recursive: true })
}
const zipName = `easyJSON_${version}_utools.zip`
const zipPath = path.join(FILE_DIR, zipName)

console.log(`[uTools] Archiving to file/${zipName}...`)
const isWin = process.platform === 'win32'
try {
  if (isWin) {
    execSync(`tar.exe -a -c -f "${zipPath}" -C "${OUT}" .`, { stdio: 'inherit' })
  } else {
    execSync(`cd "${OUT}" && zip -r "${zipPath}" ./*`, { stdio: 'inherit' })
  }
  const stat = fs.statSync(zipPath)
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2)
  console.log(`\x1b[32m[uTools] Successfully generated: file/${zipName} (${sizeMb} MB)\x1b[0m`)
} catch (err) {
  console.warn('[uTools] tar/zip failed, attempting PowerShell Compress-Archive...', err.message)
  if (isWin) {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' }
    )
  }
}

console.log('[uTools] Done! Output: utools-dist/ and file/' + zipName)
console.log('[uTools] Drag utools-dist/ into uTools developer tools to load, or install file/' + zipName)
