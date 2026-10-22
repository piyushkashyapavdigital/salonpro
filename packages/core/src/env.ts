import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const API_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(API_ROOT, '..', '..');

/** Load .env files if present (tiny parser, no dotenv dependency). */
function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(REPO_ROOT, '.env'));
loadEnvFile(path.join(API_ROOT, '.env'));

function str(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}
function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const NODE_ENV = str('NODE_ENV', 'development');
/**
 * Demo mode. With it on, the server shows one-time codes on screen instead of
 * sending them, and the developer PIN works too — that is what makes a hosted
 * demo usable. With it off the server refuses both.
 */
const ALLOW_DEV_OTP = bool('ALLOW_DEV_OTP', false);

export const env = {
  nodeEnv: NODE_ENV,
  port: num('PORT', 4000),
  repoRoot: REPO_ROOT,
  /**
   * Postgres connection. Neon in production:
   *   DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
   * Local runs and tests fall back to PGlite (Postgres in WASM, no server):
   *   DATABASE_URL=pglite:memory:            in-memory
   *   DATABASE_URL=pglite:file:<dir>         file-backed
   */
  databaseUrl: str('DATABASE_URL', `pglite:file:${path.join(REPO_ROOT, 'data', 'pglite')}`),

  /** Session tokens are stored hashed. Rotate this to invalidate all sessions. */
  sessionSecret: str('SESSION_SECRET', 'dev-session-secret-change-me'),
  sessionTtlDays: num('SESSION_TTL_DAYS', 30),

  /** OTP */
  otpLength: num('OTP_LENGTH', 6),
  otpTtlMinutes: num('OTP_TTL_MINUTES', 5),
  otpMaxAttempts: num('OTP_MAX_ATTEMPTS', 5),
  otpRateLimitPerHour: num('OTP_RATE_LIMIT_PER_HOUR', 10),
  /**
   * When no SMS/WhatsApp OTP provider is configured the API runs in
   * development mock mode: the generated code is returned in the response and
   * logged. The UI labels this clearly as DEV MODE. It never claims a real OTP
   * was delivered.
   */
  otpProviderConfigured: bool('OTP_PROVIDER_CONFIGURED', false),

  /** Razorpay */
  razorpayKeyId: str('RAZORPAY_KEY_ID'),
  razorpayKeySecret: str('RAZORPAY_KEY_SECRET'),
  razorpayWebhookSecret: str('RAZORPAY_WEBHOOK_SECRET'),
  /** Allows the built-in test checkout to post signed test payloads. */
  allowPaymentSimulation: bool('ALLOW_PAYMENT_SIMULATION', true),

  /** Notifications */
  whatsappToken: str('WHATSAPP_ACCESS_TOKEN'),
  whatsappPhoneId: str('WHATSAPP_PHONE_NUMBER_ID'),
  vapidPublicKey: str('VAPID_PUBLIC_KEY'),
  vapidPrivateKey: str('VAPID_PRIVATE_KEY'),
  vapidSubject: str('VAPID_SUBJECT', 'mailto:owner@salonpro.test'),

  webOrigin: str('WEB_ORIGIN', 'http://localhost:5173'),

  /**
   * Shared secret for the scheduled-jobs endpoint (`/api/internal/reminders`).
   * Unset means the endpoint answers 503 — it is never open by accident.
   */
  cronSecret: str('CRON_SECRET'),

  /**
   * A hosted demo may run with the development OTP mock on purpose. It is an
   * explicit acknowledgement, never a default: without it, a production server
   * refuses to issue a code it cannot actually send (503), exactly as before.
   */
  allowDevOtp: ALLOW_DEV_OTP,

  /**
   * PIN for the demo-only developer sign-in (`POST /api/auth/dev-login`).
   *
   * A development server and a hosted **demo** (one with `ALLOW_DEV_OTP` on —
   * the mode where the one-time code is shown on screen anyway) use the
   * documented default `1234`; set `DEV_LOGIN_PIN` to choose another. A real
   * deployment — demo mode off — gets no default at all, and the route is
   * closed there regardless.
   */
  devLoginPin: str('DEV_LOGIN_PIN', '') || (ALLOW_DEV_OTP || NODE_ENV !== 'production' ? '1234' : ''),

  /**
   * Postgres pool size. Serverless platforms run many short-lived instances per
   * database, so this stays small there (Neon's pooled endpoint multiplexes);
   * a single long-running process can afford more.
   */
  databasePoolMax: num('DATABASE_POOL_MAX', process.env.VERCEL ? 3 : 6),
} as const;

export const integrations = {
  razorpayLive: Boolean(env.razorpayKeyId && env.razorpayKeySecret),
  razorpayWebhook: Boolean(env.razorpayWebhookSecret),
  whatsapp: Boolean(env.whatsappToken && env.whatsappPhoneId),
  push: Boolean(env.vapidPublicKey && env.vapidPrivateKey),
  otpDelivery: env.otpProviderConfigured,
};

export type Integrations = typeof integrations;
