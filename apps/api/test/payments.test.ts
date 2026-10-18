import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

/** Matches DEV_SECRET in src/services/payments.ts (used when no live keys exist). */
const DEV_RAZORPAY_SECRET = 'dev_razorpay_secret_not_for_production';

function webhookSignature(raw: string): string {
  return crypto.createHmac('sha256', DEV_RAZORPAY_SECRET).update(raw).digest('hex');
}

let phoneCounter = 0;
/** A brand-new customer with a zero balance, so balance assertions are exact. */
async function freshCustomer(): Promise<string> {
  phoneCounter += 1;
  const phone = `98${String(30000000 + phoneCounter).padStart(8, '0')}`;
  const request = await h.post<{ devCode: string }>('/auth/otp/request', { phone });
  const registered = await h.post<{ token: string }>('/auth/otp/verify', {
    phone,
    code: request.data.devCode,
    name: 'Payer',
  });
  return registered.data.token;
}

async function rechargeOrder(token: string, payAmount = 50000) {
  const wallet = await h.get<{ offers: any[] }>('/customer/wallet', token);
  const offer = wallet.data.offers.find((o) => o.payAmount === payAmount);
  const order = await h.post<{ checkout: any; order: any }>(
    '/payments/orders',
    { purpose: 'wallet_recharge', offerId: offer.id },
    token,
  );
  return order.data;
}

test('an order is created in simulated mode with a signed test payload', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const { checkout, order } = await rechargeOrder(token);
  assert.equal(checkout.mode, 'simulated');
  assert.equal(checkout.provider, 'razorpay');
  assert.ok(checkout.orderId);
  assert.ok(checkout.simulatedSignature, 'a locally signed payload is exposed for the test checkout');
  assert.equal(order.status, 'created');
});

test('server-side verification accepts a genuinely signed checkout payload', async () => {
  const token = await freshCustomer();
  const { checkout } = await rechargeOrder(token);
  const res = await h.post<{ ok: boolean; credited: boolean; wallet: any }>(
    '/payments/verify',
    {
      razorpayOrderId: checkout.orderId,
      razorpayPaymentId: checkout.simulatedPaymentId,
      razorpaySignature: checkout.simulatedSignature,
    },
    token,
  );
  assert.equal(res.status, 200);
  assert.equal(res.data.credited, true);
  assert.equal(res.data.wallet.cashBalance, 50000);
});

test('a tampered signature is rejected and no money moves', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const { checkout } = await rechargeOrder(token);
  const res = await h.post('/payments/verify', {
    razorpayOrderId: checkout.orderId,
    razorpayPaymentId: checkout.simulatedPaymentId,
    razorpaySignature: 'f'.repeat(64),
  }, token);
  assert.equal(res.status, 400);
  const order = h.db.one<{ status: string }>('SELECT status FROM payment_orders WHERE razorpayOrderId = ?', checkout.orderId);
  assert.notEqual(order!.status, 'paid');
});

test('an unsigned webhook is refused with HTTP 400', async () => {
  const res = await h.request('POST', '/payments/webhook', {
    raw: JSON.stringify({ event: 'payment.captured', event_id: 'evt_bad', payload: {} }),
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'not-a-real-signature' },
  });
  assert.equal(res.status, 400);
});

test('a signed webhook credits the wallet exactly once', async () => {
  const token = await freshCustomer();
  const { checkout } = await rechargeOrder(token);
  const event = {
    event: 'payment.captured',
    event_id: 'evt_smoke_capture_1',
    payload: { payment: { entity: { id: 'pay_webhook_1', order_id: checkout.orderId } } },
  };
  const raw = JSON.stringify(event);
  const first = await h.request<{ credited: boolean }>('POST', '/payments/webhook', {
    raw,
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': webhookSignature(raw) },
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.credited, true);

  const wallet = await h.get<{ wallet: any }>('/customer/wallet', token);
  assert.equal(wallet.data.wallet.cashBalance, 50000);
  assert.equal(wallet.data.wallet.bonusBalance, 5000);

  const replay = await h.request<{ duplicate?: boolean }>('POST', '/payments/webhook', {
    raw,
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': webhookSignature(raw) },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.duplicate, true);
  const after = await h.get<{ wallet: any }>('/customer/wallet', token);
  assert.equal(after.data.wallet.cashBalance, 50000, 'the replayed event did not double-credit');
});

test('a failed payment simulation never credits the wallet', async () => {
  const token = await freshCustomer();
  const { checkout } = await rechargeOrder(token);
  const res = await h.post<{ ok: boolean; status: string }>(
    '/payments/simulate',
    { razorpayOrderId: checkout.orderId, outcome: 'failure' },
    token,
  );
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'failed');
  const wallet = await h.get<{ wallet: any }>('/customer/wallet', token);
  assert.equal(wallet.data.wallet.cashBalance, 0);
});

test('an appointment can be paid online and settles as paid', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const branches = await h.get<{ branches: any[] }>('/catalog/branches', token);
  const services = await h.get<{ services: any[] }>('/catalog/services', token);
  const service = services.data.services[0];
  const date = dayFrom(7);
  const avail = await h.get<{ slots: any[] }>(
    `/catalog/availability?branchId=${branches.data.branches[0].id}&date=${date}&serviceIds=${service.id}`,
    token,
  );
  const booking = await h.post<{ appointment: any }>(
    '/customer/bookings',
    {
      branchId: branches.data.branches[0].id,
      serviceIds: [service.id],
      date,
      startTime: avail.data.slots[0].startTime,
      staffId: avail.data.slots[0].staffId,
      paymentPreference: 'online',
    },
    token,
  );
  const appointmentId = booking.data.appointment.id;

  const order = await h.post<{ checkout: any }>('/payments/orders', { purpose: 'appointment', appointmentId }, token);
  assert.equal(order.status, 201);
  const sim = await h.post(
    '/payments/simulate',
    { razorpayOrderId: order.data.checkout.orderId, outcome: 'success' },
    token,
  );
  assert.equal(sim.status, 200);
  const appt = h.db.one<{ paymentStatus: string; paidAmount: number }>('SELECT paymentStatus, paidAmount FROM appointments WHERE id = ?', appointmentId);
  assert.equal(appt!.paymentStatus, 'paid');
  assert.equal(appt!.paidAmount, service.price);
});

test('a recharge below the minimum is rejected', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const res = await h.post('/payments/orders', { purpose: 'wallet_recharge', amount: 50 }, token);
  assert.equal(res.status, 400);
});

test('payments/config never leaks a secret', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const res = await h.get<{ configured: boolean; mode: string }>('/payments/config', token);
  assert.equal(res.status, 200);
  assert.equal(res.data.mode, 'simulated');
  assert.equal(res.data.configured, false);
  assert.equal(JSON.stringify(res.data).includes('secret'), false);
});
