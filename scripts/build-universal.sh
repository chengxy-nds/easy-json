#!/usr/bin/env bash
set -euo pipefail

# ─── easyJSON Universal macOS Build ───
# Builds a universal .app and .dmg (Intel x86_64 + Apple Silicon arm64)
#
# Usage:  npm run build:mac:universal
# Output: src-tauri/target/release/bundle/macos/easyJSON.app (universal)
#         src-tauri/target/release/bundle/dmg/easyJSON_*_universal.dmg

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_TAURI="$PROJECT_DIR/src-tauri"
APP="$SRC_TAURI/target/release/bundle/macos/easyJSON.app"
VERSION=$(cd "$PROJECT_DIR" && node -pe "require('./package.json').version")
DMG_OUT="$SRC_TAURI/target/release/bundle/dmg/easyJSON_${VERSION}_universal.dmg"

echo "========================================="
echo "  easyJSON Universal macOS Build"
echo "========================================="
echo ""

# ── Step 1: Check Rust targets ──────────────────────────────────
echo "▸ Checking Rust targets..."
source "$HOME/.cargo/env" 2>/dev/null || true
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  rustup target list --installed | grep -q "$target" || rustup target add "$target"
done
echo "  ✓ Rust targets ready"
echo ""

# ── Step 2: Tauri build (produces .app with default arch) ───────
echo "▸ Building frontend + bundling .app..."
cd "$PROJECT_DIR"
npm run build --silent
cd "$SRC_TAURI"
cargo build --release
echo "  ✓ .app bundled"
echo ""

# ── Step 3: Build for the other arch & merge ────────────────────
echo "▸ Building for Intel (x86_64)..."
cargo build --release --target x86_64-apple-darwin
echo "  ✓ x86_64 done"

echo "▸ Merging into universal binary..."
lipo -create \
  "$SRC_TAURI/target/release/easy-json" \
  "$SRC_TAURI/target/x86_64-apple-darwin/release/easy-json" \
  -output "$SRC_TAURI/target/release/easy-json-universal"

# Replace binary in .app
cp "$SRC_TAURI/target/release/easy-json-universal" "$APP/Contents/MacOS/easy-json"
codesign --force --sign - "$APP" 2>/dev/null || true
rm -f "$SRC_TAURI/target/release/easy-json-universal"
echo "  ✓ Universal binary installed in .app"
echo ""

# ── Step 4: Create DMG ──────────────────────────────────────────
echo "▸ Creating DMG (using srcfolder, macOS 26 compatible)..."

# Clean up any leftover mounts
hdiutil detach /Volumes/easyJSON 2>/dev/null || true
sleep 1

# Use srcfolder approach — avoids read-only mount issues on macOS 26
TMP_DIR="$(mktemp -d /tmp/easyjson_dmg_XXXXXX)"
mkdir -p "$TMP_DIR"
cp -R "$APP" "$TMP_DIR/"
rm -f "$DMG_OUT"

hdiutil create -srcfolder "$TMP_DIR" \
  -volname "easyJSON" \
  -format UDZO \
  -ov \
  "$DMG_OUT" 2>&1 | tail -1

rm -rf "$TMP_DIR"

echo ""
echo "========================================="
echo "  ✅ Build Complete"
echo "========================================="
echo ""
echo "  .app:  $APP"
file "$APP/Contents/MacOS/easy-json" | head -1 | sed 's/.*: /  arch:  /'
echo "  .dmg:  $DMG_OUT"
echo "  size:  $(du -h "$DMG_OUT" | cut -f1)"
echo ""
echo "  Supported: Intel + Apple Silicon"
echo "  Requires:  macOS 11.0 (Big Sur) and above"
