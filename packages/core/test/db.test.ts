import { test, beforeAll as before, afterAll as after, beforeEach, describe } from 'bun:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getHarness, type Harness } from './harness';
import { toPg } from '../src/db';

/*
 * Database-layer tests.
 *
 * The API talks SQLite-flavoured SQL (?, camelCase columns) to a Postgres
 * database. Everything above `db.ts` assumes that translation is invisible, so
 * the tests here pin the two things that would break silently: the translator
 * and transaction semantics. The audit/ledger rules are checked at the source
 * level too — an `UPDATE wallet_transactions` would compile and pass every
 * other test while destroying the append-only guarantee.
 */

/* ------------------------------------------------------------------ */
/* SQL translation (pure)                                              */
/* ------------------------------------------------------------------ */

describe('toPg', () => {
  test('numbers placeholders in order', () => {
    assert.equal(
      toPg('SELECT * FROM users WHERE phone = ? AND role = ?'),
      'SELECT * FROM users WHERE phone = $1 AND role = $2',
    );
  });

  test('quotes camelCase identifiers so Postgres keeps their case', () => {
    assert.equal(
      toPg('SELECT createdAt, salonId FROM wallets WHERE customerId = ?'),
      'SELECT "createdAt", "salonId" FROM wallets WHERE "customerId" = $1',
    );
  });

  test('quotes `timestamp`, which Postgres reserves', () => {
    assert.equal(toPg('SELECT timestamp FROM ledger'), 'SELECT "timestamp" FROM ledger');
  });

  test('leaves snake_case words alone', () => {
    assert.equal(
      toPg('SELECT wallet_transactions.id FROM wallet_transactions'),
      'SELECT wallet_transactions.id FROM wallet_transactions',
    );
  });

  test('never rewrites placeholders or identifiers inside string literals', () => {
    assert.equal(
      toPg("SELECT * FROM notes WHERE body = 'why? see createdAt' AND id = ?"),
      "SELECT * FROM notes WHERE body = 'why? see createdAt' AND id = $1",
    );
  });

  test('handles the SQL escaping of a doubled quote', () => {
    assert.equal(toPg("SELECT 'it''s ? fine' AS x WHERE id = ?"), "SELECT 'it''s ? fine' AS x WHERE id = $1");
  });

  test('copies comments through and does not number a ? inside one', () => {
    assert.equal(toPg('SELECT 1 -- is this a param? no\n, ? AS x'), 'SELECT 1 -- is this a param? no\n, $1 AS x');
  });

  test('leaves double-quoted identifiers untouched', () => {
    assert.equal(toPg('SELECT "alreadyQuoted" FROM t WHERE id = ?'), 'SELECT "alreadyQuoted" FROM t WHERE id = $1');
  });
});

/* ------------------------------------------------------------------ */
/* Driver behaviour                                                    */
/* ------------------------------------------------------------------ */

describe('query helpers', () => {
  let h: Harness;

  before(async () => {
    h = await getHarness();
  });

  beforeEach(async () => {
    await h.reset();
  });

  after(async () => {
    await h.close();
  });

  test('scalar returns a number for COUNT and SUM, not a bigint string', async () => {
    const users = await h.db.scalar('SELECT COUNT(*) FROM users');
    assert.equal(typeof users, 'number');
    assert.ok(users > 0);

    const total = await h.db.scalar('SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions');
    assert.equal(typeof total, 'number');
  });

  test('one returns undefined for an empty result', async () => {
    const row = await h.db.one('SELECT id FROM users WHERE phone = ?', '0000000000');
    assert.equal(row, undefined);
  });

  test('all returns every matching row in insertion order', async () => {
    const rows = await h.db.all<{ payAmount: number }>('SELECT payAmount FROM recharge_offers ORDER BY payAmount');
    assert.ok(rows.length >= 3);
    for (const row of rows) assert.equal(typeof row.payAmount, 'number');
  });

  test('run reports the number of affected rows', async () => {
    const result = await h.db.run(
      "INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      'db-test-key',
      'hello',
    );
    assert.equal(result.rowCount, 1);
    assert.equal(await h.db.scalar("SELECT value FROM schema_meta WHERE key = 'db-test-key'"), 'hello');
  });

  test('booleans bind as integers (SQLite-flavoured code passes true/false)', async () => {
    await h.db.run(
      "INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      'db-test-bool',
      true as unknown as string,
    );
    assert.equal(await h.db.scalar("SELECT value FROM schema_meta WHERE key = 'db-test-bool'"), '1');
  });

  test('concurrent reads all resolve on the single-connection test driver', async () => {
    const values = await Promise.all(Array.from({ length: 25 }, () => h.db.scalar('SELECT COUNT(*) FROM users')));
    assert.equal(new Set(values).size, 1);
  });
});

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

describe('transactions', () => {
  let h: Harness;

  before(async () => {
    h = await getHarness();
  });

  beforeEach(async () => {
    await h.reset();
  });

  after(async () => {
    await h.close();
  });

  const setMeta = (key: string, value: string) =>
    h.db.run('INSERT INTO schema_meta (key, value) VALUES (?, ?)', key, value);

  test('commits every write when the function resolves', async () => {
    await h.db.tx(async () => {
      await setMeta('tx-a', '1');
      await setMeta('tx-b', '2');
    });
    assert.equal(await h.db.scalar("SELECT COUNT(*) FROM schema_meta WHERE key IN ('tx-a','tx-b')"), 2);
  });

  test('rolls the whole transaction back when the function throws', async () => {
    await assert.rejects(
      h.db.tx(async () => {
        await setMeta('tx-c', '1');
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(await h.db.scalar("SELECT COUNT(*) FROM schema_meta WHERE key = 'tx-c'"), 0);
  });

  test('nested tx calls join the outer transaction instead of committing early', async () => {
    await assert.rejects(
      h.db.tx(async () => {
        await setMeta('tx-outer', '1');
        await h.db.tx(async () => {
          await setMeta('tx-inner', '1');
        });
        throw new Error('outer failed after the inner committed');
      }),
    );
    /* Neither row may survive: a nested commit would have left `tx-inner`. */
    assert.equal(await h.db.scalar("SELECT COUNT(*) FROM schema_meta WHERE key IN ('tx-outer','tx-inner')"), 0);
  });

  test('a nested transaction that throws aborts the outer one', async () => {
    await assert.rejects(
      h.db.tx(async () => {
        await setMeta('tx-d', '1');
        await h.db.tx(async () => {
          throw new Error('inner');
        });
        await setMeta('tx-e', '1');
      }),
      /inner/,
    );
    assert.equal(await h.db.scalar("SELECT COUNT(*) FROM schema_meta WHERE key IN ('tx-d','tx-e')"), 0);
  });

  test('a transaction does not wedge the driver for the next query', async () => {
    await assert.rejects(h.db.tx(async () => {
      throw new Error('still fine');
    }));
    assert.equal(await h.db.scalar('SELECT 1 AS n'), 1);
  });
});

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

describe('schema', () => {
  let h: Harness;

  before(async () => {
    h = await getHarness();
  });

  after(async () => {
    await h.close();
  });

  test('migrate() is idempotent', async () => {
    await h.db.migrate();
    await h.db.migrate();
    const users = await h.db.scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'");
    assert.ok(users >= 20, `expected the full schema, found ${users} tables`);
  });

  test('every table the API needs exists', async () => {
    const required = [
      'users', 'sessions', 'salons', 'branches', 'staff', 'services', 'branch_services',
      'appointments', 'wallets', 'wallet_transactions', 'payment_orders', 'payment_events',
      'refunds', 'referral_codes', 'referrals', 'reward_transactions', 'notifications',
      'notification_preferences', 'push_subscriptions', 'reminder_settings', 'coupons',
      'coupon_redemptions', 'service_records', 'loyalty_accounts', 'loyalty_transactions',
      'salon_reviews', 'audit_logs', 'data_requests', 'app_meta',
    ];
    for (const table of required) {
      const exists = await h.db.scalar(
        'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        'public',
        table,
      );
      assert.equal(exists, 1, `missing table ${table}`);
    }
  });

  test('the ledger is append-only in the code, not just by convention', () => {
    const serviceDir = path.resolve(import.meta.dirname, '../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        /* db.ts builds the schema; a schema-level UPDATE is still forbidden. */
        const sql = fs.readFileSync(full, 'utf8');
        /* Only monetary columns are immutable: a reversal legitimately flips
         * `status` to 'reversed' and then inserts a compensating row. */
        if (/UPDATE\s+wallet_transactions\s+SET\s+(amount|balanceType|walletId|customerId|type)\b/i.test(sql)) {
          offenders.push(`${entry.name}: UPDATE`);
        }
        if (/DELETE\s+FROM\s+wallet_transactions\b/i.test(sql)) offenders.push(`${entry.name}: DELETE`);
      }
    };
    walk(serviceDir);
    /* A monetary UPDATE is never legitimate. A DELETE only exists in the reset
     * helper, which truncates the whole database on purpose. */
    const updates = offenders.filter((o) => o.endsWith(': UPDATE'));
    const deletes = offenders.filter((o) => o.endsWith(': DELETE') && !o.startsWith('db.ts'));
    assert.deepEqual(updates, [], `ledger corrections must be compensating INSERTs, found: ${updates.join(', ')}`);
    assert.deepEqual(deletes, [], `nothing may delete ledger rows, found: ${deletes.join(', ')}`);
  });
});
