# easyJSON Windows build script
# Prerequisites: Rust GNU toolchain + MinGW-w64 on PATH

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== easyJSON Windows Build ===" -ForegroundColor Cyan

# 1. Verify toolchain
Write-Host "[1/4] Verifying toolchain..." -ForegroundColor Yellow
cargo --version 2>$null
if ($LASTEXITCODE -ne 0) { throw "Cargo not found. Install Rust with GNU toolchain." }
rustup default stable-x86_64-pc-windows-gnu 2>$null
Write-Host "       Toolchain ready" -ForegroundColor Green

# 2. Build frontend
Write-Host "[2/4] Building frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Write-Host "       Frontend built" -ForegroundColor Green

# 3. Build Tauri (Rust backend + bundler)
Write-Host "[3/4] Building Tauri app..." -ForegroundColor Yellow
npm run tauri:build
$exitCode = $LASTEXITCODE

# 4. Check result
if ($exitCode -eq 0) {
    $installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    $exe = Get-ChildItem "src-tauri\target\release\easy-json.exe" -ErrorAction SilentlyContinue
    if ($installer) {
        Write-Host "[4/4] Build complete!" -ForegroundColor Green
        Write-Host "       Installer: $($installer.FullName)" -ForegroundColor White
    } elseif ($exe) {
        Write-Host "[4/4] Build complete (exe only)" -ForegroundColor Green
        Write-Host "       Binary: $($exe.FullName)" -ForegroundColor White
    } else {
        Write-Host "[4/4] Build artifacts not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "[4/4] Build failed (exit code: $exitCode)" -ForegroundColor Red
}
