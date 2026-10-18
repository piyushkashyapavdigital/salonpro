import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from './env';

/**
 * SQLite via the Node built-in driver (`node:sqlite`).
 *
 * Deliberately synchronous: the driver is synchronous and single-threaded, so a
 * check-then-insert inside `tx()` cannot interleave with another request. That
 * is what makes concurrent booking conflict checks and wallet credits safe
 * without an external lock service.
 */

fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });

export const sql = new DatabaseSync(env.databaseFile);

sql.exec('PRAGMA journal_mode = WAL;');
sql.exec('PRAGMA foreign_keys = ON;');
sql.exec('PRAGMA busy_timeout = 5000;');

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

export type Row = Record<string, any>;
type Bindable = string | number | bigint | null | Uint8Array | boolean | undefined;

function normalize(params: Bindable[]): (string | number | bigint | null | Uint8Array)[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export function one<T = Row>(query: string, ...params: Bindable[]): T | undefined {
  return sql.prepare(query).get(...normalize(params)) as T | undefined;
}

export function all<T = Row>(query: string, ...params: Bindable[]): T[] {
  return sql.prepare(query).all(...normalize(params)) as T[];
}

export function run(query: string, ...params: Bindable[]) {
  return sql.prepare(query).run(...normalize(params));
}

export function scalar<T = number>(query: string, ...params: Bindable[]): T {
  const row = one<Record<string, any>>(query, ...params);
  if (!row) return 0 as unknown as T;
  const values = Object.values(row);
  return (values[0] ?? 0) as T;
}

/**
 * Run a function inside an IMMEDIATE transaction. Nested calls are flattened
 * into the outer transaction. Any throw rolls the whole thing back.
 */
let txDepth = 0;
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  sql.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const result = fn();
    sql.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      sql.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw err;
  } finally {
    txDepth--;
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  passwordHash TEXT,
  isDemo INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  revokedAt TEXT,
  userAgent TEXT,
  ip TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  codeHash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',
  expiresAt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumedAt TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, createdAt);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(key, kind, createdAt);

CREATE TABLE IF NOT EXISTS salons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  ownerId TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  openingHours TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_branches_salon ON branches(salonId);

CREATE TABLE IF NOT EXISTS branch_settings (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(branchId, key)
);

CREATE TABLE IF NOT EXISTS user_branches (
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branchId TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (userId, branchId)
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  branchId TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  workingHours TEXT NOT NULL,
  commissionRules TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_branch ON staff(branchId, status);

CREATE TABLE IF NOT EXISTS staff_breaks (
  id TEXT PRIMARY KEY,
  staffId TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_breaks_staff ON staff_breaks(staffId, weekday);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id TEXT PRIMARY KEY,
  staffId TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  branchId TEXT NOT NULL,
  date TEXT NOT NULL,
  checkInAt TEXT,
  checkOutAt TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  UNIQUE(staffId, date)
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  durationMinutes INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  imageEmoji TEXT NOT NULL DEFAULT '✂️',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_services_salon ON services(salonId, active);

CREATE TABLE IF NOT EXISTS branch_services (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  serviceId TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  price INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(branchId, serviceId)
);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  reason TEXT,
  UNIQUE(branchId, date)
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  branchId TEXT NOT NULL,
  customerId TEXT NOT NULL REFERENCES users(id),
  staffId TEXT REFERENCES staff(id),
  servicesJson TEXT NOT NULL,
  date TEXT NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  durationMinutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',
  bookingSource TEXT NOT NULL DEFAULT 'app',
  referralId TEXT,
  couponCode TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  totalAmount INTEGER NOT NULL DEFAULT 0,
  paidAmount INTEGER NOT NULL DEFAULT 0,
  paymentStatus TEXT NOT NULL DEFAULT 'unpaid',
  paymentMethod TEXT,
  notes TEXT,
  createdBy TEXT,
  idempotencyKey TEXT UNIQUE,
  cancelledReason TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_branch_date ON appointments(branchId, date, status);
CREATE INDEX IF NOT EXISTS idx_appt_customer ON appointments(customerId, date DESC);
CREATE INDEX IF NOT EXISTS idx_appt_staff ON appointments(staffId, date);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status, date DESC);

CREATE TABLE IF NOT EXISTS customer_profiles (
  customerId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  salonId TEXT,
  lastVisitAt TEXT,
  totalVisits INTEGER NOT NULL DEFAULT 0,
  totalCompletedSpend INTEGER NOT NULL DEFAULT 0,
  preferredServices TEXT NOT NULL DEFAULT '[]',
  marketingConsent INTEGER NOT NULL DEFAULT 1,
  birthday TEXT,
  referredByCode TEXT,
  referralToken TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_lastvisit ON customer_profiles(lastVisitAt);
CREATE INDEX IF NOT EXISTS idx_profiles_spend ON customer_profiles(totalCompletedSpend DESC);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  customerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  UNIQUE(salonId, customerId)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  walletId TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  customerId TEXT NOT NULL,
  salonId TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balanceType TEXT NOT NULL,
  paymentId TEXT,
  referenceId TEXT,
  idempotencyKey TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'posted',
  reason TEXT,
  actorId TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wtx_wallet ON wallet_transactions(walletId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_wtx_customer ON wallet_transactions(customerId, createdAt DESC);

CREATE TABLE IF NOT EXISTS recharge_offers (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  payAmount INTEGER NOT NULL,
  bonusAmount INTEGER NOT NULL,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  customerId TEXT NOT NULL,
  razorpayOrderId TEXT NOT NULL UNIQUE,
  paymentId TEXT,
  amount INTEGER NOT NULL,
  amountPaid INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  mode TEXT NOT NULL DEFAULT 'test',
  referenceId TEXT,
  receipt TEXT,
  notes TEXT,
  signature TEXT,
  verifiedAt TEXT,
  idempotencyKey TEXT UNIQUE,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON payment_orders(customerId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON payment_orders(status);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  paymentOrderId TEXT,
  eventId TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  payload TEXT,
  processedAt TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  paymentOrderId TEXT,
  appointmentId TEXT,
  customerId TEXT NOT NULL,
  salonId TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  actorId TEXT NOT NULL,
  walletTransactionId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_codes (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  customerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refcodes_customer ON referral_codes(customerId);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  referrerId TEXT NOT NULL,
  referredCustomerId TEXT,
  referralCode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_attribution',
  qualifyingAppointmentId TEXT,
  referrerRewardStatus TEXT NOT NULL DEFAULT 'pending',
  refereeRewardStatus TEXT NOT NULL DEFAULT 'pending',
  referrerRewardAmount INTEGER NOT NULL DEFAULT 0,
  refereeRewardAmount INTEGER NOT NULL DEFAULT 0,
  attributionToken TEXT,
  createdAt TEXT NOT NULL,
  qualifiedAt TEXT,
  UNIQUE(referrerId, referredCustomerId)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrerId, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referredCustomerId);

CREATE TABLE IF NOT EXISTS reward_transactions (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  referralId TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  walletTransactionId TEXT,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rewards_customer ON reward_transactions(customerId);

CREATE TABLE IF NOT EXISTS notification_preferences (
  customerId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  whatsappConsent INTEGER NOT NULL DEFAULT 1,
  pushEnabled INTEGER NOT NULL DEFAULT 1,
  promotionalConsent INTEGER NOT NULL DEFAULT 1,
  quietHoursStart TEXT NOT NULL DEFAULT '21:00',
  quietHoursEnd TEXT NOT NULL DEFAULT '09:00',
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  customerId TEXT NOT NULL,
  channel TEXT NOT NULL,
  template TEXT NOT NULL,
  stage TEXT NOT NULL,
  scheduledAt TEXT NOT NULL,
  sentAt TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  errorDetails TEXT,
  body TEXT,
  reminderKey TEXT NOT NULL UNIQUE,
  appointmentId TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status, scheduledAt);
CREATE INDEX IF NOT EXISTS idx_notif_customer ON notifications(customerId, createdAt DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keysJson TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder_settings (
  salonId TEXT PRIMARY KEY,
  stagesJson TEXT NOT NULL,
  channelsJson TEXT NOT NULL,
  templatesJson TEXT NOT NULL,
  intervalsJson TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  value INTEGER NOT NULL,
  minAmount INTEGER NOT NULL DEFAULT 0,
  maxDiscount INTEGER,
  startAt TEXT NOT NULL,
  endAt TEXT NOT NULL,
  usageLimit INTEGER,
  usedCount INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  couponId TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  customerId TEXT NOT NULL,
  appointmentId TEXT,
  amount INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(couponId, appointmentId)
);

CREATE TABLE IF NOT EXISTS service_records (
  id TEXT PRIMARY KEY,
  appointmentId TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  customerId TEXT NOT NULL,
  staffId TEXT,
  salonId TEXT NOT NULL,
  branchId TEXT NOT NULL,
  servicesJson TEXT NOT NULL,
  grossAmount INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  finalAmount INTEGER NOT NULL,
  paymentMethod TEXT NOT NULL,
  walletAmount INTEGER NOT NULL DEFAULT 0,
  onlineAmount INTEGER NOT NULL DEFAULT 0,
  cashAmount INTEGER NOT NULL DEFAULT 0,
  completedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sr_customer ON service_records(customerId, completedAt DESC);
CREATE INDEX IF NOT EXISTS idx_sr_completed ON service_records(completedAt);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  customerId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  lifetimePoints INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  referenceId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actorId TEXT NOT NULL,
  action TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  meta TEXT,
  ip TEXT,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entityType, entityId);

CREATE TABLE IF NOT EXISTS data_requests (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  resolvedAt TEXT
);

CREATE TABLE IF NOT EXISTS app_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lastReminderRunAt TEXT,
  installedAt TEXT NOT NULL
);
`;

export function migrate() {
  sql.exec(SCHEMA);
  const row = one<{ id: number }>('SELECT id FROM app_meta WHERE id = 1');
  if (!row) {
    run('INSERT INTO app_meta (id, lastReminderRunAt, installedAt) VALUES (1, NULL, ?)', new Date().toISOString());
  }
}

export function resetDatabase() {
  const tables = all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  sql.exec('PRAGMA foreign_keys = OFF;');
  for (const t of tables) sql.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  sql.exec('PRAGMA foreign_keys = ON;');
}
