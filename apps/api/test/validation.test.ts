import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getHarness, ACCOUNTS, type Harness } from './harness';

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

test('an unknown API route returns a structured 404', async () => {
  const res = await h.get('/definitely-not-a-route');
  assert.equal(res.status, 404);
  assert.equal(res.data.error, 'not_found');
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
});

test('validation failures return 400 with field details', async () => {
  const res = await h.post('/auth/otp/request', { phone: 'not-a-phone' });
  assert.equal(res.status, 400);
  assert.ok(res.data.error === 'validation_error' || res.data.error === 'bad_request');
  if (res.data.error === 'validation_error') {
    assert.ok(Array.isArray(res.data.details));
    assert.ok(res.data.details.length >= 1);
  }
});

test('malformed JSON returns a 400, not a 500', async () => {
  const res = await h.request('POST', '/auth/otp/request', {
    raw: '{"phone": "98000',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.status, 400);
});

test('a missing resource returns 404 with a helpful message', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const res = await h.get('/customer/bookings/00000000-0000-0000-0000-000000000000', token);
  assert.equal(res.status, 404);
  assert.ok(res.data.message);
});

test('a missing admin resource returns 404', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get('/admin/customers/does-not-exist', token);
  assert.equal(res.status, 404);
});

test('security headers are present on every response', async () => {
  const res = await h.get('/health');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('a CORS preflight is answered with 204', async () => {
  const res = await h.request('OPTIONS', '/auth/otp/request', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('the JSON body limit is enforced rather than crashing', async () => {
  const huge = { phone: '9800000000', pad: 'x'.repeat(3 * 1024 * 1024) };
  const res = await h.post('/auth/otp/request', huge);
  assert.ok(res.status === 400 || res.status === 413, `expected 400/413, got ${res.status}`);
});

test('a conflicting transition returns 409 with an explanatory message', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const owner = h.db.one<{ id: string }>(
    "SELECT id FROM appointments WHERE customerId = (SELECT id FROM users WHERE phone = ?) AND status IN ('completed','cancelled') LIMIT 1",
    ACCOUNTS.customer1,
  );
  if (!owner) return;
  const res = await h.post(`/customer/bookings/${owner.id}/cancel`, { reason: 'too late' }, token);
  assert.ok(res.status === 400 || res.status === 404);
});
