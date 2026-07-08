#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="ai-translate-chrome-plugin"
MANIFEST_PATH="public/manifest.json"
DIST_DIR="dist"
RELEASE_DIR="releases"

NODE_BIN="${NODE_BIN:-}"
NPM_BIN="${NPM_BIN:-}"

detect_command() {
  local preferred="$1"
  local fallback="$2"

  if [[ -n "$preferred" ]]; then
    echo "$preferred"
    return
  fi
  if command -v "$fallback" >/dev/null 2>&1; then
    command -v "$fallback"
    return
  fi
  if command -v "$fallback.exe" >/dev/null 2>&1; then
    command -v "$fallback.exe"
    return
  fi
  if command -v "$fallback.cmd" >/dev/null 2>&1; then
    command -v "$fallback.cmd"
    return
  fi

  echo "$fallback"
}

NODE_BIN="$(detect_command "$NODE_BIN" node)"
NPM_BIN="$(detect_command "$NPM_BIN" npm)"

usage() {
  cat <<EOF
Usage:
  bash scripts/release.sh [version]

Examples:
  bash scripts/release.sh
  bash scripts/release.sh 1.1.2
  bash scripts/release.sh v1.1.2
EOF
}

read_manifest_version() {
  "$NODE_BIN" -e "console.log(JSON.parse(require('fs').readFileSync('$MANIFEST_PATH', 'utf8')).version)"
}

normalize_version() {
  local raw="${1#v}"
  if [[ ! "$raw" =~ ^[0-9]+(\.[0-9]+){1,3}$ ]]; then
    echo "Invalid version: $1" >&2
    echo "Chrome extension versions should look like 1.1.2 or 1.1.2.0" >&2
    exit 1
  fi
  echo "$raw"
}

update_manifest_version() {
  local version="$1"
  "$NODE_BIN" - "$version" "$MANIFEST_PATH" <<'NODE'
const fs = require('fs')
const [version, manifestPath] = process.argv.slice(2)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
manifest.version = version
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
NODE
}

make_zip() {
  local zip_path="$1"
  rm -f "$zip_path"

  if command -v zip >/dev/null 2>&1; then
    (cd "$DIST_DIR" && zip -qr "../$zip_path" .)
    return
  fi

  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
      "Compress-Archive -Path '$DIST_DIR/*' -DestinationPath '$zip_path' -Force" >/dev/null
    return
  fi

  echo "Neither zip nor powershell.exe was found. Please install zip and retry." >&2
  exit 1
}

print_sha256() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file"
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command \
      "(Get-FileHash '$file' -Algorithm SHA256).Hash.ToLower() + '  $file'"
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "Manifest not found: $MANIFEST_PATH" >&2
  exit 1
fi

VERSION="$(read_manifest_version)"
if [[ $# -gt 0 ]]; then
  VERSION="$(normalize_version "$1")"
  echo "Updating $MANIFEST_PATH version to $VERSION"
  update_manifest_version "$VERSION"
fi

mkdir -p "$RELEASE_DIR"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies with npm ci"
  "$NPM_BIN" ci
fi

echo "Building extension for v$VERSION"
"$NPM_BIN" run build

BUILT_VERSION="$("$NODE_BIN" -e "console.log(JSON.parse(require('fs').readFileSync('$DIST_DIR/manifest.json', 'utf8')).version)")"
if [[ "$BUILT_VERSION" != "$VERSION" ]]; then
  echo "Built manifest version mismatch: expected $VERSION, got $BUILT_VERSION" >&2
  exit 1
fi

ZIP_PATH="$RELEASE_DIR/$APP_NAME-$VERSION.zip"
echo "Creating $ZIP_PATH"
make_zip "$ZIP_PATH"

echo
echo "Release package generated:"
echo "  $ZIP_PATH"

HASH="$(print_sha256 "$ZIP_PATH" || true)"
if [[ -n "${HASH:-}" ]]; then
  echo
  echo "SHA256:"
  echo "  $HASH"
fi
