# SalonPro 2.1.0 — evergreen redesign, global navigation, session-linked reviews

The look of the app changed, the bottom bar stopped disappearing, reviews are
attached to the visit instead of a form, and the update prompt is now ours
rather than Android's.

## Install

- **Existing app (2.0.2 and older):** the in-app updater offers 2.1.0 on the next
  launch, on returning to the app, or from **Check for updates**. The APK keeps
  the same signing certificate and the `mobile-customer-2.1.0.apk` asset name.
- **Fresh install:** install `mobile-customer-2.1.0.apk` and sign in.

APK: 71,162,964 bytes · SHA-256 `8a34ed24fcd7df8750a94894c7378ffdbcb50ecb0e61c15853353e0ebfff017f`

`versionCode 10` · `versionName 2.1.0` · package `com.salonpro.app` · signing
certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
(unchanged, so it installs over 2.0.2 without losing data).

No database reset or re-registration is required.

## What changed

### A new look

The hot-magenta theme is gone. The palette is evergreen over warm ivory with a
single terracotta spark, headings use a serif display face, and the whole app
moves: floating header orbs, spring press scaling on cards, buttons and chips,
and a slide-up sheet for every dialog. The app icon, the Android 12 splash and
the hosted page's favicon are the same monogram.

### The bottom bar never leaves

The bar is rendered by each stack's layout rather than by the tab navigator, so
it stays visible on a pushed appointment, a customer record, settings, a
walk-in form — everything. It highlights the tab the current screen belongs to
and jumps back to the tab shell when you tap another one.

### Reviews belong to a visit

The hosted page no longer asks for a name or a phone number.

- A signed-in customer gets a short-lived signed token for one completed visit
  (`POST /api/customer/reviews/link`); the app opens
  `/r/<salonId>?t=<token>` from the visit screen.
- The page shows **"Reviewing as <name>"**, and the server attaches the
  customer and the visit to the review. The token is checked against the
  session's own service record, and a second review of the same visit is
  refused.
- The vendor **Reviews** screen marks those reviews **Verified visit**.
- Reviews stay private to the salon team (owner, manager). Customers never see
  another customer's feedback, and the hosted page never lists reviews.
- A shared link without a token still works and is stored as anonymous
  feedback.

### Our own dialogs

The updater (update available, permission note, error, download progress) and
the customer dialogs (sign out, cancel a visit, wallet terms, coupon and
referral codes, delete-data) are SalonPro sheets instead of native Android
alerts. Android's package-installer confirmation at the end is still the
system's — that one needs device-owner privileges to replace.

### Fast access to each workspace

The sign-in screen asks the server whether developer sign-in is available and,
on a demo server, shows a **Demo access** card: enter the PIN (default `1234`,
or tap *Use 1234*) and tap **Platform**, **Salon owner**, **Client**, **Manager**
or **Reception**. The server picks the seeded account; the app never chooses a
role by itself. A production server has no default PIN — `DEV_LOGIN_PIN` has to
be set explicitly there, otherwise the route stays closed and the card is
hidden.

## Server changes

- Schema version **4**: `salon_reviews` gains `customerId` and `appointmentId`,
  with an index on each and a unique index on `appointmentId` (one review per
  visit). Existing rows are untouched.
- `POST /api/customer/reviews/link` — a signed-in customer asks for a review
  token for one of their completed visits.
- `GET/POST /api/public/reviews/:salonId` understand that token: they resolve
  the reviewer on the server, refuse a tampered or expired token, and never
  accept a caller-supplied name or phone.
- `POST /api/auth/dev-login` accepts a `role`, so a demo can open any
  workspace in one tap.
- `GET /api/auth/dev-mode` — a boolean that says whether developer sign-in
  exists on that server. The PIN is never sent to the app.

## Honest limitations

- The 2.0.2 → 2.1.0 in-app update path was verified against the published
  release (discovery, version comparison, digest) but the final install step
  has not been exercised on a device in this workspace — the Android emulator
  was removed to free disk. Confirm the installer once on a phone.
- Google reviews on the deployed salon are still off until the owner connects
  the salon's real Place ID. Without it, a 4–5★ rating is stored but no Google
  hand-off is offered.
- The APK is still a debug-signed sideload build, not a Play Store release.
- A few less-used vendor screens (appointments, refunds, reminders, attendance,
  role changes) still use Android's native `Alert`; the shared `AppSheet` is
  ready for them.
