#!/usr/bin/env bash
# Build release APKs for the customer and admin apps.
#
#   bash scripts/build-mobile-apks.sh            # both apps
#   bash scripts/build-mobile-apks.sh customer    # just one
#   SALONPRO_API_BASE=https://salonpro.vercel.app bash scripts/build-mobile-apks.sh
#
# What it does, in order:
#   1. copies the shared mobile sources into each app (`sync-mobile-shared.sh`)
#   2. bakes the API address into `src/config.ts` when SALONPRO_API_BASE is set
#   3. makes sure the icon font ships in the APK
#   4. runs `./gradlew assembleRelease` and copies the APK to artifacts/
#
# Signed with the debug keystore, which is what the reference project does: the
# APKs are for testing and sideloading, not for the Play Store.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/share/mise/installs/java/17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

TARGET="${1:-both}"
WANT_CUSTOMER=1
WANT_ADMIN=1
case "$TARGET" in
  customer) WANT_ADMIN=0 ;;
  admin) WANT_CUSTOMER=0 ;;
  both) ;;
  *) echo "usage: bash scripts/build-mobile-apks.sh [both|customer|admin]" >&2; exit 2 ;;
esac

echo "── syncing shared sources"
bash "$ROOT/scripts/sync-mobile-shared.sh"

build_app() {
  local app_dir="$1" label="$2"

  if [ -n "${SALONPRO_API_BASE:-}" ]; then
    echo "── $label: baking API address $SALONPRO_API_BASE"
    python3 - "$app_dir/src/config.ts" "$SALONPRO_API_BASE" <<'PY'
import pathlib, sys
path, base = pathlib.Path(sys.argv[1]), sys.argv[2].rstrip('/')
text = path.read_text()
lines = []
for line in text.splitlines():
    if line.startswith('export const BUILD_API_BASE'):
        line = f"export const BUILD_API_BASE = '{base}';"
    lines.append(line)
path.write_text('\n'.join(lines) + '\n')
PY
  fi

  echo "── $label: signing (debug keystore)"
  local keystore="$app_dir/android/app/debug.keystore"
  if [ ! -f "$keystore" ]; then
    # The React Native template signs release builds with the standard debug
    # keystore. A fresh clone may not have it, so recreate it exactly.
    keytool -genkeypair -v -keystore "$keystore" -storepass android -alias androiddebugkey \
      -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Android Debug,O=Android,C=US" >/dev/null
    echo "   created a fresh debug keystore for $label"
  fi

  echo "── $label: icon font"
  local fonts_dir="$app_dir/android/app/src/main/assets/fonts"
  mkdir -p "$fonts_dir"
  cp "$app_dir/node_modules/react-native-vector-icons/Fonts/MaterialIcons.ttf" "$fonts_dir/MaterialIcons.ttf"

  echo "── $label: assembling release (this takes a few minutes)"
  (cd "$app_dir/android" && ./gradlew --no-daemon assembleRelease)

  local apk="$app_dir/android/app/build/outputs/apk/release/app-release.apk"
  if [ ! -f "$apk" ]; then
    echo "!! $label: no APK at $apk" >&2
    exit 1
  fi

  mkdir -p "$ROOT/artifacts"
  local slug out
  slug="$(basename "$app_dir")"
  out="$ROOT/artifacts/${slug}-1.0.1.apk"
  cp "$apk" "$out"
  printf '✅ %s → %s (%s)\n' "$label" "$out" "$(du -h "$out" | cut -f1)"
}

if [ "$WANT_CUSTOMER" = 1 ]; then build_app "$ROOT/apps/mobile-customer" "customer app"; fi
if [ "$WANT_ADMIN" = 1 ]; then build_app "$ROOT/apps/mobile-admin" "admin app"; fi

echo
echo "Install on a connected phone:"
echo "  adb install -r artifacts/mobile-customer-1.0.1.apk"
echo "  adb install -r artifacts/mobile-admin-1.0.1.apk"
