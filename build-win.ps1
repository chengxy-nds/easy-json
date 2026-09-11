# easyJSON Windows build script
# Prerequisites: Rust GNU toolchain + MinGW-w64 on PATH

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== easyJSON Windows Build ===" -ForegroundColor Cyan

# 1. Verify toolchain
Write-Host "[1/4] Verifying toolchain..." -ForegroundColor Yellow

# Ensure MinGW / windres is in PATH
if (-not (Get-Command windres -ErrorAction SilentlyContinue)) {
    $mingwCandidates = @(
        "C:\mingw64\mingw64\bin",
        "C:\mingw64\bin",
        "C:\msys64\mingw64\bin",
        "C:\Program Files\mingw-w64\x86_64-8.1.0-posix-seh-rt_v6-rev0\mingw64\bin"
    )
    foreach ($cand in $mingwCandidates) {
        if (Test-Path "$cand\windres.exe") {
            $env:PATH = "$cand;$env:PATH"
            Write-Host "       Added MinGW to PATH: $cand" -ForegroundColor Gray
            break
        }
    }
}

if (-not (Get-Command windres -ErrorAction SilentlyContinue)) {
    throw "windres.exe not found in PATH or standard MinGW directories. Please install MinGW-w64."
}

cargo --version 2>$null
if ($LASTEXITCODE -ne 0) { throw "Cargo not found. Install Rust with GNU toolchain." }
cmd /c "rustup default stable-x86_64-pc-windows-gnu 2>nul"
Write-Host "       Toolchain ready" -ForegroundColor Green

# 2. Build frontend & sync version
Write-Host "[2/4] Syncing version & building frontend..." -ForegroundColor Yellow
node scripts/sync-version.mjs
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Write-Host "       Frontend built" -ForegroundColor Green

# 3. Build Tauri (Rust backend + bundler)
Write-Host "[3/4] Building Tauri app..." -ForegroundColor Yellow
npm run tauri:build
$exitCode = $LASTEXITCODE

# 4. Check result
if ($exitCode -eq 0) {
    $installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $installer) {
        $installer = Get-ChildItem -Path "src-tauri\target" -Filter "*setup.exe" -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    }
    $exe = Get-ChildItem "src-tauri\target\release\easy-json.exe" -ErrorAction SilentlyContinue
    if ($installer) {
        Write-Host "[4/4] Build complete!" -ForegroundColor Green
        Write-Host "       Installer: $($installer.FullName)" -ForegroundColor White

        $fileDir = Join-Path $PSScriptRoot "file"
        if (-not (Test-Path $fileDir)) {
            New-Item -ItemType Directory -Force -Path $fileDir | Out-Null
        }
        $destPath = Join-Path $fileDir $installer.Name
        Copy-Item -Path $installer.FullName -Destination $destPath -Force
        Write-Host "       Copied to: file/$($installer.Name)" -ForegroundColor Cyan
    } elseif ($exe) {
        Write-Host "[4/4] Build complete (exe only)" -ForegroundColor Green
        Write-Host "       Binary: $($exe.FullName)" -ForegroundColor White
    } else {
        Write-Host "[4/4] Build artifacts not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "[4/4] Build failed (exit code: $exitCode)" -ForegroundColor Red
}
