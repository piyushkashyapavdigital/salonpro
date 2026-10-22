# Deploying SalonPro to Vercel

Everything the customer APK and the admin APK talk to is one API: `apps/next`
(Next.js App Router on Vercel) in front of **packages/core**, talking to **Neon
Postgres**. There is no Express server and no second service to host.

> **What gets deployed:** only `apps/next` — the API. The mobile apps are React
> Native and are built separately (see the README); the deployed API is all they
> need.

## 1. Point the repo at Neon

You need the connection string from your local `.env`:

```bash
grep '^DATABASE_URL=' .env
```

It looks like `postgresql://user:pass@ep-….neon.tech/neondb?sslmode=require`.
Use Neon's **pooled** endpoint (the host with `-pooler`) — Vercel runs many
short-lived instances and the pooler multiplexes them.

## 2. Import the project (browser, one time)

1. <https://vercel.com> → **Add New… → Project** → **Import** the GitHub repo
   `piyushkashyapavdigital/salonpro`.
2. **Root Directory → `apps/next`** (click *Edit* next to it). This single
   setting is the important one: the repo root is a **Bun workspace**, Vercel
   sees the `bun.lock` at the repo root and installs with Bun, and the build then
   runs inside `apps/next`. The framework (Next.js) is detected automatically.
3. **Environment Variables** — add these for Production (and Preview if you
   like). `SESSION_SECRET` and `CRON_SECRET` are in `deploy-secrets.local.txt`
   (generated for you; keep that file off git — it already is):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your Neon pooled string, with `?sslmode=require` |
   | `SESSION_SECRET` | from `deploy-secrets.local.txt` (rotating it signs everyone out) |
   | `CRON_SECRET` | from `deploy-secrets.local.txt` — the reminder endpoints answer 503 without it, by design |
   | `ALLOW_DEV_OTP` | *only for demos*: `true` makes the OTP visible on screen and the apps say no SMS was sent. Leave unset for real use (production then refuses rather than faking a code). |
   | `DEV_LOGIN_PIN` | *only for demos*: the PIN for the developer sign-in that opens a seeded account (Platform / Salon owner / Client / Manager / Reception). Defaults to `1234` while `ALLOW_DEV_OTP` is on (a hosted demo); set it to something private to change it. With demo mode **off** the route is closed and the app hides its demo card. |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | optional — test keys flip checkout from the simulated path to the real sheet; the webhook secret keeps verification server-side |
   | `OTP_PROVIDER_CONFIGURED` + your SMS/WhatsApp provider vars (see `.env.example`) | optional — a real OTP channel |

4. **Deploy**. First build takes ~1–2 minutes.

## 3. Verify

```bash
curl -s https://<your-project>.vercel.app/api/health | head -c 400
```

You want `{"ok":true,...}`. The response is honest about integrations: with no
provider configured you will see `otpDelivery:false`, `razorpay:false`, `push:false`.

## 4. Point the apps at it

- **APK**: sign-in screen → tap the *Salon server address* card → paste
  `https://<your-project>.vercel.app`. The app checks the address really answers
  as a SalonPro server before saving it. (Rebuilding with
  `SALONPRO_API_BASE=https://<your-project>.vercel.app bash scripts/build-mobile-apks.sh`
  just makes it the default.)

## 5. Connect Google reviews

The first request after deploy runs the schema migration that adds
`salon_reviews` automatically. The current schema version is **4**: the table
also carries `customerId` and `appointmentId`, so a review can be attached to
the customer and the visit it came from (the customer app asks the API for a
short-lived review token for a completed visit; the hosted page then shows
“Reviewing as …” and no name or phone is ever typed again). One review per
visit is enforced by a unique index on `appointmentId`. Then, in the app:

1. Sign in as the salon owner → **More → Settings → Google reviews**.
2. Paste the salon's Google **Place ID** (or a Google Maps URL containing
   `place_id` / `query_place_id`) and tap **Connect Google**.
3. Share the displayed hosted review page: `https://<your-project>.vercel.app/r/<salonId>`.

Verify the public page and API:

```bash
curl -s https://<your-project>.vercel.app/api/public/reviews/<salonId> | head -c 400
```

`googleConfigured` should be `true`. If no Place ID is set, 4–5★ feedback is
still saved for the salon, but customers are told Google is not connected and
are never sent to a dead Google link.

## 6. Reminder sweeps (day 7/14/30 + tomorrow's appointments)

Vercel's free plan runs cron **once a day** (the two jobs in
`apps/next/vercel.json` stay as a backstop). The 15-minute sweeps are done by
the GitHub Actions workflow `.github/workflows/reminders.yml`, which is already
in the repo:

1. Repo → **Settings → Secrets and variables → Actions**
2. **Variable**: `SALONPRO_API_URL` = `https://<your-project>.vercel.app`
3. **Secret**: `CRON_SECRET` — already set by the setup; just make sure it is
   the *same* value you pasted into Vercel.

Until both exist the workflow prints a warning and exits green — a fresh clone
shows no red.

## Free-tier notes

- Vercel Hobby: 2 cron jobs, once per day each — fine, because the GitHub
  workflow covers the frequent sweeps.
- Neon free plan sleeps when idle; the first request after a nap is slower
  (seconds, not minutes).
- `DATABASE_POOL_MAX` defaults to `3` when Vercel is detected; the pooler makes
  that safe.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build fails with "No Next.js version detected" | The project's **Root Directory** is not `apps/next` |
| Build fails resolving `@salonpro/core` | Same cause — import the repo through Git (dashboard) so the whole workspace is uploaded. Do **not** run the Vercel CLI from inside `apps/next`; it uploads only that folder. From the repo root, prefer the dashboard or `bunx vercel --cwd apps/next`. |
| `/api/internal/reminders` answers 503 | `CRON_SECRET` is unset — deliberate; set it |
| Sign-in says it cannot send a code (503) | No SMS provider configured and `ALLOW_DEV_OTP` is off — exactly the promise: it never pretends an SMS was sent |
| Razorpay sheet doesn't appear in the APK build | The APK in the release includes `react-native-razorpay`; a **rebuild from source** needs `bun install` inside `apps/mobile-customer` first |
