#!/usr/bin/env bash
# SalonPro server launcher — frees the port, then starts the Next.js API
# (the one address the unified app talks to).
#
#   bash scripts/serve.sh            # free :4000, build if needed, then start
#   PORT=4100 bash scripts/serve.sh  # use another port
#   SKIP_BUILD=1 bash scripts/serve.sh   # start the existing build untouched
#
# Use this instead of a bare `bun start` when you are not sure whether an older
# server is still running: it stops the stale one first instead of failing with
# EADDRINUSE. Run it in YOUR OWN terminal — servers started in the agent's
# background shells are killed whenever the environment restarts, which is what
# makes the phone app report "failed to fetch".
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4000}"

# --- 1. clear anything already holding the port ------------------------------
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
fi
# Stale servers (Next keeps a titled child process). The bracket keeps the
# pattern from matching this script's own command line.
pkill -f "[n]ext start"          >/dev/null 2>&1 || true
pkill -f "[n]ext-server"         >/dev/null 2>&1 || true
pkill -f "[s]alonpro/api"        >/dev/null 2>&1 || true

# Give the OS a moment to release the socket.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  ss -ltn 2>/dev/null | grep -q ":${PORT} " || break
  sleep 0.5
done

if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "ERROR: port ${PORT} is still held by:" >&2
  ss -ltnp 2>/dev/null | grep ":${PORT} " >&2 || true
  echo "Stop that process and re-run." >&2
  exit 1
fi

# --- 2. build when there is no usable build ----------------------------------
if [ "${SKIP_BUILD:-0}" != "1" ] && [ ! -f apps/next/.next/BUILD_ID ]; then
  echo "No Next.js build found — building (this takes a minute; Ctrl+C to skip"
  echo "and run 'bun run dev' for the fast dev server instead)."
  echo
  bash scripts/build-next.sh
  echo
fi

# --- 3. show the address the phone / APK talks to ----------------------------
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "SalonPro starting on port ${PORT}"
if [ -n "${LAN_IP:-}" ]; then
  echo "  API  on this PC    : http://127.0.0.1:${PORT}/api/health"
  echo "  API  on your phone : http://${LAN_IP}:${PORT}   <- what the APK calls"
  echo "                       (phone must be on the same Wi-Fi)"
else
  echo "  API  http://127.0.0.1:${PORT}/api/health"
fi
echo "  stop with Ctrl+C"
echo

# --- 4. start ----------------------------------------------------------------
PORT="$PORT" exec bun start
