import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const FILE_DIR = path.join(ROOT, 'file')

// 1. 读取 package.json 获取版本号
const pkgPath = path.join(ROOT, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const version = pkg.version || '1.0.0'
const releaseTitle = `EasyJSON v${version}`
const tag = `v${version}`

console.log('====================================================')
console.log(`  EasyJSON 发版发布工具 (${releaseTitle})`)
console.log('====================================================\n')

// 自动同步版本号到 src-tauri/tauri.conf.json 和 src-tauri/Cargo.toml，防止版本错位
const syncVersions = (ver) => {
  const tauriConfPath = path.join(ROOT, 'src-tauri', 'tauri.conf.json')
  if (fs.existsSync(tauriConfPath)) {
    try {
      const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'))
      if (tauriConf.version !== ver) {
        tauriConf.version = ver
        fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8')
        console.log(`\x1b[32m✔ [版本同步] 已自动同步 tauri.conf.json 版本为 ${ver}\x1b[0m`)
      }
    } catch (e) {}
  }

  const cargoPath = path.join(ROOT, 'src-tauri', 'Cargo.toml')
  if (fs.existsSync(cargoPath)) {
    try {
      const cargoContent = fs.readFileSync(cargoPath, 'utf-8')
      const updated = cargoContent.replace(/version\s*=\s*"[^"]+"/, `version = "${ver}"`)
      if (updated !== cargoContent) {
        fs.writeFileSync(cargoPath, updated, 'utf-8')
        console.log(`\x1b[32m✔ [版本同步] 已自动同步 Cargo.toml 版本为 ${ver}\x1b[0m`)
      }
    } catch (e) {}
  }
}

syncVersions(version)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve))

const askReleaseNotes = () => {
  return new Promise((resolve) => {
    console.log(`\n\x1b[36m请输入本次 ${releaseTitle} 的升级点/更新说明：\x1b[0m`)
    console.log('\x1b[90m(支持输入多行，直接回车换行；输入完毕后另起一行输入 "EOF" 或连续按两次回车提交)\x1b[0m\n')

    const lines = []
    let lastLineEmpty = false

    rl.setPrompt('📝 ')
    rl.prompt()

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (trimmed.toUpperCase() === 'EOF') {
        finishInput()
        return
      }

      if (trimmed === '') {
        if (lastLineEmpty && lines.length > 0) {
          finishInput()
          return
        }
        lastLineEmpty = true
        lines.push('')
      } else {
        lastLineEmpty = false
        lines.push(line)
      }
      rl.prompt()
    })

    const finishInput = () => {
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop()
      }
      const content = lines.join('\n').trim()
      resolve(content || '优化体验与功能改进')
    }
  })
}

async function main() {
  // 1. 询问是否在本地同步打包
  const buildAnswer = await askQuestion(
    '\x1b[33m❓ 是否在本地同步编译打包安装包与插件？\x1b[0m\n' +
    '   [1] 否 (直接推送到 GitHub 发版，速度最快) [默认]\n' +
    '   [2] 是 (在本地编译并打包文件到 file/ 目录)\n' +
    '请输入选项 [1/2] (直接回车默认选 1): '
  )

  const shouldBuild = buildAnswer.trim() === '2' || buildAnswer.trim().toLowerCase() === 'y'

  // 2. 交互录入升级点
  const notes = await askReleaseNotes()
  rl.close()

  console.log('\n----------------------------------------------------')
  console.log('\x1b[32m✔ 已记录本次升级点：\x1b[0m')
  console.log(notes)
  console.log('----------------------------------------------------\n')

  // 3. 根据用户选择执行打包
  if (shouldBuild) {
    if (!fs.existsSync(FILE_DIR)) {
      fs.mkdirSync(FILE_DIR, { recursive: true })
    }

    console.log('▶ [1/3] 正在本地打包 Chrome 插件...')
    try {
      execSync('node scripts/build-plugin.mjs', { cwd: ROOT, stdio: 'inherit' })
    } catch (e) {
      console.error('❌ Chrome 插件打包失败')
      process.exit(1)
    }

    const isWin = process.platform === 'win32'
    const isMac = process.platform === 'darwin'

    if (isWin) {
      console.log(`\n▶ [2/3] 当前为 Windows 环境，正在编译 Windows 安装包 (easyJSON_${version}_x64-setup.exe)...`)
      try {
        execSync('npm run build:win', { cwd: ROOT, stdio: 'inherit' })
      } catch (e) {
        console.error('❌ Windows 安装包构建失败')
        process.exit(1)
      }
    } else if (isMac) {
      console.log(`\n▶ [2/3] 当前为 macOS 环境，正在编译 macOS Universal DMG (easyJSON_${version}_universal.dmg)...`)
      try {
        execSync('npm run build:mac:universal', { cwd: ROOT, stdio: 'inherit' })
      } catch (e) {
        console.error('❌ macOS DMG 构建失败')
        process.exit(1)
      }
    }

    console.log('\n▶ [3/3] 检查 file/ 目录就绪状态：')
    const expectedFiles = [
      `easyJSON_${version}_plugin.zip`,
      `easyJSON_${version}_x64-setup.exe`,
      `easyJSON_${version}_universal.dmg`
    ]
    expectedFiles.forEach((file) => {
      const fPath = path.join(FILE_DIR, file)
      if (fs.existsSync(fPath)) {
        const mb = (fs.statSync(fPath).size / (1024 * 1024)).toFixed(2)
        console.log(`  \x1b[32m✔ [就绪]\x1b[0m ${file} (${mb} MB)`)
      } else {
        console.log(`  \x1b[33m- [未就绪]\x1b[0m ${file} (可在对应系统上生成或拷入)`)
      }
    })
  } else {
    console.log('\x1b[36m⏩ 已跳过本地编译打包，直接进行 GitHub 发版...\x1b[0m')
  }

  // 4. 打 Git Tag 并推送到远程
  console.log(`\n▶ 正在创建 Git Tag: ${tag}...`)
  try {
    const existingTags = execSync(`git tag -l "${tag}"`, { cwd: ROOT, encoding: 'utf-8' }).trim()
    if (existingTags === tag) {
      console.log(`\x1b[33m[提示] 本地已存在 Tag "${tag}"，准备直接推送到远程...\x1b[0m`)
    } else {
      const tagMessage = `${releaseTitle}\n\n${notes}`
      execSync(`git tag -a "${tag}" -m "${tagMessage.replace(/"/g, '\\"')}"`, { cwd: ROOT, stdio: 'inherit' })
      console.log(`\x1b[32m✔ 本地 Tag "${tag}" 创建成功！\x1b[0m`)
    }

    console.log(`▶ 正在推送 Tag 到远程仓库: git push origin "${tag}"`)
    try {
      execSync(`git push origin "${tag}"`, { cwd: ROOT, stdio: 'inherit', timeout: 30000 })
      console.log(`\x1b[32m✔ 成功将 Tag "${tag}" 推送到远程！\x1b[0m`)
    } catch (pushErr) {
      console.warn(`\x1b[33m[提示] 推送 Tag 到远程超时或网络波动，后续可手动执行: git push origin "${tag}"\x1b[0m`)
    }
  } catch (err) {
    console.warn(`\x1b[33m[提示] Git Tag 处理跳过: ${err.message}\x1b[0m`)
  }

  // 5. 自动在浏览器打开 GitHub Release 页面并预填标题与更新内容
  const encodedTitle = encodeURIComponent(releaseTitle)
  const encodedBody = encodeURIComponent(notes)
  const newReleaseUrl = `https://github.com/chengxy-nds/easy-json/releases/new?tag=${tag}&title=${encodedTitle}&body=${encodedBody}`

  console.log('\n====================================================')
  console.log(`\x1b[32m🎉 发版流程已就绪！\x1b[0m`)
  console.log(`Release 标题: \x1b[36m${releaseTitle}\x1b[0m`)
  console.log(`Release 链接: \x1b[34m${newReleaseUrl}\x1b[0m`)
  console.log('====================================================\n')

  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  try {
    if (shouldBuild && fs.existsSync(FILE_DIR)) {
      if (isWin) execSync(`explorer "${FILE_DIR}"`, { stdio: 'ignore' })
      else if (isMac) execSync(`open "${FILE_DIR}"`, { stdio: 'ignore' })
    }
    if (isWin) execSync(`start "" "${newReleaseUrl}"`, { stdio: 'ignore' })
    else if (isMac) execSync(`open "${newReleaseUrl}"`, { stdio: 'ignore' })
  } catch (e) {}

  console.log('✔ 已自动打开浏览器 GitHub Release 发版页面，标题与升级内容已预填！\n')
}

main().catch((err) => {
  console.error('发版异常:', err)
  process.exit(1)
})
