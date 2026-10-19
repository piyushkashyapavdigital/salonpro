import type {
  CustomerProfile,
  DailyTrendPoint,
  RetentionReport,
  RevenueReport,
  TopCustomer,
  TodayOverview,
  Wallet,
} from '@salonpro/shared';
import { addDays, isoDate, maskPhone } from '@salonpro/shared';
import { all, one, parseJson, scalar } from '../db';
import { DbRow } from '../lib/types';
import { balances, getOrCreateWallet } from './wallet';

export interface ScopeFilter {
  salonId: string;
  branchIds?: string[];
}

function branchClause(alias: string, branchIds?: string[]) {
  if (!branchIds || !branchIds.length) return { sql: '', params: [] as string[] };
  return {
    sql: ` AND ${alias}.branchId IN (${branchIds.map(() => '?').join(',')})`,
    params: branchIds,
  };
}

/**
 * The first ten characters of an ISO timestamp — the calendar day, in UTC.
 * (`date(x)` in the old SQLite build did the same thing.)
 */
function day10(expr: string): string {
  return `substring(${expr} from 1 for 10)`;
}

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

export async function todayOverview(scope: ScopeFilter, date = isoDate()): Promise<TodayOverview> {
  const b = branchClause('a', scope.branchIds);

  const appts = await all<DbRow>(
    `SELECT a.* FROM appointments a WHERE a.salonId = ? AND a.date = ?${b.sql}`,
    scope.salonId,
    date,
    ...b.params,
  );

  const completed = appts.filter((a) => a.status === 'completed');
  const s = branchClause('sr', scope.branchIds);
  const records = await all<DbRow>(
    `SELECT sr.* FROM service_records sr WHERE sr.salonId = ? AND ${day10('sr."completedAt"')} = ?${s.sql}`,
    scope.salonId,
    date,
    ...s.params,
  );

  const revenueCollected =
    records.reduce((sum, r) => sum + r.finalAmount, 0) + (await sumWalletToday(scope, date));
  const walletPayments = records.reduce((sum, r) => sum + r.walletAmount, 0);
  const directPayments = records.reduce((sum, r) => sum + r.onlineAmount + r.cashAmount, 0);

  const visitedCustomers = new Set(records.map((r) => r.customerId));

  const newCustomers = await scalar<number>(
    `SELECT COUNT(*) FROM users u
      WHERE u.role = 'customer' AND ${day10('u."createdAt"')} = ?
        AND EXISTS (SELECT 1 FROM service_records sr WHERE sr.customerId = u.id AND sr.salonId = ?)`,
    date,
    scope.salonId,
  );
  const newRegistrations = await scalar<number>(
    `SELECT COUNT(*) FROM users WHERE role = 'customer' AND ${day10('"createdAt"')} = ?`,
    date,
  );

  const walletCash = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'cash' AND status = 'posted'`,
    scope.salonId,
  );
  const walletBonus = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'bonus' AND status = 'posted'`,
    scope.salonId,
  );
  const referralRewardExpense = await scalar<number>(
    `SELECT COALESCE(SUM(rt.amount),0) FROM reward_transactions rt JOIN referrals r ON r.id = rt.referralId
      WHERE r.salonId = ? AND rt.status = 'credited' AND rt.type <> 'reversal'`,
    scope.salonId,
  );

  return {
    date,
    customersVisited: visitedCustomers.size,
    newCustomers,
    returningCustomers: Math.max(0, visitedCustomers.size - newCustomers),
    appointmentsBooked: appts.length,
    completed: completed.length,
    cancelled: appts.filter((a) => a.status === 'cancelled').length,
    pending: appts.filter((a) => ['booked', 'confirmed', 'checked_in', 'in_progress'].includes(a.status)).length,
    walkIns: appts.filter((a) => a.bookingSource === 'walk_in').length,
    online: appts.filter((a) => a.bookingSource !== 'walk_in').length,
    revenueCollected,
    walletPayments,
    directPayments,
    newRegistrations,
    referralVisits: appts.filter((a) => a.referralId).length,
    walletCashLiability: walletCash,
    walletBonusLiability: walletBonus,
    referralRewardExpense,
  };
}

/** Wallet recharges collected today (money in, not service revenue). */
function sumWalletToday(scope: ScopeFilter, date: string) {
  return scalar<number>(
    `SELECT COALESCE(SUM(po.amountPaid),0) FROM payment_orders po
      WHERE po.salonId = ? AND po.status = 'paid' AND ${day10('po."verifiedAt"')} = ?`,
    scope.salonId,
    date,
  );
}

/**
 * A real day-by-day series ending at `endDate`, gaps filled with zeroes.
 * Revenue/visits come from completed service records; appointments from the
 * booking calendar. Every point maps to an actual calendar date.
 */
export async function dailyTrend(scope: ScopeFilter, endDate = isoDate(), days = 7): Promise<DailyTrendPoint[]> {
  const from = addDays(endDate, -(days - 1));

  const s = branchClause('sr', scope.branchIds);
  const revenueRows = await all<DbRow>(
    `SELECT ${day10('sr."completedAt"')} AS day,
            COALESCE(SUM(sr.finalAmount),0) AS revenue,
            COUNT(DISTINCT sr.customerId) AS visits
       FROM service_records sr
      WHERE sr.salonId = ? AND ${day10('sr."completedAt"')} BETWEEN ? AND ?${s.sql}
      GROUP BY ${day10('sr."completedAt"')}`,
    scope.salonId,
    from,
    endDate,
    ...s.params,
  );

  const a = branchClause('a', scope.branchIds);
  const appointmentRows = await all<DbRow>(
    `SELECT a.date AS day, COUNT(*) AS appointments
       FROM appointments a
      WHERE a.salonId = ? AND a.date BETWEEN ? AND ?${a.sql}
      GROUP BY a.date`,
    scope.salonId,
    from,
    endDate,
    ...a.params,
  );

  const revenueByDay = new Map(revenueRows.map((r) => [String(r.day), r]));
  const appointmentsByDay = new Map(appointmentRows.map((r) => [String(r.day), r]));

  const series: DailyTrendPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDays(from, i);
    const rev = revenueByDay.get(day);
    const appt = appointmentsByDay.get(day);
    series.push({
      date: day,
      revenue: rev ? rev.revenue : 0,
      visits: rev ? rev.visits : 0,
      appointments: appt ? appt.appointments : 0,
    });
  }
  return series;
}

/* ------------------------------------------------------------------ */
/* Revenue                                                             */
/* ------------------------------------------------------------------ */

export async function revenueReport(scope: ScopeFilter, from: string, to: string): Promise<RevenueReport> {
  const s = branchClause('sr', scope.branchIds);
  const records = await all<DbRow>(
    `SELECT sr.* FROM service_records sr
      WHERE sr.salonId = ? AND ${day10('sr."completedAt"')} BETWEEN ? AND ?${s.sql}`,
    scope.salonId,
    from,
    to,
    ...s.params,
  );

  const grossServiceSales = records.reduce((sum, r) => sum + r.grossAmount, 0);
  const discounts = records.reduce((sum, r) => sum + r.discount, 0);
  const netCollected = records.reduce((sum, r) => sum + r.finalAmount, 0);

  const refunds = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM refunds WHERE salonId = ? AND ${day10('"createdAt"')} BETWEEN ? AND ? AND status = 'processed'`,
    scope.salonId,
    from,
    to,
  );

  const recharges = await all<DbRow>(
    `SELECT * FROM payment_orders WHERE salonId = ? AND status = 'paid' AND ${day10('"verifiedAt"')} BETWEEN ? AND ?`,
    scope.salonId,
    from,
    to,
  );
  const walletCashCollected = recharges
    .filter((r) => r.purpose === 'wallet_recharge')
    .reduce((sum, r) => sum + r.amountPaid, 0);

  const walletBonusGranted = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions
      WHERE salonId = ? AND balanceType = 'bonus' AND type IN ('recharge','referral_bonus') AND status = 'posted'
        AND ${day10('"createdAt"')} BETWEEN ? AND ?`,
    scope.salonId,
    from,
    to,
  );

  const cashLiability = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'cash' AND status = 'posted'`,
    scope.salonId,
  );
  const bonusLiability = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'bonus' AND status = 'posted'`,
    scope.salonId,
  );
  const referralRewardExpense = await scalar<number>(
    `SELECT COALESCE(SUM(rt.amount),0) FROM reward_transactions rt JOIN referrals r ON r.id = rt.referralId
      WHERE r.salonId = ? AND rt.status = 'credited' AND rt.type <> 'reversal' AND ${day10('rt."createdAt"')} BETWEEN ? AND ?`,
    scope.salonId,
    from,
    to,
  );

  const byServiceMap = new Map<string, { serviceId: string; name: string; revenue: number; count: number }>();
  for (const record of records) {
    for (const svc of parseJson<{ serviceId: string; name: string; price: number }[]>(record.servicesJson, [])) {
      const entry = byServiceMap.get(svc.serviceId) ?? { serviceId: svc.serviceId, name: svc.name, revenue: 0, count: 0 };
      entry.revenue += svc.price;
      entry.count += 1;
      byServiceMap.set(svc.serviceId, entry);
    }
  }

  const byMethodMap = new Map<string, { method: string; amount: number; count: number }>();
  for (const record of records) {
    const method = record.paymentMethod as string;
    const entry = byMethodMap.get(method) ?? { method, amount: 0, count: 0 };
    entry.amount += record.finalAmount;
    entry.count += 1;
    byMethodMap.set(method, entry);
  }

  const seriesMap = new Map<string, { date: string; net: number; gross: number }>();
  for (const record of records) {
    const day = String(record.completedAt).slice(0, 10);
    const entry = seriesMap.get(day) ?? { date: day, net: 0, gross: 0 };
    entry.net += record.finalAmount;
    entry.gross += record.grossAmount;
    seriesMap.set(day, entry);
  }

  const outstanding = await scalar<number>(
    `SELECT COALESCE(SUM(totalAmount - paidAmount),0) FROM appointments
      WHERE salonId = ? AND status = 'completed' AND paymentStatus <> 'paid'`,
    scope.salonId,
  );

  return {
    from,
    to,
    grossServiceSales,
    discounts,
    refunds,
    netCollected,
    outstanding,
    walletCashCollected,
    walletBonusGranted,
    directCollected: records.reduce((sum, r) => sum + r.onlineAmount + r.cashAmount, 0),
    referralRewardExpense,
    cashLiability,
    bonusLiability,
    byService: [...byServiceMap.values()].sort((a, b2) => b2.revenue - a.revenue),
    byMethod: [...byMethodMap.values()].sort((a, b2) => b2.amount - a.amount),
    series: [...seriesMap.values()].sort((a, b2) => a.date.localeCompare(b2.date)),
  };
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export async function topCustomers(
  scope: ScopeFilter,
  opts: { from?: string; to?: string; sort?: 'spend' | 'visits' | 'referrals'; limit?: number } = {},
): Promise<TopCustomer[]> {
  const s = branchClause('sr', scope.branchIds);
  const from = opts.from ?? '1970-01-01';
  const to = opts.to ?? isoDate();
  const rows = await all<DbRow>(
    `SELECT u.id AS customerId, u.name, u.phone,
            COALESCE(SUM(sr.finalAmount),0) AS totalSpend,
            COUNT(sr.id) AS visits,
            MAX(sr.completedAt) AS lastVisitAt
       FROM users u
       LEFT JOIN service_records sr ON sr.customerId = u.id AND sr.salonId = ?
            AND ${day10('sr."completedAt"')} BETWEEN ? AND ?${s.sql}
      WHERE u.role = 'customer'
      GROUP BY u.id
      HAVING COUNT(sr.id) > 0`,
    scope.salonId,
    from,
    to,
    ...s.params,
  );

  const mapped: TopCustomer[] = [];
  for (const row of rows) {
    const walletRow = await one<DbRow>(
      'SELECT id FROM wallets WHERE salonId = ? AND customerId = ?',
      scope.salonId,
      row.customerId,
    );
    const b = walletRow ? await balances(walletRow.id) : { cash: 0, bonus: 0, total: 0 };
    const referrals = await scalar<number>(
      "SELECT COUNT(*) FROM referrals WHERE salonId = ? AND referrerId = ? AND status IN ('qualified','rewarded')",
      scope.salonId,
      row.customerId,
    );
    mapped.push({
      customerId: row.customerId,
      name: row.name,
      phoneMasked: maskPhone(row.phone),
      totalSpend: row.totalSpend,
      visits: row.visits,
      averageSpend: row.visits ? Math.round(row.totalSpend / row.visits) : 0,
      lastVisitAt: row.lastVisitAt,
      walletBalance: b.total,
      referrals,
    });
  }

  const sort = opts.sort ?? 'spend';
  mapped.sort((a, b2) =>
    sort === 'visits' ? b2.visits - a.visits : sort === 'referrals' ? b2.referrals - a.referrals : b2.totalSpend - a.totalSpend,
  );
  return mapped.slice(0, opts.limit ?? 20);
}

export async function listCustomers(scope: ScopeFilter, opts: { search?: string; limit?: number } = {}): Promise<CustomerProfile[]> {
  const params: (string | number)[] = [scope.salonId];
  let searchClause = '';
  if (opts.search) {
    searchClause = ' AND (u.name ILIKE ? OR u.phone ILIKE ?)';
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  params.push(opts.limit ?? 100);
  const rows = await all<DbRow>(
    `SELECT u.id, u.name, u.phone, u.createdAt,
            p.lastVisitAt, p.totalVisits, p.totalCompletedSpend, p.preferredServices, p.marketingConsent, p.birthday
       FROM users u
       LEFT JOIN customer_profiles p ON p.customerId = u.id
      WHERE u.role = 'customer' AND p.salonId = ?${searchClause}
      ORDER BY COALESCE(p.totalCompletedSpend, 0) DESC LIMIT ?`,
    ...params,
  );
  const out: CustomerProfile[] = [];
  for (const row of rows) out.push(await customerProfileFromRow(scope.salonId, row));
  return out;
}

async function customerProfileFromRow(salonId: string, row: DbRow): Promise<CustomerProfile> {
  const walletRow = await one<DbRow>('SELECT id FROM wallets WHERE salonId = ? AND customerId = ?', salonId, row.id);
  const b = walletRow ? await balances(walletRow.id) : { cash: 0, bonus: 0, total: 0 };
  const wallet: Wallet | null = walletRow
    ? {
        id: walletRow.id,
        salonId,
        customerId: row.id,
        status: 'active',
        cashBalance: b.cash,
        bonusBalance: b.bonus,
        totalBalance: b.total,
        createdAt: row.createdAt,
      }
    : null;
  return {
    customerId: row.id,
    name: row.name,
    phone: row.phone,
    lastVisitAt: row.lastVisitAt ?? null,
    totalVisits: row.totalVisits ?? 0,
    totalCompletedSpend: row.totalCompletedSpend ?? 0,
    averageSpend: row.totalVisits ? Math.round((row.totalCompletedSpend ?? 0) / row.totalVisits) : 0,
    preferredServices: parseJson<string[]>(row.preferredServices, []),
    marketingConsent: row.marketingConsent === null || row.marketingConsent === undefined ? true : !!row.marketingConsent,
    birthday: row.birthday ?? null,
    wallet,
    successfulReferrals: await scalar<number>(
      "SELECT COUNT(*) FROM referrals WHERE salonId = ? AND referrerId = ? AND status IN ('qualified','rewarded')",
      salonId,
      row.id,
    ),
    createdAt: row.createdAt,
  };
}

export async function customerProfile(salonId: string, customerId: string): Promise<CustomerProfile | null> {
  const row = await one<DbRow>(
    `SELECT u.id, u.name, u.phone, u.createdAt,
            p.lastVisitAt, p.totalVisits, p.totalCompletedSpend, p.preferredServices, p.marketingConsent, p.birthday
       FROM users u LEFT JOIN customer_profiles p ON p.customerId = u.id
      WHERE u.id = ?`,
    customerId,
  );
  return row ? customerProfileFromRow(salonId, row) : null;
}

/* ------------------------------------------------------------------ */
/* Retention                                                           */
/* ------------------------------------------------------------------ */

export async function retentionReport(scope: ScopeFilter): Promise<RetentionReport> {
  const s = branchClause('sr', scope.branchIds);
  const inactive = (days: number) =>
    scalar<number>(
      `SELECT COUNT(DISTINCT u.id) FROM users u
        JOIN service_records sr ON sr.customerId = u.id AND sr.salonId = ?${s.sql}
       WHERE u.role = 'customer'
         AND sr.completedAt = (SELECT MAX(sr2.completedAt) FROM service_records sr2 WHERE sr2.customerId = u.id)
         AND EXTRACT(EPOCH FROM (NOW() - (sr."completedAt")::timestamptz)) / 86400 > ?`,
      scope.salonId,
      ...s.params,
      days,
    );

  const popular = await all<DbRow>(
    `SELECT srv.name AS name, COUNT(*) AS count
       FROM service_records sr
       CROSS JOIN LATERAL jsonb_array_elements(sr."servicesJson"::jsonb) AS je(value)
       JOIN services srv ON srv.id = je.value->>'serviceId'
      WHERE sr.salonId = ?
      GROUP BY srv.id ORDER BY COUNT(*) DESC LIMIT 8`,
    scope.salonId,
  );

  const totalCustomers = await scalar<number>(
    `SELECT COUNT(DISTINCT sr.customerId) FROM service_records sr WHERE sr.salonId = ?`,
    scope.salonId,
  );
  const repeatCustomers = await scalar<number>(
    `SELECT COUNT(*) FROM (SELECT sr.customerId FROM service_records sr WHERE sr.salonId = ? GROUP BY sr.customerId HAVING COUNT(*) > 1) AS repeaters`,
    scope.salonId,
  );
  const avg = await scalar<number>(
    'SELECT COALESCE(AVG(finalAmount),0) FROM service_records WHERE salonId = ?',
    scope.salonId,
  );

  const conversions = await all<DbRow>(
    `SELECT n.stage,
            COUNT(*) AS sent,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM appointments a WHERE a.customerId = n.customerId AND a.createdAt > n.scheduledAt)
                THEN 1 ELSE 0 END) AS booked
       FROM notifications n
      WHERE n.salonId = ? AND n.stage <> 'transactional'
      GROUP BY n.stage`,
    scope.salonId,
  );

  return {
    inactive30: await inactive(30),
    inactive60: await inactive(60),
    inactive90: await inactive(90),
    popularServices: popular as { name: string; count: number }[],
    repeatCustomerPercent: totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
    averageSpend: Math.round(avg),
    referralAcquisition: await scalar<number>(
      "SELECT COUNT(*) FROM referrals WHERE salonId = ? AND status IN ('qualified','rewarded')",
      scope.salonId,
    ),
    reminderConversions: conversions.map((c) => ({
      stage: c.stage,
      sent: c.sent,
      booked: c.booked ?? 0,
      conversion: c.sent ? Math.round(((c.booked ?? 0) / c.sent) * 100) : 0,
    })),
  };
}

export { getOrCreateWallet };
