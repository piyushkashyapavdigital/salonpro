# SalonPro

A salon platform with **one API** and **one React Native app** that opens three
role-based workspaces: platform admin → salon vendors (owner, manager, reception,
stylist) → clients. A playful, high-contrast interface — hot-magenta over warm
cream, candy accents, rounded white cards, bottom tab navigation — shipped as one
installable APK that talks to one Next.js API.

> **Honesty first.** This deployment runs Razorpay in **simulated** mode and OTP
> in **development mock** mode until real keys are provided. When nothing is
> configured, the app **never** claims a payment was charged, an OTP was sent, or
> a WhatsApp/push message was delivered. `/api/health` reports the true state.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | **Next.js 16 App Router** (`apps/next`) — one catch-all route handler dispatches into `packages/core` | Deploys to Vercel with no separate server and **no Express anywhere**; one warm function, one database pool |
| Mobile | **React Native 0.87** (`apps/mobile`) + React Navigation 7 | One APK, three workspaces chosen from the server session; native navigation, AsyncStorage sessions and one shared UI kit. Frozen 1.0.5 reference builds live in `apps/mobile-customer` and `apps/mobile-admin` |
| DB | **Postgres** — Neon (`pg`) in production, **PGlite** (Postgres in WASM) locally and in tests | One SQL dialect everywhere; the test suite needs no database server |
| Validation | `zod` | One schema per boundary |
| Scheduling | Vercel Cron (2 daily jobs, free-tier limit) + an in-process sweep on API traffic + a GitHub Actions workflow for brute-force retries | Reminders go out without a second server |
| Tooling | **Bun** — package manager, runtime and test runner | One tool for install, scripts and tests; no npm/yarn/pnpm and no Node needed |

Money is stored as **integer paise** everywhere. The wallet is an **append-only
ledger**; balances are always derived from the sum of posted rows — the
`wallets` table has no balance column at all.

### One database, two drivers

`packages/core/src/db.ts` owns the connection. It picks the driver from
`DATABASE_URL`:

| `DATABASE_URL` | Driver | Used for |
|---|---|---|
| `postgresql://…` | `pg` `Pool` against Neon | production / staging |
| `pglite:memory:` | PGlite, in-memory | the test suite |
| `pglite:file:<dir>` | PGlite, file-backed | local dev without a server |

The rest of the codebase keeps writing SQLite-flavoured SQL (`?` placeholders,
camelCase columns). `toPg()` translates it at the driver boundary — `?` → `$n`,
and camelCase / `timestamp` identifiers are quoted so Postgres preserves their
case. `one/all/run/scalar/tx` are async; `tx()` opens a real transaction, joins
the caller's transaction when nested, and uses `AsyncLocalStorage` so every
statement inside a request runs on the transaction's own connection.

`migrate()` runs the (idempotent) schema statement by statement and is called on
boot, so a fresh Neon database becomes usable on the first `bun start`.


---

## Design system

One theme drives the unified app. It lives in `apps/mobile-shared/src/theme.ts`
(tokens) and `apps/mobile-shared/src/components.tsx` (the kit), and is copied
into the app so the three workspaces cannot drift apart.

| Token | Meaning |
|---|---|
| `colors.brand*` | Hot-magenta accent (`#FF2E88` core) — primary buttons, active tabs, badges, charts |
| `colors.canvas` / `colors.ink*` | The warm-cream app canvas (`#FFF7F2`) over warm plum-ink neutrals — `ink100` the hairline border, `300`–`500` muted text, `700`–`950` headings and numbers |
| `colors.mint` / `amber` / `rose` / `sky` | Success / warning / danger / info |
| `colors.lilac` / `coral` / `lemon` / `grape` / `accents` | The candy accents that give cards and quick actions some colour |
| `gradients` | Hero gradients — `header` is violet→magenta (the home/overview hero), `primary` the button fill |
| `space()`, `radius`, `font`, `shadow` | One spacing scale, generous rounded-card radii, the soft plum-tinted card shadow |
| `statusColors()` / `STATUS_LABEL` | Every appointment/payment status colour and label in one place |

The kit is plain React over `StyleSheet` — no NativeWind, no Reanimated, no CSS
runtime — so an Android build needs no NDK/CMake toolchain. The unified app uses
React Navigation 7 with a bottom tab bar over the same `Screen`,
`GradientHeader`, `Card`, `Button`, `Field`, `Chip`, `Banner`, `Badge`, `Empty`,
`Loading`, `StatTile` and `Avatar` primitives.

Every screen sits inside an error boundary, so a crash shows a readable card
with a reload button instead of a blank white screen.

---

## Quick start

Requires **[Bun](https://bun.sh) ≥ 1.2** — the whole repo uses Bun as the package
manager and runtime; Node, npm, yarn and pnpm are not needed.

```bash
bun install
bun run seed:reset          # create + populate the demo database
bun run dev                 # API on :4000
```

With no `DATABASE_URL` the API uses a file-backed PGlite database under
`data/`, so this works with **no database server installed**. Check it with:

```bash
curl -s localhost:4000/api/health
```

Single-process production mode:

```bash
bun run build               # builds the Next.js API
bun start                   # migrates the database, then serves on :4000
```

If you are not sure whether an older server is still running, use the launcher
instead of a bare `bun start` — it stops the stale one first, then starts a
single fresh server, so it never fails with `EADDRINUSE`:

```bash
bash scripts/serve.sh       # frees :4000, prints the phone URL, then starts
```

---

## Neon database

Put the connection string in `.env` **in quotes** — an unquoted URL loses
everything after the first `&`, because the shell splits it:

```bash
DATABASE_URL='postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
```

```bash
bun start        # creates the schema on boot if it is missing, then serves
```

`bun start` calls `migrate()`, so pointing the app at an empty Neon database and
starting it is all the setup there is. Verify with the health endpoint:

```bash
curl -s localhost:4000/api/health      # → { ok, integrations: {…}, database: "postgres" }
```

> **Demo data vs. a live salon.** `bun run seed:reset` is for local demos only:
> it **drops every table** and fills the database with sample customers,
> appointments and payments. Never run it against a real salon's database.
> For a real one use the bootstrap below, which creates a clean salon and
> nothing else.

### Bootstrapping a live salon (no demo data)

Creates one salon, one owner, one branch and the three standard recharge offers
(₹500→₹550, ₹1000→₹1150, ₹2000→₹2400) — **no customers, appointments, wallets or
payments**:

```bash
BOOTSTRAP_OWNER_PHONE=9812345678 \
BOOTSTRAP_OWNER_NAME="Deepa Menon" \
BOOTSTRAP_SALON_NAME="Blush Studio" \
BOOTSTRAP_ADDRESS="12 MG Road, Bengaluru" \
bun run seed:bootstrap
```

| Variable | Required | Default |
|---|---|---|
| `BOOTSTRAP_OWNER_PHONE` | yes | — (the mobile number the owner signs in with) |
| `BOOTSTRAP_OWNER_NAME` | no | `Salon Owner` |
| `BOOTSTRAP_SALON_NAME` | no | `SalonPro` |
| `BOOTSTRAP_ADDRESS` | no | `Address not set — update it in Settings` |
| `BOOTSTRAP_CONTACT` | no | — |
| `BOOTSTRAP_BRANCH` | no | `<salon name> — Main branch` |

Environment variables are the supported route because `bun run` swallows
unknown `--flags`. To pass flags instead, call the CLI directly:

```bash
BOOTSTRAP_OWNER_PHONE=9812345678 bun run seed:bootstrap   # optional: BOOTSTRAP_OWNER_NAME=… BOOTSTRAP_SALON_NAME=…
```

Running it twice is safe: if a salon already exists it does nothing. The owner
then signs in with OTP from the app's vendor workspace and adds services, staff and branches. A platform admin can also create the salon from the platform console.

---

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Runs the API (Next.js dev server) on `:4000` |
| `bun run seed` | Seeds the demo data into an **empty** database |
| `bun run seed:reset` | Drops everything and reseeds the demo data (local only) |
| `bun run seed:bootstrap` | Creates a clean live salon — no demo data. See [Neon database](#neon-database) |
| `bun run build` | Builds the Next.js API (`apps/next`) |
| `bun start` | Runs the API (migrates the database, then serves on `:4000`) |
| `bash scripts/serve.sh` | Kills a stale server on `:4000`, builds if needed, prints the phone URL, then starts |
| `bun run typecheck` | TypeScript for the API packages (tests included) |
| `bun run test` | Everything: shared + core + Next parity |
| `bun run test:api` | Core suite (database, routes, journeys, integrations) |
| `bun run test:next` | The Next.js deployment surface (parity, cron auth, path handling) |
| `bun run test:smoke` | Just the end-to-end journeys |
| `bun run mobile:sync` | Copy `apps/mobile-shared/src` into the React Native apps |
| `bun run mobile:apks` | Build the unified release APK into `artifacts/` |
| `bun run mobile:install` | Install the built APK over USB (`adb`) |
| `cd apps/mobile && bun run test` | The unified app's jest smoke test: renders the whole app and unmounts it |
| `cd apps/mobile && bunx tsc --noEmit` | Typecheck the unified app, tests included |

## Android app — React Native, one icon, one API

The phones the salon actually uses run **one native React Native app** against
the SalonPro API. After sign-in the server session decides which workspace
opens:

| Workspace | Roles | What they see |
|---|---|---|
| **Client** | `customer` | Home, booking, visit history, wallet & offers, referrals, notifications |
| **Vendor** | `salon_owner`, `branch_manager`, `receptionist`, `salon_staff` | Today/reports, schedule + status actions, customers, money/refunds, staff, services, offers, reminders, settings, audit — filtered by permission |
| **Platform** | `super_admin` | Cross-salon overview, salons, vendors, audit, account |

| App | Package | Source | Version |
|---|---|---|---|
| **SalonPro (unified)** | `com.salonpro.app` | `apps/mobile/` | 2.0.2 |
| Frozen reference | `com.salonpro.app` | `apps/mobile-customer/` | 1.0.5 |
| Frozen reference | `com.salonpro.admin` | `apps/mobile-admin/` | 1.0.5 |

The app is React Native 0.87 (Hermes, new architecture) with React Navigation 7,
AsyncStorage sessions, a shared theme and component kit, and hand-drawn charts —
so an Android build needs **no NDK-level styling dependencies**. Screens are
styled with plain `StyleSheet` against `apps/mobile-shared/src/theme.ts`: the same
hot-magenta-over-cream SalonPro palette, with no NativeWind or Reanimated in the
tree (they would pull in CMake/NDK work for no user-visible gain here).

The permission catalog is the contract: tabs and action controls are rendered
from `user.permissions`, but every API route re-checks the permission and the
salon scope on the server. A hidden button is not security.

### One shared codebase

`apps/mobile-shared/src/` holds everything the app uses — theme, API client,
endpoint map, types, auth provider, UI components, hooks, server-address card,
the checkout helper and the in-app updater. `scripts/sync-mobile-shared.sh`
**copies** it into `apps/mobile/src/shared/` (plus `packages/shared/src` →
`src/core/`), and every copied file carries a `GENERATED FILE` header. Edit the
shared sources and re-run the script (also done automatically by the APK build);
never edit the copies.

### Build the APK

```bash
bash scripts/build-mobile-apks.sh              # unified app (default)
bash scripts/build-mobile-apks.sh legacy        # old customer + admin reference builds
SALONPRO_API_BASE=https://salonpro.vercel.app bash scripts/build-mobile-apks.sh
```

Each build syncs the shared sources, bakes the API address into `src/config.ts`
when `SALONPRO_API_BASE` is set, copies the Material icon font into the APK and
runs `./gradlew assembleRelease`. It reads `versionName` from
`android/app/build.gradle` and uses it for the file name and the in-app version
label. Output lands in `artifacts/`:

```
artifacts/mobile-customer-2.0.2.apk      (com.salonpro.app, unified)
```

The `mobile-customer-` prefix is intentional since 2.0.0: installed 1.0.5
customer updaters look for that prefix. It is an asset name, not the app's
identity.

Prerequisites: **JDK 17**, the Android SDK (`platform-tools`, `platforms;android-36`,
`build-tools;37.0.0`), and — because React Native's app module compiles a small
amount of C++ for the new architecture — **NDK 27.1.12297006** and **CMake 3.22.1**
(`sdkmanager "ndk;27.1.12297006" "cmake;3.22.1"`). A first release build takes
roughly ten minutes; later ones are much faster.

Signed with the same **debug keystore** as 1.0.4/1.0.5 (SHA-256
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`), which is
right for sideloading to your own phones and not for the Play Store. The keystore
is not committed; keep a local copy in `apps/mobile/android/app/debug.keystore`
before building. Android refuses an update signed with a different key.

Install over USB:

```bash
bash scripts/install-apks.sh       # restarts adb, waits for authorization, installs the built APK
adb install -r artifacts/mobile-customer-2.0.2.apk
```

The old `com.salonpro.admin` app is retired. Android will not install a different
package over it; admin users install the unified APK once manually, then sign in
with the same phone.

### In-app updates — no more GitHub by hand

From **1.0.4**, the app checks GitHub Releases when it starts (and at most once
every 10 minutes when returning to the foreground). If a newer build exists, a
native Android dialog offers it, the APK downloads with an in-app progress bar,
and Android's package installer opens. There is also a **Check for updates** row
in the client Profile and in the vendor/platform **More/Account** screens.

The first build that contains the updater — **1.0.4** — has to be installed once
by hand. Every release after that can install from inside the app.

**Publish an update:**

1. Bump `versionCode` **and** `versionName` in
   `apps/mobile/android/app/build.gradle`.
2. Build:
   ```bash
   SALONPRO_API_BASE=https://salonpro-rosy.vercel.app bash scripts/build-mobile-apks.sh
   ```
   The script names the file after `versionName`:
   `artifacts/mobile-customer-<version>.apk` (the legacy prefix is what installed
   1.0.5 customer updaters search for).
3. Create a GitHub release (for example tag `mobile-2.0.2`), upload the APK
   **with that exact file name**, and publish it — not a draft, not a
   pre-release.
4. Installed 1.0.4+ apps offer it on the next launch, on returning to the app,
   or from the manual check. The 1.0.5 → 2.0.0 path is the first unified update;
   the 2.0.0 → 2.0.1 and 2.0.1 → 2.0.2 paths were exercised on an Android
   emulator.

The updater picks the newest published release that has a matching asset,
compares the version in the file name with the installed `versionName`, then
checks the downloaded APK's package name and `versionCode` (and GitHub's
SHA-256 digest when the API supplies one) before opening the installer. Android
additionally refuses any APK signed with a different key — so keep using the
same debug keystore.

Android always shows its own install confirmation: an ordinary app cannot
install silently (that needs device-owner provisioning). The win is that nobody
visits GitHub, downloads a file, or hunts through the Downloads folder.

### Which server do the apps talk to?

Each app has a built-in address (this machine's LAN IP on `:4000` by default) and
a **Server address** screen reachable from sign-in and from More → Server address:

- Tap **Test and save**: the address is probed against `/api/health` and only a
  real SalonPro server is accepted as connected — a wrong address, a captive
  portal or someone else's web server is refused with the reason.
- The address is per-phone and signs nobody in or out.
- Use **https://** for a hosted deployment (Vercel), **http://<lan-ip>:4000** for a
  server running at the desk. Android's cleartext HTTP is explicitly allowed in
  the manifest for that reason.

### Money in the apps, honestly

- **Wallet and pay-at-salon work today.** Wallet recharges can also be paid by
  card/UPI: the unified app ships the Razorpay native SDK
  (`react-native-razorpay`), so once the salon's keys are configured on the
  server the sheet opens in test mode and the server verifies the signature.
  With no keys the same flow runs against the server's signed simulation, and a
  build without the SDK says *"This build has no Razorpay sheet installed"*
  instead of pretending a payment happened.
- The phone never decides that money moved: orders are created on the server, and
  a payment only becomes `paid` after **server-side signature verification** (or a
  deliberately signed simulation payload, in simulated mode).
- Reminder/notification screens show `pending`, `sent`, `failed` or `suppressed`
  exactly as the server recorded it, with the provider's error text. With no
  provider connected, "Run now" queues messages and the screen says so **before**
  you tap.

### Google review funnel

The vendor workspace has a **Reviews** screen and a **Google reviews** section in
**Settings**:

1. The owner pastes the salon's Google **Place ID** (or a Google Maps URL that
   contains one). Only the owner can change it; managers can read reviews;
   receptionists cannot.
2. The same card shows the hosted review page:
   `https://<your-api-host>/r/<salonId>`. Share that link with customers.
3. A customer taps 1–5 stars. **4–5★** customers get a button that copies their
   written review and opens Google's `writereview` form in a new tab; Google does
   not allow websites to prefill review text, so the page copies it for one-tap
   pasting. **1–3★** feedback is saved only in SalonPro and is never given a
   Google URL — the server, not the browser, decides this.
4. The vendor **Reviews** screen shows the average, the rating breakdown, Google
   hand-offs and private feedback, with All / 4–5★ / 1–3★ filters.

Every rating is stored in `salon_reviews`; `googleRedirected` is true only for a
4–5★ request made while a Place ID is connected. The public API is
`GET/POST /api/public/reviews/:salonId` and the owner API is
`GET /api/admin/reviews`.

> **Policy note:** routing only happy customers to Google is commonly called
> “review gating”, and Google's review policies may prohibit it. Confirm the
> policy for your market before running this funnel at scale.

## Demo accounts

Password for all demo logins: **`salonpro123`**. Demo users are seeded with
`isDemo = 1` and excluded from production reporting. Demo login endpoints are
refused when `NODE_ENV=production`.

| Role | Phone |
|---|---|
| Super admin | `9999999999` |
| Salon owner | `9800000001` |
| Branch manager | `9800000002` |
| Receptionist | `9800000003` |
| Stylist | `9800000010` |
| Customers | `9700000001` … `9700000020` |

---

## Testing

The suite runs on **Bun's test runner**.
**No database server, network or external service is needed:** the harness drives
the real router (the same one Next.js dispatches into on Vercel) against PGlite —
real Postgres compiled to WebAssembly — seeded deterministically.

```bash
bun run test          # everything (163 tests)
bun run test:shared   # pure helpers: money, time, masking (10)
bun run test:api      # database, routes, journeys, integrations (140)
bun run test:next     # the Vercel/Next surface: parity, cron auth, 204/304 handling (13)
bun run test:smoke    # just the end-to-end journeys (10)
```

What the suites cover:

| Suite | Tests | What it pins down |
|---|---|---|
| **shared** | 9 | Paise formatting, rupee round-tripping, phone masking, time conversion, date math, status labels |
| **`db.test.ts`** | 22 | `toPg()` translation (placeholders, camelCase quoting, literals and comments untouched); `scalar`/`COUNT` return numbers, not bigint strings; `tx()` commits, rolls back, flattens nested calls and never wedges the driver; `migrate()` is idempotent; **the ledger has no `UPDATE`/`DELETE` path in the source** |
| **`routes.test.ts`** | 6 | **All 101 HTTP routes** exist and answer without a 5xx; every protected route 401s anonymously; a customer token gets 403 on every admin route; the 35 endpoints the apps load daily return 200; CSV exports are real files |
| **`reviews.test.ts`** | 6 | The hosted review funnel: Place ID normalisation, owner-only Google connection, 4–5★ gets a Google URL, 1–3★ is stored locally with no Google URL, managers can read reviews, receptionists cannot, and suspended salons have no public page |
| **`smoke.test.ts`** | 10 | Whole journeys over HTTP: OTP sign-up → recharge → book from the wallet → receipt; cancel refunds and frees the slot; data export + account deletion; a completed visit reaching the dashboard, ledger, leaderboard, revenue report and audit log; the ₹50+₹50 referral paying out after qualification; then SQL invariants (no orphans, no overdrawn wallet, no half-written ledger row) |
| **`integrations.test.ts`** | 9 | **Honesty:** the dev OTP mock labels itself and says "no real SMS was sent"; production **refuses with 503** rather than faking an OTP; notifications are never marked `sent` without a provider; opt-outs are `suppressed`; registering a push device creates no phantom delivery; `/api/health` reports every integration as `false` while unconfigured; **the production bootstrap creates a clean database** (1 user, 1 salon, 1 branch, 3 offers, zero of anything else) and its owner can sign in |
| **existing API suites** | 87 | Auth/sessions, booking and the status machine, wallet maths and bonus-before-cash, payments and signature verification, referrals, RBAC and branch scoping, validation and error shapes, analytics |

### Test architecture

- `packages/core/test/setup-env.ts` sets `NODE_ENV=test`, `DATABASE_URL=pglite:memory:`
  and generous rate limits. It must be the **first import** so env is in place
  before any `src` module loads.
- `packages/core/test/harness.ts` exports `getHarness()`: it resets + reseeds,
  builds the router, listens on port `0`, and returns typed
  `get/post/patch/request/login` helpers plus direct `db` access.
  `lib/router.ts` + `server.ts` (`buildRouter()`/`dispatch()`) are side-effect
  free, so tests mount them without a scheduler — and `apps/next/app/api/[...path]`
  dispatches into exactly the same code in production.
- Bun's runner runs **every test file in one process**, so that harness is a
  process-wide singleton and its `close()` is a deliberate no-op: the server is
  unref'd and the in-memory database dies with the process. The tests import from
  `bun:test`; `test/bun-shim.d.ts` maps that module onto Node's test types so
  `tsc` typechecks the suite without pulling in `@types/bun`.

`packages/core/src/**` is fully typechecked together with tests, so `bun run typecheck`
fails on a broken test as well as broken app code.

---

## Configuration (all optional)

Copy `.env.example` to `.env` (loaded by a tiny built-in parser — no `dotenv`).

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_URL` | `pglite:file:data/pglite` | Postgres connection. `postgresql://…` → Neon via `pg`; `pglite:memory:` / `pglite:file:<dir>` → local Postgres-in-WASM. **Quote it in `.env`** — the URL contains `&`. |
| `SESSION_SECRET` | dev value | Key for hashed session tokens; rotate to sign everyone out |
| `SESSION_TTL_DAYS` | `30` | Session lifetime |
| `OTP_PROVIDER_CONFIGURED` | `false` | If false, OTP is a labelled dev mock (and in `NODE_ENV=production` the request is **refused with 503** instead of faked) |
| `ALLOW_DEV_OTP` | `false` | Demo escape hatch: returns the OTP in the response **on any database, including a live one**. Whoever knows a phone number can then sign in as that person — turn it off the moment real SMS is configured |
| `CRON_SECRET` | dev value | Shared secret for the reminder cron endpoints; the request is compared in constant time and refused without it |
| `DATABASE_POOL_MAX` | `10` | pg pool size per serverless instance |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | empty | When set, live-ish mode; otherwise **simulated** |
| `RAZORPAY_WEBHOOK_SECRET` | empty | Webhook HMAC secret (falls back to a dev secret) |
| `ALLOW_PAYMENT_SIMULATION` | `true` | Lets the built-in test checkout post signed payloads |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | empty | WhatsApp delivery |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | empty | Web push |
| `WEB_ORIGIN` | `http://localhost:5173` | Base URL used in message links (booking/referral) and the CORS allow-list. Point it at wherever those links should resolve |
| `NODE_ENV` | `development` | `production` disables demo login, refuses to fake an OTP and excludes demo data |

> Treat a production `DATABASE_URL` like a password: it grants full access to
> the salon's data. Rotate the Neon role's password if it has ever been shared
> in chat, a screenshot or a ticket, and set a real `SESSION_SECRET` — the
> default value is public.

---

## Honest integration status

`GET /api/health` returns an `integrations` block. In a default checkout:

```json
{ "razorpayLive": false, "razorpayWebhook": false, "whatsapp": false, "push": false, "otpDelivery": false }
```

- **Payments** — without keys, orders are created in `simulated` mode. Signature
  verification is **really performed** (HMAC SHA-256) against a local dev secret,
  so the security-critical path is exercised, not stubbed. Simulated orders are
  labelled and excluded from production reporting.
- **OTP** — without a provider, the code is returned in the response and the UI
  labels it `DEV MODE` with the notice "no real SMS was sent". With
  `NODE_ENV=production` and no provider, `/api/auth/otp/request` returns **503
  `otp_unavailable`** — a server that cannot send an OTP says so instead of
  pretending.
- **Reminders / push / WhatsApp** — without providers, messages are recorded as
  `pending`/`queued` with the reason in `errorDetails`. The system never writes
  `sent`, and `sentAt` stays empty. `integrations.test.ts` fails the build if
  that ever changes.

---

## Why not Convex / Freebuff (as the spec suggested)?

The spec proposed a managed backend. This build keeps the service layer portable
instead: one `tx()` boundary around money, one `db.ts` driver, and SQL that runs
unchanged on Neon or PGlite. That is what makes the app testable with **zero
credentials** (the suite is in-memory Postgres) while still being a real
production deployment on a managed Postgres. See `REVIEW.md` §10.

---

## Project layout

```
salonpro/
├── apps/
│   ├── next/                 # the deployed API: Next.js App Router on Vercel
│   │   ├── app/api/[...path]/route.ts   # one catch-all → packages/core
│   │   ├── lib/reminders.ts  # staleness guard + stampede collapse for the sweep
│   │   ├── test/parity.test.ts          # 13 tests: the deployed surface
│   │   └── vercel.json       # 2 daily cron jobs (free tier)
│   ├── mobile-shared/src/    # shared native source (theme, api, endpoints, ui, auth, updates)
│   ├── mobile/               # unified app → com.salonpro.app (client + vendor + platform)
│   ├── mobile-customer/      # frozen 1.0.5 reference build
│   └── mobile-admin/         # frozen 1.0.5 reference build
├── packages/
│   ├── core/                 # the whole server: routes, services, db, seed, auth
│   │   ├── src/
│   │   │   ├── server.ts     # buildRouter() / dispatch() — no framework
│   │   │   ├── lib/router.ts # the mini-router (replaced Express)
│   │   │   ├── lib/node-server.ts       # the local listener used by serve.sh
│   │   │   ├── db.ts         # driver (pg | PGlite), toPg() translation, schema, tx()
│   │   │   ├── seed.ts       # demo seed (--reset) and live bootstrap
│   │   │   └── routes/ + services/
│   │   └── test/             # harness + 140 tests (including platform tenant tests)
│   └── shared/               # types + money/time/format helpers (+ 10 tests)
├── scripts/
│   ├── build-mobile-apks.sh  # sync shared code → gradle assembleRelease → artifacts/
│   ├── sync-mobile-shared.sh # copy apps/mobile-shared into the native apps
│   ├── install-apks.sh       # adb install over USB
│   ├── build-next.sh         # build the Next.js API
│   └── serve.sh              # restart the server cleanly on :4000
├── .github/workflows/reminders.yml      # cron fallback that survives Hobby limits
├── artifacts/                # built APKs (gitignored — share them as files)
└── REVIEW.md                 # spec critique and gap analysis
```


---

## Known gaps (tracked, not hidden)

- Staff **commission payouts** are not built (the raw data exists in
  `service_records`).
- **Bonus expiry sweep** is not scheduled (the setting and row data exist).
- **Retention policy** for PII is not implemented (export/deletion endpoints do
  exist).
- Loyalty/period boundaries use the process clock rather than a per-salon
  timezone library.
- The Android APK is a **debug** build signed with the debug keystore — fine for
  sharing directly, but it cannot be published on the Play Store and Android
  shows the usual "unknown sources" warnings.
- The 1.0.5 → 2.0.0 in-app update has not been exercised on a physical phone in
  this workspace (`adb devices` was empty). The APK is built, signed with the
  1.0.5 certificate and named for the 1.0.5 updater; the on-device confirmation
  is still pending.
- Card/UPI checkout in the client workspace opens the real Razorpay sheet —
  `react-native-razorpay` is installed and autolinked. It stays on the honest
  simulated path until the salon's Razorpay keys are set on the server. The
  vendor workspace deliberately has no payment sheet: it records money that
  arrived, it does not take it.
- **Push notifications** need a Firebase project and `google-services.json` placed
  in the app; without it the vendor workspace records that no device is
  registered rather than claiming a push was delivered.
- Customer message templates still build a booking/referral link from
  `WEB_ORIGIN`. With the browser surface removed those URLs don't resolve yet —
  point `WEB_ORIGIN` at a future booking page or drop the links when a WhatsApp
  provider is connected (nothing is sent today without one).
- The hosted deployment (`apps/next` → Vercel) still needs **your** Vercel login.
  Step-by-step walkthrough: **`DEPLOY.md`** (import the repo, Root Directory
  `apps/next`, three env vars — then `SALONPRO_API_BASE` can be rebuilt into the
  APKs, or set once in the app's server screen).
- The API is reachable wherever you host it; on a LAN the phones must be on the
  same Wi-Fi, and the apps' Server address screen is the fix when they are not.

See `REVIEW.md` for each of these with the recommended fix.
