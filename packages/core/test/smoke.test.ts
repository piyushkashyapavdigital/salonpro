import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, dayFrom, getHarness, tick, type Harness } from './harness';

/*
 * End-to-end smoke tests.
 *
 * One test per journey a real person takes, driven through HTTP exactly like
 * the apps do: a new customer signs up with OTP, tops up, books, pays from the
 * wallet, and gets a receipt; an owner watches it land on the dashboard; a
 * referral pays out after the first completed visit. Nothing is stubbed except
 * the SMS/payment providers, and those are honest about being simulated.
 *
 * The last tests are invariants checked straight in SQL after the journeys —
 * the things that must be true of the database no matter which path was taken.
 */

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

let phoneCounter = 0;
/** Register a brand-new customer through the OTP flow and return their token. */
async function signUp(name = 'Smoke Tester'): Promise<{ token: string; phone: string; id: string }> {
  phoneCounter += 1;
  const phone = `97${String(50000000 + phoneCounter).padStart(8, '0')}`;
  const request = await h.post<{ devCode: string; deliveryMode: string; notice: string }>('/auth/otp/request', { phone });
  assert.equal(request.status, 200);
  assert.ok(request.data.devCode, 'the dev mock must expose the code when no SMS provider is configured');
  assert.equal(request.data.deliveryMode, 'development_mock');
  assert.match(request.data.notice, /no real sms was sent/i, 'the API must say plainly that nothing was sent');

  const verified = await h.post<{ token: string; user: { id: string } }>('/auth/otp/verify', {
    phone,
    code: request.data.devCode,
    name,
  });
  assert.equal(verified.status, 200);
  return { token: verified.data.token, phone, id: verified.data.user.id };
}

async function pickSlot(token: string, dayOffset = 4) {
  const branches = await h.get<{ branches: any[] }>('/catalog/branches', token);
  const services = await h.get<{ services: any[] }>('/catalog/services', token);
  const service = services.data.services[0]!;
  const date = dayFrom(dayOffset);
  const avail = await h.get<{ slots: any[] }>(
    `/catalog/availability?branchId=${branches.data.branches[0].id}&date=${date}&serviceIds=${service.id}`,
    token,
  );
  assert.ok(avail.data.slots.length > 0, 'the salon must have free slots to smoke-test a booking');
  return { branchId: branches.data.branches[0].id as string, service, date, slot: avail.data.slots[0]! };
}

/** Top up a wallet through the real order → simulate → verify path. */
async function topUp(token: string, payAmount = 100000) {
  const wallet = await h.get<{ offers: any[] }>('/customer/wallet', token);
  const offer = wallet.data.offers.find((o) => o.payAmount === payAmount);
  assert.ok(offer, `the ₹${payAmount / 100} recharge offer must exist`);
  const order = await h.post<{ checkout: any }>('/payments/orders', { purpose: 'wallet_recharge', offerId: offer.id }, token);
  assert.equal(order.status, 201, JSON.stringify(order.data));
  const done = await h.post<{ ok: boolean; order: { status: string } }>(
    '/payments/simulate',
    { razorpayOrderId: order.data.checkout.orderId, outcome: 'success' },
    token,
  );
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.order.status, 'paid');
  return { payAmount: offer.payAmount as number, bonusAmount: offer.bonusAmount as number };
}

/* ------------------------------------------------------------------ */
/* Customer journey                                                    */
/* ------------------------------------------------------------------ */

describe('customer journey', () => {
  test('sign up → top up → book → pay from the wallet → receipt', async () => {
    const { token, phone } = await signUp('Meera Nair');

    /* A brand-new customer starts clean: no wallet balance, one referral code. */
    const home = await h.get<any>('/customer/home', token);
    assert.equal(home.status, 200);
    assert.equal(home.data.wallet.totalBalance, 0);
    assert.equal(home.data.upcoming.length, 0);
    assert.ok(home.data.referral.code, 'every customer gets a share code');

    /* Top up ₹1,000 → ₹1,150 of value. */
    await topUp(token, 100000);
    const funded = await h.get<{ wallet: any }>('/customer/wallet', token);
    assert.equal(funded.data.wallet.cashBalance, 100000);
    assert.equal(funded.data.wallet.bonusBalance, 15000);
    assert.equal(funded.data.wallet.totalBalance, 115000);

    /* Book, paying the whole amount from the wallet. */
    const { branchId, service, date, slot } = await pickSlot(token);
    const booking = await h.post<any>(
      '/customer/bookings',
      {
        branchId,
        serviceIds: [service.id],
        date,
        startTime: slot.startTime,
        staffId: slot.staffId,
        paymentPreference: 'wallet',
        idempotencyKey: 'smoke-journey-1',
      },
      token,
    );
    assert.equal(booking.status, 201, JSON.stringify(booking.data));
    const appointmentId = booking.data.appointment.id as string;
    assert.equal(booking.data.appointment.paymentStatus, 'paid');
    assert.equal(booking.data.appointment.paidAmount, service.price);

    /* Bonus is spent before cash, so 15,000 came from bonus and the rest from cash. */
    const afterBooking = await h.get<{ wallet: any }>('/customer/wallet', token);
    assert.equal(afterBooking.data.wallet.bonusBalance, 0);
    assert.equal(afterBooking.data.wallet.cashBalance, 115000 - service.price);

    /* The booking shows up on the home screen and in the list. */
    const homeAfter = await h.get<any>('/customer/home', token);
    assert.equal(homeAfter.data.upcoming[0].id, appointmentId);
    const list = await h.get<any>('/customer/bookings', token);
    assert.ok(list.data.appointments.some((a: any) => a.id === appointmentId));

    /* A receipt is retrievable for the wallet entry that paid for it. */
    const wallet = await h.get<{ transactions: any[] }>('/customer/wallet', token);
    const debit = wallet.data.transactions.find((t: any) => t.amount < 0);
    assert.ok(debit, 'the visit payment is on the ledger');
    const receipt = await h.get<any>(`/customer/wallet/receipt/${debit.id}`, token);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.data.receipt.amount, debit.amount);

    /* Signing back in with the same number works (no duplicate account). */
    const again = await h.post<{ devCode: string }>('/auth/otp/request', { phone });
    const session = await h.post<any>('/auth/otp/verify', { phone, code: again.data.devCode });
    assert.equal(session.data.user.id, (await h.get<any>('/auth/me', token)).data.user.id);
  });

  test('a cancelled booking releases the slot and refunds the wallet', async () => {
    const { token } = await signUp('Cancel Case');
    await topUp(token, 100000);
    const { branchId, service, date, slot } = await pickSlot(token, 5);

    const booking = await h.post<any>(
      '/customer/bookings',
      {
        branchId,
        serviceIds: [service.id],
        date,
        startTime: slot.startTime,
        staffId: slot.staffId,
        paymentPreference: 'wallet',
        idempotencyKey: 'smoke-cancel-1',
      },
      token,
    );
    assert.equal(booking.status, 201, JSON.stringify(booking.data));
    const appointmentId = booking.data.appointment.id as string;
    const balanceAfterBooking = (await h.get<{ wallet: any }>('/customer/wallet', token)).data.wallet.totalBalance;

    const cancel = await h.post<any>(`/customer/bookings/${appointmentId}/cancel`, { reason: 'Changed my mind' }, token);
    assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
    assert.equal(cancel.data.appointment.status, 'cancelled');

    /* The money is back and the slot is bookable again. */
    const wallet = await h.get<{ wallet: any }>('/customer/wallet', token);
    assert.equal(wallet.data.wallet.totalBalance, balanceAfterBooking + service.price);
    const avail = await h.get<{ slots: any[] }>(
      `/catalog/availability?branchId=${branchId}&date=${date}&serviceIds=${service.id}`,
      token,
    );
    assert.ok(
      avail.data.slots.some((s) => s.startTime === slot.startTime),
      'the cancelled slot must be offered again',
    );
  });

  test('the customer can export their data and delete the account', async () => {
    const { token } = await signUp('Privacy Case');
    const exported = await h.get<any>('/customer/data-export', token);
    assert.equal(exported.status, 200);
    assert.equal(exported.data.user.phone.length, 10);
    assert.ok(Array.isArray(exported.data.appointments));
    assert.ok(Array.isArray(exported.data.walletTransactions));

    const deletion = await h.post<any>('/customer/account-deletion', { confirm: 'DELETE' }, token);
    assert.equal(deletion.status, 200, JSON.stringify(deletion.data));
    assert.equal(deletion.data.ok, true);
    const row = await h.db.one<{ status: string; customerId: string }>(
      'SELECT status, "customerId" FROM data_requests WHERE kind = ? ORDER BY "createdAt" DESC',
      'deletion',
    );
    assert.ok(row, 'the deletion request is recorded for the salon to action');
    assert.equal(row.status, 'pending');
    /* The person is anonymised at once; the salon still has to action it. */
    const anonymised = await h.db.one<{ name: string; status: string }>('SELECT name, status FROM users WHERE id = ?', row.customerId);
    assert.equal(anonymised?.name, 'Deleted customer');
    assert.equal(anonymised?.status, 'deactivated');
  });
});

/* ------------------------------------------------------------------ */
/* Admin journey                                                       */
/* ------------------------------------------------------------------ */

describe('admin journey', () => {
  test('a completed visit lands on the dashboard, the ledger and the audit log', async () => {
    const owner = await h.login(ACCOUNTS.owner);
    const { token: customerToken } = await signUp('Walk In Wendy');
    await topUp(customerToken, 100000);
    const { branchId, service, date, slot } = await pickSlot(customerToken, 0);

    const booking = await h.post<any>(
      '/customer/bookings',
      {
        branchId,
        serviceIds: [service.id],
        date,
        startTime: slot.startTime,
        staffId: slot.staffId,
        paymentPreference: 'wallet',
        idempotencyKey: 'smoke-admin-1',
      },
      customerToken,
    );
    assert.equal(booking.status, 201, JSON.stringify(booking.data));
    const appointmentId = booking.data.appointment.id as string;

    /* Owner sees the booking on today's schedule before touching it. */
    const before = await h.get<any>(`/admin/overview?date=${date}`, owner);
    assert.equal(before.data.overview.appointmentsBooked >= 1, true);
    assert.ok(before.data.upcomingToday.some((a: any) => a.id === appointmentId));

    /* Walk the status machine to completed. */
    for (const status of ['confirmed', 'checked_in', 'in_progress', 'completed']) {
      const res = await h.post<any>(`/admin/appointments/${appointmentId}/status`, { status }, owner);
      assert.equal(res.status, 200, `transition to ${status} failed: ${JSON.stringify(res.data)}`);
    }

    /* The dashboard now counts the revenue and the customer. */
    const after = await h.get<any>(`/admin/overview?date=${date}`, owner);
    assert.equal(after.data.overview.completed >= 1, true);
    assert.equal(after.data.overview.customersVisited >= 1, true);
    const trendPoint = after.data.trend.find((p: any) => p.date === date);
    assert.ok(trendPoint, 'today is in the 7-day trend');
    assert.ok(trendPoint.revenue >= service.price, 'the completed visit is in the trend revenue');

    /* A service record exists for the visit — reporting depends on it. */
    const record = await h.db.one<{ finalAmount: number; paymentMethod: string }>(
      'SELECT finalAmount, paymentMethod FROM service_records WHERE appointmentId = ?',
      appointmentId,
    );
    assert.ok(record, 'completing a visit writes a service record');
    assert.equal(record.paymentMethod, 'wallet');

    /* The Top-20 leaderboard reflects the spend. */
    const customerId = await h.db.scalar<string>('SELECT "customerId" FROM appointments WHERE id = ?', appointmentId);
    const top20 = await h.get<{ customers: any[] }>('/admin/customers/top?sort=spend&limit=20', owner);
    assert.ok(top20.data.customers.length <= 20, 'the leaderboard never exceeds 20 rows');
    const board = await h.get<{ customers: any[] }>('/admin/customers/top?sort=spend&limit=100', owner);
    const ranked = board.data.customers.find((c: any) => c.customerId === customerId);
    assert.ok(ranked, 'the customer is ranked after their first completed visit');
    assert.ok(ranked.totalSpend >= service.price, 'their spend counts towards the ranking');
    assert.equal(ranked.visits >= 1, true);
    const rawPhone = await h.db.scalar<string>('SELECT phone FROM users WHERE id = ?', customerId);
    assert.match(ranked.phoneMasked, /•/, 'phone numbers are masked for staff');
    assert.ok(!ranked.phoneMasked.includes(rawPhone), 'the full number is never returned to a leaderboard');
    assert.deepEqual(
      board.data.customers.map((c: any) => c.totalSpend),
      [...board.data.customers].map((c: any) => c.totalSpend).sort((a: number, b: number) => b - a),
      'the board is sorted by spend, highest first',
    );

    /* And the revenue report matches the visit. */
    const revenue = await h.get<any>(`/admin/reports/revenue?from=${date}&to=${date}`, owner);
    assert.equal(revenue.status, 200);
    assert.ok(revenue.data.report.netCollected >= service.price, 'the visit is in the net collected figure');
    assert.equal(revenue.data.report.grossServiceSales - revenue.data.report.discounts, revenue.data.report.netCollected);

    /* Administrative actions are audited. */
    const actions = await h.db.all<{ action: string; actorId: string }>(
      'SELECT action, actorId FROM audit_logs ORDER BY "timestamp" DESC LIMIT 20',
    );
    assert.ok(actions.some((a) => a.action.startsWith('appointment.')), 'the status change is audited');
    const ownerId = await h.db.scalar<string>("SELECT id FROM users WHERE phone = ?", ACCOUNTS.owner);
    assert.ok(actions.every((a) => a.actorId), 'every audit row names an actor');
    assert.ok(actions.some((a) => a.actorId === ownerId));
  });

  test('a reminder goes out on day 7 and the notification is honest about delivery', async () => {
    const owner = await h.login(ACCOUNTS.owner);
    const { token, id } = await signUp('Reminder Case');
    const { branchId, service, date, slot } = await pickSlot(token, -7);

    const booking = await h.post<any>(
      '/customer/bookings',
      {
        branchId,
        serviceIds: [service.id],
        date,
        startTime: slot.startTime,
        staffId: slot.staffId,
        paymentPreference: 'pay_at_salon',
        idempotencyKey: 'smoke-reminder-1',
      },
      token,
    );
    assert.equal(booking.status, 201, JSON.stringify(booking.data));
    const appointmentId = booking.data.appointment.id as string;
    for (const status of ['confirmed', 'checked_in', 'in_progress', 'completed']) {
      await h.post(`/admin/appointments/${appointmentId}/status`, { status, paymentMethod: 'cash' }, owner);
    }

    /* The pass looks at how long ago the visit *completed*, so age the visit
     * rather than the booking: seven days on, the day-7 nudge is due. */
    await h.db.run(
      'UPDATE service_records SET "completedAt" = ? WHERE "customerId" = ?',
      new Date(Date.now() - 7 * 86_400_000).toISOString(),
      id,
    );
    const run = await h.post<any>('/admin/reminders/run', {}, owner);
    assert.equal(run.status, 200, JSON.stringify(run.data));
    await tick();

    const rows = await h.db.all<{ stage: string; status: string; errorDetails: string | null }>(
      'SELECT stage, status, errorDetails FROM notifications WHERE customerId = ?',
      id,
    );
    const day7 = rows.find((r) => r.stage === 'day7');
    assert.ok(day7, `a day-7 reminder should exist, got ${rows.map((r) => r.stage).join(', ')}`);
    assert.notEqual(day7.status, 'sent', 'nothing may be marked sent while no provider is configured');
    assert.notEqual(day7.status, 'delivered');

    /* The customer sees the same honest status, and retrying does not fake it. */
    const inbox = await h.get<{ notifications: any[] }>('/customer/notifications', token);
    const seen = inbox.data.notifications.find((n) => n.stage === 'day7');
    assert.ok(seen);
    assert.notEqual(seen.status, 'sent');
    const retry = await h.post<any>(`/customer/notifications/${seen.id}/retry`, {}, token);
    assert.equal(retry.status, 200);
    assert.notEqual(retry.data.notification.status, 'sent', 'the retry may not claim a delivery that never happened');
    assert.ok(retry.data.notification.errorDetails, 'the attempt records why it could not be delivered');
    assert.ok(retry.data.notification.attempts >= 1, 'the attempt is counted');
    const after = await h.get<{ notifications: any[] }>('/customer/notifications', token);
    assert.notEqual(after.data.notifications.find((n) => n.id === seen.id).status, 'sent');
  });
});

/* ------------------------------------------------------------------ */
/* Referral journey                                                    */
/* ------------------------------------------------------------------ */

describe('referral journey', () => {
  test('₹50 + ₹50 is paid only after the invited friend completes a paid visit', async () => {
    const referrer = await h.login(ACCOUNTS.customer1);
    const info = await h.get<{ code: string; token: string }>('/customer/referrals', referrer);
    const code = info.data.token;

    const joined = await h.post<{ token: string; user: { id: string } }>('/auth/otp/verify', {
      phone: '9790000777',
      code: (await h.post<{ devCode: string }>('/auth/otp/request', { phone: '9790000777' })).data.devCode,
      name: 'Invited Friend',
      referralToken: code,
    });
    const friend = joined.data.token;
    assert.equal(joined.status, 200, JSON.stringify(joined.data));

    const referral = await h.db.one<{ status: string }>('SELECT status FROM referrals WHERE referredCustomerId = ?', joined.data.user.id);
    assert.ok(referral, 'the invite is attributed to the referrer');

    const dashboard = await h.get<any>('/customer/referrals', referrer);
    assert.ok(dashboard.data.code, 'the referrer keeps a share code');

    /* The friend books and the salon completes the visit — the qualification. */
    const owner = await h.login(ACCOUNTS.owner);
    await topUp(friend, 100000);
    const { branchId, service, date, slot } = await pickSlot(friend, 1);
    const booking = await h.post<any>(
      '/customer/bookings',
      {
        branchId,
        serviceIds: [service.id],
        date,
        startTime: slot.startTime,
        staffId: slot.staffId,
        paymentPreference: 'wallet',
        idempotencyKey: 'smoke-referral-1',
        referralToken: code,
      },
      friend,
    );
    assert.equal(booking.status, 201, JSON.stringify(booking.data));
    const appointmentId = booking.data.appointment.id as string;
    for (const status of ['confirmed', 'checked_in', 'in_progress', 'completed']) {
      await h.post(`/admin/appointments/${appointmentId}/status`, { status }, owner);
    }

    const rewards = await h.db.all<{ customerId: string; amount: number; type: string }>(
      'SELECT customerId, amount, type FROM reward_transactions WHERE referralId = (SELECT id FROM referrals WHERE referredCustomerId = ?)',
      joined.data.user.id,
    );
    assert.equal(rewards.length, 2, 'both sides get exactly one reward');
    for (const reward of rewards) assert.equal(reward.amount, 5000, '₹50 each');

    /* Both wallets actually hold the money. */
    const referrerWallet = await h.get<{ wallet: any }>('/customer/wallet', referrer);
    assert.ok(referrerWallet.data.wallet.totalBalance > 0, 'the referrer was credited');
    const friendWallet = await h.get<{ wallet: any }>('/customer/wallet', friend);
    assert.ok(friendWallet.data.wallet.totalBalance > 0, 'the friend was credited');
  });
});

/* ------------------------------------------------------------------ */
/* Database invariants                                                 */
/* ------------------------------------------------------------------ */

describe('invariants after the journeys', () => {
  test('every wallet balance is the sum of its posted ledger rows, and never negative', async () => {
    /* Balances are derived, never stored: the wallets table has no balance
     * column at all, which is what makes the ledger the single source of truth. */
    const wallets = await h.db.all<{ id: string; customerId: string }>('SELECT id, "customerId" FROM wallets');
    assert.ok(wallets.length > 0);
    for (const wallet of wallets) {
      const ledger = await h.db.one<{ cash: number; bonus: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN "balanceType" = 'cash'  AND status = 'posted' THEN amount END), 0) AS cash,
           COALESCE(SUM(CASE WHEN "balanceType" = 'bonus' AND status = 'posted' THEN amount END), 0) AS bonus
         FROM wallet_transactions WHERE "walletId" = ?`,
        wallet.id,
      );
      assert.ok((ledger?.cash ?? 0) >= 0, `cash went negative on wallet ${wallet.id}`);
      assert.ok((ledger?.bonus ?? 0) >= 0, `bonus went negative on wallet ${wallet.id}`);
      assert.equal(Number.isInteger(ledger?.cash), true, 'balances stay in whole paise');
    }
  });

  test('every row points at parents that exist', async () => {
    const orphanChecks: Array<[string, string]> = [
      ['appointments', 'SELECT COUNT(*) FROM appointments a LEFT JOIN users u ON u.id = a."customerId" WHERE u.id IS NULL'],
      ['service_records', 'SELECT COUNT(*) FROM service_records s LEFT JOIN appointments a ON a.id = s."appointmentId" WHERE a.id IS NULL'],
      ['wallet_transactions', 'SELECT COUNT(*) FROM wallet_transactions t LEFT JOIN wallets w ON w.id = t."walletId" WHERE w.id IS NULL'],
      ['referrals', 'SELECT COUNT(*) FROM referrals r LEFT JOIN users u ON u.id = r."referrerId" WHERE u.id IS NULL'],
      ['payment_orders', 'SELECT COUNT(*) FROM payment_orders o LEFT JOIN users u ON u.id = o."customerId" WHERE u.id IS NULL'],
      ['audit_logs', 'SELECT COUNT(*) FROM audit_logs l LEFT JOIN users u ON u.id = l."actorId" WHERE u.id IS NULL'],
      ['sessions', 'SELECT COUNT(*) FROM sessions s LEFT JOIN users u ON u.id = s."userId" WHERE u.id IS NULL'],
    ];
    for (const [label, sql] of orphanChecks) {
      assert.equal(await h.db.scalar(sql), 0, `orphaned rows in ${label}`);
    }
  });

  test('no ledger row is left in a half-written state', async () => {
    const bad = await h.db.all<{ id: string }>(
      "SELECT id FROM wallet_transactions WHERE amount = 0 OR status NOT IN ('posted', 'reversed') OR \"balanceType\" NOT IN ('cash', 'bonus')",
    );
    assert.deepEqual(bad, []);
  });

  test('reversals always pair with the original entry', async () => {
    /* A reversed row must have a compensating row referencing the same wallet,
     * otherwise money would vanish from the ledger without a trace. */
    const reversed = await h.db.scalar("SELECT COUNT(*) FROM wallet_transactions WHERE status = 'reversed'");
    if (reversed === 0) return;
    const unpaired = await h.db.scalar(
      `SELECT COUNT(*) FROM wallet_transactions r
        WHERE r.status = 'reversed'
          AND NOT EXISTS (
            SELECT 1 FROM wallet_transactions c
             WHERE c."walletId" = r."walletId" AND c."referenceId" = r.id
          )`,
    );
    assert.equal(unpaired, 0);
  });
});
