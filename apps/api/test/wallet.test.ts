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

function customerId(phone: string): string {
  return h.db.one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone)!.id;
}

let phoneCounter = 0;
/** A brand-new customer with a zero balance, so wallet assertions are exact. */
async function freshCustomer(): Promise<{ token: string; id: string }> {
  phoneCounter += 1;
  const phone = `98${String(20000000 + phoneCounter).padStart(8, '0')}`;
  const request = await h.post<{ devCode: string }>('/auth/otp/request', { phone });
  const registered = await h.post<{ token: string; user: { id: string } }>('/auth/otp/verify', {
    phone,
    code: request.data.devCode,
    name: 'Wallet Tester',
  });
  return { token: registered.data.token, id: registered.data.user.id };
}

async function recharge(token: string, payAmount: number, idempotencyKey?: string) {
  const wallet = await h.get<{ offers: any[] }>('/customer/wallet', token);
  const offer = wallet.data.offers.find((o) => o.payAmount === payAmount);
  assert.ok(offer, `seeded offer for ₹${payAmount / 100} exists`);
  const order = await h.post<{ checkout: any }>(
    '/payments/orders',
    { purpose: 'wallet_recharge', offerId: offer.id, idempotencyKey },
    token,
  );
  assert.equal(order.status, 201);
  return order.data.checkout;
}

async function cheapestBooking(token: string, dayOffset = 3) {
  const branches = await h.get<{ branches: any[] }>('/catalog/branches', token);
  const services = await h.get<{ services: any[] }>('/catalog/services', token);
  const service = [...services.data.services].sort((a, b) => a.price - b.price)[0];
  const branchId = branches.data.branches[0].id;
  const date = dayFrom(dayOffset);
  const avail = await h.get<{ slots: any[] }>(
    `/catalog/availability?branchId=${branchId}&date=${date}&serviceIds=${service.id}`,
    token,
  );
  return { branchId, service, date, slot: avail.data.slots[0] };
}

test('recharge offers match the spec: ₹500→₹550, ₹1000→₹1150, ₹2000→₹2400', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const wallet = await h.get<{ offers: any[] }>('/customer/wallet', token);
  const map = Object.fromEntries(wallet.data.offers.map((o) => [o.payAmount, o.payAmount + o.bonusAmount]));
  assert.equal(map[50000], 55000);
  assert.equal(map[100000], 115000);
  assert.equal(map[200000], 240000);
});

test('a simulated recharge credits cash and bonus as separate ledger rows', async () => {
  const { token, id } = await freshCustomer();
  const checkout = await recharge(token, 50000);
  assert.equal(checkout.mode, 'simulated');
  assert.ok(checkout.simulatedSignature && checkout.simulatedPaymentId);

  const sim = await h.post<{ credited: boolean; wallet: any }>(
    '/payments/simulate',
    { razorpayOrderId: checkout.orderId, outcome: 'success' },
    token,
  );
  assert.equal(sim.status, 200);
  assert.equal(sim.data.credited, true);
  assert.equal(sim.data.wallet.cashBalance, 50000);
  assert.equal(sim.data.wallet.bonusBalance, 5000);

  const rows = h.db.all<{ balanceType: string; amount: number; type: string }>(
    'SELECT balanceType, amount, type FROM wallet_transactions WHERE customerId = ? AND type = ? ORDER BY createdAt',
    id,
    'recharge',
  );
  assert.ok(rows.some((r) => r.balanceType === 'cash' && r.amount === 50000));
  assert.ok(rows.some((r) => r.balanceType === 'bonus' && r.amount === 5000));
});

test('a replayed recharge never double-credits', async () => {
  const { token } = await freshCustomer();
  const checkout = await recharge(token, 100000);
  await h.post('/payments/simulate', { razorpayOrderId: checkout.orderId, outcome: 'success' }, token);
  const replay = await h.post<{ credited: boolean; reason?: string }>(
    '/payments/simulate',
    { razorpayOrderId: checkout.orderId, outcome: 'success' },
    token,
  );
  assert.equal(replay.data.credited, false);
  assert.equal(replay.data.reason, 'already_credited');
  const wallet = await h.get<{ wallet: any }>('/customer/wallet', token);
  assert.equal(wallet.data.wallet.cashBalance, 100000);
  assert.equal(wallet.data.wallet.bonusBalance, 15000);
});

test('promotional bonus is spent before cash', async () => {
  const { token } = await freshCustomer();
  const checkout = await recharge(token, 50000); // 50000 cash + 5000 bonus
  await h.post('/payments/simulate', { razorpayOrderId: checkout.orderId, outcome: 'success' }, token);

  const { branchId, service, date, slot } = await cheapestBooking(token);
  const book = await h.post<{ walletDebit: number; wallet: any }>(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, staffId: slot.staffId, paymentPreference: 'wallet' },
    token,
  );
  assert.equal(book.status, 201);
  assert.equal(book.data.walletDebit, service.price);
  const w = book.data.wallet;
  assert.equal(w.bonusBalance, 0, 'bonus drained first');
  assert.equal(w.cashBalance, 55000 - service.price);
});

test('wallet payment is refused when the balance is too low', async () => {
  const { token } = await freshCustomer(); // zero balance, no recharge

  const { branchId, service, date, slot } = await cheapestBooking(token);
  const res = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, paymentPreference: 'wallet' },
    token,
  );
  assert.equal(res.status, 409);
  assert.match(res.data.message, /insufficient wallet balance/i);
});

test('balances always equal the sum of posted ledger rows (append-only invariant)', async () => {
  const { token } = await freshCustomer();
  const checkout = await recharge(token, 50000);
  await h.post('/payments/simulate', { razorpayOrderId: checkout.orderId, outcome: 'success' }, token);
  const wallet = await h.get<{ wallet: any }>('/customer/wallet', token);
  const sum = h.db.one<{ cash: number; bonus: number }>(
    `SELECT
        COALESCE(SUM(CASE WHEN balanceType='cash' THEN amount END),0) AS cash,
        COALESCE(SUM(CASE WHEN balanceType='bonus' THEN amount END),0) AS bonus
       FROM wallet_transactions WHERE walletId = ? AND status='posted'`,
    wallet.data.wallet.id,
  );
  assert.equal(wallet.data.wallet.cashBalance, sum!.cash);
  assert.equal(wallet.data.wallet.bonusBalance, sum!.bonus);
});

test('an owner can adjust a wallet with a reason and it is audited', async () => {
  const owner = await h.login(ACCOUNTS.owner);
  const cid = customerId(ACCOUNTS.customer2);
  const before = await h.get<{ wallet: any }>(`/admin/customers/${cid}`, owner);
  const beforeCash = before.data.wallet.cashBalance;

  const res = await h.post<{ wallet: any }>(
    `/admin/customers/${cid}/wallet/adjust`,
    { amount: 25000, balanceType: 'cash', reason: 'Goodwill credit for a delayed service' },
    owner,
  );
  assert.equal(res.status, 200);
  assert.equal(res.data.wallet.cashBalance, beforeCash + 25000);
  const audit = h.db.one(
    "SELECT * FROM audit_logs WHERE action = 'wallet.adjust' AND entityId = ? LIMIT 1",
    res.data.wallet.id,
  );
  assert.ok(audit, 'the adjustment is recorded in the audit log');
});

test('an adjustment without a reason is rejected (audit requirement)', async () => {
  const owner = await h.login(ACCOUNTS.owner);
  const cid = customerId(ACCOUNTS.customer2);
  const res = await h.post(`/admin/customers/${cid}/wallet/adjust`, { amount: 100, balanceType: 'cash', reason: 'x' }, owner);
  assert.equal(res.status, 400);
});

test('a receptionist cannot adjust wallets (capability guard)', async () => {
  const reception = await h.login(ACCOUNTS.receptionist);
  const cid = customerId(ACCOUNTS.customer2);
  const res = await h.post(
    `/admin/customers/${cid}/wallet/adjust`,
    { amount: 500, balanceType: 'cash', reason: 'should be forbidden' },
    reception,
  );
  assert.equal(res.status, 403);
});
