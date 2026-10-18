import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { audit, can, requireAdmin, requireAuth, requireCapability } from '../auth';
import { all, one, parseJson, run, scalar, tx } from '../db';
import { badRequest, conflict, forbidden, handler, notFound } from '../lib/http';
import { isoDate } from '@salonpro/shared';
import {
  branchSchema,
  couponSchema,
  dateSchema,
  rechargeOfferSchema,
  serviceSchema,
  staffSchema,
  timeSchema,
  userUpdateSchema,
} from '../lib/schemas';
import { SCOPED } from '../lib/scope';
import { integrations } from '../env';
import { listAppointments, getAppointment, changeStatus, createBooking, toCoupon } from '../services/booking';
import { findSlots } from '../services/availability';
import {
  customerProfile,
  dailyTrend,
  listCustomers,
  retentionReport,
  revenueReport,
  todayOverview,
  topCustomers,
} from '../services/analytics';
import { adjust, ledger, liabilities, toWalletTransaction, getOrCreateWallet, walletView } from '../services/wallet';
import { listOrders, PAYMENT_MODE } from '../services/payments';
import { refundPayment } from '../services/refunds';
import { salonReferralStats, dashboard as referralDashboard, ensureReferralCode } from '../services/referral';
import { listNotifications, notificationStats, reminderSettings, saveReminderSettings, runReminderPass, attemptSendAsync } from '../services/notifications';
import { readSettings, fullWeekHours, fullWeekWorkingHours } from '../services/settings';

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

function scope(req: Parameters<typeof SCOPED>[0]) {
  return SCOPED(req);
}

function csv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
}

function sendCsv(res: import('express').Response, filename: string, rows: (string | number | null | undefined)[][]) {
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  res.send(csv(rows));
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/overview',
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const date = req.query.date ? dateSchema.parse(req.query.date) : isoDate();
    const overview = todayOverview({ salonId, branchIds }, date);
    const salon = one<{ name: string; settings: string }>('SELECT name, settings FROM salons WHERE id = ?', salonId);
    const settings = readSettings(salon?.settings);
    res.json({
      overview,
      settings,
      payments: { mode: PAYMENT_MODE },
      upcomingToday: listAppointments({ salonId, branchIds, date, limit: 12 }),
      referralStats: salonReferralStats(salonId),
      reminderStats: notificationStats(salonId),
      topCustomers: topCustomers({ salonId, branchIds }, { limit: 5 }),
      trend: dailyTrend({ salonId, branchIds }, date, 7),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/appointments',
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const query = z
      .object({
        date: dateSchema.optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        status: z.string().optional(),
        branchId: z.string().optional(),
        staffId: z.string().optional(),
        customerId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(req.query);
    const scopedBranches = query.branchId ? branchIds.filter((b) => b === query.branchId) : branchIds;
    if (query.branchId && !scopedBranches.length) throw forbidden('You are not authorised for that branch.');
    const appointments = listAppointments({
      salonId,
      branchIds: scopedBranches,
      date: query.date,
      from: query.from,
      to: query.to,
      status: query.status as never,
      staffId: query.staffId,
      customerId: query.customerId,
      limit: query.limit,
    });
    res.json({ appointments });
  }),
);

adminRouter.get(
  '/appointments/calendar',
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const query = z
      .object({ date: dateSchema, branchId: z.string().optional(), staffId: z.string().optional() })
      .parse(req.query);
    const staff = all(
      "SELECT s.id, u.name, s.designation, s.branchId FROM staff s JOIN users u ON u.id = s.userId WHERE s.salonId = ? AND s.status = 'active'",
      salonId,
    );
    const appointments = listAppointments({
      salonId,
      branchIds: branchIds.filter((b) => (query.branchId ? b === query.branchId : true)),
      date: query.date,
      staffId: query.staffId,
      limit: 300,
    });
    const branch = query.branchId
      ? one('SELECT * FROM branches WHERE id = ?', query.branchId)
      : one('SELECT * FROM branches WHERE salonId = ? ORDER BY name LIMIT 1', salonId);
    const openingHours = branch ? parseJson(branch.openingHours, fullWeekHours()) : fullWeekHours();
    res.json({ date: query.date, staff, appointments, openingHours, holidays: all('SELECT * FROM holidays WHERE date = ?', query.date) });
  }),
);

adminRouter.get(
  '/appointments/:id',
  handler((req, res) => {
    const appt = getAppointment(req.params.id!);
    if (!appt) throw notFound('Appointment not found.');
    if (!scope(req).branchIds.includes(appt.branchId)) throw forbidden();
    res.json({ appointment: appt });
  }),
);

adminRouter.post(
  '/appointments',
  requireCapability(can.manageAppointments, 'Only owners, managers and receptionists can create bookings.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = z
      .object({
        customerId: z.string().optional(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        branchId: z.string().min(1),
        serviceIds: z.array(z.string()).min(1),
        staffId: z.string().nullable().optional(),
        date: dateSchema,
        startTime: timeSchema,
        couponCode: z.string().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        paymentPreference: z.enum(['wallet', 'online', 'pay_at_salon']).default('pay_at_salon'),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);

    if (req.auth!.role !== 'super_admin' && !req.auth!.branchIds.includes(body.branchId)) {
      throw forbidden('You are not authorised for that branch.');
    }

    let customerId = body.customerId;
    if (!customerId) {
      if (!body.customerPhone || !body.customerName) {
        throw badRequest('Provide an existing customer or a name and phone number for the walk-in.');
      }
      const phone = body.customerPhone.replace(/\D/g, '').slice(-10);
      const existing = one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
      if (existing) {
        customerId = existing.id;
      } else {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        tx(() => {
          run('INSERT INTO users (id, name, phone, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)',
            id, body.customerName!, phone, 'customer', 'active', 0, now, now);
          run('INSERT INTO customer_profiles (customerId, salonId, totalVisits, totalCompletedSpend, preferredServices, marketingConsent, createdAt) VALUES (?,?,?,?,?,?,?)',
            id, salonId, 0, 0, '[]', Number(req.body.marketingConsent !== false), now);
          ensureReferralCode(salonId, id);
        });
        customerId = id;
      }
    }

    const result = createBooking({
      auth: req.auth!,
      salonId,
      branchId: body.branchId,
      customerId,
      staffId: body.staffId ?? null,
      serviceIds: body.serviceIds,
      date: body.date,
      startTime: body.startTime,
      bookingSource: 'walk_in',
      couponCode: body.couponCode ?? null,
      notes: body.notes ?? null,
      paymentPreference: body.paymentPreference,
      idempotencyKey: body.idempotencyKey ?? null,
    });
    res.status(201).json(result);
  }),
);

adminRouter.post(
  '/appointments/:id/status',
  requireCapability(can.completeService, 'Your role cannot change appointment status.'),
  handler((req, res) => {
    const body = z
      .object({
        status: z.enum(['booked', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
        reason: z.string().max(300).optional(),
        paymentMethod: z.enum(['wallet', 'online', 'pay_at_salon', 'cash', 'upi_card']).optional(),
      })
      .parse(req.body);
    const appt = getAppointment(req.params.id!);
    if (!appt) throw notFound('Appointment not found.');
    if (!scope(req).branchIds.includes(appt.branchId)) throw forbidden();
    if (req.auth!.role === 'salon_staff' && !['in_progress', 'completed'].includes(body.status)) {
      throw forbidden('Stylists can only start or complete their own appointments.');
    }
    const updated = changeStatus({
      auth: req.auth!,
      appointmentId: appt.id,
      status: body.status,
      reason: body.reason,
      paymentMethod: body.paymentMethod,
    });
    res.json({ appointment: updated });
  }),
);

adminRouter.post(
  '/appointments/:id/no-show',
  requireCapability(can.manageAppointments),
  handler((req, res) => {
    const appt = getAppointment(req.params.id!);
    if (!appt) throw notFound('Appointment not found.');
    res.json({ appointment: changeStatus({ auth: req.auth!, appointmentId: appt.id, status: 'no_show', reason: 'Marked no-show' }) });
  }),
);

adminRouter.get(
  '/availability',
  handler((req, res) => {
    const { salonId } = scope(req);
    const query = z
      .object({ branchId: z.string(), date: dateSchema, serviceIds: z.string(), staffId: z.string().optional() })
      .parse(req.query);
    const settings = readSettings(one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings);
    const services = all(
      `SELECT * FROM services WHERE salonId = ? AND id IN (${query.serviceIds.split(',').map(() => '?').join(',')})`,
      salonId,
      ...query.serviceIds.split(','),
    );
    const duration = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    res.json(
      findSlots({
        branchId: query.branchId,
        date: query.date,
        durationMinutes: duration || 30,
        staffId: query.staffId ?? null,
        stepMinutes: settings.slotGranularityMinutes,
      }),
    );
  }),
);

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/customers',
  requireCapability(can.viewCustomers, 'Your role cannot browse the customer directory.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const query = z.object({ search: z.string().optional(), limit: z.coerce.number().int().max(500).optional() }).parse(req.query);
    res.json({ customers: listCustomers({ salonId }, query) });
  }),
);

adminRouter.get(
  '/customers/top',
  requireCapability(can.viewCustomers),
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const query = z
      .object({
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        sort: z.enum(['spend', 'visits', 'referrals']).optional(),
        limit: z.coerce.number().int().max(100).optional(),
      })
      .parse(req.query);
    res.json({ customers: topCustomers({ salonId, branchIds }, query) });
  }),
);

adminRouter.get(
  '/customers/:id',
  requireCapability(can.viewCustomers),
  handler((req, res) => {
    const { salonId } = scope(req);
    const id = req.params.id!;
    const profile = customerProfile(salonId, id);
    if (!profile) throw notFound('Customer not found.');
    const wallet = walletView(salonId, id);
    const appointments = listAppointments({ salonId, customerId: id, limit: 100 });
    const transactions = ledger(wallet.id, 100).map(toWalletTransaction);
    const rewards = all('SELECT * FROM reward_transactions WHERE customerId = ? ORDER BY createdAt DESC', id);
    const referrals = all('SELECT * FROM referrals WHERE referrerId = ? OR referredCustomerId = ? ORDER BY createdAt DESC', id, id);
    const notifications = listNotifications(salonId, { limit: 50 }).filter((n) => n.customerId === id);
    const loyalty = one('SELECT * FROM loyalty_accounts WHERE customerId = ?', id);
    res.json({ profile, wallet, appointments, transactions, rewards, referrals, notifications, loyalty });
  }),
);

adminRouter.post(
  '/customers/:id/wallet/adjust',
  requireCapability(can.adjustWallet, 'Only an owner can adjust wallet balances.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = z
      .object({
        amount: z.number().int(),
        balanceType: z.enum(['cash', 'bonus']),
        reason: z.string().min(6).max(300),
      })
      .parse(req.body);
    const wallet = getOrCreateWallet(salonId, req.params.id!);
    const entry = adjust({
      walletId: wallet.id,
      customerId: req.params.id!,
      salonId,
      amount: body.amount,
      balanceType: body.balanceType,
      reason: body.reason,
      actorId: req.auth!.id,
    });
    audit(req.auth!.id, 'wallet.adjust', 'wallet', wallet.id, { amount: body.amount, balanceType: body.balanceType, reason: body.reason }, req.ip);
    res.json({ transaction: toWalletTransaction(entry), wallet: walletView(salonId, req.params.id!) });
  }),
);

adminRouter.post(
  '/customers/:id/consent',
  requireCapability(can.viewCustomers),
  handler((req, res) => {
    const body = z.object({ marketingConsent: z.boolean() }).parse(req.body);
    run('UPDATE customer_profiles SET marketingConsent = ? WHERE customerId = ?', body.marketingConsent, req.params.id!);
    audit(req.auth!.id, 'customer.consent', 'user', req.params.id!, body, req.ip);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ */
/* Wallet ledger, payments, refunds                                    */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/wallet',
  requireCapability(can.viewReports, 'Your role cannot view the wallet ledger.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const query = z
      .object({
        customerId: z.string().optional(),
        type: z.string().optional(),
        balanceType: z.enum(['cash', 'bonus']).optional(),
        limit: z.coerce.number().int().max(1000).optional(),
      })
      .parse(req.query);

    const clauses = ['wt.salonId = ?'];
    const params: (string | number)[] = [salonId];
    if (query.customerId) {
      clauses.push('wt.customerId = ?');
      params.push(query.customerId);
    }
    if (query.type) {
      clauses.push('wt.type = ?');
      params.push(query.type);
    }
    if (query.balanceType) {
      clauses.push('wt.balanceType = ?');
      params.push(query.balanceType);
    }
    params.push(query.limit ?? 300);

    const rows = all(
      `SELECT wt.*, u.name AS customerName FROM wallet_transactions wt
         JOIN users u ON u.id = wt.customerId
        WHERE ${clauses.join(' AND ')} ORDER BY wt.createdAt DESC LIMIT ?`,
      ...params,
    );
    res.json({
      transactions: rows.map((r) => ({ ...toWalletTransaction(r), customerName: r.customerName })),
      liabilities: liabilities(salonId),
      recentRecharges: listOrders(salonId, { limit: 20 }).filter((o) => o.purpose === 'wallet_recharge'),
    });
  }),
);

adminRouter.get(
  '/wallet.csv',
  requireCapability(can.viewReports),
  handler((req, res) => {
    const { salonId } = scope(req);
    const rows = all(
      `SELECT wt.*, u.name AS customerName FROM wallet_transactions wt JOIN users u ON u.id = wt.customerId
        WHERE wt.salonId = ? ORDER BY wt.createdAt DESC LIMIT 5000`,
      salonId,
    );
    sendCsv(res, 'salonpro-wallet-ledger.csv', [
      ['date', 'customer', 'type', 'balance_type', 'amount_inr', 'status', 'reference', 'reason'],
      ...rows.map((r) => [r.createdAt, r.customerName, r.type, r.balanceType, (r.amount / 100).toFixed(2), r.status, r.referenceId ?? '', r.reason ?? '']),
    ]);
  }),
);

adminRouter.get(
  '/payments',
  requireCapability(can.viewReports, 'Your role cannot view payments.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const query = z.object({ status: z.string().optional(), limit: z.coerce.number().int().max(500).optional() }).parse(req.query);
    const orders = listOrders(salonId, query);
    const refunds = all(
      `SELECT r.*, u.name AS customerName FROM refunds r JOIN users u ON u.id = r.customerId
        WHERE r.salonId = ? ORDER BY r.createdAt DESC LIMIT 100`,
      salonId,
    );
    res.json({
      orders,
      refunds,
      mode: PAYMENT_MODE,
      summary: {
        collected: orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amountPaid, 0),
        pending: orders.filter((o) => ['created', 'attempted'].includes(o.status)).length,
        failed: orders.filter((o) => o.status === 'failed').length,
        refunded: refunds.reduce((s, r) => s + r.amount, 0),
      },
    });
  }),
);

adminRouter.get(
  '/payments.csv',
  requireCapability(can.viewReports),
  handler((req, res) => {
    const { salonId } = scope(req);
    const rows = listOrders(salonId, { limit: 5000 });
    sendCsv(res, 'salonpro-payments.csv', [
      ['created_at', 'customer', 'razorpay_order_id', 'payment_id', 'amount_inr', 'status', 'mode', 'purpose', 'verified_at'],
      ...rows.map((o) => [o.createdAt, o.customerName ?? '', o.razorpayOrderId, o.paymentId ?? '', (o.amount / 100).toFixed(2), o.status, o.mode, o.purpose, o.verifiedAt ?? '']),
    ]);
  }),
);

adminRouter.post(
  '/refunds',
  requireCapability(can.processRefund, 'Only an owner or manager can issue a refund.'),
  handler(async (req, res) => {
    const { salonId } = scope(req);
    const body = z
      .object({
        paymentOrderId: z.string().optional(),
        appointmentId: z.string().optional(),
        customerId: z.string().min(1),
        amount: z.number().int().min(1),
        reason: z.string().min(6).max(300),
        toWallet: z.boolean().default(true),
      })
      .parse(req.body);
    const result = await refundPayment({ salonId, actorId: req.auth!.id, ...body });
    res.json(result);
  }),
);

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/referrals',
  handler((req, res) => {
    const { salonId } = scope(req);
    const stats = salonReferralStats(salonId);
    const settings = readSettings(one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings);
    res.json({ ...stats, config: settings.referral, mode: 'scripts' });
  }),
);

adminRouter.patch(
  '/referrals/config',
  requireCapability(can.manageReferrals, 'Only an owner can change referral rewards.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = z
      .object({
        referrerReward: z.number().int().min(0).optional(),
        refereeReward: z.number().int().min(0).optional(),
        maxRewardsPerMonth: z.number().int().min(0).optional(),
        requireFirstPaidVisit: z.boolean().optional(),
      })
      .parse(req.body);
    const salon = one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId);
    const settings = readSettings(salon?.settings);
    const next = { ...settings, referral: { ...settings.referral, ...body } };
    run('UPDATE salons SET settings = ? WHERE id = ?', JSON.stringify(next), salonId);
    audit(req.auth!.id, 'referral.config', 'salon', salonId, body, req.ip);
    res.json({ config: next.referral });
  }),
);

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/reminders',
  handler((req, res) => {
    const { salonId } = scope(req);
    const query = z.object({ status: z.string().optional(), stage: z.string().optional() }).parse(req.query);
    const settings = readSettings(one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings);
    res.json({
      settings: reminderSettings(salonId),
      templates: settings.templates,
      notifications: listNotifications(salonId, query),
      stats: notificationStats(salonId),
    });
  }),
);

adminRouter.patch(
  '/reminders/settings',
  requireCapability(can.manageSalon, 'Only an owner can change reminder settings.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = z
      .object({
        stages: z.array(z.enum(['day7', 'day14', 'day30', 'appointment'])).optional(),
        channels: z.array(z.enum(['whatsapp', 'push', 'sms', 'email'])).optional(),
        intervals: z.record(z.number().int().min(1).max(365)).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(req.body);
    const next = saveReminderSettings(salonId, body);
    audit(req.auth!.id, 'reminder.settings', 'salon', salonId, body, req.ip);
    res.json({ settings: next });
  }),
);

adminRouter.patch(
  '/reminders/templates',
  requireCapability(can.manageSalon, 'Only an owner can edit reminder templates.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = z
      .object({
        day7: z.string().max(600).optional(),
        day14: z.string().max(600).optional(),
        day30: z.string().max(600).optional(),
        appointment_confirmation: z.string().max(600).optional(),
        referral_reward: z.string().max(600).optional(),
        wallet_credit: z.string().max(600).optional(),
      })
      .parse(req.body);
    const salon = one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId);
    const settings = readSettings(salon?.settings);
    const next = { ...settings, templates: { ...settings.templates, ...body } };
    run('UPDATE salons SET settings = ? WHERE id = ?', JSON.stringify(next), salonId);
    audit(req.auth!.id, 'reminder.templates', 'salon', salonId, {}, req.ip);
    res.json({ templates: next.templates });
  }),
);

adminRouter.post(
  '/reminders/run',
  requireCapability(can.manageSalon, 'Only an owner can trigger a reminder pass.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const result = runReminderPass(salonId);
    audit(req.auth!.id, 'reminder.run', 'salon', salonId, result as never, req.ip);
    res.json({ result, notifications: listNotifications(salonId, { limit: 30 }) });
  }),
);

adminRouter.post(
  '/reminders/:id/retry',
  handler(async (req, res) => {
    const { salonId } = scope(req);
    const row = one('SELECT * FROM notifications WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!row) throw notFound('Notification not found.');
    const updated = await attemptSendAsync(row.id);
    res.json({ notification: updated });
  }),
);

/* ------------------------------------------------------------------ */
/* Services, staff, branches, offers, coupons                          */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/services',
  handler((req, res) => {
    const { salonId } = scope(req);
    const services = all('SELECT * FROM services WHERE salonId = ? ORDER BY sortOrder, name', salonId);
    const stats = all(
      `SELECT json_extract(je.value, '$.serviceId') AS serviceId, COUNT(*) AS count, SUM(sr.finalAmount) AS revenue
         FROM service_records sr, json_each(sr.servicesJson) je WHERE sr.salonId = ? GROUP BY serviceId`,
      salonId,
    );
    res.json({
      services: services.map((s) => {
        const stat = stats.find((x) => x.serviceId === s.id);
        return { ...s, active: !!s.active, completions: stat?.count ?? 0, revenue: stat?.revenue ?? 0 };
      }),
    });
  }),
);

adminRouter.post(
  '/services',
  requireCapability(can.manageServices),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = serviceSchema.parse(req.body);
    const id = crypto.randomUUID();
    run(
      'INSERT INTO services (id, salonId, name, category, description, price, durationMinutes, active, imageEmoji, sortOrder, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, salonId, body.name, body.category, body.description, body.price, body.durationMinutes,
      body.active ? 1 : 0, body.imageEmoji, body.sortOrder, new Date().toISOString(),
    );
    audit(req.auth!.id, 'service.create', 'service', id, body as never, req.ip);
    res.status(201).json({ service: one('SELECT * FROM services WHERE id = ?', id) });
  }),
);

adminRouter.patch(
  '/services/:id',
  requireCapability(can.manageServices),
  handler((req, res) => {
    const { salonId } = scope(req);
    const existing = one('SELECT * FROM services WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!existing) throw notFound('Service not found.');
    const body = serviceSchema.partial().parse(req.body);
    run(
      `UPDATE services SET name = ?, category = ?, description = ?, price = ?, durationMinutes = ?, active = ?, imageEmoji = ?, sortOrder = ? WHERE id = ?`,
      body.name ?? existing.name,
      body.category ?? existing.category,
      body.description ?? existing.description,
      body.price ?? existing.price,
      body.durationMinutes ?? existing.durationMinutes,
      (body.active ?? !!existing.active) ? 1 : 0,
      body.imageEmoji ?? existing.imageEmoji,
      body.sortOrder ?? existing.sortOrder,
      existing.id,
    );
    audit(req.auth!.id, 'service.update', 'service', existing.id, body as never, req.ip);
    res.json({ service: one('SELECT * FROM services WHERE id = ?', existing.id) });
  }),
);

adminRouter.get(
  '/staff',
  handler((req, res) => {
    const { salonId } = scope(req);
    const staff = all(
      `SELECT s.*, u.name, u.phone, u.email, u.status AS userStatus, b.name AS branchName
         FROM staff s JOIN users u ON u.id = s.userId JOIN branches b ON b.id = s.branchId
        WHERE s.salonId = ? ORDER BY b.name, u.name`,
      salonId,
    ).map((s) => ({
      ...s,
      workingHours: parseJson(s.workingHours, fullWeekWorkingHours()),
      commissionRules: parseJson(s.commissionRules, { serviceBps: 800, productBps: 300 }),
      breaks: all('SELECT * FROM staff_breaks WHERE staffId = ?', s.id),
      attendance: all('SELECT * FROM staff_attendance WHERE staffId = ? ORDER BY date DESC LIMIT 14', s.id),
      stats: {
        services: scalar<number>('SELECT COUNT(*) FROM service_records WHERE staffId = ?', s.id),
        revenue: scalar<number>('SELECT COALESCE(SUM(finalAmount),0) FROM service_records WHERE staffId = ?', s.id),
        upcoming: scalar<number>(
          "SELECT COUNT(*) FROM appointments WHERE staffId = ? AND date >= date('now') AND status IN ('booked','confirmed')",
          s.id,
        ),
      },
    }));
    res.json({ staff });
  }),
);

adminRouter.post(
  '/staff',
  requireCapability(can.manageStaff),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = staffSchema.parse(req.body);
    if (!body.userId && (!body.name || !body.phone)) throw badRequest('Provide a name and phone, or an existing user.');
    let userId = body.userId;
    const now = new Date().toISOString();
    if (!userId) {
      const phone = body.phone!.replace(/\D/g, '').slice(-10);
      const existing = one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
      if (existing) userId = existing.id;
      else {
        userId = crypto.randomUUID();
        run('INSERT INTO users (id, name, phone, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)',
          userId, body.name!, phone, 'salon_staff', 'active', 0, now, now);
      }
    }
    const staffId = crypto.randomUUID();
    run(
      'INSERT INTO staff (id, salonId, branchId, userId, designation, workingHours, commissionRules, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      staffId, salonId, body.branchId, userId, body.designation,
      JSON.stringify(body.workingHours ?? fullWeekWorkingHours('10:00', '20:00', [0])),
      JSON.stringify(body.commissionRules ?? { serviceBps: 800, productBps: 300 }), 'active', now,
    );
    run('INSERT INTO user_branches (userId, branchId) VALUES (?,?) ON CONFLICT DO NOTHING', userId, body.branchId);
    audit(req.auth!.id, 'staff.create', 'staff', staffId, body as never, req.ip);
    res.status(201).json({ staffId });
  }),
);

adminRouter.patch(
  '/staff/:id',
  requireCapability(can.manageStaff),
  handler((req, res) => {
    const { salonId } = scope(req);
    const staff = one('SELECT * FROM staff WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!staff) throw notFound('Staff member not found.');
    const body = staffSchema.partial().parse(req.body);
    run(
      'UPDATE staff SET designation = ?, workingHours = ?, commissionRules = ?, status = ?, branchId = ? WHERE id = ?',
      body.designation ?? staff.designation,
      JSON.stringify(body.workingHours ?? parseJson(staff.workingHours, {})),
      JSON.stringify(body.commissionRules ?? parseJson(staff.commissionRules, {})),
      body.status ?? staff.status,
      body.branchId ?? staff.branchId,
      staff.id,
    );
    audit(req.auth!.id, 'staff.update', 'staff', staff.id, body as never, req.ip);
    res.json({ staff: one('SELECT * FROM staff WHERE id = ?', staff.id) });
  }),
);

adminRouter.post(
  '/staff/:id/attendance',
  requireCapability(can.manageStaff),
  handler((req, res) => {
    const { salonId } = scope(req);
    const staff = one<{ id: string; branchId: string }>('SELECT id, branchId FROM staff WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!staff) throw notFound('Staff member not found.');
    const body = z
      .object({
        date: dateSchema,
        status: z.enum(['present', 'absent', 'leave', 'half_day']).default('present'),
        checkInAt: z.string().nullable().optional(),
        checkOutAt: z.string().nullable().optional(),
      })
      .parse(req.body);
    run(
      `INSERT INTO staff_attendance (id, staffId, branchId, date, checkInAt, checkOutAt, status) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(staffId, date) DO UPDATE SET status = excluded.status, checkInAt = excluded.checkInAt, checkOutAt = excluded.checkOutAt`,
      crypto.randomUUID(), staff.id, staff.branchId, body.date, body.checkInAt ?? null, body.checkOutAt ?? null, body.status,
    );
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/branches',
  handler((req, res) => {
    const { salonId } = scope(req);
    const branches = all('SELECT * FROM branches WHERE salonId = ? ORDER BY name', salonId).map((b) => ({
      ...b,
      openingHours: parseJson(b.openingHours, fullWeekHours()),
      staffCount: scalar<number>('SELECT COUNT(*) FROM staff WHERE branchId = ?', b.id),
      holidays: all('SELECT * FROM holidays WHERE branchId = ? ORDER BY date', b.id),
      revenue: scalar<number>('SELECT COALESCE(SUM(finalAmount),0) FROM service_records WHERE branchId = ?', b.id),
      customers: scalar<number>('SELECT COUNT(DISTINCT customerId) FROM service_records WHERE branchId = ?', b.id),
      appointments: scalar<number>('SELECT COUNT(*) FROM appointments WHERE branchId = ?', b.id),
    }));
    res.json({ branches });
  }),
);

adminRouter.post(
  '/branches',
  requireCapability(can.manageBranches),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = branchSchema.parse(req.body);
    const id = crypto.randomUUID();
    tx(() => {
      run(
        'INSERT INTO branches (id, salonId, name, address, contact, timezone, openingHours, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        id, salonId, body.name, body.address, body.contact, 'Asia/Kolkata', JSON.stringify(body.openingHours), body.status, new Date().toISOString(),
      );
      run('INSERT INTO user_branches (userId, branchId) VALUES (?,?) ON CONFLICT DO NOTHING', req.auth!.id, id);
      audit(req.auth!.id, 'branch.create', 'branch', id, body as never, req.ip);
    });
    res.status(201).json({ branch: one('SELECT * FROM branches WHERE id = ?', id) });
  }),
);

adminRouter.patch(
  '/branches/:id',
  requireCapability(can.manageBranches),
  handler((req, res) => {
    const { salonId } = scope(req);
    const branch = one('SELECT * FROM branches WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!branch) throw notFound('Branch not found.');
    const body = branchSchema.partial().parse(req.body);
    run(
      'UPDATE branches SET name = ?, address = ?, contact = ?, openingHours = ?, status = ? WHERE id = ?',
      body.name ?? branch.name,
      body.address ?? branch.address,
      body.contact ?? branch.contact,
      JSON.stringify(body.openingHours ?? parseJson(branch.openingHours, fullWeekHours())),
      body.status ?? branch.status,
      branch.id,
    );
    audit(req.auth!.id, 'branch.update', 'branch', branch.id, body as never, req.ip);
    res.json({ branch: one('SELECT * FROM branches WHERE id = ?', branch.id) });
  }),
);

adminRouter.post(
  '/branches/:id/holidays',
  requireCapability(can.manageBranches),
  handler((req, res) => {
    const { salonId } = scope(req);
    const branch = one('SELECT id FROM branches WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!branch) throw notFound('Branch not found.');
    const body = z.object({ date: dateSchema, reason: z.string().max(120).optional() }).parse(req.body);
    run('INSERT INTO holidays (id, branchId, date, reason) VALUES (?,?,?,?) ON CONFLICT(branchId, date) DO UPDATE SET reason = excluded.reason',
      crypto.randomUUID(), branch.id, body.date, body.reason ?? null);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/offers',
  handler((req, res) => {
    const { salonId } = scope(req);
    res.json({
      rechargeOffers: all('SELECT * FROM recharge_offers WHERE salonId = ? ORDER BY sortOrder', salonId).map((o) => ({
        ...o, active: !!o.active, totalValue: o.payAmount + o.bonusAmount,
      })),
      coupons: all('SELECT * FROM coupons WHERE salonId = ? ORDER BY endAt DESC', salonId).map(toCoupon),
    });
  }),
);

adminRouter.post(
  '/offers/recharge',
  requireCapability(can.manageSalon),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = rechargeOfferSchema.parse(req.body);
    const id = crypto.randomUUID();
    run('INSERT INTO recharge_offers (id, salonId, payAmount, bonusAmount, label, active, sortOrder) VALUES (?,?,?,?,?,?,?)',
      id, salonId, body.payAmount, body.bonusAmount, body.label, body.active ? 1 : 0, body.sortOrder);
    audit(req.auth!.id, 'offer.create', 'recharge_offer', id, body as never, req.ip);
    res.status(201).json({ offer: one('SELECT * FROM recharge_offers WHERE id = ?', id)! });
  }),
);

adminRouter.patch(
  '/offers/recharge/:id',
  requireCapability(can.manageSalon),
  handler((req, res) => {
    const { salonId } = scope(req);
    const offer = one('SELECT * FROM recharge_offers WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!offer) throw notFound('Offer not found.');
    const body = rechargeOfferSchema.partial().parse(req.body);
    run('UPDATE recharge_offers SET payAmount = ?, bonusAmount = ?, label = ?, active = ?, sortOrder = ? WHERE id = ?',
      body.payAmount ?? offer.payAmount, body.bonusAmount ?? offer.bonusAmount,
      body.label ?? offer.label, (body.active ?? !!offer.active) ? 1 : 0, body.sortOrder ?? offer.sortOrder, offer.id);
    audit(req.auth!.id, 'offer.update', 'recharge_offer', offer.id, body as never, req.ip);
    res.json({ offer: one('SELECT * FROM recharge_offers WHERE id = ?', offer.id)! });
  }),
);

adminRouter.post(
  '/coupons',
  requireCapability(can.manageSalon),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = couponSchema.parse(req.body);
    if (one('SELECT id FROM coupons WHERE UPPER(code) = UPPER(?)', body.code)) throw conflict('That coupon code already exists.');
    const id = crypto.randomUUID();
    run('INSERT INTO coupons (id, salonId, code, type, value, minAmount, maxDiscount, startAt, endAt, usageLimit, usedCount, active, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, salonId, body.code.toUpperCase(), body.type, body.value, body.minAmount, body.maxDiscount, body.startAt, body.endAt, body.usageLimit, 0, body.active ? 1 : 0, body.description);
    audit(req.auth!.id, 'coupon.create', 'coupon', id, body as never, req.ip);
    res.status(201).json({ coupon: toCoupon(one('SELECT * FROM coupons WHERE id = ?', id)!) });
  }),
);

adminRouter.patch(
  '/coupons/:id',
  requireCapability(can.manageSalon),
  handler((req, res) => {
    const { salonId } = scope(req);
    const coupon = one('SELECT * FROM coupons WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!coupon) throw notFound('Coupon not found.');
    const body = couponSchema.partial().parse(req.body);
    run('UPDATE coupons SET code = ?, type = ?, value = ?, minAmount = ?, maxDiscount = ?, endAt = ?, usageLimit = ?, active = ?, description = ? WHERE id = ?',
      (body.code ?? coupon.code).toUpperCase(), body.type ?? coupon.type, body.value ?? coupon.value,
      body.minAmount ?? coupon.minAmount, body.maxDiscount ?? coupon.maxDiscount, body.endAt ?? coupon.endAt,
      body.usageLimit ?? coupon.usageLimit, (body.active ?? !!coupon.active) ? 1 : 0, body.description ?? coupon.description, coupon.id);
    res.json({ coupon: toCoupon(one('SELECT * FROM coupons WHERE id = ?', coupon.id)!) });
  }),
);

/* ------------------------------------------------------------------ */
/* Reports, settings, staff users, audit                               */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/reports/revenue',
  requireCapability(can.viewReports, 'Your role cannot view financial reports.'),
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const query = z.object({ from: dateSchema, to: dateSchema }).parse(req.query);
    res.json({ report: revenueReport({ salonId, branchIds }, query.from, query.to) });
  }),
);

adminRouter.get(
  '/reports/revenue.csv',
  requireCapability(can.viewReports),
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const query = z.object({ from: dateSchema, to: dateSchema }).parse(req.query);
    const report = revenueReport({ salonId, branchIds }, query.from, query.to);
    sendCsv(res, `salonpro-revenue-${query.from}-to-${query.to}.csv`, [
      ['SalonPro revenue report', `${query.from} to ${query.to}`],
      [],
      ['metric', 'amount_inr'],
      ['Gross service sales', (report.grossServiceSales / 100).toFixed(2)],
      ['Discounts', (report.discounts / 100).toFixed(2)],
      ['Refunds', (report.refunds / 100).toFixed(2)],
      ['Net collected (services)', (report.netCollected / 100).toFixed(2)],
      ['Wallet recharges collected', (report.walletCashCollected / 100).toFixed(2)],
      ['Promotional bonus granted', (report.walletBonusGranted / 100).toFixed(2)],
      ['Referral reward expense', (report.referralRewardExpense / 100).toFixed(2)],
      ['Cash wallet liability', (report.cashLiability / 100).toFixed(2)],
      ['Bonus wallet liability', (report.bonusLiability / 100).toFixed(2)],
      [],
      ['date', 'gross_inr', 'net_inr'],
      ...report.series.map((s) => [s.date, (s.gross / 100).toFixed(2), (s.net / 100).toFixed(2)]),
      [],
      ['service', 'completed_count', 'revenue_inr'],
      ...report.byService.map((s) => [s.name, s.count, (s.revenue / 100).toFixed(2)]),
      [],
      ['payment_method', 'count', 'amount_inr'],
      ...report.byMethod.map((m) => [m.method, m.count, (m.amount / 100).toFixed(2)]),
    ]);
  }),
);

adminRouter.get(
  '/reports/retention',
  requireCapability(can.viewReports),
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    res.json({ report: retentionReport({ salonId, branchIds }) });
  }),
);

adminRouter.get(
  '/reports/customers.csv',
  requireCapability(can.viewReports),
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const rows = topCustomers({ salonId, branchIds }, { limit: 5000 });
    sendCsv(res, 'salonpro-customers.csv', [
      ['name', 'phone_masked', 'visits', 'total_spend_inr', 'average_spend_inr', 'last_visit', 'wallet_balance_inr', 'successful_referrals'],
      ...rows.map((c) => [c.name, c.phoneMasked, c.visits, (c.totalSpend / 100).toFixed(2), (c.averageSpend / 100).toFixed(2), c.lastVisitAt ?? '', (c.walletBalance / 100).toFixed(2), c.referrals]),
    ]);
  }),
);

adminRouter.get(
  '/users',
  requireCapability(can.manageSettings, 'Only an owner can manage roles.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const users = all(
      `SELECT u.id, u.name, u.phone, u.email, u.role, u.status, u.createdAt,
              (SELECT GROUP_CONCAT(b.name) FROM user_branches ub JOIN branches b ON b.id = ub.branchId WHERE ub.userId = u.id) AS branchNames,
              (SELECT COUNT(*) FROM sessions s WHERE s.userId = u.id AND s.revokedAt IS NULL AND s.expiresAt > datetime('now')) AS activeSessions
         FROM users u
        WHERE u.role <> 'customer'
           OR EXISTS (SELECT 1 FROM referrals r WHERE r.salonId = ? AND (r.referrerId = u.id OR r.referredCustomerId = u.id))
        ORDER BY u.role, u.name`,
      salonId,
    );
    res.json({ users });
  }),
);

adminRouter.patch(
  '/users/:id',
  requireCapability(can.manageSettings, 'Only an owner can change roles.'),
  handler((req, res) => {
    const body = userUpdateSchema.parse(req.body);
    const user = one<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = ?', req.params.id!);
    if (!user) throw notFound('User not found.');
    if (user.id === req.auth!.id && body.role && body.role !== user.role) throw badRequest('You cannot change your own role.');
    if (body.role) run('UPDATE users SET role = ?, updatedAt = ? WHERE id = ?', body.role, new Date().toISOString(), user.id);
    if (body.name) run('UPDATE users SET name = ?, updatedAt = ? WHERE id = ?', body.name, new Date().toISOString(), user.id);
    if (body.email !== undefined) run('UPDATE users SET email = ?, updatedAt = ? WHERE id = ?', body.email, new Date().toISOString(), user.id);
    if (body.status) {
      run('UPDATE users SET status = ?, updatedAt = ? WHERE id = ?', body.status, new Date().toISOString(), user.id);
      if (body.status === 'deactivated') run('UPDATE sessions SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL', new Date().toISOString(), user.id);
    }
    audit(req.auth!.id, 'user.update', 'user', user.id, body as never, req.ip);
    res.json({ user: one('SELECT id, name, phone, email, role, status FROM users WHERE id = ?', user.id) });
  }),
);

adminRouter.get(
  '/audit',
  requireCapability(can.viewAudit, 'Only an owner can read the audit log.'),
  handler((req, res) => {
    const query = z
      .object({ limit: z.coerce.number().int().max(500).optional(), entityType: z.string().optional(), action: z.string().optional() })
      .parse(req.query);
    const clauses: string[] = ['1=1'];
    const params: (string | number)[] = [];
    if (query.entityType) {
      clauses.push('al.entityType = ?');
      params.push(query.entityType);
    }
    if (query.action) {
      clauses.push('al.action LIKE ?');
      params.push(`%${query.action}%`);
    }
    params.push(query.limit ?? 200);
    const logs = all(
      `SELECT al.*, u.name AS actorName FROM audit_logs al LEFT JOIN users u ON u.id = al.actorId
        WHERE ${clauses.join(' AND ')} ORDER BY al.timestamp DESC LIMIT ?`,
      ...params,
    ).map((l) => ({ ...l, meta: parseJson(l.meta, null) }));
    res.json({ logs });
  }),
);

adminRouter.get(
  '/settings',
  handler((req, res) => {
    const { salonId } = scope(req);
    const salon = one('SELECT * FROM salons WHERE id = ?', salonId);
    const settings = readSettings(salon?.settings);
    res.json({
      salon: { ...salon, settings },
      integrations,
      payments: { mode: PAYMENT_MODE },
      refundPolicy:
        'Wallet-funded cancellations are refunded to the wallet in full. Online payments are refunded to the source after owner approval. Promotional bonus is never refunded as cash.',
    });
  }),
);

adminRouter.patch(
  '/settings',
  requireCapability(can.manageSalon, 'Only an owner can change salon settings.'),
  handler((req, res) => {
    const { salonId } = scope(req);
    const body = z
      .object({
        name: z.string().min(2).max(80).optional(),
        address: z.string().min(4).max(200).optional(),
        contact: z.string().max(40).nullable().optional(),
        spendingOrder: z.array(z.enum(['bonus', 'cash'])).min(1).optional(),
        bonusExpiryDays: z.number().int().min(0).max(3650).nullable().optional(),
        slotGranularityMinutes: z.number().int().min(5).max(60).optional(),
        loyaltyEnabled: z.boolean().optional(),
        loyaltyPointsPerHundred: z.number().int().min(0).max(100).optional(),
      })
      .parse(req.body);
    const salon = one<{ settings: string; name: string; address: string; contact: string | null }>(
      'SELECT settings, name, address, contact FROM salons WHERE id = ?',
      salonId,
    );
    const settings = { ...readSettings(salon?.settings), ...body };
    run(
      'UPDATE salons SET name = ?, address = ?, contact = ?, settings = ? WHERE id = ?',
      body.name ?? salon!.name,
      body.address ?? salon!.address,
      body.contact ?? salon!.contact,
      JSON.stringify(settings),
      salonId,
    );
    audit(req.auth!.id, 'salon.settings', 'salon', salonId, body as never, req.ip);
    res.json({ settings });
  }),
);

adminRouter.get(
  '/me',
  handler((req, res) => {
    const { salonId, branchIds } = scope(req);
    const salon = one('SELECT * FROM salons WHERE id = ?', salonId);
    res.json({
      user: req.auth,
      salon: { ...salon, settings: readSettings(salon?.settings) },
      branches: all('SELECT id, name, status FROM branches WHERE id IN (' + (branchIds.length ? branchIds.map(() => '?').join(',') : "''") + ')', ...branchIds),
      capabilities: Object.fromEntries(Object.entries(can).map(([k, fn]) => [k, fn(req.auth!.role)])),
    });
  }),
);
