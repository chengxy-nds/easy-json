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
fs.copyFileSync(path.join(VSCODE_SRC, 'package.json'), path.join(OUT, 'package.json'))

if (fs.existsSync(path.join(VSCODE_SRC, 'media'))) {
  copyDir(path.join(VSCODE_SRC, 'media'), path.join(OUT, 'media'))
}

if (fs.existsSync(path.join(VSCODE_SRC, 'README.md'))) {
  fs.copyFileSync(path.join(VSCODE_SRC, 'README.md'), path.join(OUT, 'README.md'))
}

console.log('[VSCode Extension] Done! Output directory: vscode-dist/')
console.log('[VSCode Extension] To package as .vsix file, run: npx vsce package (inside vscode-dist/)')
