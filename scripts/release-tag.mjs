import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// 1. 从 package.json 获取版本号
const pkgPath = path.join(ROOT, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const version = pkg.version

if (!version) {
  console.error('\x1b[31m[Git Tag] 错误：package.json 中未找到 version 字段！\x1b[0m')
  process.exit(1)
}

const tag = `v${version}`

console.log('==============================================')
console.log(`  easyJSON 发布 Tag 工具: ${tag}`)
console.log('==============================================\n')

// 2. 检查本地是否存在未提交的改动
try {
  const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' }).trim()
  if (status) {
    console.warn('\x1b[33m[警告] 检测到工作区有未提交的改动，建议先执行 git commit 提交改动后再打 Tag。\x1b[0m\n')
  }
} catch (e) {
  // 忽略 git status 检查异常
}

// 3. 检查本地是否已存在该 Tag
try {
  const existingTags = execSync(`git tag -l "${tag}"`, { cwd: ROOT, encoding: 'utf-8' }).trim()
  if (existingTags === tag) {
    console.log(`\x1b[33m[提示] 本地已存在 Tag "${tag}"，准备直接推送到远程...\x1b[0m`)
  } else {
    console.log(`▶ [1/2] 正在创建本地附注标签: git tag -a "${tag}" -m "Release ${tag}"`)
    execSync(`git tag -a "${tag}" -m "Release ${tag}"`, { cwd: ROOT, stdio: 'inherit' })
    console.log(`✔ 本地 Tag "${tag}" 创建成功！\n`)
  }
} catch (err) {
  console.error(`\x1b[31m[错误] 创建本地 Tag 失败: ${err.message}\x1b[0m`)
  process.exit(1)
}

// 4. 推送到远程 origin
console.log(`▶ [2/2] 正在推送到远程仓库: git push origin "${tag}"`)
try {
  execSync(`git push origin "${tag}"`, { cwd: ROOT, stdio: 'inherit' })
  console.log(`\n\x1b[32m✔ 成功将 Tag "${tag}" 推送到远程 origin！\x1b[0m`)
} catch (err) {
  console.error(`\n\x1b[31m❌ 推送 Tag 失败，请检查网络或远程权限: ${err.message}\x1b[0m`)
  process.exit(1)
}
