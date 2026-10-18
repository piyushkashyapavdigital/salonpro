#!/usr/bin/env bash
#
# Force a phone to re-issue the USB-debugging authorization prompt.
# Use this when `adb devices` shows "unauthorized" and no dialog appears.
#
#   bash scripts/fix-adb.sh
#
# It backs up ~/.android/adbkey, removes it so adb generates a NEW key, restarts
# the adb server, prints the on-phone steps, then waits for authorization.
#
set -euo pipefail

KEYDIR="$HOME/.android"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "==> [1/3] stopping adb server"
adb kill-server >/dev/null 2>&1 || true

if [ -f "$KEYDIR/adbkey" ]; then
  echo "==> [2/3] backing up old adb key (so you can restore it if needed)"
  cp -f "$KEYDIR/adbkey" "$KEYDIR/adbkey.bak-$STAMP"
  [ -f "$KEYDIR/adbkey.pub" ] && cp -f "$KEYDIR/adbkey.pub" "$KEYDIR/adbkey.pub.bak-$STAMP" || true
  echo "    saved: $KEYDIR/adbkey.bak-$STAMP"
  echo "    removing old key -> a brand new prompt will appear on the phone"
  rm -f "$KEYDIR/adbkey" "$KEYDIR/adbkey.pub"
else
  echo "==> [2/3] no existing adb key (adb will create one)"
fi

echo "==> [3/3] starting adb server with a fresh key"
adb start-server >/dev/null 2>&1 || true

cat <<'PHONE'

--------------------------------------------------------------------
 ON THE PHONE (vivo / Funtouch OS) — do all four:
   1. UNLOCK the screen and keep it awake.
   2. Pull down the notification shade, tap the USB notification,
      and choose "File transfer" / "Transfer files"
      (NOT "Charging only" — vivo won't prompt in charge-only mode).
   3. A dialog "Allow USB debugging?" should appear -> tap ALLOW
      and tick "Always allow from this computer".
   4. No dialog yet?  Settings -> System -> Developer options
        - toggle "USB debugging" OFF, then ON
        - (if present) toggle "USB debugging (Security settings)" ON
        - or tap "Revoke USB debugging authorizations", then replug
      Then unplug and replug the cable.
--------------------------------------------------------------------

PHONE

echo "Waiting for authorization (Ctrl-C to abort)..."
tries=0
until [ "$(adb get-state 2>/dev/null || true)" = "device" ]; do
  tries=$((tries + 1))
  if [ $((tries % 15)) -eq 0 ]; then
    echo "  still unauthorized — current status:"
    adb devices
  fi
  sleep 2
done

echo
echo "Authorized: $(adb devices | awk '/device$/{print $1; exit}')"
echo "Next: bash scripts/install-apks.sh"
