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
| DB | `node:sqlite` (`DatabaseSync`), WAL | Zero external deps; synchronous writes make check-then-insert atomic without a lock service |
| Validation | `zod` | One schema per boundary |
| Scheduling | `node-cron` | Reminder passes |

Money is stored as **integer paise** everywhere. The wallet is an **append-only
ledger**; balances are always derived from the sum of posted rows.

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

---

## Quick start

```bash
npm install
npm run seed -- --reset     # create + populate the demo database
npm run dev                 # API on :4000, web on :5173
```

Then open <http://localhost:5173>.

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

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs API + web together |
| `npm run seed -- --reset` | Drops and reseeds demo data |
| `npm run build` | Typechecks and builds the customer SPA + PWA (`apps/web/dist`) |
| `npm run build:admin` | Builds the dashboard-only bundle (`apps/web/dist-admin`, `VITE_APP_MODE=admin`) |
| `npm start` | Runs the API (serves `apps/web/dist` if built) |
| `bash scripts/serve.sh` | Kills a stale API on `:4000`, then starts a fresh one |
| `npm run typecheck` | TypeScript for API + web (tests included) |
| `npm test` | Full test suite: shared + API + web |

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
npm install && npm run seed -- --reset && bash scripts/build-apk.sh customer && bash scripts/build-apk.sh admin
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
  a second press ("press back again to exit") — handled in `lib/native.ts`.
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

The suite runs on Node's built-in test runner (API/shared) and Vitest (web). No
network or external services are needed: the API harness boots the real Express
app on an ephemeral port against a throwaway SQLite file, seeded deterministically.

```bash
npm test              # everything (122 tests)
npm run test:shared   # pure helpers: money, time, masking (9)
npm run test:api      # integration: auth, booking, wallet, payments, referrals, RBAC, validation, analytics (72)
npm run test:web      # UI: api client, design system, full-app render smoke (41)
```

What the suites cover:

- **Shared (9)** — paise formatting, rupee round-tripping, phone masking, time
  conversion, date math, status labels.
- **API (72)** — OTP flow and its honesty; session tokens stored hashed; booking
  availability, idempotency, overlap → 409, the appointment state machine, the
  service record; wallet recharge/replay, **bonus-before-cash** spending,
  insufficient-balance → 409, append-only invariant, adjustment audit; payment
  order creation, **real signature verification**, tampered-signature rejection,
  signed webhook crediting once and ignoring replays; referral attribution,
  self-referral and first-touch guards, ₹50+₹50 once, refund reversal; RBAC and
  branch scoping; validation and error-shape semantics; analytics and Top-20.
- **Web (41)** — the API client's token/401/error-shape behaviour and file
  download; every design-system primitive; and full-app render smoke tests for
  public routes, the customer shell, the admin shell, and the route guards.

### Test architecture

- `apps/api/test/setup-env.ts` sets a throwaway `DATABASE_FILE` and generous rate
  limits. It must be the **first import** so env is set before any `src` module
  loads.
- `apps/api/test/harness.ts` exports `getHarness()`: it resets + reseeds, builds
  the app, listens on port `0`, and returns typed `get/post/patch/request/login`
  helpers plus direct `db` access. `index.ts` was split into `app.ts`
  (`buildApp()`, side-effect free) so tests can mount it without a listener or a
  scheduler.
- `apps/web/test/setup.ts` wires `@testing-library/jest-dom`, cleans up between
  tests, and shims `matchMedia`/`scrollTo` for jsdom.

`apps/api/src/**` is fully typechecked together with tests, so `npm run typecheck`
fails on a broken test as well as broken app code.

---

## Configuration (all optional)

Copy `.env.example` to `.env` (loaded by a tiny built-in parser — no `dotenv`).

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_FILE` | `data/salonpro.db` | SQLite file (tests override this) |
| `SESSION_SECRET` | dev value | Key for hashed session tokens; rotate to sign everyone out |
| `SESSION_TTL_DAYS` | `30` | Session lifetime |
| `OTP_PROVIDER_CONFIGURED` | `false` | If false, OTP is a labelled dev mock |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | empty | When set, live-ish mode; otherwise **simulated** |
| `RAZORPAY_WEBHOOK_SECRET` | empty | Webhook HMAC secret (falls back to a dev secret) |
| `ALLOW_PAYMENT_SIMULATION` | `true` | Lets the built-in test checkout post signed payloads |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | empty | WhatsApp delivery |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | empty | Web push |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `SERVE_STATIC` | `true` | Serve the built SPA from the API |
| `NODE_ENV` | `development` | `production` disables demo login + excludes demo data |

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
  labels it `DEV MODE` with the notice "no real SMS was sent".
- **Reminders / push / WhatsApp** — without providers, messages are recorded as
  `pending`. The system never writes `sent`.

---

## Why not Convex / Freebuff (as the spec suggested)?

The spec proposed a managed backend. This build deliberately uses
Node + Express + SQLite so that it is **self-contained and runs with zero
credentials**, which is what makes it testable and reviewable offline. The service
layer isolates money through a single `tx()` transaction boundary, so moving to
Postgres (or a managed backend) is a driver swap rather than a rewrite. See
`REVIEW.md` §10 for the migration path.

---

## Project layout

```
salonpro/
├── apps/
│   ├── api/                 # Express API + SQLite
│   │   ├── src/
│   │   │   ├── app.ts       # buildApp() — side-effect-free Express app
│   │   │   ├── index.ts     # listener + scheduler bootstrap
│   │   │   ├── db.ts        # schema + query/tx helpers
│   │   │   ├── auth.ts      # password hashing, sessions, RBAC, audit
│   │   │   ├── routes/      # auth, catalog, customer, admin, payments
│   │   │   └── services/    # wallet, booking, payments, refunds, referral, …
│   │   └── test/            # harness + 72 integration tests
│   └── web/                 # React PWA (shared source for both apps)
│       ├── src/pages/       # customer/ and admin/ screens
│       ├── src/lib/mode.ts  # VITE_APP_MODE: customer vs admin build
│       ├── dist/            # customer bundle
│       ├── dist-admin/      # admin bundle (dashboard only)
│       └── test/            # 41 UI + render tests
├── apps/admin/              # Capacitor shell for SalonPro Admin (com.salonpro.admin)
│   ├── capacitor.config.ts
│   └── android/             # generated Gradle project + launcher icons
├── scripts/build-apk.sh     # build/install either APK over USB
├── packages/shared/         # types + money/time/format helpers (+ 9 tests)
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
