# SalonPro

A premium salon platform: a customer PWA, an owner dashboard, and a
reception/staff console, backed by one API and a persistent database. A soft
blush / rose interface — rounded white cards, pink accents, bottom tab
navigation — installable as a PWA and shipped as two Android apps.

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
| API | Express 4 + TypeScript (`tsx`) | Small, inspectable |
| DB | **Postgres** — Neon (`pg`) in production, **PGlite** (Postgres in WASM) locally and in tests | One SQL dialect everywhere; the test suite needs no database server |
| Validation | `zod` | One schema per boundary |
| Scheduling | `node-cron` | Reminder passes |

Money is stored as **integer paise** everywhere. The wallet is an **append-only
ledger**; balances are always derived from the sum of posted rows — the
`wallets` table has no balance column at all.

### One database, two drivers

`apps/api/src/db.ts` owns the connection. It picks the driver from
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
cd apps/api && npx tsx src/seed.ts --bootstrap --phone 9812345678 --owner "Deepa Menon" --salon "Blush Studio"
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
| `npm start` | Runs the API (migrates the database, serves `apps/web/dist` if built) |
| `bash scripts/serve.sh` | Kills a stale API on `:4000`, then starts a fresh one |
| `npm run typecheck` | TypeScript for API + web (tests included) |
| `npm test` | Full test suite: shared + API + web |
| `npm run test:api` | API suite (database, routes, journeys, integrations) |
| `npm run test:smoke` | Just the end-to-end journeys |

## Android apps (two icons, one codebase)

The web app is packaged as **two separate Android apps** with Capacitor — one
launcher icon each — from the same source:

| App | Package | Pages | Build dir |
|---|---|---|---|
| SalonPro (customer) | `com.salonpro.app` | landing + customer app + owner dashboard | `apps/web/android` |
| SalonPro Admin | `com.salonpro.admin` | owner dashboard + staff console only | `apps/admin/android` |

Build and install over USB (phone on the same Wi-Fi as this PC, USB debugging on):

```bash
# both apps, seed the DB, and install over USB — one shot
npm install && npm run seed:reset && bash scripts/build-apk.sh customer && bash scripts/build-apk.sh admin
```

Or one at a time:

```bash
bash scripts/build-apk.sh                 # customer app -> com.salonpro.app
bash scripts/build-apk.sh admin           # admin app    -> com.salonpro.admin
bash scripts/build-apk.sh admin --no-install
```

Each APK bakes in the API base at build time (`VITE_API_BASE`, default is this
machine's LAN IP on port 4000), so the API must be reachable on the same network.
Override with `API_BASE=http://<ip>:4000 bash scripts/build-apk.sh admin`.

Run the API in **your own terminal** (`bash scripts/serve.sh`) rather than in an
agent/session background shell: when such a session restarts, its shells are
killed and the apps then report **"failed to fetch"** on the first call. The
fix in that case is simply to start the API again — it prints the exact
`http://<lan-ip>:4000` address the installed APK expects.

The API base is baked into the bundle, so the app must be rebuilt (and
reinstalled) if this machine's LAN IP changes.

### It behaves like an app, not a website

The packaged APKs are a real native shell, not a browser tab:

- **Boots into the app.** The customer APK goes straight to the app (or sign-in);
  the marketing landing page only renders on the open web. The admin APK is
  dashboard-only.
- **Android hardware back button** pops the in-app history, and only exits after
  a second press ("press back again to exit") — handled in `lib/native.ts`. It
  trusts Capacitor's own `canGoBack`, never `window.history.length`, because a
  popped history entry leaves that count unchanged and would leave the button
  doing nothing.
- **Native splash screen** is held until React has mounted, over a blush
  background, so there is no white flash on launch. Status bar is themed to
  match, and content no longer renders underneath it.
- **Haptics** fire on tab changes, successes and errors.
- **Native share sheet** for referral invites.
- **Bottom sheets** and a floating dock, safe-area aware, with a spring-driven
  active pill; no desktop drawer chrome on a phone.
- Tap highlight, long-press magnifier and rubber-band overscroll are disabled.

Prerequisites: JDK 17, the Android SDK (`platform-tools`, `platforms;android-34`,
`build-tools;34.0.0`), and Gradle 8.2.1 (see the header of `scripts/build-apk.sh`).

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

The suite runs on Node's built-in test runner (API/shared) and Vitest (web).
**No database server, network or external service is needed:** the API harness
boots the real Express app on an ephemeral port against PGlite — real Postgres
compiled to WebAssembly — seeded deterministically.

```bash
npm test              # everything (208 tests)
npm run test:shared   # pure helpers: money, time, masking (9)
npm run test:api      # database, routes, journeys, integrations (119)
npm run test:web      # mobile UX, pages, crash safety, primitives (80)
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
| **existing web tests** | 41 | API client token/401/error shapes and downloads, every design-system primitive, full-app render smoke and route guards |

### Test architecture

- `apps/api/test/setup-env.ts` sets `NODE_ENV=test`, `DATABASE_URL=pglite:memory:`
  and generous rate limits. It must be the **first import** so env is in place
  before any `src` module loads.
- `apps/api/test/harness.ts` exports `getHarness()`: it resets + reseeds, builds
  the app, listens on port `0`, and returns typed `get/post/patch/request/login`
  helpers plus direct `db` access. `index.ts` is split into `app.ts`
  (`buildApp()`, side-effect free) so tests mount it without a listener or a
  scheduler.
- `apps/web/test/setup.ts` wires `@testing-library/jest-dom`, cleans up between
  tests, and shims `matchMedia`, `scrollTo` and `ResizeObserver` (recharts needs
  the last one to size a chart in jsdom) for jsdom.

`apps/api/src/**` is fully typechecked together with tests, so `npm run typecheck`
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
│   ├── api/                 # Express API + Postgres (Neon / PGlite)
│   │   ├── src/
│   │   │   ├── app.ts       # buildApp() — side-effect-free Express app
│   │   │   ├── index.ts     # listener + migrate() + scheduler bootstrap
│   │   │   ├── db.ts        # driver (pg | PGlite), toPg() translation, schema, tx()
│   │   │   ├── seed.ts      # demo seed (--reset) and live bootstrap (--bootstrap)
│   │   │   ├── auth.ts      # password hashing, sessions, RBAC, audit
│   │   │   ├── routes/      # auth, catalog, customer, admin, payments
│   │   │   └── services/    # wallet, booking, payments, refunds, referral, …
│   │   └── test/            # harness + 119 tests (db, routes, smoke, integrations, …)
│   └── web/                 # React PWA (shared source for both apps)
│       ├── src/pages/       # customer/ and admin/ screens
│       ├── src/lib/native.ts# Capacitor bridge: back button, haptics, share, status bar
│       ├── src/lib/mode.ts  # VITE_APP_MODE: customer vs admin build
│       ├── dist/            # customer bundle
│       ├── dist-admin/      # admin bundle (dashboard only)
│       └── test/            # 80 tests (mobile UX, pages, crash safety, primitives)
├── apps/admin/              # Capacitor shell for SalonPro Admin (com.salonpro.admin)
│   ├── capacitor.config.ts
│   └── android/             # generated Gradle project + launcher icons
├── scripts/build-apk.sh     # build/install either APK over USB
├── scripts/serve.sh         # restart the API cleanly on :4000
├── packages/shared/         # types + money/time/format helpers (+ 9 tests)
├── .env                     # DATABASE_URL, secrets (gitignored)
├── REVIEW.md                # spec critique and gap analysis
└── README.md
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

See `REVIEW.md` for each of these with the recommended fix.
