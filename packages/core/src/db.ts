import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from './env';

/**
 * Postgres data access.
 *
 * Production runs on Neon (`DATABASE_URL=postgresql://…`); local runs and the
 * test suite run on PGlite (`DATABASE_URL=pglite:memory:`), which is real
 * Postgres compiled to WASM — no server to install, same SQL semantics.
 *
 * The rest of the codebase only uses `one/all/run/scalar/tx`, and keeps writing
 * SQLite-flavoured SQL (`?` placeholders, camelCase identifiers). `toPg()`
 * translates it on the way out:
 *   - `?`            → `$1, $2, …`
 *   - camelCase name → "quoted", so Postgres preserves the case instead of
 *                      folding it to lowercase (which would break every
 *                      `row.createdAt` in the codebase).
 */

export type Row = Record<string, any>;
type Bindable = string | number | bigint | null | Uint8Array | boolean | undefined;

/* ------------------------------------------------------------------ */
/* SQL translation                                                     */
/* ------------------------------------------------------------------ */

/** Lower-case words that are reserved enough in Postgres to need quoting. */
const QUOTE_ALWAYS = new Set(['timestamp']);

function isWordStart(ch: string) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}
function isWordChar(ch: string) {
  return isWordStart(ch) || (ch >= '0' && ch <= '9');
}

/**
 * Rewrite a SQLite-flavoured statement for Postgres. String literals and
 * comments are copied through untouched (so a `?` or a camelCase word inside a
 * literal is never rewritten).
 */
export function toPg(sql: string): string {
  let out = '';
  let i = 0;
  let params = 0;

  while (i < sql.length) {
    const ch = sql[i]!;

    if (ch === "'") {
      out += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            out += "''";
            i += 2;
            continue;
          }
          out += "'";
          i++;
          break;
        }
        out += sql[i++];
      }
      continue;
    }

    if (ch === '"') {
      out += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === '"') {
          out += '"';
          i++;
          break;
        }
        out += sql[i++];
      }
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') out += sql[i++];
      continue;
    }

    if (ch === '?') {
      params += 1;
      out += `$${params}`;
      i++;
      continue;
    }

    if (isWordStart(ch)) {
      let j = i;
      while (j < sql.length && isWordChar(sql[j]!)) j++;
      const word = sql.slice(i, j);
      const camel = /^[a-z]/.test(word) && /[A-Z]/.test(word);
      out += camel || QUOTE_ALWAYS.has(word) ? `"${word}"` : word;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function normalize(params: (Bindable | unknown)[]): unknown[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

/* ------------------------------------------------------------------ */
/* Connections                                                         */
/* ------------------------------------------------------------------ */

interface Result {
  rows: Row[];
  rowCount: number;
}
interface Conn {
  query(sql: string, params?: unknown[]): Promise<Result>;
  release?(): void;
}
interface Driver {
  /** True when every query shares one connection (PGlite) and must be queued. */
  singleConnection: boolean;
  query(sql: string, params: unknown[]): Promise<Result>;
  connect(): Promise<Conn>;
  end(): Promise<void>;
}

const store = new AsyncLocalStorage<Conn>();

let driver: Driver | null = null;
let starting: Promise<Driver> | null = null;

function wrapRows(rows: Row[]): Row[] {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (typeof row[key] === 'bigint') row[key] = Number(row[key]);
    }
  }
  return rows;
}

async function createDriver(): Promise<Driver> {
  const url = env.databaseUrl;
  if (url.startsWith('pglite:')) {
    /* `pglite:/abs/path`, `pglite:file:/abs/path` and `pglite:file:///abs/path`
     * all mean the same directory — PGlite only understands the bare path, and
     * anything else silently becomes a relative folder named "file:". */
    const target = url.slice('pglite:'.length).replace(/^file:\/\//, '').replace(/^file:/, '');
    const { PGlite } = await import('@electric-sql/pglite');
    const db = target === 'memory:' || target === '' ? new PGlite() : new PGlite(target);
    await db.waitReady;
    const conn: Conn = {
      async query(sql, params) {
        const res = await db.query(sql, (params ?? []) as any[]);
        return res as unknown as Result;
      },
    };
    return {
      singleConnection: true,
      query: (sql, params) => conn.query(sql, params),
      connect: async () => conn,
      end: async () => {
        await db.close();
      },
    };
  }

  const pg = (await import('pg')).default;
  /* int8 (COUNT/SUM) arrives as a string by default — make it a number so
   * arithmetic in the API keeps working. */
  pg.types.setTypeParser(20, (v: string) => Number(v));
  pg.types.setTypeParser(1700, (v: string) => Number(v));

  const pool = new pg.Pool({
    connectionString: url,
    /* Serverless opens a pool per instance; Neon's pooled endpoint multiplexes
     * those, so keep the per-instance ceiling low. */
    max: env.databasePoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
  });

  const shape = (res: any): Result => ({ rows: wrapRows(res.rows ?? []), rowCount: res.rowCount ?? 0 });

  return {
    singleConnection: false,
    async query(sql, params) {
      return shape(await pool.query(sql, params));
    },
    async connect() {
      const client = await pool.connect();
      return {
        async query(sql, params) {
          return shape(await client.query(sql, params));
        },
        release: () => client.release(),
      };
    },
    end: async () => {
      await pool.end();
    },
  };
}

function ready(): Promise<Driver> {
  if (!driver) starting ??= createDriver().then((d) => (driver = d));
  return Promise.resolve(driver ?? starting!);
}

export async function closeDatabase(): Promise<void> {
  if (driver) await driver.end();
  driver = null;
  starting = null;
}

/* ------------------------------------------------------------------ */
/* Single-connection queue (PGlite)                                    */
/* ------------------------------------------------------------------ */

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

async function execute(sql: string, params: unknown[]): Promise<Result> {
  const d = await ready();
  const conn = store.getStore();
  const text = toPg(sql);
  const values = normalize(params);
  if (conn) return conn.query(text, values);
  if (d.singleConnection) return enqueue(() => d.query(text, values));
  return d.query(text, values);
}

export async function one<T = Row>(query: string, ...params: Bindable[]): Promise<T | undefined> {
  const res = await execute(query, params);
  return res.rows[0] as T | undefined;
}

export async function all<T = Row>(query: string, ...params: Bindable[]): Promise<T[]> {
  const res = await execute(query, params);
  return res.rows as T[];
}

export async function run(query: string, ...params: Bindable[]): Promise<{ rowCount: number }> {
  const res = await execute(query, params);
  return { rowCount: res.rowCount };
}

export async function scalar<T = number>(query: string, ...params: Bindable[]): Promise<T> {
  const row = await one<Record<string, any>>(query, ...params);
  if (!row) return 0 as unknown as T;
  const values = Object.values(row);
  return (values[0] ?? 0) as T;
}

/**
 * Run a function inside a transaction. Nested calls join the outer transaction.
 * On Postgres each transaction gets its own pooled connection, so concurrent
 * requests never share one; on PGlite (a single connection) transactions are
 * serialised through the queue.
 */
export async function tx<T>(fn: () => Promise<T> | T): Promise<T> {
  const existing = store.getStore();
  if (existing) return fn();

  const d = await ready();
  const work = async (): Promise<T> => {
    const conn = await d.connect();
    try {
      await conn.query('BEGIN');
      const result = await store.run(conn, async () => fn());
      await conn.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await conn.query('ROLLBACK');
      } catch {
        /* the connection is already unusable — the release below recovers it */
      }
      throw err;
    } finally {
      conn.release?.();
    }
  };

  return d.singleConnection ? enqueue(work) : work();
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
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'trial',
  trialEndsAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);
ALTER TABLE salons ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS trialEndsAt TEXT;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS updatedAt TEXT;
CREATE INDEX IF NOT EXISTS idx_salons_status ON salons(status);

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

CREATE TABLE IF NOT EXISTS salon_reviews (
  id TEXT PRIMARY KEY,
  salonId TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL DEFAULT '',
  customerName TEXT,
  customerPhone TEXT,
  googleRedirected INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'hosted_review',
  userAgent TEXT,
  ip TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_salon ON salon_reviews(salonId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON salon_reviews(salonId, rating);

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

/**
 * Bump when `SCHEMA` changes. `ensureSchema()` compares it with what the
 * database reports and only then runs the migrations.
 */
export const SCHEMA_VERSION = '3';

/**
 * Create the schema if this database has never seen it.
 *
 * Serverless functions boot many times an hour, and `migrate()` issues one
 * round trip per statement — running it on every cold start would be both slow
 * and pointless. One cheap read decides it, and the version row makes a future
 * schema change automatic instead of a manual step.
 */
export async function ensureSchema(): Promise<'created' | 'current' | 'upgraded'> {
  try {
    const row = await one<{ value: string }>('SELECT value FROM schema_meta WHERE key = ?', 'version');
    if (row?.value === SCHEMA_VERSION) return 'current';
    await migrate();
    await run(
      `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      SCHEMA_VERSION,
    );
    return row ? 'upgraded' : 'created';
  } catch {
    /* No schema_meta table yet — this is a brand-new database. */
    await migrate();
    await run(
      `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      SCHEMA_VERSION,
    );
    return 'created';
  }
}

export async function migrate(): Promise<void> {
  /* One statement per round trip: Postgres refuses multiple commands in a
   * single prepared statement, which is how both drivers send parameterised
   * queries. Statements are separated by `;` and the schema contains no
   * semicolons inside literals, so a plain split is safe. */
  for (const statement of SCHEMA.split(';')) {
    const trimmed = statement.trim();
    if (trimmed) await run(trimmed);
  }
  await run(
    'INSERT INTO app_meta (id, lastReminderRunAt, installedAt) VALUES (1, NULL, ?) ON CONFLICT (id) DO NOTHING',
    new Date().toISOString(),
  );
}

/** Drop every table in the public schema (tests and `seed --reset`). */
export async function resetDatabase(): Promise<void> {
  const tables = await all<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  for (const t of tables) {
    await run(`DROP TABLE IF EXISTS "${t.table_name}" CASCADE`);
  }
}

/** Absolute path helper kept for callers that still reference the data dir. */
export const dataDir = path.resolve(env.repoRoot, 'data');
