# SalonPro 2.0.0 — one app, three workspaces

The customer and salon-staff apps are now **one app**. Sign in with the same
mobile number; the server session decides which workspace opens:

- **Client** — book, visit history, wallet and offers, referrals, notifications.
- **Vendor** — owner, manager, receptionist and stylist screens. Tabs and action
  buttons are filtered by the role's permissions; the API enforces the same
  permissions on every request.
- **Platform** — a new console for the platform admin: overview, salons, vendors,
  audit log, salon creation, suspend/reactivate.

## Install

- **Existing customer app (`com.salonpro.app` 1.0.5):** the in-app updater offers
  2.0.0 automatically. The APK keeps the same signing certificate and the
  `mobile-customer-2.0.0.apk` asset name.
- **Existing admin app (`com.salonpro.admin` 1.0.5):** Android cannot replace a
  different package in place. Install this APK once manually, then sign in with
  the same phone number. The old admin package is retired.
- **Fresh install:** install `mobile-customer-2.0.0.apk` and sign in.

APK: 71,153,240 bytes · SHA-256 `b1dd1552abf47c02aab0d568e177af44cc103f011f900ec1eb2c398957d2f79d`

No database reset or re-registration is required. Existing salons, staff,
customers, wallets, bookings and audit history are unchanged.

## Server changes

- `salons` gains `status`, `plan`, `trialEndsAt`, `updatedAt`; schema version 2.
- Platform routes under `/api/platform` create a salon, first branch, invited
  owner, default settings and standard recharge offers in one transaction.
- Suspended salons are blocked when the session is resolved; platform admins keep
  access. Login attempts for a suspended salon return 401 and discard the token.
- `SessionUser` now includes `permissions` and `workspace`.

## Honest limitations

- The 1.0.5 → 2.0.0 in-app update path was built and signed for the installed
  updater but has not been exercised on a physical phone in this workspace
  (`adb devices` was empty). Confirm the native installer on a device before
  handing it to users.
- The APK is still a debug-signed sideload build, not a Play Store release.
- `super_admin` keeps the salon permission bundle temporarily so the existing
  admin routes remain usable. Audited support mode is future work.
- One salon per user in v1. Multi-salon membership is not built.
