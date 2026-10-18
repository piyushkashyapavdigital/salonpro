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

test('the today overview returns the metrics the dashboard renders', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get<any>('/admin/overview', token);
  assert.equal(res.status, 200);
  const o = res.data.overview;
  for (const key of ['customersVisited', 'newCustomers', 'appointmentsBooked', 'completed', 'cancelled', 'pending', 'revenueCollected', 'walletPayments', 'directPayments']) {
    assert.equal(typeof o[key], 'number', `overview.${key} should be a number`);
  }
  assert.ok(Array.isArray(res.data.topCustomers));
  assert.ok(res.data.topCustomers.length <= 5);
  assert.ok(res.data.referralStats);
});

test('the overview 7-day trend is a real, contiguous calendar series, not fabricated', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get<any>('/admin/overview', token);
  assert.equal(res.status, 200);
  type TrendPoint = { date: string; revenue: number; visits: number; appointments: number };
  const trend = res.data.trend as TrendPoint[];
  assert.ok(Array.isArray(trend), 'the overview carries a trend series');
  assert.equal(trend.length, 7, 'exactly seven daily points');

  const dayMs = 86_400_000;
  for (let i = 0; i < trend.length; i++) {
    const point = trend[i];
    assert.match(point.date, /^\d{4}-\d{2}-\d{2}$/, 'each point is a real date');
    assert.equal(typeof point.revenue, 'number');
    assert.equal(typeof point.visits, 'number');
    assert.equal(typeof point.appointments, 'number');
    assert.ok(point.revenue >= 0 && point.visits >= 0 && point.appointments >= 0);
    if (i > 0) {
      const gap: number = Date.parse(`${point.date}T00:00:00Z`) - Date.parse(`${trend[i - 1].date}T00:00:00Z`);
      assert.equal(gap, dayMs, 'consecutive days with no gaps');
    }
  }

  // The final point is the overview's own date, and it agrees with the same
  // day's headline figures — proof the series reads from the same data.
  assert.equal(trend[6].date, res.data.overview.date, 'the series ends on the requested date');
  assert.equal(trend[6].visits, res.data.overview.customersVisited);
  assert.equal(trend[6].appointments, res.data.overview.appointmentsBooked);
});

test('the Top 20 leaderboard is ranked by spend and masks phone numbers', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get<{ customers: any[] }>('/admin/customers/top?limit=20', token);
  assert.equal(res.status, 200);
  const rows = res.data.customers;
  assert.ok(rows.length > 0 && rows.length <= 20);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].totalSpend >= rows[i].totalSpend, 'rows are sorted by descending spend');
  }
  for (const row of rows) {
    assert.ok(row.name);
    assert.ok(row.phoneMasked.includes('•') || row.phoneMasked.includes('*'), 'phone numbers are masked');
    assert.equal(typeof row.averageSpend, 'number');
  }
});

test('the leaderboard can be re-sorted by visits and referrals', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const byVisits = await h.get<{ customers: any[] }>('/admin/customers/top?sort=visits&limit=10', token);
  for (let i = 1; i < byVisits.data.customers.length; i++) {
    assert.ok(byVisits.data.customers[i - 1].visits >= byVisits.data.customers[i].visits);
  }
  const byReferrals = await h.get<{ customers: any[] }>('/admin/customers/top?sort=referrals&limit=10', token);
  for (let i = 1; i < byReferrals.data.customers.length; i++) {
    assert.ok(byReferrals.data.customers[i - 1].referrals >= byReferrals.data.customers[i].referrals);
  }
});

test('the revenue report distinguishes net collected from gross sales', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get<{ report: any }>(`/admin/reports/revenue?from=${dayFrom(-30)}&to=${dayFrom(0)}`, token);
  assert.equal(res.status, 200);
  const r = res.data.report;
  assert.equal(typeof r.grossServiceSales, 'number');
  assert.equal(typeof r.netCollected, 'number');
  assert.equal(typeof r.cashLiability, 'number');
  assert.equal(typeof r.bonusLiability, 'number');
  assert.ok(Array.isArray(r.series));
  assert.ok(r.series.length >= 1, 'at least one day of activity is returned');
  for (const point of r.series) {
    assert.match(point.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(point.date >= dayFrom(-30) && point.date <= dayFrom(0), 'points fall inside the range');
  }
});

test('the revenue report requires an explicit date range', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get('/admin/reports/revenue', token);
  assert.equal(res.status, 400);
});

test('the retention report exposes inactivity buckets', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get<{ report: any }>('/admin/reports/retention', token);
  assert.equal(res.status, 200);
  assert.ok(res.data.report);
});

test('CSV exports are served as downloadable text/csv', async () => {
  const token = await h.login(ACCOUNTS.owner);
  for (const path of [
    '/admin/wallet.csv',
    `/admin/reports/revenue.csv?from=${dayFrom(-30)}&to=${dayFrom(0)}`,
    '/customer/wallet/transactions.csv',
  ]) {
    const useToken = path.startsWith('/customer') ? await h.login(ACCOUNTS.customer1) : token;
    const res = await h.get(path, useToken);
    assert.equal(res.status, 200, `${path} should export`);
    assert.match(res.headers.get('content-type') ?? '', /text\/csv/);
    assert.match(res.headers.get('content-disposition') ?? '', /attachment/);
  }
});

test('the audit log records administrative actions', async () => {
  const token = await h.login(ACCOUNTS.owner);
  const res = await h.get<{ logs: any[] }>('/admin/audit?limit=20', token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.logs));
  assert.ok(res.data.logs.length > 0, 'the seed writes at least one audit entry');
});
