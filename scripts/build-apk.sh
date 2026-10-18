#!/usr/bin/env bash
#
# Build a debug APK of SalonPro and (optionally) install it on a USB-connected
# Android phone.
#
# Usage:
#   bash scripts/build-apk.sh                 # customer app  (com.salonpro.app)   + install
#   bash scripts/build-apk.sh admin           # admin app     (com.salonpro.admin) + install
#   bash scripts/build-apk.sh admin --no-install
#   API_BASE=http://192.168.1.34:4000 bash scripts/build-apk.sh admin
#
# Two apps, one web codebase:
#   customer -> apps/web/dist          (landing + customer app + dashboard)
#   admin    -> apps/web/dist-admin    (dashboard only; built with VITE_APP_MODE=admin)
#
# Requirements (already present on this machine):
#   - JDK 17            ($HOME/.local/share/mise/installs/java/17)
#   - Android SDK       ($HOME/Android/Sdk : platform-tools, platforms;android-34, build-tools;34.0.0)
#   - Gradle 8.2.1      (/tmp/opencode/gradle-8.2.1/bin/gradle)
#   - adb + a phone with USB debugging enabled (for install)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="customer"
DO_INSTALL=1
for arg in "$@"; do
  case "$arg" in
    customer|admin) TARGET="$arg" ;;
    --no-install)   DO_INSTALL=0 ;;
    -h|--help)      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

case "$TARGET" in
  customer)
    APP_NAME="SalonPro"
    APP_ID="com.salonpro.app"
    APP_DIR="apps/web"
    ANDROID_DIR="apps/web/android"
    BUILD_CMD=(npm run build)
    ;;
  admin)
    APP_NAME="SalonPro Admin"
    APP_ID="com.salonpro.admin"
    APP_DIR="apps/admin"
    ANDROID_DIR="apps/admin/android"
    BUILD_CMD=(npm run build:admin)
    ;;
esac

JAVA_HOME="${JAVA_HOME:-$HOME/.local/share/mise/installs/java/17}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
GRADLE="${GRADLE:-/tmp/opencode/gradle-8.2.1/bin/gradle}"
export JAVA_HOME ANDROID_HOME
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"

if [ ! -x "$GRADLE" ]; then
  echo "ERROR: gradle not found at $GRADLE (set GRADLE=/path/to/gradle)" >&2
  exit 1
fi

# The APK talks to the API over Wi-Fi, so bake in this machine's LAN address.
LAN_IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -1)"
API_BASE="${API_BASE:-http://$LAN_IP:4000}"

echo "=============================================="
echo " SalonPro -> Android APK"
echo " target      : $TARGET  ($APP_NAME)"
echo " package     : $APP_ID"
echo " API base    : $API_BASE"
echo " (phone must be on the same Wi-Fi as this PC)"
echo "=============================================="

echo
echo "==> [1/5] npm install"
npm install

echo
echo "==> [2/5] build web bundle"
# VITE_DISABLE_PWA: a packaged WebView loads from local assets, so the service
# worker is skipped here. The plain `npm run build` (web/PWA) keeps it.
VITE_DISABLE_PWA=1 VITE_API_BASE="$API_BASE" "${BUILD_CMD[@]}"

echo
echo "==> [3/5] cap sync android"
( cd "$APP_DIR" && npx cap sync android )

echo
echo "==> [4/5] gradle assembleDebug"
echo "sdk.dir=$ANDROID_HOME" > "$ANDROID_DIR/local.properties"
( cd "$ANDROID_DIR" && "$GRADLE" assembleDebug --console=plain )

APK="$ROOT/$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
echo
echo "==> APK built:"
ls -la "$APK"

if [ "$DO_INSTALL" = "1" ]; then
  echo
  echo "==> [5/5] adb install"
  if command -v adb >/dev/null 2>&1 && adb get-state >/dev/null 2>&1; then
    adb install -r "$APK"
    echo "Installed. Launch '$APP_NAME' from the phone's app drawer."
  else
    echo "No device detected. Connect the phone (USB debugging ON), then run:"
    echo "  adb install -r \"$APK\""
  fi
else
  echo
  echo "==> [5/5] skipped install (--no-install)"
  echo "Install later with:"
  echo "  adb install -r \"$APK\""
fi

echo
echo "Done."
