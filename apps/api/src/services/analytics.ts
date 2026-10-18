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

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

export function todayOverview(scope: ScopeFilter, date = isoDate()): TodayOverview {
  const b = branchClause('a', scope.branchIds);

  const appts = all<DbRow>(
    `SELECT a.* FROM appointments a WHERE a.salonId = ? AND a.date = ?${b.sql}`,
    scope.salonId,
    date,
    ...b.params,
  );

  const completed = appts.filter((a) => a.status === 'completed');
  const s = branchClause('sr', scope.branchIds);
  const records = all<DbRow>(
    `SELECT sr.* FROM service_records sr WHERE sr.salonId = ? AND date(sr.completedAt) = ?${s.sql}`,
    scope.salonId,
    date,
    ...s.params,
  );

  const revenueCollected = records.reduce((sum, r) => sum + r.finalAmount, 0) + sumWalletToday(scope, date);
  const walletPayments = records.reduce((sum, r) => sum + r.walletAmount, 0);
  const directPayments = records.reduce((sum, r) => sum + r.onlineAmount + r.cashAmount, 0);

  const visitedCustomers = new Set(records.map((r) => r.customerId));

  const newCustomers = scalar<number>(
    `SELECT COUNT(*) FROM users u
      WHERE u.role = 'customer' AND date(u.createdAt) = ?
        AND EXISTS (SELECT 1 FROM service_records sr WHERE sr.customerId = u.id AND sr.salonId = ?)`,
    date,
    scope.salonId,
  );
  const newRegistrations = scalar<number>(
    "SELECT COUNT(*) FROM users WHERE role = 'customer' AND date(createdAt) = ?",
    date,
  );

  const walletCash = scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'cash' AND status = 'posted'`,
    scope.salonId,
  );
  const walletBonus = scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'bonus' AND status = 'posted'`,
    scope.salonId,
  );
  const referralRewardExpense = scalar<number>(
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
      WHERE po.salonId = ? AND po.status = 'paid' AND date(po.verifiedAt) = ?`,
    scope.salonId,
    date,
  );
}

/**
 * A real day-by-day series ending at `endDate`, gaps filled with zeroes.
 * Revenue/visits come from completed service records; appointments from the
 * booking calendar. Every point maps to an actual calendar date.
 */
export function dailyTrend(scope: ScopeFilter, endDate = isoDate(), days = 7): DailyTrendPoint[] {
  const from = addDays(endDate, -(days - 1));

  const s = branchClause('sr', scope.branchIds);
  const revenueRows = all<DbRow>(
    `SELECT date(sr.completedAt) AS day,
            COALESCE(SUM(sr.finalAmount),0) AS revenue,
            COUNT(DISTINCT sr.customerId) AS visits
       FROM service_records sr
      WHERE sr.salonId = ? AND date(sr.completedAt) BETWEEN ? AND ?${s.sql}
      GROUP BY day`,
    scope.salonId,
    from,
    endDate,
    ...s.params,
  );

  const a = branchClause('a', scope.branchIds);
  const appointmentRows = all<DbRow>(
    `SELECT a.date AS day, COUNT(*) AS appointments
       FROM appointments a
      WHERE a.salonId = ? AND a.date BETWEEN ? AND ?${a.sql}
      GROUP BY day`,
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

export function revenueReport(scope: ScopeFilter, from: string, to: string): RevenueReport {
  const s = branchClause('sr', scope.branchIds);
  const records = all<DbRow>(
    `SELECT sr.* FROM service_records sr
      WHERE sr.salonId = ? AND date(sr.completedAt) BETWEEN ? AND ?${s.sql}`,
    scope.salonId,
    from,
    to,
    ...s.params,
  );

  const grossServiceSales = records.reduce((sum, r) => sum + r.grossAmount, 0);
  const discounts = records.reduce((sum, r) => sum + r.discount, 0);
  const netCollected = records.reduce((sum, r) => sum + r.finalAmount, 0);

  const refunds = scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM refunds WHERE salonId = ? AND date(createdAt) BETWEEN ? AND ? AND status = 'processed'`,
    scope.salonId,
    from,
    to,
  );

  const recharges = all<DbRow>(
    `SELECT * FROM payment_orders WHERE salonId = ? AND status = 'paid' AND date(verifiedAt) BETWEEN ? AND ?`,
    scope.salonId,
    from,
    to,
  );
  const walletCashCollected = recharges
    .filter((r) => r.purpose === 'wallet_recharge')
    .reduce((sum, r) => sum + r.amountPaid, 0);

  const walletBonusGranted = scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions
      WHERE salonId = ? AND balanceType = 'bonus' AND type IN ('recharge','referral_bonus') AND status = 'posted'
        AND date(createdAt) BETWEEN ? AND ?`,
    scope.salonId,
    from,
    to,
  );

  const cashLiability = scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'cash' AND status = 'posted'`,
    scope.salonId,
  );
  const bonusLiability = scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE salonId = ? AND balanceType = 'bonus' AND status = 'posted'`,
    scope.salonId,
  );
  const referralRewardExpense = scalar<number>(
    `SELECT COALESCE(SUM(rt.amount),0) FROM reward_transactions rt JOIN referrals r ON r.id = rt.referralId
      WHERE r.salonId = ? AND rt.status = 'credited' AND rt.type <> 'reversal' AND date(rt.createdAt) BETWEEN ? AND ?`,
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

  const outstanding = scalar<number>(
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

export function topCustomers(scope: ScopeFilter, opts: { from?: string; to?: string; sort?: 'spend' | 'visits' | 'referrals'; limit?: number } = {}): TopCustomer[] {
  const s = branchClause('sr', scope.branchIds);
  const from = opts.from ?? '1970-01-01';
  const to = opts.to ?? isoDate();
  const rows = all<DbRow>(
    `SELECT u.id AS customerId, u.name, u.phone,
            COALESCE(SUM(sr.finalAmount),0) AS totalSpend,
            COUNT(sr.id) AS visits,
            MAX(sr.completedAt) AS lastVisitAt
       FROM users u
       LEFT JOIN service_records sr ON sr.customerId = u.id AND sr.salonId = ?
            AND date(sr.completedAt) BETWEEN ? AND ?${s.sql}
      WHERE u.role = 'customer'
      GROUP BY u.id
      HAVING visits > 0`,
    scope.salonId,
    from,
    to,
    ...s.params,
  );

  const mapped: TopCustomer[] = rows.map((row) => {
    const walletRow = one<DbRow>('SELECT id FROM wallets WHERE salonId = ? AND customerId = ?', scope.salonId, row.customerId);
    const b = walletRow ? balances(walletRow.id) : { cash: 0, bonus: 0, total: 0 };
    const referrals = scalar<number>(
      "SELECT COUNT(*) FROM referrals WHERE salonId = ? AND referrerId = ? AND status IN ('qualified','rewarded')",
      scope.salonId,
      row.customerId,
    );
    return {
      customerId: row.customerId,
      name: row.name,
      phoneMasked: maskPhone(row.phone),
      totalSpend: row.totalSpend,
      visits: row.visits,
      averageSpend: row.visits ? Math.round(row.totalSpend / row.visits) : 0,
      lastVisitAt: row.lastVisitAt,
      walletBalance: b.total,
      referrals,
    };
  });

  const sort = opts.sort ?? 'spend';
  mapped.sort((a, b2) =>
    sort === 'visits' ? b2.visits - a.visits : sort === 'referrals' ? b2.referrals - a.referrals : b2.totalSpend - a.totalSpend,
  );
  return mapped.slice(0, opts.limit ?? 20);
}

export function listCustomers(scope: ScopeFilter, opts: { search?: string; limit?: number } = {}): CustomerProfile[] {
  const params: (string | number)[] = [scope.salonId];
  let searchClause = '';
  if (opts.search) {
    searchClause = ' AND (u.name LIKE ? OR u.phone LIKE ?)';
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  params.push(opts.limit ?? 100);
  const rows = all<DbRow>(
    `SELECT u.id, u.name, u.phone, u.createdAt,
            p.lastVisitAt, p.totalVisits, p.totalCompletedSpend, p.preferredServices, p.marketingConsent, p.birthday
       FROM users u
       LEFT JOIN customer_profiles p ON p.customerId = u.id
      WHERE u.role = 'customer'${searchClause}
      ORDER BY COALESCE(p.totalCompletedSpend, 0) DESC LIMIT ?`,
    ...params,
  );
  return rows.map((row) => customerProfileFromRow(scope.salonId, row));
}

function customerProfileFromRow(salonId: string, row: DbRow): CustomerProfile {
  const walletRow = one<DbRow>('SELECT id FROM wallets WHERE salonId = ? AND customerId = ?', salonId, row.id);
  const b = walletRow ? balances(walletRow.id) : { cash: 0, bonus: 0, total: 0 };
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
    successfulReferrals: scalar<number>(
      "SELECT COUNT(*) FROM referrals WHERE salonId = ? AND referrerId = ? AND status IN ('qualified','rewarded')",
      salonId,
      row.id,
    ),
    createdAt: row.createdAt,
  };
}

export function customerProfile(salonId: string, customerId: string): CustomerProfile | null {
  const row = one<DbRow>(
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

export function retentionReport(scope: ScopeFilter): RetentionReport {
  const s = branchClause('sr', scope.branchIds);
  const inactive = (days: number) =>
    scalar<number>(
      `SELECT COUNT(DISTINCT u.id) FROM users u
        JOIN service_records sr ON sr.customerId = u.id AND sr.salonId = ?${s.sql}
       WHERE u.role = 'customer'
         AND sr.completedAt = (SELECT MAX(sr2.completedAt) FROM service_records sr2 WHERE sr2.customerId = u.id)
         AND julianday('now') - julianday(sr.completedAt) > ?`,
      scope.salonId,
      ...s.params,
      days,
    );

  const popular = all<DbRow>(
    `SELECT srv.name AS name, COUNT(*) AS count
       FROM service_records sr, json_each(sr.servicesJson) je
       JOIN services srv ON srv.id = json_extract(je.value, '$.serviceId')
      WHERE sr.salonId = ?
      GROUP BY srv.id ORDER BY count DESC LIMIT 8`,
    scope.salonId,
  );

  const totalCustomers = scalar<number>(
    `SELECT COUNT(DISTINCT sr.customerId) FROM service_records sr WHERE sr.salonId = ?`,
    scope.salonId,
  );
  const repeatCustomers = scalar<number>(
    `SELECT COUNT(*) FROM (SELECT sr.customerId, COUNT(*) c FROM service_records sr WHERE sr.salonId = ? GROUP BY sr.customerId HAVING c > 1)`,
    scope.salonId,
  );
  const avg = scalar<number>(
    'SELECT COALESCE(AVG(finalAmount),0) FROM service_records WHERE salonId = ?',
    scope.salonId,
  );

  const conversions = all<DbRow>(
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
    inactive30: inactive(30),
    inactive60: inactive(60),
    inactive90: inactive(90),
    popularServices: popular as { name: string; count: number }[],
    repeatCustomerPercent: totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
    averageSpend: Math.round(avg),
    referralAcquisition: scalar<number>(
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
