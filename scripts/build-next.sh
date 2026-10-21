#!/usr/bin/env bash
# Build the SalonPro API — the same Next.js app that Vercel deploys.
#
#   bash scripts/build-next.sh
#
# scripts/serve.sh runs this automatically when there is no build yet.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "── building the Next.js API ────────────────────────────────────────"
bun --filter @salonpro/next build

echo
echo "Built. Start it with:  bun start        (or bash scripts/serve.sh)"
echo "  API   http://localhost:4000/api/health"
