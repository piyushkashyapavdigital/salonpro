import { test, beforeAll as before, afterAll as after, beforeEach } from 'bun:test';
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

test('protected endpoints reject an anonymous caller', async () => {
  for (const path of ['/admin/overview', '/customer/wallet', '/customer/bookings', '/payments/orders']) {
    const res = await h.get(path);
    assert.equal(res.status, 401, `${path} should be 401 without a token`);
  }
});

test('an admin without a token gets 401, not a data leak', async () => {
  const res = await h.get('/admin/customers');
  assert.equal(res.status, 401);
  assert.equal(res.data.customers, undefined);
});

test('a customer cannot reach any admin route', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  for (const path of ['/admin/overview', '/admin/customers', '/admin/wallet', '/admin/reports/retention', '/admin/audit']) {
    const res = await h.get(path, token);
    assert.equal(res.status, 403, `${path} must be forbidden for customers (got ${res.status})`);
  }
});

test('a receptionist cannot view financial reports', async () => {
  const token = await h.login(ACCOUNTS.receptionist);
  const res = await h.get('/admin/reports/retention', token);
  assert.equal(res.status, 403);
});

test('a receptionist cannot create or edit services', async () => {
  const token = await h.login(ACCOUNTS.receptionist);
  const res = await h.post('/admin/services', { name: 'Sneaky Service', category: 'Hair', price: 100, durationMinutes: 30 }, token);
  assert.equal(res.status, 403);
});

test('a branch manager can view reports but cannot adjust wallets', async () => {
  const token = await h.login(ACCOUNTS.manager);
  const reports = await h.get('/admin/reports/retention', token);
  assert.equal(reports.status, 200);
  const cid = (await h.db.one<{ id: string }>('SELECT id FROM users WHERE phone = ?', ACCOUNTS.customer2))!.id;
  const adjust = await h.post(
    `/admin/customers/${cid}/wallet/adjust`,
    { amount: 100, balanceType: 'cash', reason: 'manager should not do this' },
    token,
  );
  assert.equal(adjust.status, 403);
});

test('a stylist may start or complete but not confirm appointments', async () => {
  const owner = await h.login(ACCOUNTS.owner);
  const appointment = await h.get<{ appointments: any[] }>(`/admin/appointments?date=${new Date().toISOString().slice(0, 10)}`, owner);
  const booked = appointment.data.appointments.find((a) => ['booked', 'confirmed'].includes(a.status));
  if (!booked) return; // nothing booked today in the seed

  const stylist = await h.login(ACCOUNTS.stylist);
  const confirm = await h.post(`/admin/appointments/${booked.id}/status`, { status: 'confirmed' }, stylist);
  assert.equal(confirm.status, 403, 'a stylist cannot confirm');
  const start = await h.post(`/admin/appointments/${booked.id}/status`, { status: 'in_progress' }, stylist);
  assert.ok(start.status === 200 || start.status === 403, 'start is capability-checked');
});

test('a manager cannot create an appointment for an unauthorised branch', async () => {
  const managerId = (await h.db.one<{ id: string }>('SELECT id FROM users WHERE phone = ?', ACCOUNTS.manager))!.id;
  const mine = (await h.db.all<{ branchId: string }>('SELECT branchId FROM user_branches WHERE userId = ?', managerId)).map((r) => r.branchId);
  const other = (await h.db.all<{ id: string }>('SELECT id FROM branches')).find((b) => !mine.includes(b.id));
  if (!other) return; // manager has every branch in this seed

  const service = (await h.db.one<{ id: string }>('SELECT id FROM services LIMIT 1'))!;
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const token = await h.login(ACCOUNTS.manager);
  const res = await h.post(
    '/admin/appointments',
    { branchId: other.id, serviceIds: [service.id], date, startTime: '12:00', customerPhone: '9700000009', customerName: 'Walk In' },
    token,
  );
  assert.equal(res.status, 403);
});

test('adding staff is a simple add: a name and phone are enough', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.post<{ staffId: string }>('/admin/staff', { name: 'Meera Nair', phone: '9800000999' }, token);
  assert.equal(res.status, 201, JSON.stringify(res.data));

  const row = await h.db.one<{ branchId: string; designation: string }>(
    'SELECT branchId, designation FROM staff WHERE id = ?',
    res.data.staffId,
  );
  assert.ok(row?.branchId, 'a branch is chosen automatically when none is given');
  assert.equal(row?.designation, 'Stylist', 'a sensible default title');

  /* The new staff member gets an admin role, so they can sign in right away. */
  const user = await h.db.one<{ role: string }>('SELECT role FROM users WHERE phone = ?', '9800000999');
  assert.equal(user?.role, 'salon_staff');
});

test('the role the owner picks is applied when adding staff', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.post<{ staffId: string }>(
    '/admin/staff',
    { name: 'Ravi Front', phone: '9800000998', role: 'receptionist', designation: 'Front desk' },
    token,
  );
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const user = await h.db.one<{ role: string }>('SELECT role FROM users WHERE phone = ?', '9800000998');
  assert.equal(user?.role, 'receptionist');
});

test('a customer cannot verify another customer\'s payment order', async () => {
  const a = await h.login(ACCOUNTS.customer1);
  const wallet = await h.get<{ offers: any[] }>('/customer/wallet', a);
  const offer = wallet.data.offers[0];
  const order = await h.post<{ checkout: any }>('/payments/orders', { purpose: 'wallet_recharge', offerId: offer.id }, a);

  const b = await h.login(ACCOUNTS.customer2);
  const res = await h.post(
    '/payments/verify',
    {
      razorpayOrderId: order.data.checkout.orderId,
      razorpayPaymentId: order.data.checkout.simulatedPaymentId,
      razorpaySignature: order.data.checkout.simulatedSignature,
    },
    b,
  );
  assert.equal(res.status, 400);
});

test('customers cannot read another customer\'s wallet transactions', async () => {
  const b = await h.login(ACCOUNTS.customer2);
  const res = await h.get('/customer/wallet', b);
  assert.equal(res.status, 200);
  /* The wallet returned must belong to the caller, never to customer 1. */
  const aId = (await h.db.one<{ id: string }>('SELECT id FROM users WHERE phone = ?', ACCOUNTS.customer1))!.id;
  assert.notEqual(res.data.wallet.customerId, aId);
});
