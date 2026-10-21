#!/usr/bin/env bash
# Build release APKs for the unified SalonPro app (and, when asked, the legacy
# customer/admin builds for reproducing an older release).
#
#   bash scripts/build-mobile-apks.sh              # unified app (default)
#   bash scripts/build-mobile-apks.sh legacy        # old customer + admin apps
#   bash scripts/build-mobile-apks.sh customer      # old customer app only
#   bash scripts/build-mobile-apks.sh admin         # old admin app only
#   SALONPRO_API_BASE=https://salonpro.vercel.app bash scripts/build-mobile-apks.sh
#
# What it does, in order:
#   1. copies the shared mobile sources into each app (`sync-mobile-shared.sh`)
#   2. bakes the API address into `src/config.ts` when SALONPRO_API_BASE is set
#   3. makes sure the icon font ships in the APK
#   4. runs `./gradlew assembleRelease` and copies the APK to artifacts/
#
# Signed with the same debug keystore as the published 1.0.4/1.0.5 builds, so
# Android installs the update over the existing app and keeps local data.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/share/mise/installs/java/17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

TARGET="${1:-unified}"
WANT_UNIFIED=0
WANT_CUSTOMER=0
WANT_ADMIN=0
case "$TARGET" in
  unified) WANT_UNIFIED=1 ;;
  legacy) WANT_CUSTOMER=1; WANT_ADMIN=1 ;;
  customer) WANT_CUSTOMER=1 ;;
  admin) WANT_ADMIN=1 ;;
  all) WANT_UNIFIED=1; WANT_CUSTOMER=1; WANT_ADMIN=1 ;;
  *) echo "usage: bash scripts/build-mobile-apks.sh [unified|legacy|customer|admin|all]" >&2; exit 2 ;;
esac

BUILT=()

echo "── syncing shared sources"
bash "$ROOT/scripts/sync-mobile-shared.sh"

build_app() {
  local app_dir="$1" label="$2" slug_override="${3:-}"

  # The version in android/app/build.gradle is the single source of truth: it
  # becomes versionName (shown to Android), the APK's file name (which the
  # in-app updater parses), and APP_VERSION (shown in the UI).
  local version_name
  version_name="$(sed -nE 's/.*versionName "([^"]+)".*/\1/p' "$app_dir/android/app/build.gradle" | head -1)"
  if [ -z "$version_name" ]; then
    echo "!! $label: no versionName in android/app/build.gradle" >&2
    exit 1
  fi
  echo "── $label: version $version_name"
  python3 - "$app_dir/src/config.ts" "$version_name" <<'PY'
import pathlib, re, sys
path, version = pathlib.Path(sys.argv[1]), sys.argv[2]
text = path.read_text()
text = re.sub(r"export const APP_VERSION = '[^']*';", f"export const APP_VERSION = '{version}';", text)
path.write_text(text)
PY

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
  slug="${slug_override:-$(basename "$app_dir")}"
  out="$ROOT/artifacts/${slug}-${version_name}.apk"
  cp "$apk" "$out"
  BUILT+=("$out")
  printf '✅ %s → %s (%s)\n' "$label" "$out" "$(du -h "$out" | cut -f1)"
}

if [ "$WANT_UNIFIED" = 1 ]; then
  # Keep the `mobile-customer-` asset prefix for 2.0.0 so installed 1.0.5
  # customer builds can discover the unified APK through their updater.
  build_app "$ROOT/apps/mobile" "unified SalonPro app" "mobile-customer"
fi
if [ "$WANT_CUSTOMER" = 1 ]; then build_app "$ROOT/apps/mobile-customer" "legacy customer app"; fi
if [ "$WANT_ADMIN" = 1 ]; then build_app "$ROOT/apps/mobile-admin" "legacy admin app"; fi

echo
echo "Built:"
for apk in "${BUILT[@]}"; do echo "  $apk"; done
echo
echo "Install on a connected phone:"
echo "  adb install -r <apk>     (or: bash scripts/install-apks.sh)"
echo
echo "To publish an in-app update: upload these exact file names to a GitHub"
echo "release that is neither a draft nor a pre-release. Installed 1.0.4+ builds"
echo "will offer the install from inside the app."
