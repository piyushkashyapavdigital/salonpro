import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, getHarness, type Harness } from './harness';

/*
 * Route-surface tests.
 *
 * Unit tests prove the handlers they know about; these prove the *routes exist
 * at all*. Every screen in the customer app and the admin dashboard calls an
 * endpoint, and a renamed route used to fail only when a user tapped it. The
 * table below is the full HTTP surface: if a registration is dropped, the
 * inventory count changes; if a handler throws, the status is 5xx; if a caller
 * is not authorised, the guard answers 401/403 before any data is read.
 *
 * Query strings are deliberately minimal: a 400 from validation still proves
 * the route is mounted and validating, which is what this suite is about. The
 * end-to-end behaviour lives in `smoke.test.ts`.
 */

type Role = 'public' | 'customer' | 'owner';

interface Route {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  role: Role;
  /** Body for a mutation that is expected to validate, not to run. */
  body?: unknown;
}

let h: Harness;
let ids: Record<string, string>;

const q = (params: Record<string, string>) =>
  '?' + new URLSearchParams(params).toString();

function buildRoutes(): Route[] {
  const date = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const to = date;

  return [
    /* --- auth ------------------------------------------------------ */
    { method: 'POST', path: '/auth/otp/request', role: 'public', body: {} },
    { method: 'POST', path: '/auth/otp/verify', role: 'public', body: {} },
    { method: 'GET', path: '/auth/demo-accounts', role: 'public' },
    { method: 'POST', path: '/auth/demo-login', role: 'public', body: {} },
    { method: 'GET', path: '/auth/me', role: 'customer' },
    { method: 'POST', path: '/auth/logout', role: 'customer', body: {} },
    { method: 'POST', path: '/auth/logout-all', role: 'customer', body: {} },
    { method: 'POST', path: '/auth/invite', role: 'owner', body: {} },
    { method: 'POST', path: '/auth/password', role: 'customer', body: {} },

    /* --- catalog (public storefront) ------------------------------- */
    { method: 'GET', path: '/catalog/salon', role: 'public' },
    { method: 'GET', path: '/catalog/branches', role: 'public' },
    { method: 'GET', path: '/catalog/services', role: 'public' },
    { method: 'GET', path: '/catalog/staff', role: 'public' },
    { method: 'GET', path: `/catalog/availability${q({ date, serviceIds: ids.service, branchId: ids.branch })}`, role: 'public' },
    { method: 'GET', path: '/catalog/coupons', role: 'public' },
    { method: 'POST', path: '/catalog/coupons/validate', role: 'customer', body: {} },
    { method: 'GET', path: '/catalog/recharge-offers', role: 'public' },
    { method: 'GET', path: `/catalog/join/${ids.referralCode}`, role: 'public' },
    { method: 'GET', path: `/catalog/referral-info${q({ code: ids.referralCode })}`, role: 'public' },
    { method: 'GET', path: `/catalog/payment-status/${ids.order}`, role: 'public' },
    { method: 'GET', path: '/catalog/cities', role: 'public' },

    /* --- customer app ---------------------------------------------- */
    { method: 'GET', path: '/customer/home', role: 'customer' },
    { method: 'POST', path: '/customer/bookings', role: 'customer', body: {} },
    { method: 'GET', path: '/customer/bookings', role: 'customer' },
    { method: 'GET', path: `/customer/bookings/${ids.appointment}`, role: 'customer' },
    { method: 'POST', path: `/customer/bookings/${ids.appointment}/cancel`, role: 'customer', body: {} },
    { method: 'POST', path: `/customer/bookings/${ids.appointment}/reschedule`, role: 'customer', body: {} },
    { method: 'GET', path: '/customer/wallet', role: 'customer' },
    { method: 'GET', path: `/customer/wallet/receipt/${ids.transaction}`, role: 'customer' },
    { method: 'GET', path: '/customer/wallet/transactions.csv', role: 'customer' },
    { method: 'GET', path: '/customer/referrals', role: 'customer' },
    { method: 'GET', path: '/customer/offers', role: 'customer' },
    { method: 'GET', path: '/customer/profile', role: 'customer' },
    { method: 'PATCH', path: '/customer/profile', role: 'customer', body: {} },
    { method: 'PATCH', path: '/customer/preferences', role: 'customer', body: {} },
    { method: 'GET', path: '/customer/notifications', role: 'customer' },
    { method: 'POST', path: `/customer/notifications/${ids.notification}/retry`, role: 'customer', body: {} },
    { method: 'POST', path: '/customer/push-subscription', role: 'customer', body: {} },
    { method: 'GET', path: '/customer/data-export', role: 'customer' },
    { method: 'POST', path: '/customer/account-deletion', role: 'customer', body: {} },

    /* --- payments -------------------------------------------------- */
    { method: 'POST', path: '/payments/orders', role: 'customer', body: {} },
    { method: 'POST', path: '/payments/verify', role: 'customer', body: {} },
    { method: 'POST', path: '/payments/simulate', role: 'customer', body: {} },
    { method: 'POST', path: '/payments/webhook', role: 'public', body: {} },
    { method: 'GET', path: '/payments/config', role: 'public' },
    { method: 'GET', path: '/payments/orders', role: 'customer' },
    { method: 'POST', path: `/payments/orders/${ids.order}/fail`, role: 'customer', body: {} },

    /* --- admin dashboard ------------------------------------------- */
    { method: 'GET', path: `/admin/overview${q({ date })}`, role: 'owner' },
    { method: 'GET', path: `/admin/appointments${q({ date })}`, role: 'owner' },
    { method: 'GET', path: `/admin/appointments/calendar${q({ date, from, to })}`, role: 'owner' },
    { method: 'GET', path: `/admin/appointments/${ids.appointment}`, role: 'owner' },
    { method: 'POST', path: '/admin/appointments', role: 'owner', body: {} },
    { method: 'POST', path: `/admin/appointments/${ids.appointment}/status`, role: 'owner', body: {} },
    { method: 'POST', path: `/admin/appointments/${ids.appointment}/no-show`, role: 'owner', body: {} },
    { method: 'GET', path: `/admin/availability${q({ date, serviceIds: ids.service, branchId: ids.branch })}`, role: 'owner' },
    { method: 'GET', path: '/admin/customers', role: 'owner' },
    { method: 'GET', path: '/admin/customers/top', role: 'owner' },
    { method: 'GET', path: `/admin/customers/${ids.customer}`, role: 'owner' },
    { method: 'POST', path: `/admin/customers/${ids.customer}/wallet/adjust`, role: 'owner', body: {} },
    { method: 'POST', path: `/admin/customers/${ids.customer}/consent`, role: 'owner', body: {} },
    { method: 'GET', path: '/admin/wallet', role: 'owner' },
    { method: 'GET', path: '/admin/wallet.csv', role: 'owner' },
    { method: 'GET', path: '/admin/payments', role: 'owner' },
    { method: 'GET', path: '/admin/payments.csv', role: 'owner' },
    { method: 'POST', path: '/admin/refunds', role: 'owner', body: {} },
    { method: 'GET', path: '/admin/referrals', role: 'owner' },
    { method: 'PATCH', path: '/admin/referrals/config', role: 'owner', body: {} },
    { method: 'GET', path: '/admin/reminders', role: 'owner' },
    { method: 'PATCH', path: '/admin/reminders/settings', role: 'owner', body: {} },
    { method: 'PATCH', path: '/admin/reminders/templates', role: 'owner', body: {} },
    { method: 'POST', path: '/admin/reminders/run', role: 'owner', body: {} },
    { method: 'POST', path: `/admin/reminders/${ids.notification}/retry`, role: 'owner', body: {} },
    { method: 'GET', path: '/admin/services', role: 'owner' },
    { method: 'POST', path: '/admin/services', role: 'owner', body: {} },
    { method: 'PATCH', path: `/admin/services/${ids.service}`, role: 'owner', body: {} },
    { method: 'GET', path: '/admin/staff', role: 'owner' },
    { method: 'POST', path: '/admin/staff', role: 'owner', body: {} },
    { method: 'PATCH', path: `/admin/staff/${ids.staff}`, role: 'owner', body: {} },
    { method: 'POST', path: `/admin/staff/${ids.staff}/attendance`, role: 'owner', body: {} },
    { method: 'GET', path: '/admin/branches', role: 'owner' },
    { method: 'POST', path: '/admin/branches', role: 'owner', body: {} },
    { method: 'PATCH', path: `/admin/branches/${ids.branch}`, role: 'owner', body: {} },
    { method: 'POST', path: `/admin/branches/${ids.branch}/holidays`, role: 'owner', body: {} },
    { method: 'GET', path: '/admin/offers', role: 'owner' },
    { method: 'POST', path: '/admin/offers/recharge', role: 'owner', body: {} },
    { method: 'PATCH', path: `/admin/offers/recharge/${ids.offer}`, role: 'owner', body: {} },
    { method: 'POST', path: '/admin/coupons', role: 'owner', body: {} },
    { method: 'PATCH', path: `/admin/coupons/${ids.coupon}`, role: 'owner', body: {} },
    { method: 'GET', path: `/admin/reports/revenue${q({ date, from, to })}`, role: 'owner' },
    { method: 'GET', path: `/admin/reports/revenue.csv${q({ date, from, to })}`, role: 'owner' },
    { method: 'GET', path: '/admin/reports/retention', role: 'owner' },
    { method: 'GET', path: '/admin/reports/customers.csv', role: 'owner' },
    { method: 'GET', path: '/admin/users', role: 'owner' },
    { method: 'PATCH', path: `/admin/users/${ids.user}`, role: 'owner', body: {} },
    { method: 'GET', path: '/admin/audit', role: 'owner' },
    { method: 'GET', path: '/admin/settings', role: 'owner' },
    { method: 'PATCH', path: '/admin/settings', role: 'owner', body: {} },
    { method: 'GET', path: '/admin/me', role: 'owner' },
  ];
}

/** A 404 that means "this URL is not a route", as opposed to a missing record. */
function isMissingRoute(status: number, data: unknown) {
  const message = (data as { message?: string } | null)?.message ?? '';
  return status === 404 && /is not a route/i.test(message);
}

function describeFailure(method: string, path: string, status: number, data: unknown) {
  return `${method} ${path} → ${status} ${JSON.stringify(data).slice(0, 300)}`;
}

async function loadIds(): Promise<Record<string, string>> {
  const pick = async (sql: string, ...params: unknown[]) =>
    (await h.db.scalar<string>(sql, ...(params as string[]))) || 'missing';
  return {
    appointment: await pick('SELECT id FROM appointments LIMIT 1'),
    customer: await pick("SELECT id FROM users WHERE role = 'customer' LIMIT 1"),
    user: await pick("SELECT id FROM users WHERE role = 'stylist' LIMIT 1"),
    staff: await pick('SELECT id FROM staff LIMIT 1'),
    service: await pick('SELECT id FROM services LIMIT 1'),
    branch: await pick('SELECT id FROM branches LIMIT 1'),
    offer: await pick('SELECT id FROM recharge_offers LIMIT 1'),
    coupon: await pick('SELECT id FROM coupons LIMIT 1'),
    transaction: await pick('SELECT id FROM wallet_transactions LIMIT 1'),
    notification: await pick('SELECT id FROM notifications LIMIT 1'),
    order: await pick('SELECT id FROM payment_orders LIMIT 1'),
    referralCode: await pick('SELECT code FROM referral_codes LIMIT 1'),
  };
}

describe('route surface', () => {
  let customerToken: string;
  let ownerToken: string;
  let routes: Route[];

  before(async () => {
    h = await getHarness();
    await h.reset();
    ids = await loadIds();
  });

  beforeEach(async () => {
    await h.reset();
    ids = await loadIds();
    customerToken = await h.login(ACCOUNTS.customer1);
    ownerToken = await h.login(ACCOUNTS.owner);
    routes = buildRoutes();
  });

  after(async () => {
    await h.close();
  });

  test('the inventory covers the whole documented HTTP surface', () => {
    /* Auth 9 + catalog 12 + customer 19 + payments 7 + admin 51. */
    assert.equal(routes.length, 98);
    assert.equal(new Set(routes.map((r) => `${r.method} ${r.path.split('?')[0]}`)).size, routes.length, 'duplicate route in the table');
  });

  test('every route is registered and no handler returns a 5xx', async () => {
    for (const route of routes) {
      const token = route.role === 'owner' ? ownerToken : route.role === 'customer' ? customerToken : undefined;
      const res =
        route.method === 'GET'
          ? await h.get(route.path, token)
          : route.method === 'POST'
            ? await h.post(route.path, route.body, token)
            : await h.patch(route.path, route.body, token);

      assert.equal(
        isMissingRoute(res.status, res.data),
        false,
        `${route.method} ${route.path} is not registered`,
      );
      assert.ok(res.status < 500, describeFailure(route.method, route.path, res.status, res.data));
    }
  });

  test('every protected route refuses an anonymous caller with 401', async () => {
    for (const route of routes.filter((r) => r.role !== 'public')) {
      const res =
        route.method === 'GET'
          ? await h.get(route.path)
          : route.method === 'POST'
            ? await h.post(route.path, route.body)
            : await h.patch(route.path, route.body);
      assert.equal(
        res.status,
        401,
        `${route.method} ${route.path} should require a session, got ${res.status} ${JSON.stringify(res.data)}`,
      );
    }
  });

  test('a customer token cannot reach any admin endpoint', async () => {
    for (const route of routes.filter((r) => r.role === 'owner')) {
      const res =
        route.method === 'GET'
          ? await h.get(route.path, customerToken)
          : route.method === 'POST'
            ? await h.post(route.path, route.body, customerToken)
            : await h.patch(route.path, route.body, customerToken);
      assert.equal(
        res.status,
        403,
        `${route.method} ${route.path} leaked to a customer: ${res.status} ${JSON.stringify(res.data)}`,
      );
    }
  });

  test('the endpoints the mobile UI loads every day all return 200', async () => {
    const date = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    const to = date;
    const daily: Array<[string, string]> = [
      ['/auth/me', customerToken],
      ['/customer/home', customerToken],
      ['/customer/bookings', customerToken],
      ['/customer/wallet', customerToken],
      ['/customer/referrals', customerToken],
      ['/customer/offers', customerToken],
      ['/customer/profile', customerToken],
      ['/customer/notifications', customerToken],
      ['/catalog/salon', customerToken],
      [`/catalog/services${q({ branchId: ids.branch })}`, customerToken],
      [`/catalog/staff${q({ branchId: ids.branch })}`, customerToken],
      ['/catalog/branches', customerToken],
      ['/catalog/recharge-offers', customerToken],
      ['/catalog/coupons', customerToken],
      [`/admin/overview${q({ date })}`, ownerToken],
      [`/admin/appointments${q({ date })}`, ownerToken],
      [`/admin/appointments/calendar${q({ date, from, to })}`, ownerToken],
      ['/admin/customers', ownerToken],
      ['/admin/customers/top', ownerToken],
      ['/admin/wallet', ownerToken],
      ['/admin/payments', ownerToken],
      ['/admin/referrals', ownerToken],
      ['/admin/reminders', ownerToken],
      ['/admin/services', ownerToken],
      ['/admin/staff', ownerToken],
      ['/admin/branches', ownerToken],
      ['/admin/offers', ownerToken],
      ['/admin/users', ownerToken],
      ['/admin/audit', ownerToken],
      ['/admin/settings', ownerToken],
      ['/admin/me', ownerToken],
      [`/admin/reports/revenue${q({ date, from, to })}`, ownerToken],
      ['/admin/reports/retention', ownerToken],
      ['/payments/config', customerToken],
    ];

    for (const [path, token] of daily) {
      const res = await h.get(path, token || undefined);
      assert.equal(res.status, 200, describeFailure('GET', path, res.status, res.data));
    }
  });

  test('CSV downloads are actual files, not JSON error bodies', async () => {
    const csvs: Array<[string, string]> = [
      ['/customer/wallet/transactions.csv', customerToken],
      ['/admin/wallet.csv', ownerToken],
      ['/admin/payments.csv', ownerToken],
      ['/admin/reports/customers.csv', ownerToken],
    ];
    for (const [path, token] of csvs) {
      const res = await h.get(path, token);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-type') ?? '', /text\/csv/, `${path} did not serve CSV`);
      assert.match(String(res.data), /^[^\n]*,[^\n]*\n/, `${path} has no header row`);
    }
  });
});
