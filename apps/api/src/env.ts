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

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: num('PORT', 4000),
  databaseFile: str('DATABASE_FILE', path.join(REPO_ROOT, 'data', 'salonpro.db')),

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
  /** Serve the built SPA from the API (single-process production mode). */
  serveStatic: bool('SERVE_STATIC', true),
} as const;

export const integrations = {
  razorpayLive: Boolean(env.razorpayKeyId && env.razorpayKeySecret),
  razorpayWebhook: Boolean(env.razorpayWebhookSecret),
  whatsapp: Boolean(env.whatsappToken && env.whatsappPhoneId),
  push: Boolean(env.vapidPublicKey && env.vapidPrivateKey),
  otpDelivery: env.otpProviderConfigured,
};

export type Integrations = typeof integrations;
