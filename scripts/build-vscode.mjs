import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const VSCODE_SRC = path.join(ROOT, 'vscode-extension')
const OUT = path.join(ROOT, 'vscode-dist')

console.log('[VSCode Extension] Building frontend...')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

if (fs.existsSync(OUT)) {
  try {
    fs.rmSync(OUT, { recursive: true, force: true })
  } catch (e) {
    if (fs.existsSync(path.join(OUT, 'dist'))) {
      try { fs.rmSync(path.join(OUT, 'dist'), { recursive: true, force: true }) } catch (err) {}
    }
  }
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

console.log('[VSCode Extension] Copying web dist into vscode-dist/dist...')
copyDir(DIST, path.join(OUT, 'dist'))

// Copy system official logo into media & dist
const logoSrc = path.join(ROOT, 'public', 'icons', 'icon-256.png')
fs.mkdirSync(path.join(OUT, 'media'), { recursive: true })
fs.copyFileSync(logoSrc, path.join(OUT, 'media', 'logo.png'))
fs.copyFileSync(logoSrc, path.join(OUT, 'dist', 'logo.png'))

// Clean index.html (remove external telemetry & canonicals)
const indexPath = path.join(OUT, 'dist', 'index.html')
let html = fs.readFileSync(indexPath, 'utf-8')
html = html.replace(/<script>[^<]*hm\.baidu\.com[^<]*<\/script>\s*/g, '')
html = html.replace(/<script[^>]*src="[^"]*51\.la[^"]*"[^>]*><\/script>\s*/g, '')
html = html.replace(/<script>[^<]*LA\.init[^<]*<\/script>\s*/g, '')
html = html.replace(/ crossorigin/g, '')
html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '')
html = html.replace(/<meta property="og:[^>]*>\s*/g, '')
fs.writeFileSync(indexPath, html, 'utf-8')

console.log('[VSCode Extension] Copying extension.js & package.json...')
fs.copyFileSync(path.join(VSCODE_SRC, 'extension.js'), path.join(OUT, 'extension.js'))

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version || '1.0.0'

const vsPkg = JSON.parse(fs.readFileSync(path.join(VSCODE_SRC, 'package.json'), 'utf-8'))
vsPkg.version = version
vsPkg.name = 'easyjson'
vsPkg.displayName = `easyJSON v${version} - 智能JSON格式化与对比`
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(vsPkg, null, 2) + '\n', 'utf-8')

if (fs.existsSync(path.join(VSCODE_SRC, 'media'))) {
  copyDir(path.join(VSCODE_SRC, 'media'), path.join(OUT, 'media'))
}

if (fs.existsSync(path.join(VSCODE_SRC, 'README.md'))) {
  fs.copyFileSync(path.join(VSCODE_SRC, 'README.md'), path.join(OUT, 'README.md'))
}

// 6. 打包为 .vsix 和 .zip 存放到 file/ 目录
const FILE_DIR = path.join(ROOT, 'file')
if (!fs.existsSync(FILE_DIR)) {
  fs.mkdirSync(FILE_DIR, { recursive: true })
}

const vsixName = `easyJSON_${version}_vscode.vsix`
const vsixPath = path.join(FILE_DIR, vsixName)
console.log(`[VSCode Extension] Packaging to file/${vsixName}...`)
try {
  execSync(`npx -y @vscode/vsce package --no-dependencies --allow-missing-repository -o "${vsixPath}"`, { cwd: OUT, stdio: 'inherit' })
  const stat = fs.statSync(vsixPath)
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2)
  console.log(`\x1b[32m[VSCode Extension] Successfully generated: file/${vsixName} (${sizeMb} MB)\x1b[0m`)
} catch (err) {
  console.warn('[VSCode Extension] vsce package failed, skipping .vsix...', err.message)
}

const zipName = `easyJSON_${version}_vscode.zip`
const zipPath = path.join(FILE_DIR, zipName)
console.log(`[VSCode Extension] Archiving to file/${zipName}...`)
const isWin = process.platform === 'win32'
try {
  if (isWin) {
    execSync(`tar.exe -a -c -f "${zipPath}" -C "${OUT}" .`, { stdio: 'inherit' })
  } else {
    execSync(`cd "${OUT}" && zip -r "${zipPath}" ./*`, { stdio: 'inherit' })
  }
  const stat = fs.statSync(zipPath)
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2)
  console.log(`\x1b[32m[VSCode Extension] Successfully generated: file/${zipName} (${sizeMb} MB)\x1b[0m`)
} catch (err) {
  console.warn('[VSCode Extension] zip archiving failed:', err.message)
}

console.log('[VSCode Extension] Done! Output: vscode-dist/ and file/')
