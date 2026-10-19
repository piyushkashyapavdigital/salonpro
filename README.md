# SalonPro

A premium salon platform: a customer PWA, an owner dashboard, a reception/staff
console, and **two installable Android apps** — backed by one API and a
persistent database. A soft blush / rose interface — rounded white cards, pink
accents, bottom tab navigation — installable as a PWA and shipped as two
React Native APKs (customer + salon staff) that talk to the same JSON API as the
web app.

> **Honesty first.** This deployment runs Razorpay in **simulated** mode and OTP
> in **development mock** mode until real keys are provided. When nothing is
> configured, the app **never** claims a payment was charged, an OTP was sent, or
> a WhatsApp/push message was delivered. `/api/health` reports the true state.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web | Vite + React 18 + TypeScript + Tailwind + React Router + TanStack Query | Fast dev loop, no Expo/Metro |
| PWA | `vite-plugin-pwa` (Workbox) | Installable, offline shell |
| API | **Next.js 16 App Router** (`apps/next`) — one catch-all route handler dispatches into `packages/core` | Deploys to Vercel with no separate server and **no Express anywhere**; one warm function, one database pool |
| Mobile | **React Native 0.87** (`apps/mobile-customer`, `apps/mobile-admin`) + React Navigation 7 | Real APKs with native navigation, AsyncStorage sessions and one shared UI kit — the same shape as the reference project |
| DB | **Postgres** — Neon (`pg`) in production, **PGlite** (Postgres in WASM) locally and in tests | One SQL dialect everywhere; the test suite needs no database server |
| Validation | `zod` | One schema per boundary |
| Scheduling | Vercel Cron (2 daily jobs, free-tier limit) + an in-process sweep on API traffic + a GitHub Actions workflow for brute-force retries | Reminders go out without a second server |

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
boot, so a fresh Neon database becomes usable on the first `npm start`.


---

## Design system

One theme drives the web app, the customer APK and the admin APK. It lives in
`apps/web/tailwind.config.js` (tokens) and `apps/web/src/index.css` (primitives).

| Token | Meaning |
|---|---|
| `brand-*` | Rose accent (`#EC4899` core) — primary buttons, active tabs, badges, charts |
| `ink-*` | Warm blush-tinted neutrals — `ink-50` is the app canvas, `ink-100` the hairline border, `300`–`500` muted text, `700`–`950` headings and numbers |
| `mint` / `amber` / `rose` / `sky` | Success / warning / danger / info |
| `.card` | White, `rounded-3xl`, soft rose-tinted shadow |
| `.card-dark` | The blush-gradient hero card (wallet balance, revenue, referrals) |
| `.btn-primary`, `.btn-brand` | Solid and gradient rose calls to action |

Type is **Poppins** for display (headings, KPI numbers) and **Inter** for body.
Both shells use a bottom tab bar; the dashboard adds a persistent sidebar from
the `lg` breakpoint up and tucks the remaining sections behind **More**.

### Component system

Three layers, all in `apps/web/src/components`:

| Layer | Location | What it is |
|---|---|---|
| Design-system primitives | `ui.tsx` | `Card`, `Stat`, `Badge`, `Avatar`, `Drawer`, `Modal`, `Table`, charts — the components every page composes |
| **shadcn/ui** | `shadcn/` | Radix-backed primitives generated in the shadcn style, themed through HSL CSS variables in `index.css`. `components.json` is wired up, so `npx shadcn@latest add <component>` works and writes to `shadcn/`. Includes `shadcn/chart` — the recharts-based `ChartContainer`/`ChartTooltip` used by the admin revenue trend |
| **Magic UI / Aceternity-style** | `magic/` | `NumberTicker`, `BlurFade`, `Marquee`, `ShimmerButton`, `MagicCard`, `BorderBeam`, `AnimatedGradientText`, `SparklesText`, `AnimatedShinyText`, `Meteors`, `TabDock` |

In active use right now: `shadcn/sheet` (every bottom-sheet menu), `shadcn/separator`,
`shadcn/chart` (the admin "Collected · last 7 days" trend, fed by a real
day-by-day API series), `shadcn/sonner` (all toasts, via `useToast()`), and
`magic/tab-dock`, `magic/number-ticker`, `magic/blur-fade`, `magic/magic-card`.
The rest of the kit is there to reach for.

> The admin chart lives in `components/charts/` and is `React.lazy`-loaded, so
> recharts is code-split out of the customer app's startup bundle (~400 kB off
> the first paint for the customer APK).

> Reveal and ticker animations deliberately animate **on mount**, not on
> intersection, and fall back to the final value / plain markup when
> `IntersectionObserver` or `requestAnimationFrame` cannot run (hidden document,
> `prefers-reduced-motion`, jsdom). A number can therefore never be stranded
> showing `0`, and content can never be stranded invisible.

> Motion also respects the phone's own setting: `MotionConfig reducedMotion="user"`
> in `App.tsx` plus a CSS media query means a device with "reduce motion" on gets
> no sliding pills, meteors or ticking numbers. And every screen is wrapped in an
> `ErrorBoundary`, so a crash shows a readable card with a reload button instead
> of a blank white screen.

---

## Quick start

```bash
npm install
npm run seed:reset          # create + populate the demo database
npm run dev                 # API on :4000, web on :5173
```

Then open <http://localhost:5173>.

With no `DATABASE_URL` the API uses a file-backed PGlite database under
`data/`, so this works with **no database server installed**.

Single-process production mode (API serves the built SPA):

```bash
npm run build               # builds the SPA into apps/web/dist
npm start                   # API on :4000 also serves the SPA
```

If you are not sure whether an older server is still running, use the launcher
instead of a bare `npm start` — it stops the stale one first, then starts a
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
npm start        # creates the schema on boot if it is missing, then serves
```

`npm start` calls `migrate()`, so pointing the app at an empty Neon database and
starting it is all the setup there is. Verify with the health endpoint:

```bash
curl -s localhost:4000/api/health      # → { ok, integrations: {…}, database: "postgres" }
```

> **Demo data vs. a live salon.** `npm run seed:reset` is for local demos only:
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
npm run seed:bootstrap
```

| Variable | Required | Default |
|---|---|---|
| `BOOTSTRAP_OWNER_PHONE` | yes | — (the mobile number the owner signs in with) |
| `BOOTSTRAP_OWNER_NAME` | no | `Salon Owner` |
| `BOOTSTRAP_SALON_NAME` | no | `SalonPro` |
| `BOOTSTRAP_ADDRESS` | no | `Address not set — update it in Settings` |
| `BOOTSTRAP_CONTACT` | no | — |
| `BOOTSTRAP_BRANCH` | no | `<salon name> — Main branch` |

Environment variables are the supported route because `npm run` swallows
unknown `--flags`. To pass flags instead, call the CLI directly:

```bash
BOOTSTRAP_OWNER_PHONE=9812345678 npm run seed:bootstrap   # optional: BOOTSTRAP_OWNER_NAME=… BOOTSTRAP_SALON_NAME=…
```

Running it twice is safe: if a salon already exists it does nothing. The owner
then signs in with OTP from the admin app and adds services, staff and branches.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs API + web together |
| `npm run seed` | Seeds the demo data into an **empty** database |
| `npm run seed:reset` | Drops everything and reseeds the demo data (local only) |
| `npm run seed:bootstrap` | Creates a clean live salon — no demo data. See [Neon database](#neon-database) |
| `npm run build` | Typechecks and builds the customer SPA + PWA (`apps/web/dist`) |
| `npm run build:admin` | Builds the dashboard-only bundle (`apps/web/dist-admin`, `VITE_APP_MODE=admin`) |
| `npm start` | Runs the API (Next.js; migrates the database, still serves the built SPA when present) |
| `bash scripts/serve.sh` | Kills a stale server on `:4000`, builds if needed, prints the phone URL, then starts |
| `npm run typecheck` | TypeScript for core + Next + web (tests included) |
| `npm test` | Everything: shared + core + Next parity + web |
| `npm run test:api` | Core suite (database, routes, journeys, integrations) |
| `npm run test:next` | The Next.js deployment surface (parity, cron auth, path handling) |
| `npm run test:smoke` | Just the end-to-end journeys |
| `npm run mobile:sync` | Copy `apps/mobile-shared/src` into both React Native apps |
| `npm run mobile:apks` | Build both release APKs into `artifacts/` |
| `npm run mobile:install` | Install whichever APKs are built over USB (`adb`) |
| `cd apps/mobile-customer && npm test` | The app's jest smoke test: renders the whole app and unmounts it (same in `apps/mobile-admin`) |
| `cd apps/mobile-customer && npx tsc --noEmit` | Typecheck a native app, tests included (same in `apps/mobile-admin`) |

## Android apps — React Native, two icons, one API

The phones the salon actually uses run **native React Native apps** (the reference
project's model), against the same API as the web app:

| App | Package | Source | Who uses it |
|---|---|---|---|
| **SalonPro** | `com.salonpro.app` | `apps/mobile-customer/` | Customers: book, visit history, wallet & offers, referrals, notifications |
| **SalonPro Admin** | `com.salonpro.admin` | `apps/mobile-admin/` | The salon: today's numbers, schedule + status actions, customers, money/refunds, staff, services, reports, reminders, settings, audit log |

Both are React Native 0.87 (Hermes, new architecture) with React Navigation 7,
AsyncStorage sessions, a shared theme and component kit, and hand-drawn charts —
so an Android build needs **no NDK-level styling dependencies**. Screens are
styled with plain `StyleSheet` against `apps/mobile-shared/src/theme.ts`: the same
blush/rose tokens the web app uses, with no NativeWind or Reanimated in the tree
(they would pull in CMake/NDK work for no user-visible gain here).

### One shared codebase, two apps

`apps/mobile-shared/src/` holds everything both apps use — theme, API client,
endpoint map, types, auth provider, UI components, hooks, server-address card and
the checkout helper. `scripts/sync-mobile-shared.sh` **copies** it into each app's
`src/shared/` (plus `packages/shared/src` → `src/core/`), and every copied file
carries a `GENERATED FILE` header. Edit the shared sources and re-run the script
(also done automatically by the APK build); never edit the copies.

### Build the APKs

```bash
bash scripts/build-mobile-apks.sh              # both apps
bash scripts/build-mobile-apks.sh customer     # just one
SALONPRO_API_BASE=https://salonpro.vercel.app bash scripts/build-mobile-apks.sh
```

Each build syncs the shared sources, bakes the API address into `src/config.ts`
when `SALONPRO_API_BASE` is set, copies the Material icon font into the APK and
runs `./gradlew assembleRelease`. Output lands in `artifacts/`:

```
artifacts/mobile-customer-1.0.0.apk      (com.salonpro.app)
artifacts/mobile-admin-1.0.0.apk         (com.salonpro.admin)
```

Prerequisites: **JDK 17**, the Android SDK (`platform-tools`, `platforms;android-36`,
`build-tools;37.0.0`), and — because React Native's app module compiles a small
amount of C++ for the new architecture — **NDK 27.1.12297006** and **CMake 3.22.1**
(`sdkmanager "ndk;27.1.12297006" "cmake;3.22.1"`). A first release build takes
roughly ten minutes; later ones are much faster.

Signed with the standard **debug keystore** (the build script recreates it if a
fresh clone is missing it), which is right for sideloading to your own phones and
not for the Play Store.

Install over USB:

```bash
bash scripts/install-apks.sh       # restarts adb, waits for authorization, installs both
adb install -r artifacts/mobile-customer-1.0.0.apk
```

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

- **Wallet and pay-at-salon work today.** Card/UPI checkout uses the Razorpay
  native SDK if it is installed in the app; when it is not, the app says
  *"no payment sheet is installed in this build"* and offers the other methods
  instead of pretending a payment happened.
- The phone never decides that money moved: orders are created on the server, and
  a payment only becomes `paid` after **server-side signature verification** (or a
  deliberately signed simulation payload, in simulated mode).
- Reminder/notification screens show `pending`, `sent`, `failed` or `suppressed`
  exactly as the server recorded it, with the provider's error text. With no
  provider connected, "Run now" queues messages and the screen says so **before**
  you tap.

### Legacy: the Capacitor PWA shell

`apps/web/android` and `apps/admin/android` are Capacitor projects that wrap the
built web app as an APK (`bash scripts/build-apk.sh [admin]`). They still work and
`npm run mobile:install` falls back to them, but the React Native apps are the
shipped product.

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

The suite runs on Node's built-in test runner (shared/core/next) and Vitest (web).
**No database server, network or external service is needed:** the harness drives
the real router (the same one Next.js dispatches into on Vercel) against PGlite —
real Postgres compiled to WebAssembly — seeded deterministically.

```bash
npm test              # everything (240 tests)
npm run test:shared   # pure helpers: money, time, masking (9)
npm run test:api      # database, routes, journeys, integrations (120)
npm run test:next     # the Vercel/Next surface: parity, cron auth, 204/304 handling (13)
npm run test:web      # mobile UX, pages, crash safety, server setting (98)
npm run test:smoke    # just the end-to-end journeys (10)
```

What the suites cover:

| Suite | Tests | What it pins down |
|---|---|---|
| **shared** | 9 | Paise formatting, rupee round-tripping, phone masking, time conversion, date math, status labels |
| **`db.test.ts`** | 22 | `toPg()` translation (placeholders, camelCase quoting, literals and comments untouched); `scalar`/`COUNT` return numbers, not bigint strings; `tx()` commits, rolls back, flattens nested calls and never wedges the driver; `migrate()` is idempotent; **the ledger has no `UPDATE`/`DELETE` path in the source** |
| **`routes.test.ts`** | 6 | **All 98 HTTP routes** exist and answer without a 5xx; every protected route 401s anonymously; a customer token gets 403 on every admin route; the 34 endpoints the apps load daily return 200; CSV exports are real files |
| **`smoke.test.ts`** | 10 | Whole journeys over HTTP: OTP sign-up → recharge → book from the wallet → receipt; cancel refunds and frees the slot; data export + account deletion; a completed visit reaching the dashboard, ledger, leaderboard, revenue report and audit log; the ₹50+₹50 referral paying out after qualification; then SQL invariants (no orphans, no overdrawn wallet, no half-written ledger row) |
| **`integrations.test.ts`** | 8 | **Honesty:** the dev OTP mock labels itself and says "no real SMS was sent"; production **refuses with 503** rather than faking an OTP; notifications are never marked `sent` without a provider; opt-outs are `suppressed`; registering a push device creates no phantom delivery; `/api/health` reports every integration as `false` while unconfigured; **the production bootstrap creates a clean database** (1 user, 1 salon, 1 branch, 3 offers, zero of anything else) and its owner can sign in |
| **existing API suites** | 73 | Auth/sessions, booking and the status machine, wallet maths and bonus-before-cash, payments and signature verification, referrals, RBAC and branch scoping, validation and error shapes, analytics |
| **`mobile-ux.test.tsx`** | 21 | The mobile-app contracts: `viewport-fit=cover`, safe-area padding, `.card { min-width: 0 }`, **no `overflow-x: hidden` anywhere**, `overscroll-behavior`/tap-highlight off, `prefers-reduced-motion` (CSS + `MotionConfig`), the dock's items are siblings of one flex row with identical geometry, and the Android back button (back inside the app, double-press to exit, forgotten after 2 s) |
| **`pages.test.tsx`** | 12 | Renders the real pages against a mocked API **twice with different payloads**, so a hardcoded number or a fabricated chart fails; error and empty states; premium-customer leaderboard order and phone masking |
| **`crash-safety.test.tsx`** | 6 | The error boundary turns a thrown render error into a readable card with a reload button; `NumberTicker` renders `0` for a missing metric instead of blanking the screen |
| **`server.test.tsx`** | 18 | Address handling for the packaged apps: bare addresses get a scheme, trailing `/` and `/api` are stripped, every request goes through the configured base (a relative `/api/...` fetch is unreachable inside the shell — that bug silently broke reschedule slots and the marketing-consent toggle), a wrong address is **never** reported as connected (HTML, `{ok:false}`, HTTP 500 and timeouts each get their own message), saving is followed by a reload, and the web sign-in is left uncluttered |
| **existing web tests** | 41 | API client token/401/error shapes and downloads, every design-system primitive, full-app render smoke and route guards |

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
- `apps/web/test/setup.ts` wires `@testing-library/jest-dom`, cleans up between
  tests, and shims `matchMedia`, `scrollTo` and `ResizeObserver` (recharts needs
  the last one to size a chart in jsdom) for jsdom.

`packages/core/src/**` is fully typechecked together with tests, so `npm run typecheck`
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
| `WEB_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `SERVE_STATIC` | `true` | Serve the built SPA from the API |
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
│   ├── web/                  # React PWA (customer + dashboard bundles)
│   │   ├── src/pages/        # customer/ and admin/ screens
│   │   ├── src/lib/native.ts # Capacitor bridge (legacy shell): back button, haptics, share
│   │   └── test/             # 98 tests (mobile UX, pages, crash safety, server setting)
│   ├── mobile-shared/src/    # ONE source for both native apps (theme, api, endpoints, ui, auth)
│   ├── mobile-customer/      # React Native app  → com.salonpro.app
│   ├── mobile-admin/         # React Native app  → com.salonpro.admin
│   └── admin/                # Capacitor shell for the admin PWA bundle (legacy)
├── packages/
│   ├── core/                 # the whole server: routes, services, db, seed, auth
│   │   ├── src/
│   │   │   ├── server.ts     # buildRouter() / dispatch() — no framework
│   │   │   ├── lib/router.ts # the mini-router (replaced Express)
│   │   │   ├── lib/node-server.ts       # the local listener used by serve.sh
│   │   │   ├── db.ts         # driver (pg | PGlite), toPg() translation, schema, tx()
│   │   │   ├── seed.ts       # demo seed (--reset) and live bootstrap
│   │   │   └── routes/ + services/
│   │   └── test/             # harness + 120 tests
│   └── shared/               # types + money/time/format helpers (+ 9 tests)
├── scripts/
│   ├── build-mobile-apks.sh  # sync shared code → gradle assembleRelease → artifacts/
│   ├── sync-mobile-shared.sh # copy apps/mobile-shared into both apps
│   ├── install-apks.sh       # adb install over USB
│   ├── build-next.sh         # web build + next build check
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
- The Android APKs are **debug** builds signed with the debug keystore — fine for
  sharing directly, but they cannot be published on the Play Store and Android
  shows the usual "unknown sources" warnings.
- **Card/UPI inside the native apps** needs the Razorpay React Native SDK added to
  `apps/mobile-customer` (a pure Java/Kotlin module). Until it is, the checkout
  helper says so plainly and wallet / pay-at-salon remain fully usable.
- **Push notifications** need a Firebase project and `google-services.json` placed
  in the app; without it the admin app records that no device is registered rather
  than claiming a push was delivered.
- The hosted deployment (`apps/next` → Vercel) still needs **your** Vercel login to
  run `vercel --prod`, and `SALONPRO_API_BASE` must then be rebuilt into the APKs.
- The API is reachable wherever you host it; on a LAN the phones must be on the
  same Wi-Fi, and the apps' Server address screen is the fix when they are not.

See `REVIEW.md` for each of these with the recommended fix.
