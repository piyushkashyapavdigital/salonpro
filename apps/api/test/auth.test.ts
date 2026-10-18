import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

test('health endpoint reports honest integration state', async () => {
  const { status, data } = await h.get('/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.integrations.otpDelivery, false, 'no OTP provider is configured in tests');
  assert.equal(data.integrations.razorpayLive, false, 'no Razorpay keys are configured in tests');
  assert.ok(Array.isArray(data.policy.refund.rules));
});

test('OTP request returns a code only in dev mock and says so plainly', async () => {
  const { status, data } = await h.post('/auth/otp/request', { phone: '9800111222' });
  assert.equal(status, 200);
  assert.equal(data.deliveryMode, 'development_mock');
  assert.match(data.notice, /no real sms was sent/i);
  assert.match(data.devCode, /^\d{6}$/);
  assert.equal(data.isNewUser, true);
});

test('OTP request rejects a malformed phone number', async () => {
  const { status, data } = await h.post('/auth/otp/request', { phone: 'abc' });
  assert.equal(status, 400);
  assert.ok(data.message);
});

test('OTP verify registers a new customer and issues a session', async () => {
  const request = await h.post('/auth/otp/request', { phone: '9800111223' });
  const verify = await h.post('/auth/otp/verify', {
    phone: '9800111223',
    code: request.data.devCode,
    name: 'New Person',
  });
  assert.equal(verify.status, 200);
  assert.ok(verify.data.token);
  assert.equal(verify.data.user.role, 'customer');
  assert.ok(verify.data.wallet, 'a wallet view is returned for the new customer');
});

test('an incorrect OTP is rejected and never issues a session', async () => {
  const request = await h.post('/auth/otp/request', { phone: '9800111224' });
  const code = String(request.data.devCode);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
  assert.notEqual(wrong, code);
  const verify = await h.post('/auth/otp/verify', { phone: '9800111224', code: wrong });
  assert.ok(verify.status >= 400, `expected rejection, got ${verify.status}`);
  assert.equal(verify.data.token, undefined);
});

test('an OTP cannot be consumed twice', async () => {
  const request = await h.post('/auth/otp/request', { phone: '9800111225' });
  const first = await h.post('/auth/otp/verify', { phone: '9800111225', code: request.data.devCode });
  assert.equal(first.status, 200);
  const second = await h.post('/auth/otp/verify', { phone: '9800111225', code: request.data.devCode });
  assert.ok(second.status >= 400, 'a consumed OTP must not verify again');
});

test('demo login rejects an incorrect password', async () => {
  const res = await h.post('/auth/demo-login', { phone: ACCOUNTS.owner, password: 'definitely-wrong' });
  assert.equal(res.status, 401);
});

test('session tokens are stored hashed, never in clear', async () => {
  const token = await h.login(ACCOUNTS.owner);
  // The token is stored as sha256(token + SESSION_SECRET), never in clear.
  const hashed = crypto
    .createHash('sha256')
    .update(token + process.env.SESSION_SECRET)
    .digest('hex');
  assert.equal(h.db.one('SELECT id FROM sessions WHERE tokenHash = ?', token), undefined);
  assert.ok(h.db.one('SELECT id FROM sessions WHERE tokenHash = ?', hashed));
});

test('/auth/me returns the signed-in identity and a wallet for customers', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const me = await h.get('/auth/me', token);
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'customer');
  assert.ok(me.data.wallet, 'customer sessions carry a wallet view');
});

test('logout revokes the session token', async () => {
  const token = await h.login(ACCOUNTS.owner);
  assert.equal((await h.get('/admin/overview', token)).status, 200);
  const out = await h.post('/auth/logout', {}, token);
  assert.equal(out.status, 200);
  assert.equal((await h.get('/admin/overview', token)).status, 401);
});
