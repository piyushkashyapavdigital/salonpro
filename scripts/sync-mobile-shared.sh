#!/usr/bin/env bash
# Copy the code the two mobile apps share into each app.
#
# Metro resolves modules relative to the app directory, and the apps are
# deliberately NOT Bun workspaces (hoisting React Native's native packages breaks
# Gradle's autolinking), so the shared sources are copied rather than linked.
#
#   bash scripts/sync-mobile-shared.sh
#
# Edit `apps/mobile-shared/src/**` or `packages/shared/src/**`, then re-run this.
# The generated copies carry a header saying so, and the build script runs this
# automatically before every APK.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="$ROOT/apps/mobile-shared/src"
APPS=("$ROOT/apps/mobile" "$ROOT/apps/mobile-customer" "$ROOT/apps/mobile-admin")

if [ ! -d "$SHARED" ]; then
  echo "apps/mobile-shared/src is missing — nothing to sync." >&2
  exit 1
fi

header() {
  local source="$1"
  printf '/* ------------------------------------------------------------------\n'
  printf ' * GENERATED FILE — do not edit here.\n'
  printf ' * Source: %s\n' "$source"
  printf ' * Re-run: bash scripts/sync-mobile-shared.sh\n'
  printf ' * ------------------------------------------------------------------ */\n'
}

for APP in "${APPS[@]}"; do
  if [ ! -d "$APP" ]; then
    echo "skipping $(basename "$APP") (not scaffolded yet)"
    continue
  fi

  # Domain types + formatters, shared with the API and the web app.
  mkdir -p "$APP/src/core"
  { header "packages/shared/src/index.ts"; cat "$ROOT/packages/shared/src/index.ts"; } > "$APP/src/core/index.ts"
  { header "packages/shared/src/format.ts"; cat "$ROOT/packages/shared/src/format.ts"; } > "$APP/src/core/format.ts"

  # The mobile UI/API layer.
  mkdir -p "$APP/src/shared"
  for file in "$SHARED"/*; do
    name="$(basename "$file")"
    { header "apps/mobile-shared/src/$name"; cat "$file"; } > "$APP/src/shared/$name"
  done

  # Shared jest setup: stand-ins for the native modules jest cannot load.
  { header "apps/mobile-shared/jest.setup.js"; cat "$ROOT/apps/mobile-shared/jest.setup.js"; } > "$APP/jest.setup.js"

  echo "synced → $(basename "$APP")/src/{core,shared} + jest.setup.js"
done
