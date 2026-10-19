import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ACCOUNTS, dayFrom, getHarness, tick, type Harness } from './harness';

/*
 * Integration honesty + mock tests.
 *
 * The salon is sold on trust: a customer must never be told an SMS, WhatsApp
 * message, push notification or payment happened when it did not. Every test
 * here fails if the API reports a delivery it cannot prove. They run against
 * the unconfigured providers the product ships with, which is exactly the
 * state a fresh Neon deployment is in.
 *
 * The last suite proves the production bootstrap creates a clean, empty salon
 * — no demo customers, no fake appointments — because that database is a real
 * salon's live data.
 */

const run = promisify(execFile);

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

/* ------------------------------------------------------------------ */
/* OTP delivery                                                        */
/* ------------------------------------------------------------------ */

describe('otp delivery', () => {
  test('the development mock labels itself and never claims an SMS was sent', async () => {
    const res = await h.post<any>('/auth/otp/request', { phone: '9700011122' });
    assert.equal(res.status, 200);
    assert.equal(res.data.deliveryMode, 'development_mock');
    assert.equal(res.data.isNewUser, true);
    assert.ok(res.data.devCode, 'the code is returned so the app can be tested without a provider');
    assert.match(res.data.notice, /no real sms was sent/i);
    /* The row is stored as an unconsumed code, not as a delivered message. */
    const row = await h.db.one<any>('SELECT * FROM otp_codes WHERE phone = ? ORDER BY "createdAt" DESC', '9700011122');
    assert.ok(row);
    assert.equal(row.consumedAt ?? null, null);
  });

  test('production refuses to fake an OTP when no provider is configured', async () => {
    const result = await requestOtpInChildProcess({});
    assert.equal(result.status, 503, `production must refuse, got ${result.status}`);
    assert.equal(result.body.error, 'otp_unavailable');
    assert.match(String(result.body.message), /not configured/i);
    assert.equal(result.body.devCode, undefined, 'a production response must never carry a code');
  });

  test('a hosted demo can opt in explicitly with ALLOW_DEV_OTP=true', async () => {
    /* The flag is an acknowledgement, not a default: without it the request
     * above is refused. With it the response still says no SMS was sent. */
    const result = await requestOtpInChildProcess({ ALLOW_DEV_OTP: 'true' });
    assert.equal(result.status, 200);
    assert.equal(result.body.deliveryMode, 'development_mock');
    assert.match(String(result.body.devCode), /^\d{6}$/);
    assert.match(String(result.body.notice), /no real sms was sent/i);
  });
});

/**
 * Ask for an OTP as a fresh production process would — NODE_ENV and the
 * integration flags are read once at import time, so the only honest way to
 * test them is to boot one.
 */
async function requestOtpInChildProcess(extraEnv: Record<string, string>) {
  const apiRoot = path.resolve(import.meta.dirname, '..');
  const script = `
      const { migrate, closeDatabase } = await import('${apiRoot}/src/db.ts');
      const { dispatch } = await import('${apiRoot}/src/server.ts');
      await migrate();
      const out = await dispatch({
        method: 'POST',
        url: '/api/auth/otp/request',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ phone: '9700011122' })),
      });
      process.stdout.write(JSON.stringify({ status: out.status, body: JSON.parse(Buffer.from(out.body).toString('utf8')) }));
      await closeDatabase();
    `;

  const { stdout } = await run(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: apiRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'pglite:memory:',
        SERVE_STATIC: 'false',
        OTP_PROVIDER_CONFIGURED: '',
        WHATSAPP_ACCESS_TOKEN: '',
        ALLOW_DEV_OTP: '',
        ...extraEnv,
      },
      timeout: 120_000,
    },
  );

  return JSON.parse(stdout.trim().split('\n').pop()!) as {
    status: number;
    body: { error?: string; message?: string; devCode?: string; deliveryMode?: string; notice?: string };
  };
}

/* ------------------------------------------------------------------ */
/* Notification delivery                                               */
/* ------------------------------------------------------------------ */

describe('notification delivery', () => {
  /** Book + complete a visit for a fresh customer, returning their ids. */
  async function completedVisit() {
    const phone = `97600000${Math.floor(10 + Math.random() * 89)}`;
    const otp = await h.post<{ devCode: string }>('/auth/otp/request', { phone });
    const session = await h.post<any>('/auth/otp/verify', { phone, code: otp.data.devCode, name: 'Notify Case' });
    const token = session.data.token as string;
    const customerId = session.data.user.id as string;

    const branches = await h.get<any>('/catalog/branches', token);
    const services = await h.get<any>('/catalog/services', token);
    const service = services.data.services[0];
    const date = dayFrom(-8);
    const avail = await h.get<any>(
      `/catalog/availability?branchId=${branches.data.branches[0].id}&date=${date}&serviceIds=${service.id}`,
      token,
    );
    const booking = await h.post<any>(
      '/customer/bookings',
      {
        branchId: branches.data.branches[0].id,
        serviceIds: [service.id],
        date,
        startTime: avail.data.slots[0].startTime,
        staffId: avail.data.slots[0].staffId,
        paymentPreference: 'pay_at_salon',
        idempotencyKey: `notify-${customerId}`,
      },
      token,
    );
    const owner = await h.login(ACCOUNTS.owner);
    for (const status of ['confirmed', 'checked_in', 'in_progress', 'completed']) {
      await h.post(`/admin/appointments/${booking.data.appointment.id}/status`, { status, paymentMethod: 'cash' }, owner);
    }
    return { token, customerId, owner };
  }

  test('a message is queued honestly and never reported as sent', async () => {
    const { token, customerId, owner } = await completedVisit();

    /* Age the visit so a day-7 nudge is due, then run the reminder pass. */
    await h.db.run(
      'UPDATE service_records SET "completedAt" = ? WHERE "customerId" = ?',
      new Date(Date.now() - 7 * 86_400_000).toISOString(),
      customerId,
    );
    await h.post('/admin/reminders/run', {}, owner);
    await tick();

    const queued = await h.db.all<any>('SELECT * FROM notifications WHERE "customerId" = ?', customerId);
    assert.ok(queued.length > 0, 'the reminder pass queued something');
    for (const row of queued) {
      assert.notEqual(row.status, 'sent', 'no provider is configured, so nothing can be sent');
      assert.equal(row.sentAt ?? null, null, 'sentAt must stay empty until a provider accepts the message');
    }

    /* A delivery attempt records the failure instead of flipping to "sent". */
    const attempted = await h.post<any>(`/customer/notifications/${queued[0].id}/retry`, {}, token);
    assert.equal(attempted.status, 200);
    assert.notEqual(attempted.data.notification.status, 'sent');
    assert.equal(attempted.data.notification.sentAt ?? null, null);
    assert.ok(attempted.data.notification.errorDetails, 'the reason is recorded for the salon to see');
    assert.ok(attempted.data.notification.attempts >= 1);
  });

  test('a customer who opted out is suppressed, not silently sent', async () => {
    const { token, customerId, owner } = await completedVisit();
    const prefs = await h.patch<any>(
      '/customer/preferences',
      { promotionalConsent: false, whatsappConsent: false },
      token,
    );
    assert.equal(prefs.status, 200, JSON.stringify(prefs.data));

    await h.db.run(
      'UPDATE service_records SET "completedAt" = ? WHERE "customerId" = ?',
      new Date(Date.now() - 7 * 86_400_000).toISOString(),
      customerId,
    );
    await h.post('/admin/reminders/run', {}, owner);
    await tick();

    const rows = await h.db.all<any>('SELECT status, stage FROM notifications WHERE "customerId" = ?', customerId);
    const promo = rows.find((r) => r.stage === 'day7');
    assert.ok(promo, 'the pass still records the decision');
    assert.equal(promo.status, 'suppressed', 'marketing messages respect the opt-out');
  });

  test('registering a push subscription is not a delivery', async () => {
    const { token, customerId } = await completedVisit();
    const res = await h.post<any>(
      '/customer/push-subscription',
      { endpoint: 'https://push.example.test/sub/1', keys: { p256dh: 'abc', auth: 'def' } },
      token,
    );
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const stored = await h.db.scalar('SELECT COUNT(*) FROM push_subscriptions WHERE "customerId" = ?', customerId);
    assert.equal(stored, 1, 'the device is registered');
    const sent = await h.db.scalar("SELECT COUNT(*) FROM notifications WHERE \"customerId\" = ? AND status = 'sent'", customerId);
    assert.equal(sent, 0, 'registering a device must not create a phantom delivery');
  });

  test('the health endpoint tells the truth about every integration', async () => {
    const res = await h.get<any>('/health');
    assert.equal(res.status, 200);
    assert.equal(typeof res.data.ok, 'boolean');
    for (const key of ['razorpayLive', 'razorpayWebhook', 'whatsapp', 'push', 'otpDelivery']) {
      assert.equal(res.data.integrations[key], false, `${key} must report false while unconfigured`);
    }
    /* The mode labels what the payments really are — a test gateway. */
    const config = await h.get<any>('/payments/config', await h.login(ACCOUNTS.owner));
    assert.equal(config.status, 200);
    assert.equal(config.data.mode, 'simulated');
    assert.equal(JSON.stringify(config.data).includes('secret'), false, 'no secret material in the response');
  });
});

/* ------------------------------------------------------------------ */
/* Production bootstrap                                                */
/* ------------------------------------------------------------------ */

describe('production bootstrap', () => {
  test('creates a clean salon with no demo data, and the owner can sign in', async () => {
    /* Start from a genuinely empty database — this is the Neon setup path. */
    await h.db.resetDatabase();
    const { runBootstrap } = await import('../src/seed');
    const created = await runBootstrap({
      ownerName: 'Live Owner',
      ownerPhone: '9811100099',
      salonName: 'Live Salon',
      address: '42 MG Road',
    });
    assert.equal(created, true, 'a fresh database is bootstrapped');

    const counts = {
      users: await h.db.scalar('SELECT COUNT(*) FROM users'),
      salons: await h.db.scalar('SELECT COUNT(*) FROM salons'),
      branches: await h.db.scalar('SELECT COUNT(*) FROM branches'),
      services: await h.db.scalar('SELECT COUNT(*) FROM services'),
      appointments: await h.db.scalar('SELECT COUNT(*) FROM appointments'),
      wallets: await h.db.scalar('SELECT COUNT(*) FROM wallets'),
      ledger: await h.db.scalar('SELECT COUNT(*) FROM wallet_transactions'),
      payments: await h.db.scalar('SELECT COUNT(*) FROM payment_orders'),
      notifications: await h.db.scalar('SELECT COUNT(*) FROM notifications'),
      coupons: await h.db.scalar('SELECT COUNT(*) FROM coupons'),
      customers: await h.db.scalar("SELECT COUNT(*) FROM users WHERE role = 'customer'"),
      offers: await h.db.scalar('SELECT COUNT(*) FROM recharge_offers'),
      demoUsers: await h.db.scalar('SELECT COUNT(*) FROM users WHERE "isDemo" = 1'),
    };
    assert.deepEqual(counts, {
      users: 1,
      salons: 1,
      branches: 1,
      services: 0,
      appointments: 0,
      wallets: 0,
      ledger: 0,
      payments: 0,
      notifications: 0,
      coupons: 0,
      customers: 0,
      offers: 3,
      demoUsers: 0,
    });

    /* The three standard offers are the only rows the owner gets for free. */
    const offers = await h.db.all<{ payAmount: number; bonusAmount: number }>(
      'SELECT "payAmount", "bonusAmount" FROM recharge_offers ORDER BY "sortOrder"',
    );
    assert.deepEqual(
      offers.map((o) => [o.payAmount, o.bonusAmount]),
      [
        [50000, 5000],
        [100000, 15000],
        [200000, 40000],
      ],
    );

    /* The owner is real (not demo) and assigned to the branch. */
    const owner = await h.db.one<any>('SELECT * FROM users WHERE phone = ?', '9811100099');
    assert.equal(owner.role, 'salon_owner');
    assert.equal(owner.isDemo, 0);
    assert.equal(owner.status, 'active');

    /* And they can sign in immediately through the OTP flow. */
    const otp = await h.post<{ devCode: string }>('/auth/otp/request', { phone: '9811100099' });
    const session = await h.post<any>('/auth/otp/verify', { phone: '9811100099', code: otp.data.devCode });
    assert.equal(session.status, 200);
    assert.equal(session.data.user.role, 'salon_owner');
    const me = await h.get<any>('/auth/me', session.data.token);
    assert.equal(me.data.user.id, owner.id);

    /* An empty salon still answers the dashboard — a brand-new owner taps
       "Dashboard" before adding anything, and must not meet an error screen. */
    const over = await h.get<any>(`/admin/overview?date=${new Date().toISOString().slice(0, 10)}`, session.data.token);
    assert.equal(over.status, 200, JSON.stringify(over.data));
    assert.equal(over.data.overview.appointmentsBooked, 0);
    assert.equal(over.data.trend.length, 7, 'the trend is a real seven-day series even with no sales');
    assert.deepEqual(over.data.topCustomers, []);

    /* The customer app also has nothing invented on it. */
    const signupOtp = await h.post<{ devCode: string }>('/auth/otp/request', { phone: '9790000123' });
    const customer = await h.post<any>('/auth/otp/verify', { phone: '9790000123', code: signupOtp.data.devCode, name: 'First Customer' });
    assert.equal(customer.status, 200, JSON.stringify(customer.data));
    const home = await h.get<any>('/customer/home', customer.data.token);
    assert.equal(home.status, 200);
    assert.equal(home.data.wallet.totalBalance, 0);
    assert.deepEqual(home.data.upcoming, []);
    assert.deepEqual(home.data.recentPayments, []);
  });

  test('running the bootstrap twice does not duplicate the salon', async () => {
    await h.db.resetDatabase();
    const { runBootstrap } = await import('../src/seed');
    await runBootstrap({ ownerName: 'Live Owner', ownerPhone: '9811100099', salonName: 'Live Salon', address: '42 MG Road' });
    const second = await runBootstrap({ ownerName: 'Someone Else', ownerPhone: '9811100088', salonName: 'Second Salon', address: 'x' });
    assert.equal(second, false, 'a bootstrapped database is left alone');
    assert.equal(await h.db.scalar('SELECT COUNT(*) FROM salons'), 1);
    assert.equal(await h.db.scalar('SELECT COUNT(*) FROM users'), 1);
    assert.equal(await h.db.scalar('SELECT COUNT(*) FROM recharge_offers'), 3);
  });
});
