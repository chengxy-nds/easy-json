#!/usr/bin/env bash
set -euo pipefail

# ─── easyJSON Universal macOS Build ───
# Uses Tauri's native universal-apple-darwin target for:
#   - Dual-arch build (Intel + Apple Silicon)
#   - Proper recursive deep code signing
#   - Standard .app bundle + DMG with Applications symlink

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_TAURI="$PROJECT_DIR/src-tauri"
VERSION=$(cd "$PROJECT_DIR" && node -pe "require('./package.json').version")
DMG_OUT="$SRC_TAURI/target/universal-apple-darwin/release/bundle/dmg/easyJSON_${VERSION}_universal.dmg"
APP_OUT="$SRC_TAURI/target/universal-apple-darwin/release/bundle/macos/easyJSON.app"

echo "========================================="
echo "  easyJSON Universal macOS Build"
echo "========================================="
echo ""

# ── Step 1: Ensure Rust targets ──────────────────────────────────
echo "▸ Checking Rust targets..."
source "$HOME/.cargo/env" 2>/dev/null || true
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  rustup target list --installed | grep -q "$target" || rustup target add "$target"
done
echo "  ✓ Rust targets ready"
echo ""

# ── Step 2: Tauri universal build ────────────────────────────────
# This handles: npm build, dual-arch Rust compile, lipo merge,
# recursive deep codesign, .app bundle, and DMG creation.
node "$PROJECT_DIR/scripts/sync-version.mjs"
echo "▸ Running tauri build for universal-apple-darwin..."
cd "$PROJECT_DIR"
npx tauri build --target universal-apple-darwin 2>&1
echo ""

# ── Step 3: Verify output ────────────────────────────────────────
echo "========================================="
echo "  ✅ Build Complete"
echo "========================================="
echo ""
echo "  .app:  $APP_OUT"
file "$APP_OUT/Contents/MacOS/easy-json" 2>/dev/null | head -1 | sed 's/.*: /  arch:  /'
echo "  .dmg:  $DMG_OUT"
if [ -f "$DMG_OUT" ]; then
  echo "  size:  $(du -h "$DMG_OUT" | cut -f1)"
  mkdir -p "$PROJECT_DIR/file"
  cp "$DMG_OUT" "$PROJECT_DIR/file/easyJSON_${VERSION}_universal.dmg"
  echo "  copied to: file/easyJSON_${VERSION}_universal.dmg"
fi
echo ""
echo "  Supported: Intel + Apple Silicon"

