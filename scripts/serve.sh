#!/usr/bin/env bash
# SalonPro API launcher — frees the port, then starts exactly one API server.
#
#   bash scripts/serve.sh            # free :4000, then start (Ctrl+C to stop)
#   PORT=4100 bash scripts/serve.sh  # use another port
#
# Use this instead of a bare `npm start` when you are not sure whether an older
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
# Stale `npm start` servers. The bracket keeps the pattern from matching this
# script's own command line.
pkill -f "[t]sx src/index.ts" >/dev/null 2>&1 || true
pkill -f "[s]alonpro/api"     >/dev/null 2>&1 || true

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

# --- 2. show the address the phone / APK talks to ----------------------------
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "SalonPro API starting on port ${PORT}"
if [ -n "${LAN_IP:-}" ]; then
  echo "  on this PC    : http://127.0.0.1:${PORT}"
  echo "  on your phone : http://${LAN_IP}:${PORT}   <- what the APK calls"
  echo "                  (phone must be on the same Wi-Fi)"
else
  echo "  http://127.0.0.1:${PORT}"
fi
echo "  stop with Ctrl+C"
echo

# --- 3. start ----------------------------------------------------------------
exec npm start
