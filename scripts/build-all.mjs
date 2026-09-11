import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

console.log('==============================================')
console.log('  easyJSON 一键打包流程启动')
console.log('==============================================\n')

// 1. 打包 Chrome 插件 (跨平台通用)
console.log('▶ [1/2] 正在打包 Chrome 插件...')
try {
  execSync('node scripts/build-plugin.mjs', { cwd: ROOT, stdio: 'inherit' })
} catch (e) {
  console.error('❌ Chrome 插件打包失败')
  process.exit(1)
}

// 2. 依据当前宿主操作系统打包对应客户端
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

if (isWin) {
  console.log('\n▶ [2/2] 检测到当前为 Windows 系统，正在构建 Windows 安装包 (NSIS)...')
  try {
    execSync('npm run build:win', { cwd: ROOT, stdio: 'inherit' })
    console.log('\n\x1b[32m✔ 一键打包完成！产物已归档至根目录 file/ 文件夹下。\x1b[0m')
    console.log('\x1b[33m提示：macOS 安装包 (.dmg) 受苹果专有系统限制，需在 Mac 机器或通过 GitHub Actions 云端构建。\x1b[0m')
  } catch (e) {
    console.error('❌ Windows 安装包打包失败')
    process.exit(1)
  }
} else if (isMac) {
  console.log('\n▶ [2/2] 检测到当前为 macOS 系统，正在构建 macOS Universal DMG...')
  try {
    execSync('npm run build:mac:universal', { cwd: ROOT, stdio: 'inherit' })
    console.log('\n\x1b[32m✔ 一键打包完成！产物已归档至根目录 file/ 文件夹下。\x1b[0m')
    console.log('\x1b[33m提示：Windows 安装包 (.exe) 需在 Windows 机器或通过 GitHub Actions 云端构建。\x1b[0m')
  } catch (e) {
    console.error('❌ macOS DMG 安装包打包失败')
    process.exit(1)
  }
} else {
  console.log('\n\x1b[32m✔ 插件打包完成！当前非 Win/Mac 环境，跳过桌面端客户端打包。\x1b[0m')
}
