# easyJSON Windows 打包脚本
# 用法: 右键 → "使用 PowerShell 运行"  或 终端输入 .\build-win.ps1

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "=== easyJSON Windows 打包 ===" -ForegroundColor Cyan

# 1. 确保 MSVC 工具链
rustup default stable-x86_64-pc-windows-msvc 2>$null
rustup override set stable-x86_64-pc-windows-msvc --path . 2>$null
Write-Host "[1/5] Rust MSVC 工具链就绪" -ForegroundColor Green

# 2. 构建前端
Write-Host "[2/5] 构建前端..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

# 3. 编译 Tauri (Rust)
Write-Host "[3/5] 编译 Rust 后端..." -ForegroundColor Yellow
npm run tauri:build 2>&1 | Out-Null
$exitCode = $LASTEXITCODE

# 4. 如果缺 WebView2Loader.dll，补上后重试
if ($exitCode -ne 0) {
    Write-Host "[4/5] 修补 WebView2Loader.dll..." -ForegroundColor Yellow
    $dll = Get-ChildItem "$env:USERPROFILE\.cargo\registry" -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue | Where-Object { $_.Directory.Name -eq "x64" } | Select-Object -First 1
    if ($dll) {
        Copy-Item $dll.FullName "src-tauri\target\release\" -Force
        npm run tauri:build
    }
}

# 5. 完成
$installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($installer) {
    Write-Host "[5/5] 打包完成!" -ForegroundColor Green
    Write-Host "       $($installer.FullName)" -ForegroundColor White
} else {
    Write-Host "[warn] 未找到安装包，检查编译日志" -ForegroundColor Yellow
    Get-ChildItem "src-tauri\target\release\easy-json.exe" -ErrorAction SilentlyContinue
}
