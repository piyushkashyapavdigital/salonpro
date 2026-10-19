import crypto from 'node:crypto';
import { Router } from '../lib/router';
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

export const adminRouter = new Router();
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

function scope(req: Parameters<typeof SCOPED>[0]) {
  return SCOPED(req);
}

/** `today` as a YYYY-MM-DD string — the format every date column stores. */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function sendCsv(res: import('../lib/router').Response, filename: string, rows: (string | number | null | undefined)[][]) {
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  res.send(csv(rows));
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/overview',
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    const date = req.query.date ? dateSchema.parse(req.query.date) : isoDate();
    res.json({
      overview: await todayOverview({ salonId, branchIds }, date),
      settings: readSettings((await one<{ name: string; settings: string }>('SELECT name, settings FROM salons WHERE id = ?', salonId))?.settings),
      payments: { mode: PAYMENT_MODE },
      upcomingToday: await listAppointments({ salonId, branchIds, date, limit: 12 }),
      referralStats: await salonReferralStats(salonId),
      reminderStats: await notificationStats(salonId),
      topCustomers: await topCustomers({ salonId, branchIds }, { limit: 5 }),
      trend: await dailyTrend({ salonId, branchIds }, date, 7),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/appointments',
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
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
    res.json({
      appointments: await listAppointments({
        salonId,
        branchIds: scopedBranches,
        date: query.date,
        from: query.from,
        to: query.to,
        status: query.status as never,
        staffId: query.staffId,
        customerId: query.customerId,
        limit: query.limit,
      }),
    });
  }),
);

adminRouter.get(
  '/appointments/calendar',
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    const query = z
      .object({ date: dateSchema, branchId: z.string().optional(), staffId: z.string().optional() })
      .parse(req.query);
    const staff = await all(
      "SELECT s.id, u.name, s.designation, s.branchId FROM staff s JOIN users u ON u.id = s.userId WHERE s.salonId = ? AND s.status = 'active'",
      salonId,
    );
    const appointments = await listAppointments({
      salonId,
      branchIds: branchIds.filter((b) => (query.branchId ? b === query.branchId : true)),
      date: query.date,
      staffId: query.staffId,
      limit: 300,
    });
    const branch = query.branchId
      ? await one('SELECT * FROM branches WHERE id = ?', query.branchId)
      : await one('SELECT * FROM branches WHERE salonId = ? ORDER BY name LIMIT 1', salonId);
    const openingHours = branch ? parseJson(branch.openingHours, fullWeekHours()) : fullWeekHours();
    res.json({
      date: query.date,
      staff,
      appointments,
      openingHours,
      holidays: await all('SELECT * FROM holidays WHERE date = ?', query.date),
    });
  }),
);

adminRouter.get(
  '/appointments/:id',
  handler(async (req, res) => {
    const appt = await getAppointment(req.params.id!);
    if (!appt) throw notFound('Appointment not found.');
    if (!(await scope(req)).branchIds.includes(appt.branchId)) throw forbidden();
    res.json({ appointment: appt });
  }),
);

adminRouter.post(
  '/appointments',
  requireCapability(can.manageAppointments, 'Only owners, managers and receptionists can create bookings.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
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
      const existing = await one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
      if (existing) {
        customerId = existing.id;
      } else {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await tx(async () => {
          await run('INSERT INTO users (id, name, phone, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)',
            id, body.customerName!, phone, 'customer', 'active', 0, now, now);
          await run('INSERT INTO customer_profiles (customerId, salonId, totalVisits, totalCompletedSpend, preferredServices, marketingConsent, createdAt) VALUES (?,?,?,?,?,?,?)',
            id, salonId, 0, 0, '[]', Number(req.body.marketingConsent !== false), now);
          await ensureReferralCode(salonId, id);
        });
        customerId = id;
      }
    }

    const result = await createBooking({
      auth: req.auth!,
      salonId,
      branchId: body.branchId,
      customerId: customerId!,
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
  handler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['booked', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
        reason: z.string().max(300).optional(),
        paymentMethod: z.enum(['wallet', 'online', 'pay_at_salon', 'cash', 'upi_card']).optional(),
      })
      .parse(req.body);
    const appt = await getAppointment(req.params.id!);
    if (!appt) throw notFound('Appointment not found.');
    if (!(await scope(req)).branchIds.includes(appt.branchId)) throw forbidden();
    if (req.auth!.role === 'salon_staff' && !['in_progress', 'completed'].includes(body.status)) {
      throw forbidden('Stylists can only start or complete their own appointments.');
    }
    res.json({
      appointment: await changeStatus({
        auth: req.auth!,
        appointmentId: appt.id,
        status: body.status,
        reason: body.reason,
        paymentMethod: body.paymentMethod,
      }),
    });
  }),
);

adminRouter.post(
  '/appointments/:id/no-show',
  requireCapability(can.manageAppointments),
  handler(async (req, res) => {
    const appt = await getAppointment(req.params.id!);
    if (!appt) throw notFound('Appointment not found.');
    res.json({
      appointment: await changeStatus({ auth: req.auth!, appointmentId: appt.id, status: 'no_show', reason: 'Marked no-show' }),
    });
  }),
);

adminRouter.get(
  '/availability',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const query = z
      .object({ branchId: z.string(), date: dateSchema, serviceIds: z.string(), staffId: z.string().optional() })
      .parse(req.query);
    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId))?.settings,
    );
    const ids = query.serviceIds.split(',');
    const services = await all(
      `SELECT * FROM services WHERE salonId = ? AND id IN (${ids.map(() => '?').join(',')})`,
      salonId,
      ...ids,
    );
    const duration = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    res.json(
      await findSlots({
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
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const query = z.object({ search: z.string().optional(), limit: z.coerce.number().int().max(500).optional() }).parse(req.query);
    res.json({ customers: await listCustomers({ salonId }, query) });
  }),
);

adminRouter.get(
  '/customers/top',
  requireCapability(can.viewCustomers),
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    const query = z
      .object({
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        sort: z.enum(['spend', 'visits', 'referrals']).optional(),
        limit: z.coerce.number().int().max(100).optional(),
      })
      .parse(req.query);
    res.json({ customers: await topCustomers({ salonId, branchIds }, query) });
  }),
);

adminRouter.get(
  '/customers/:id',
  requireCapability(can.viewCustomers),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const id = req.params.id!;
    const profile = await customerProfile(salonId, id);
    if (!profile) throw notFound('Customer not found.');
    const wallet = await walletView(salonId, id);
    const transactions = (await ledger(wallet.id, 100)).map(toWalletTransaction);
    res.json({
      profile,
      wallet,
      appointments: await listAppointments({ salonId, customerId: id, limit: 100 }),
      transactions,
      rewards: await all('SELECT * FROM reward_transactions WHERE customerId = ? ORDER BY createdAt DESC', id),
      referrals: await all('SELECT * FROM referrals WHERE referrerId = ? OR referredCustomerId = ? ORDER BY createdAt DESC', id, id),
      notifications: (await listNotifications(salonId, { limit: 50 })).filter((n) => n.customerId === id),
      loyalty: await one('SELECT * FROM loyalty_accounts WHERE customerId = ?', id),
    });
  }),
);

adminRouter.post(
  '/customers/:id/wallet/adjust',
  requireCapability(can.adjustWallet, 'Only an owner can adjust wallet balances.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = z
      .object({
        amount: z.number().int(),
        balanceType: z.enum(['cash', 'bonus']),
        reason: z.string().min(6).max(300),
      })
      .parse(req.body);
    const wallet = await getOrCreateWallet(salonId, req.params.id!);
    const entry = await adjust({
      walletId: wallet.id,
      customerId: req.params.id!,
      salonId,
      amount: body.amount,
      balanceType: body.balanceType,
      reason: body.reason,
      actorId: req.auth!.id,
    });
    await audit(req.auth!.id, 'wallet.adjust', 'wallet', wallet.id, { amount: body.amount, balanceType: body.balanceType, reason: body.reason }, req.ip);
    res.json({ transaction: toWalletTransaction(entry), wallet: await walletView(salonId, req.params.id!) });
  }),
);

adminRouter.post(
  '/customers/:id/consent',
  requireCapability(can.viewCustomers),
  handler(async (req, res) => {
    const body = z.object({ marketingConsent: z.boolean() }).parse(req.body);
    await run('UPDATE customer_profiles SET marketingConsent = ? WHERE customerId = ?', body.marketingConsent, req.params.id!);
    await audit(req.auth!.id, 'customer.consent', 'user', req.params.id!, body, req.ip);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ */
/* Wallet ledger, payments, refunds                                    */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/wallet',
  requireCapability(can.viewReports, 'Your role cannot view the wallet ledger.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
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

    const rows = await all(
      `SELECT wt.*, u.name AS customerName FROM wallet_transactions wt
         JOIN users u ON u.id = wt.customerId
        WHERE ${clauses.join(' AND ')} ORDER BY wt.createdAt DESC LIMIT ?`,
      ...params,
    );
    res.json({
      transactions: rows.map((r) => ({ ...toWalletTransaction(r), customerName: r.customerName })),
      liabilities: await liabilities(salonId),
      recentRecharges: (await listOrders(salonId, { limit: 20 })).filter((o) => o.purpose === 'wallet_recharge'),
    });
  }),
);

adminRouter.get(
  '/wallet.csv',
  requireCapability(can.viewReports),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const rows = await all(
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
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const query = z.object({ status: z.string().optional(), limit: z.coerce.number().int().max(500).optional() }).parse(req.query);
    const orders = await listOrders(salonId, query);
    const refunds = await all(
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
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const rows = await listOrders(salonId, { limit: 5000 });
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
    const { salonId } = await scope(req);
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
    res.json(await refundPayment({ salonId, actorId: req.auth!.id, ...body }));
  }),
);

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/referrals',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const stats = await salonReferralStats(salonId);
    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId))?.settings,
    );
    res.json({ ...stats, config: settings.referral, mode: 'scripts' });
  }),
);

adminRouter.patch(
  '/referrals/config',
  requireCapability(can.manageReferrals, 'Only an owner can change referral rewards.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = z
      .object({
        referrerReward: z.number().int().min(0).optional(),
        refereeReward: z.number().int().min(0).optional(),
        maxRewardsPerMonth: z.number().int().min(0).optional(),
        requireFirstPaidVisit: z.boolean().optional(),
      })
      .parse(req.body);
    const salon = await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId);
    const settings = readSettings(salon?.settings);
    const next = { ...settings, referral: { ...settings.referral, ...body } };
    await run('UPDATE salons SET settings = ? WHERE id = ?', JSON.stringify(next), salonId);
    await audit(req.auth!.id, 'referral.config', 'salon', salonId, body, req.ip);
    res.json({ config: next.referral });
  }),
);

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/reminders',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const query = z.object({ status: z.string().optional(), stage: z.string().optional() }).parse(req.query);
    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId))?.settings,
    );
    res.json({
      settings: await reminderSettings(salonId),
      templates: settings.templates,
      notifications: await listNotifications(salonId, query),
      stats: await notificationStats(salonId),
    });
  }),
);

adminRouter.patch(
  '/reminders/settings',
  requireCapability(can.manageSalon, 'Only an owner can change reminder settings.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = z
      .object({
        stages: z.array(z.enum(['day7', 'day14', 'day30', 'appointment'])).optional(),
        channels: z.array(z.enum(['whatsapp', 'push', 'sms', 'email'])).optional(),
        intervals: z.record(z.number().int().min(1).max(365)).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(req.body);
    const next = await saveReminderSettings(salonId, body);
    await audit(req.auth!.id, 'reminder.settings', 'salon', salonId, body, req.ip);
    res.json({ settings: next });
  }),
);

adminRouter.patch(
  '/reminders/templates',
  requireCapability(can.manageSalon, 'Only an owner can edit reminder templates.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
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
    const salon = await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId);
    const settings = readSettings(salon?.settings);
    const next = { ...settings, templates: { ...settings.templates, ...body } };
    await run('UPDATE salons SET settings = ? WHERE id = ?', JSON.stringify(next), salonId);
    await audit(req.auth!.id, 'reminder.templates', 'salon', salonId, {}, req.ip);
    res.json({ templates: next.templates });
  }),
);

adminRouter.post(
  '/reminders/run',
  requireCapability(can.manageSalon, 'Only an owner can trigger a reminder pass.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const result = await runReminderPass(salonId);
    await audit(req.auth!.id, 'reminder.run', 'salon', salonId, result as never, req.ip);
    res.json({ result, notifications: await listNotifications(salonId, { limit: 30 }) });
  }),
);

adminRouter.post(
  '/reminders/:id/retry',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const row = await one('SELECT * FROM notifications WHERE id = ? AND salonId = ?', req.params.id!, salonId);
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
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const services = await all('SELECT * FROM services WHERE salonId = ? ORDER BY sortOrder, name', salonId);
    const stats = await all(
      `SELECT je.value->>'serviceId' AS serviceId, COUNT(*) AS count, SUM(sr.finalAmount) AS revenue
         FROM service_records sr
         CROSS JOIN LATERAL jsonb_array_elements(sr.servicesJson::jsonb) AS je(value)
        WHERE sr.salonId = ? GROUP BY je.value->>'serviceId'`,
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
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = serviceSchema.parse(req.body);
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO services (id, salonId, name, category, description, price, durationMinutes, active, imageEmoji, sortOrder, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, salonId, body.name, body.category, body.description, body.price, body.durationMinutes,
      body.active ? 1 : 0, body.imageEmoji, body.sortOrder, new Date().toISOString(),
    );
    await audit(req.auth!.id, 'service.create', 'service', id, body as never, req.ip);
    res.status(201).json({ service: await one('SELECT * FROM services WHERE id = ?', id) });
  }),
);

adminRouter.patch(
  '/services/:id',
  requireCapability(can.manageServices),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const existing = await one('SELECT * FROM services WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!existing) throw notFound('Service not found.');
    const body = serviceSchema.partial().parse(req.body);
    await run(
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
    await audit(req.auth!.id, 'service.update', 'service', existing.id, body as never, req.ip);
    res.json({ service: await one('SELECT * FROM services WHERE id = ?', existing.id) });
  }),
);

adminRouter.get(
  '/staff',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const staffRows = await all(
      `SELECT s.*, u.name, u.phone, u.email, u.status AS userStatus, b.name AS branchName
         FROM staff s JOIN users u ON u.id = s.userId JOIN branches b ON b.id = s.branchId
        WHERE s.salonId = ? ORDER BY b.name, u.name`,
      salonId,
    );
    const staff = [];
    for (const s of staffRows) {
      staff.push({
        ...s,
        workingHours: parseJson(s.workingHours, fullWeekWorkingHours()),
        commissionRules: parseJson(s.commissionRules, { serviceBps: 800, productBps: 300 }),
        breaks: await all('SELECT * FROM staff_breaks WHERE staffId = ?', s.id),
        attendance: await all('SELECT * FROM staff_attendance WHERE staffId = ? ORDER BY date DESC LIMIT 14', s.id),
        stats: {
          services: await scalar<number>('SELECT COUNT(*) FROM service_records WHERE staffId = ?', s.id),
          revenue: await scalar<number>('SELECT COALESCE(SUM(finalAmount),0) FROM service_records WHERE staffId = ?', s.id),
          upcoming: await scalar<number>(
            "SELECT COUNT(*) FROM appointments WHERE staffId = ? AND date >= ? AND status IN ('booked','confirmed')",
            s.id,
            todayIso(),
          ),
        },
      });
    }
    res.json({ staff });
  }),
);

adminRouter.post(
  '/staff',
  requireCapability(can.manageStaff),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = staffSchema.parse(req.body);
    if (!body.userId && (!body.name || !body.phone)) throw badRequest('Provide a name and phone, or an existing user.');
    /* A simple add should just work: fall back to the salon's branch and a
     * sensible role/title so the owner only has to give a name and number. */
    if (!body.branchId) {
      const fallback = await one<{ id: string }>(
        "SELECT id FROM branches WHERE salonId = ? AND status = 'active' ORDER BY name LIMIT 1",
        salonId,
      );
      if (!fallback) throw badRequest('Create a branch before adding staff.');
      body.branchId = fallback.id;
    }
    body.designation = body.designation ?? 'Stylist';
    const role = body.role ?? 'salon_staff';
    let userId = body.userId;
    const now = new Date().toISOString();
    if (!userId) {
      const phone = body.phone!.replace(/\D/g, '').slice(-10);
      const existing = await one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
      if (existing) userId = existing.id;
      else {
        userId = crypto.randomUUID();
        await run('INSERT INTO users (id, name, phone, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)',
          userId, body.name!, phone, role, 'active', 0, now, now);
      }
    }
    const staffId = crypto.randomUUID();
    await run(
      'INSERT INTO staff (id, salonId, branchId, userId, designation, workingHours, commissionRules, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      staffId, salonId, body.branchId, userId, body.designation,
      JSON.stringify(body.workingHours ?? fullWeekWorkingHours('10:00', '20:00', [0])),
      JSON.stringify(body.commissionRules ?? { serviceBps: 800, productBps: 300 }), 'active', now,
    );
    await run('INSERT INTO user_branches (userId, branchId) VALUES (?,?) ON CONFLICT DO NOTHING', userId, body.branchId);
    await audit(req.auth!.id, 'staff.create', 'staff', staffId, body as never, req.ip);
    res.status(201).json({ staffId });
  }),
);

adminRouter.patch(
  '/staff/:id',
  requireCapability(can.manageStaff),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const staff = await one('SELECT * FROM staff WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!staff) throw notFound('Staff member not found.');
    const body = staffSchema.partial().parse(req.body);
    await run(
      'UPDATE staff SET designation = ?, workingHours = ?, commissionRules = ?, status = ?, branchId = ? WHERE id = ?',
      body.designation ?? staff.designation,
      JSON.stringify(body.workingHours ?? parseJson(staff.workingHours, {})),
      JSON.stringify(body.commissionRules ?? parseJson(staff.commissionRules, {})),
      body.status ?? staff.status,
      body.branchId ?? staff.branchId,
      staff.id,
    );
    await audit(req.auth!.id, 'staff.update', 'staff', staff.id, body as never, req.ip);
    res.json({ staff: await one('SELECT * FROM staff WHERE id = ?', staff.id) });
  }),
);

adminRouter.post(
  '/staff/:id/attendance',
  requireCapability(can.manageStaff),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const staff = await one<{ id: string; branchId: string }>('SELECT id, branchId FROM staff WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!staff) throw notFound('Staff member not found.');
    const body = z
      .object({
        date: dateSchema,
        status: z.enum(['present', 'absent', 'leave', 'half_day']).default('present'),
        checkInAt: z.string().nullable().optional(),
        checkOutAt: z.string().nullable().optional(),
      })
      .parse(req.body);
    await run(
      `INSERT INTO staff_attendance (id, staffId, branchId, date, checkInAt, checkOutAt, status) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(staffId, date) DO UPDATE SET status = excluded.status, checkInAt = excluded.checkInAt, checkOutAt = excluded.checkOutAt`,
      crypto.randomUUID(), staff.id, staff.branchId, body.date, body.checkInAt ?? null, body.checkOutAt ?? null, body.status,
    );
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/branches',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const rows = await all('SELECT * FROM branches WHERE salonId = ? ORDER BY name', salonId);
    const branches = [];
    for (const b of rows) {
      branches.push({
        ...b,
        openingHours: parseJson(b.openingHours, fullWeekHours()),
        staffCount: await scalar<number>('SELECT COUNT(*) FROM staff WHERE branchId = ?', b.id),
        holidays: await all('SELECT * FROM holidays WHERE branchId = ? ORDER BY date', b.id),
        revenue: await scalar<number>('SELECT COALESCE(SUM(finalAmount),0) FROM service_records WHERE branchId = ?', b.id),
        customers: await scalar<number>('SELECT COUNT(DISTINCT customerId) FROM service_records WHERE branchId = ?', b.id),
        appointments: await scalar<number>('SELECT COUNT(*) FROM appointments WHERE branchId = ?', b.id),
      });
    }
    res.json({ branches });
  }),
);

adminRouter.post(
  '/branches',
  requireCapability(can.manageBranches),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = branchSchema.parse(req.body);
    const id = crypto.randomUUID();
    await tx(async () => {
      await run(
        'INSERT INTO branches (id, salonId, name, address, contact, timezone, openingHours, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        id, salonId, body.name, body.address, body.contact, 'Asia/Kolkata', JSON.stringify(body.openingHours), body.status, new Date().toISOString(),
      );
      await run('INSERT INTO user_branches (userId, branchId) VALUES (?,?) ON CONFLICT DO NOTHING', req.auth!.id, id);
      await audit(req.auth!.id, 'branch.create', 'branch', id, body as never, req.ip);
    });
    res.status(201).json({ branch: await one('SELECT * FROM branches WHERE id = ?', id) });
  }),
);

adminRouter.patch(
  '/branches/:id',
  requireCapability(can.manageBranches),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const branch = await one('SELECT * FROM branches WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!branch) throw notFound('Branch not found.');
    const body = branchSchema.partial().parse(req.body);
    await run(
      'UPDATE branches SET name = ?, address = ?, contact = ?, openingHours = ?, status = ? WHERE id = ?',
      body.name ?? branch.name,
      body.address ?? branch.address,
      body.contact ?? branch.contact,
      JSON.stringify(body.openingHours ?? parseJson(branch.openingHours, fullWeekHours())),
      body.status ?? branch.status,
      branch.id,
    );
    await audit(req.auth!.id, 'branch.update', 'branch', branch.id, body as never, req.ip);
    res.json({ branch: await one('SELECT * FROM branches WHERE id = ?', branch.id) });
  }),
);

adminRouter.post(
  '/branches/:id/holidays',
  requireCapability(can.manageBranches),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const branch = await one('SELECT id FROM branches WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!branch) throw notFound('Branch not found.');
    const body = z.object({ date: dateSchema, reason: z.string().max(120).optional() }).parse(req.body);
    await run('INSERT INTO holidays (id, branchId, date, reason) VALUES (?,?,?,?) ON CONFLICT(branchId, date) DO UPDATE SET reason = excluded.reason',
      crypto.randomUUID(), branch.id, body.date, body.reason ?? null);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/offers',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    res.json({
      rechargeOffers: (await all('SELECT * FROM recharge_offers WHERE salonId = ? ORDER BY sortOrder', salonId)).map((o) => ({
        ...o, active: !!o.active, totalValue: o.payAmount + o.bonusAmount,
      })),
      coupons: (await all('SELECT * FROM coupons WHERE salonId = ? ORDER BY endAt DESC', salonId)).map(toCoupon),
    });
  }),
);

adminRouter.post(
  '/offers/recharge',
  requireCapability(can.manageSalon),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = rechargeOfferSchema.parse(req.body);
    const id = crypto.randomUUID();
    await run('INSERT INTO recharge_offers (id, salonId, payAmount, bonusAmount, label, active, sortOrder) VALUES (?,?,?,?,?,?,?)',
      id, salonId, body.payAmount, body.bonusAmount, body.label, body.active ? 1 : 0, body.sortOrder);
    await audit(req.auth!.id, 'offer.create', 'recharge_offer', id, body as never, req.ip);
    res.status(201).json({ offer: (await one('SELECT * FROM recharge_offers WHERE id = ?', id))! });
  }),
);

adminRouter.patch(
  '/offers/recharge/:id',
  requireCapability(can.manageSalon),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const offer = await one('SELECT * FROM recharge_offers WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!offer) throw notFound('Offer not found.');
    const body = rechargeOfferSchema.partial().parse(req.body);
    await run('UPDATE recharge_offers SET payAmount = ?, bonusAmount = ?, label = ?, active = ?, sortOrder = ? WHERE id = ?',
      body.payAmount ?? offer.payAmount, body.bonusAmount ?? offer.bonusAmount,
      body.label ?? offer.label, (body.active ?? !!offer.active) ? 1 : 0, body.sortOrder ?? offer.sortOrder, offer.id);
    await audit(req.auth!.id, 'offer.update', 'recharge_offer', offer.id, body as never, req.ip);
    res.json({ offer: (await one('SELECT * FROM recharge_offers WHERE id = ?', offer.id))! });
  }),
);

adminRouter.post(
  '/coupons',
  requireCapability(can.manageSalon),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const body = couponSchema.parse(req.body);
    if (await one('SELECT id FROM coupons WHERE UPPER(code) = UPPER(?)', body.code)) throw conflict('That coupon code already exists.');
    const id = crypto.randomUUID();
    await run('INSERT INTO coupons (id, salonId, code, type, value, minAmount, maxDiscount, startAt, endAt, usageLimit, usedCount, active, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, salonId, body.code.toUpperCase(), body.type, body.value, body.minAmount, body.maxDiscount, body.startAt, body.endAt, body.usageLimit, 0, body.active ? 1 : 0, body.description);
    await audit(req.auth!.id, 'coupon.create', 'coupon', id, body as never, req.ip);
    res.status(201).json({ coupon: toCoupon((await one('SELECT * FROM coupons WHERE id = ?', id))!) });
  }),
);

adminRouter.patch(
  '/coupons/:id',
  requireCapability(can.manageSalon),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const coupon = await one('SELECT * FROM coupons WHERE id = ? AND salonId = ?', req.params.id!, salonId);
    if (!coupon) throw notFound('Coupon not found.');
    const body = couponSchema.partial().parse(req.body);
    await run('UPDATE coupons SET code = ?, type = ?, value = ?, minAmount = ?, maxDiscount = ?, endAt = ?, usageLimit = ?, active = ?, description = ? WHERE id = ?',
      (body.code ?? coupon.code).toUpperCase(), body.type ?? coupon.type, body.value ?? coupon.value,
      body.minAmount ?? coupon.minAmount, body.maxDiscount ?? coupon.maxDiscount, body.endAt ?? coupon.endAt,
      body.usageLimit ?? coupon.usageLimit, (body.active ?? !!coupon.active) ? 1 : 0, body.description ?? coupon.description, coupon.id);
    res.json({ coupon: toCoupon((await one('SELECT * FROM coupons WHERE id = ?', coupon.id))!) });
  }),
);

/* ------------------------------------------------------------------ */
/* Reports, settings, staff users, audit                               */
/* ------------------------------------------------------------------ */

adminRouter.get(
  '/reports/revenue',
  requireCapability(can.viewReports, 'Your role cannot view financial reports.'),
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    const query = z.object({ from: dateSchema, to: dateSchema }).parse(req.query);
    res.json({ report: await revenueReport({ salonId, branchIds }, query.from, query.to) });
  }),
);

adminRouter.get(
  '/reports/revenue.csv',
  requireCapability(can.viewReports),
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    const query = z.object({ from: dateSchema, to: dateSchema }).parse(req.query);
    const report = await revenueReport({ salonId, branchIds }, query.from, query.to);
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
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    res.json({ report: await retentionReport({ salonId, branchIds }) });
  }),
);

adminRouter.get(
  '/reports/customers.csv',
  requireCapability(can.viewReports),
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    const rows = await topCustomers({ salonId, branchIds }, { limit: 5000 });
    sendCsv(res, 'salonpro-customers.csv', [
      ['name', 'phone_masked', 'visits', 'total_spend_inr', 'average_spend_inr', 'last_visit', 'wallet_balance_inr', 'successful_referrals'],
      ...rows.map((c) => [c.name, c.phoneMasked, c.visits, (c.totalSpend / 100).toFixed(2), (c.averageSpend / 100).toFixed(2), c.lastVisitAt ?? '', (c.walletBalance / 100).toFixed(2), c.referrals]),
    ]);
  }),
);

adminRouter.get(
  '/users',
  requireCapability(can.manageSettings, 'Only an owner can manage roles.'),
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const users = await all(
      `SELECT u.id, u.name, u.phone, u.email, u.role, u.status, u.createdAt,
              (SELECT string_agg(b.name, ',') FROM user_branches ub JOIN branches b ON b.id = ub.branchId WHERE ub.userId = u.id) AS branchNames,
              (SELECT COUNT(*) FROM sessions s WHERE s.userId = u.id AND s.revokedAt IS NULL AND s.expiresAt > ?) AS activeSessions
         FROM users u
        WHERE u.role <> 'customer'
           OR EXISTS (SELECT 1 FROM referrals r WHERE r.salonId = ? AND (r.referrerId = u.id OR r.referredCustomerId = u.id))
        ORDER BY u.role, u.name`,
      new Date().toISOString(),
      salonId,
    );
    res.json({ users });
  }),
);

adminRouter.patch(
  '/users/:id',
  requireCapability(can.manageSettings, 'Only an owner can change roles.'),
  handler(async (req, res) => {
    const body = userUpdateSchema.parse(req.body);
    const user = await one<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = ?', req.params.id!);
    if (!user) throw notFound('User not found.');
    if (user.id === req.auth!.id && body.role && body.role !== user.role) throw badRequest('You cannot change your own role.');
    if (body.role) await run('UPDATE users SET role = ?, updatedAt = ? WHERE id = ?', body.role, new Date().toISOString(), user.id);
    if (body.name) await run('UPDATE users SET name = ?, updatedAt = ? WHERE id = ?', body.name, new Date().toISOString(), user.id);
    if (body.email !== undefined) await run('UPDATE users SET email = ?, updatedAt = ? WHERE id = ?', body.email, new Date().toISOString(), user.id);
    if (body.status) {
      await run('UPDATE users SET status = ?, updatedAt = ? WHERE id = ?', body.status, new Date().toISOString(), user.id);
      if (body.status === 'deactivated') await run('UPDATE sessions SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL', new Date().toISOString(), user.id);
    }
    await audit(req.auth!.id, 'user.update', 'user', user.id, body as never, req.ip);
    res.json({ user: await one('SELECT id, name, phone, email, role, status FROM users WHERE id = ?', user.id) });
  }),
);

adminRouter.get(
  '/audit',
  requireCapability(can.viewAudit, 'Only an owner can read the audit log.'),
  handler(async (req, res) => {
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
    const logs = (
      await all(
        `SELECT al.*, u.name AS actorName FROM audit_logs al LEFT JOIN users u ON u.id = al.actorId
          WHERE ${clauses.join(' AND ')} ORDER BY al."timestamp" DESC LIMIT ?`,
        ...params,
      )
    ).map((l) => ({ ...l, meta: parseJson(l.meta, null) }));
    res.json({ logs });
  }),
);

adminRouter.get(
  '/settings',
  handler(async (req, res) => {
    const { salonId } = await scope(req);
    const salon = await one('SELECT * FROM salons WHERE id = ?', salonId);
    res.json({
      salon: { ...salon, settings: readSettings(salon?.settings) },
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
  handler(async (req, res) => {
    const { salonId } = await scope(req);
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
    const salon = await one<{ settings: string; name: string; address: string; contact: string | null }>(
      'SELECT settings, name, address, contact FROM salons WHERE id = ?',
      salonId,
    );
    const settings = { ...readSettings(salon?.settings), ...body };
    await run(
      'UPDATE salons SET name = ?, address = ?, contact = ?, settings = ? WHERE id = ?',
      body.name ?? salon!.name,
      body.address ?? salon!.address,
      body.contact ?? salon!.contact,
      JSON.stringify(settings),
      salonId,
    );
    await audit(req.auth!.id, 'salon.settings', 'salon', salonId, body as never, req.ip);
    res.json({ settings });
  }),
);

adminRouter.get(
  '/me',
  handler(async (req, res) => {
    const { salonId, branchIds } = await scope(req);
    const salon = await one('SELECT * FROM salons WHERE id = ?', salonId);
    res.json({
      user: req.auth,
      salon: { ...salon, settings: readSettings(salon?.settings) },
      branches: await all(
        'SELECT id, name, status FROM branches WHERE id IN (' + (branchIds.length ? branchIds.map(() => '?').join(',') : "''") + ')',
        ...branchIds,
      ),
      capabilities: Object.fromEntries(Object.entries(can).map(([k, fn]) => [k, fn(req.auth!.role)])),
    });
  }),
);
