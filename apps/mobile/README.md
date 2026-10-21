# SalonPro mobile app

The unified SalonPro app. One package (`com.salonpro.app`) and one APK, with
three workspaces selected from the server session:

- **Client** — booking, visit history, wallet/offers, referrals, notifications.
- **Vendor** — salon owner, manager, receptionist and stylist screens, filtered
  by `user.permissions`.
- **Platform** — cross-salon overview, salons, vendors and audit for
  `super_admin`.

The permission catalog lives in `packages/shared`; the API re-checks every
permission and tenant scope. A hidden tab or button is not security.

## Development

```bash
bun install
bun run typecheck
bun run test
```

Build the release APK from the repository root:

```bash
bash scripts/build-mobile-apks.sh unified
```

Output: `artifacts/mobile-customer-<version>.apk`. The `mobile-customer-` prefix
is kept for 2.0.0 so installed 1.0.5 customer updaters can discover it.

## Generated sources

`src/core/` and `src/shared/` are copied from `packages/shared` and
`apps/mobile-shared` by `scripts/sync-mobile-shared.sh`. Do not edit the copies;
edit the sources and re-run the script.

Architecture and release notes: `docs/UNIFIED-APP.md` and the root `README.md`.
