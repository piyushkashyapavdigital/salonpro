#!/usr/bin/env bash
# Build the deployable server: the customer/admin SPA, then the Next.js app
# that serves both the API and that SPA from one origin.
#
#   bash scripts/build-next.sh
#
# Vercel does this itself on deploy (Root Directory = apps/next); this script is
# for local production runs (`scripts/serve.sh`) and for verifying the build
# before pushing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "── 1/3  building the SPA (served at /app) ──────────────────────────"
VITE_BASE=/app/ npm --workspace @salonpro/web run build

echo "── 2/3  copying it into the Next app ───────────────────────────────"
rm -rf apps/next/public/site
mkdir -p apps/next/public
cp -r apps/web/dist apps/next/public/site

echo "── 3/3  building the Next.js server ────────────────────────────────"
npm --workspace @salonpro/next run build

echo
echo "Built. Start it with:  npm start        (or bash scripts/serve.sh)"
echo "  API   http://localhost:4000/api/health"
echo "  Web   http://localhost:4000/app"
