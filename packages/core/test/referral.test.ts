import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getHarness, ACCOUNTS, dayFrom, type Harness } from './harness';

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

const REFERRAL_REWARD = 5000; // ₹50 in paise

async function registerWithReferral(phone: string, referralToken: string | undefined, name: string) {
  const request = await h.post<{ devCode: string }>('/auth/otp/request', { phone });
  return h.post<{ token: string; user: any }>('/auth/otp/verify', {
    phone,
    code: request.data.devCode,
    name,
    referralToken,
  });
}

async function customerToken(): Promise<string> {
  return h.login(ACCOUNTS.customer1);
}

async function referralTokenOf(token: string): Promise<string> {
  const ref = await h.get<{ token: string; code: string }>('/customer/referrals', token);
  assert.ok(ref.data.token, 'a signed attribution token is issued');
  return ref.data.token;
}

async function bookAndComplete(customerTokenValue: string, dayOffset = 3): Promise<string> {
  const branches = await h.get<{ branches: any[] }>('/catalog/branches', customerTokenValue);
  const services = await h.get<{ services: any[] }>('/catalog/services', customerTokenValue);
  const service = services.data.services[0];
  const branchId = branches.data.branches[0].id;
  const date = dayFrom(dayOffset);
  const avail = await h.get<{ slots: any[] }>(
    `/catalog/availability?branchId=${branchId}&date=${date}&serviceIds=${service.id}`,
    customerTokenValue,
  );
  const booking = await h.post<{ appointment: any }>(
    '/customer/bookings',
    {
      branchId,
      serviceIds: [service.id],
      date,
      startTime: avail.data.slots[0].startTime,
      staffId: avail.data.slots[0].staffId,
      paymentPreference: 'pay_at_salon',
    },
    customerTokenValue,
  );
  assert.equal(booking.status, 201);
  const id = booking.data.appointment.id;
  await complete(id);
  return id;
}

async function complete(appointmentId: string) {
  const reception = await h.login(ACCOUNTS.receptionist);
  for (const status of ['confirmed', 'checked_in', 'in_progress']) {
    await h.post(`/admin/appointments/${appointmentId}/status`, { status }, reception);
  }
  const done = await h.post(
    `/admin/appointments/${appointmentId}/status`,
    { status: 'completed', paymentMethod: 'cash' },
    reception,
  );
  assert.equal(done.status, 200);
}

test('a new customer arriving on a referral link is attributed, not yet rewarded', async () => {
  const referrer = await customerToken();
  const token = await referralTokenOf(referrer);
  const registered = await registerWithReferral('9811111001', token, 'Referred Customer');
  assert.equal(registered.status, 200);
  const newId = registered.data.user.id;

  const row = await h.db.one<{ status: string; referredCustomerId: string }>('SELECT * FROM referrals WHERE referredCustomerId = ?', newId);
  assert.ok(row, 'the referral is recorded');
  assert.equal(row.status, 'registered');

  const dash = await h.get<{ creditedRewards: number }>('/customer/referrals', registered.data.token);
  assert.equal(dash.data.creditedRewards, 0, 'nothing is credited before a qualifying visit');
});

test('an invalid referral token attributes nobody', async () => {
  const registered = await registerWithReferral('9811111002', 'not-a-signed-token', 'No Referral');
  const row = await h.db.one('SELECT id FROM referrals WHERE referredCustomerId = ?', registered.data.user.id);
  assert.equal(row, undefined);
});

test('the referral service refuses a self-referral', async () => {
  const referrer = await customerToken();
  const token = await referralTokenOf(referrer);
  const referralService = await import('../src/services/referral');
  const cid = (await h.db.one<{ id: string }>('SELECT id FROM users WHERE phone = ?', ACCOUNTS.customer1))!.id;
  const salonId = (await h.db.one<{ id: string }>('SELECT id FROM salons LIMIT 1'))!.id;
  const result = await referralService.resolveAttribution(cid, salonId, token);
  assert.equal(result, null, 'a customer cannot refer themselves');
});

test('rewards are credited ₹50 + ₹50 exactly once, after the first completed paid visit', async () => {
  const referrer = await customerToken();
  const token = await referralTokenOf(referrer);
  const registered = await registerWithReferral('9811111003', token, 'Qualifying Friend');
  const newToken = registered.data.token;
  const newId = registered.data.user.id;

  const appointmentId = await bookAndComplete(newToken);

  const refereeDash = await h.get<{ creditedRewards: number }>('/customer/referrals', newToken);
  assert.equal(refereeDash.data.creditedRewards, REFERRAL_REWARD, 'the new customer earns ₹50');

  const referrerDash = await h.get<{ creditedRewards: number }>('/customer/referrals', referrer);
  assert.ok(referrerDash.data.creditedRewards >= REFERRAL_REWARD, 'the referrer earns ₹50');

  const referral = await h.db.one<{ id: string; status: string }>('SELECT * FROM referrals WHERE referredCustomerId = ?', newId);
  assert.equal(referral!.status, 'rewarded');

  const rewards = await h.db.all('SELECT * FROM reward_transactions WHERE referralId = ?', referral!.id);
  const credited = rewards.filter((r) => r.status === 'credited');
  assert.equal(credited.length, 2, 'exactly one referrer reward and one referee reward');
});

test('completing the qualifier a second time does not re-reward', async () => {
  const referrer = await customerToken();
  const token = await referralTokenOf(referrer);
  const registered = await registerWithReferral('9811111004', token, 'Repeat Caller');
  const appointmentId = await bookAndComplete(registered.data.token);
  const before = await h.db.scalar<number>(
    "SELECT COUNT(*) FROM reward_transactions WHERE referralId IN (SELECT id FROM referrals WHERE referredCustomerId = ?) AND status='credited'",
    registered.data.user.id,
  );
  const referralService = await import('../src/services/referral');
  await referralService.qualifyForAppointment(appointmentId); // idempotent re-run
  const after = await h.db.scalar<number>(
    "SELECT COUNT(*) FROM reward_transactions WHERE referralId IN (SELECT id FROM referrals WHERE referredCustomerId = ?) AND status='credited'",
    registered.data.user.id,
  );
  assert.equal(before, 2);
  assert.equal(after, 2, 're-running qualification adds nothing');
});

test('refunding the qualifying visit reverses the rewards with compensating entries', async () => {
  const referrer = await customerToken();
  const token = await referralTokenOf(referrer);
  const registered = await registerWithReferral('9811111005', token, 'Refunded Friend');
  const appointmentId = await bookAndComplete(registered.data.token);

  const owner = await h.login(ACCOUNTS.owner);
  const refund = await h.post(
    '/admin/refunds',
    { appointmentId, customerId: registered.data.user.id, amount: 100, reason: 'Goodwill goodwill', toWallet: true },
    owner,
  );
  assert.equal(refund.status, 200);

  const referral = await h.db.one<{ status: string }>('SELECT * FROM referrals WHERE referredCustomerId = ?', registered.data.user.id);
  assert.equal(referral!.status, 'reversed');
  const reversal = await h.db.one(
    "SELECT id FROM wallet_transactions WHERE type = 'reversal' LIMIT 1",
  );
  assert.ok(reversal, 'a compensating reversal entry exists');
});

test('a customer with prior visits cannot be attributed as a referral', async () => {
  const referrer = await customerToken();
  const token = await referralTokenOf(referrer);
  /* Customer 1 already has service history, so a token resolves to nobody new. */
  const referralService = await import('../src/services/referral');
  const salonId = (await h.db.one<{ id: string }>('SELECT id FROM salons LIMIT 1'))!.id;
  const other = (await h.db.one<{ id: string }>(
    'SELECT id FROM users WHERE phone = ?',
    ACCOUNTS.customer2,
  ))!.id;
  const hadVisits = await h.db.scalar<number>('SELECT COUNT(*) FROM service_records WHERE customerId = ?', other);
  const result = await referralService.resolveAttribution(other, salonId, token);
  if (hadVisits > 0) {
    assert.equal(result, null, 'existing visitors are not attributable');
  } else {
    assert.ok(result, 'first-touch attribution is allowed for a genuinely new customer');
  }
});
