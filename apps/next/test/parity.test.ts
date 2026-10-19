/**
 * Vercel-path parity tests.
 *
 * The API suite proves `dispatch()` behaves; these prove the *deployed* path —
 * a Vercel request → the Next.js route handler → `dispatch()` → a `Response` —
 * behaves the same, and that the two serverless-specific pieces (the one-time
 * schema gate, the cron endpoint) work on a database that has never seen
 * SalonPro.
 *
 * Everything runs against the throwaway in-memory PGlite the API tests use.
 */
import './setup-env';
import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSchema } from '@salonpro/core/db';
import { ACCOUNTS, getHarness, type Harness } from '../../../packages/core/test/harness';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** The same shape Vercel calls the handler with. */
async function call(
  path: string,
  init: { method?: Method; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: Headers; body: any }> {
  const routes = await import('../app/api/[...path]/route');
  const method = init.method ?? 'GET';
  const handler = routes[method] as (request: Request) => Promise<Response>;

  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const hasBody = init.body !== undefined && method !== 'GET' && method !== 'HEAD';
  if (hasBody) headers['content-type'] = 'application/json';

  const request = new Request(new URL(path, 'https://salonpro.test'), {
    method,
    headers,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });

  const response = await handler(request);
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}

/** The cron endpoint lives in its own module. */
async function cron(path: string, headers: Record<string, string> = {}) {
  const routes = await import('../app/api/internal/reminders/[[...job]]/route');
  const response = await routes.GET(
    new Request(new URL(path, 'https://salonpro.test'), { headers }),
    { params: Promise.resolve({ job: path.split('/').filter(Boolean).slice(3) }) },
  );
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

let h: Harness;

before(async () => {
  h = await getHarness();
});

after(async () => {
  await h.close();
});

describe('the Vercel request path', () => {
  test('answers /api/health the way the tested dispatcher does', async () => {
    const direct = await h.get('/health');
    const deployed = await call('/api/health');

    assert.equal(deployed.status, direct.status);
    assert.equal(deployed.body.ok, true);
    assert.equal(typeof deployed.body.integrations, 'object');
    assert.equal(deployed.headers.get('x-content-type-options'), 'nosniff');
    /* Same payload (the clock is the only thing that can differ). */
    assert.deepEqual(
      { ...deployed.body, time: null },
      { ...direct.data, time: null },
    );
  });

  test('signs a customer in end to end: OTP request → verify → me', async () => {
    const requested = await call('/api/auth/otp/request', {
      method: 'POST',
      body: { phone: ACCOUNTS.customer1 },
    });
    assert.equal(requested.status, 200);
    /* Development mode is on in tests, so the code comes back on screen — and
     * the response says so instead of pretending an SMS was delivered. */
    assert.equal(requested.body.deliveryMode, 'development_mock');
    assert.match(String(requested.body.devCode), /^\d{6}$/);
    assert.match(String(requested.body.notice), /no real sms was sent/i);

    const verified = await call('/api/auth/otp/verify', {
      method: 'POST',
      body: { phone: ACCOUNTS.customer1, code: requested.body.devCode },
    });
    assert.equal(verified.status, 200);
    assert.ok(verified.body.token);

    const me = await call('/api/auth/me', { token: verified.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.phone, ACCOUNTS.customer1);
  });

  test('refuses an unauthenticated protected route with 401', async () => {
    const res = await call('/api/customer/bookings');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthorized');
  });

  test('keeps the structured 404 for an unknown route', async () => {
    const res = await call('/api/nope/not-a-route');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
    assert.match(res.body.message, /is not a route/);
  });

  test('keeps a rejected input as 400 with a readable message', async () => {
    const res = await call('/api/auth/otp/request', { method: 'POST', body: { phone: '12' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.match(res.body.message, /10 digit mobile number/i);
  });

  test('keeps schema validation errors as 400 with field details', async () => {
    const otp = await call('/api/auth/otp/request', {
      method: 'POST',
      body: { phone: ACCOUNTS.customer1 },
    });
    const verified = await call('/api/auth/otp/verify', {
      method: 'POST',
      body: { phone: ACCOUNTS.customer1, code: otp.body.devCode },
    });

    /* An empty service selection is a schema violation, not a hand-written
     * check — the dispatcher has to translate a ZodError. */
    const res = await call('/api/customer/bookings', {
      method: 'POST',
      token: verified.body.token,
      body: { branchId: 'whatever', serviceIds: [], date: '2030-01-01', startTime: '10:00' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'validation_error');
    assert.ok(Array.isArray(res.body.details));
  });

  test('answers a CORS preflight with a bodyless 204 (the Response API rejects one)', async () => {
    const res = await call('/api/auth/otp/request', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost' },
    });
    assert.equal(res.status, 204);
    assert.equal(res.body, null);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost');
  });

  test('allows a local browser origin through (CORS allow-list)', async () => {
    const res = await call('/api/health', { headers: { origin: 'https://localhost' } });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://localhost');
  });
});

describe('serverless specifics', () => {
  test('the schema gate creates the schema once and then reports current', async () => {
    /* The health call above already ran it against this fresh database. */
    const first = await ensureSchema();
    assert.equal(first, 'current');
    assert.equal(await ensureSchema(), 'current');
  });

  test('the cron endpoint refuses without the secret', async () => {
    const missing = await cron('/api/internal/reminders');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error, 'unauthorized');

    const wrong = await cron('/api/internal/reminders', { authorization: 'Bearer not-the-secret' });
    assert.equal(wrong.status, 401);
  });

  test('the cron endpoint runs the reminder sweep with the secret', async () => {
    const res = await cron('/api/internal/reminders', {
      authorization: 'Bearer test-cron-secret',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.job, 'reminders');
    assert.ok(typeof res.body.salons === 'number');
    assert.deepEqual(res.body.failures, []);
  });

  test('the cron endpoint also runs the appointment job', async () => {
    const res = await cron('/api/internal/reminders/appointments', {
      authorization: 'Bearer test-cron-secret',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.job, 'appointments');
    assert.ok(typeof res.body.salons === 'number');
  });

  test('the sweep it ran is no longer stale (the health catch-up stays cheap)', async () => {
    const res = await cron('/api/internal/reminders', {
      authorization: 'Bearer test-cron-secret',
    });
    assert.equal(res.status, 200);
    const row = await h.db.one<{ lastReminderRunAt: string | null }>(
      'SELECT lastReminderRunAt FROM app_meta WHERE id = 1',
    );
    const last = Date.parse(row?.lastReminderRunAt ?? '');
    assert.ok(Number.isFinite(last));
    assert.ok(Date.now() - last < 15 * 60 * 1000, 'lastReminderRunAt should be fresh after a sweep');
  });
});
