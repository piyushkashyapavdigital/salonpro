#!/usr/bin/env bash
#
# Install the built SalonPro APKs on a USB-connected phone — one shot.
#
#   bash scripts/install-apks.sh
#
# It will:
#   1. restart adb (re-triggers the phone's "Allow USB debugging?" prompt)
#   2. wait until the phone shows as *authorized* (tap ALLOW on the phone)
#   3. install the customer app and the admin app (whichever are built)
#   4. check the local API is reachable on :4000
#
# Build the APKs first (if missing) with:
#   bash scripts/build-mobile-apks.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The newest signed release APK for each app (built by scripts/build-mobile-apks.sh).
newest_apk() {
  ls -1t artifacts/$1 2>/dev/null | head -1 || true
}
RN_CUSTOMER="$(newest_apk 'mobile-customer-*.apk')"
RN_ADMIN="$(newest_apk 'mobile-admin-*.apk')"

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb not found on PATH." >&2
  exit 1
fi

echo "==> [1/4] restarting adb (re-triggers the authorization prompt)"
adb kill-server >/dev/null 2>&1 || true
adb start-server  >/dev/null 2>&1 || true

echo
echo "==> [2/4] waiting for an *authorized* device"
echo "    >>> Tap ALLOW on the phone's 'Allow USB debugging?' dialog <<<"
tries=0
until [ "$(adb get-state 2>/dev/null || true)" = "device" ]; do
  tries=$((tries + 1))
  if [ $((tries % 15)) -eq 0 ]; then
    echo "    still waiting... current status:"
    adb devices
  fi
  sleep 2
done
echo "    phone ready: $(adb devices | awk '/device$/{print $1; exit}')"

install_one() {
  local apk="${1:-}" name="$2"
  echo
  if [ -n "$apk" ] && [ -f "$apk" ]; then
    echo "==> [3/4] installing $name"
    adb install -r "$apk"
  else
    echo "==> [3/4] skipping $name — not built yet"
  fi
}

install_one "$RN_CUSTOMER" "SalonPro (customer app)"
install_one "$RN_ADMIN" "SalonPro Admin (staff app)"

echo
echo "==> [4/4] API check (phone must reach this PC's LAN IP on whatever port the server prints)"
if curl -s -o /dev/null --max-time 4 http://localhost:4000/api/health; then
  echo "    API is up on :4000 — you're good to go"
else
  echo "    API NOT reachable on :4000 — start it with:  bash scripts/serve.sh"
fi

echo
echo "Done. Look for the 'SalonPro' and 'SalonPro Admin' icons on the phone."
