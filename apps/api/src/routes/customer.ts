import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, scopedSalonId, audit } from '../auth';
import { all, one, run, scalar, tx } from '../db';
import { badRequest, conflict, forbidden, handler, notFound } from '../lib/http';
import { bookingCreateSchema } from '../lib/schemas';
import {
  createBooking,
  getAppointment,
  upcomingForCustomer,
  hydrateAppointment,
  changeStatus,
} from '../services/booking';
import { pickAvailableStaff } from '../services/availability';
import { minutesToTime, timeToMinutes } from '@salonpro/shared';
import { ledger, toWalletTransaction, walletView } from '../services/wallet';
import { dashboard as referralDashboard, ensureReferralCode, createAttributionToken } from '../services/referral';
import { preferences, savePreferences, attemptSendAsync } from '../services/notifications';
import { readSettings } from '../services/settings';
import { customerProfile } from '../services/analytics';

export const customerRouter = Router();

function customerId(req: { auth?: { id: string; role: string } }): string {
  return req.auth!.id;
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

customerRouter.get(
  '/home',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const cid = customerId(req);
    const profile = customerProfile(salonId, cid);
    const wallet = walletView(salonId, cid);
    const settings = readSettings(one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings);

    const upcoming = upcomingForCustomer(cid);
    const recentPayments = all(
      'SELECT * FROM payment_orders WHERE customerId = ? ORDER BY createdAt DESC LIMIT 3',
      cid,
    );
    const popular = all(
      `SELECT s.*, COUNT(sr.id) AS bookings
         FROM services s
         LEFT JOIN service_records sr ON sr.servicesJson LIKE '%' || s.id || '%'
        WHERE s.salonId = ? AND s.active = 1
        GROUP BY s.id ORDER BY bookings DESC, s.sortOrder LIMIT 6`,
      salonId,
    );
    const offers = all(
      'SELECT * FROM coupons WHERE salonId = ? AND active = 1 AND endAt >= ? ORDER BY endAt LIMIT 3',
      salonId,
      new Date().toISOString(),
    );
    const loyalty = one<{ points: number; lifetimePoints: number }>(
      'SELECT points, lifetimePoints FROM loyalty_accounts WHERE customerId = ?',
      cid,
    );
    const referral = one<{ code: string }>('SELECT code FROM referral_codes WHERE customerId = ? AND salonId = ?', cid, salonId);
    const rewards = scalar<number>(
      "SELECT COALESCE(SUM(amount),0) FROM reward_transactions WHERE customerId = ? AND status = 'credited' AND type <> 'reversal'",
      cid,
    );
    const visitsThisMonth = scalar<number>(
      "SELECT COUNT(*) FROM service_records WHERE customerId = ? AND completedAt >= date('now','start of month')",
      cid,
    );

    res.json({
      profile,
      wallet,
      loyalty: loyalty ?? { points: 0, lifetimePoints: 0 },
      loyaltyEnabled: settings.loyaltyEnabled,
      upcoming,
      popular: popular.map((s) => ({ ...s, active: !!s.active })),
      offers,
      referral: {
        code: referral?.code ?? (ensureReferralCode(salonId, cid).code),
        rewardsEarned: rewards,
      },
      recentPayments,
      visitsThisMonth,
      birthdayReward: profile?.birthday
        ? new Date(profile.birthday).getMonth() === new Date().getMonth()
        : false,
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

customerRouter.post(
  '/bookings',
  requireAuth,
  handler((req, res) => {
    const body = bookingCreateSchema.parse(req.body);
    const salonId = scopedSalonId(req.auth!);
    const result = createBooking({
      auth: req.auth!,
      salonId,
      branchId: body.branchId,
      customerId: customerId(req),
      staffId: body.staffId ?? null,
      serviceIds: body.serviceIds,
      date: body.date,
      startTime: body.startTime,
      bookingSource: body.bookingSource ?? 'app',
      couponCode: body.couponCode ?? null,
      notes: body.notes ?? null,
      paymentPreference: body.paymentPreference ?? 'pay_at_salon',
      referralToken: body.referralToken ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
    });
    res.status(201).json({
      appointment: result.appointment,
      paymentPreference: body.paymentPreference ?? 'pay_at_salon',
      walletDebit: result.walletDebit,
      wallet: walletView(salonId, customerId(req)),
    });
  }),
);

customerRouter.get(
  '/bookings',
  requireAuth,
  handler((req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = all(
      `SELECT * FROM appointments WHERE customerId = ? ${status ? 'AND status = ?' : ''} ORDER BY date DESC, startTime DESC LIMIT 100`,
      ...(status ? [customerId(req), status] : [customerId(req)]),
    );
    res.json({ appointments: rows.map(hydrateAppointment) });
  }),
);

customerRouter.get(
  '/bookings/:id',
  requireAuth,
  handler((req, res) => {
    const appt = getAppointment(req.params.id!);
    if (!appt) throw notFound('Booking not found.');
    /* Row level security: a customer can only read their own booking. */
    if (appt.customerId !== req.auth!.id && req.auth!.role === 'customer') throw forbidden();
    res.json({ appointment: appt });
  }),
);

customerRouter.post(
  '/bookings/:id/cancel',
  requireAuth,
  handler((req, res) => {
    const body = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    const appt = getAppointment(req.params.id!);
    if (!appt) throw notFound('Booking not found.');
    if (appt.customerId !== req.auth!.id && req.auth!.role === 'customer') throw forbidden();
    if (!['booked', 'confirmed'].includes(appt.status)) {
      throw badRequest('Only a booked or confirmed appointment can be cancelled.');
    }
    const updated = changeStatus({
      auth: req.auth!,
      appointmentId: appt.id,
      status: 'cancelled',
      reason: body.reason ?? 'Cancelled by customer',
    });
    res.json({ appointment: updated });
  }),
);

customerRouter.post(
  '/bookings/:id/reschedule',
  requireAuth,
  handler((req, res) => {
    const body = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        staffId: z.string().optional(),
      })
      .parse(req.body);
    const appt = getAppointment(req.params.id!);
    if (!appt) throw notFound('Booking not found.');
    if (appt.customerId !== req.auth!.id && req.auth!.role === 'customer') throw forbidden();
    if (['completed', 'cancelled'].includes(appt.status)) {
      throw badRequest('That appointment can no longer be moved.');
    }

    const start = timeToMinutes(body.startTime);
    const end = start + appt.durationMinutes;
    const staffId = pickAvailableStaff(appt.branchId, body.date, start, end, body.staffId ?? appt.staffId);
    if (!staffId) throw conflict('That time is not available for the selected stylist.');

    run(
      'UPDATE appointments SET date = ?, startTime = ?, endTime = ?, staffId = ?, updatedAt = ? WHERE id = ?',
      body.date,
      body.startTime,
      minutesToTime(end),
      staffId,
      new Date().toISOString(),
      appt.id,
    );
    audit(req.auth!.id, 'appointment.reschedule', 'appointment', appt.id, { date: body.date, startTime: body.startTime }, req.ip);
    res.json({ appointment: getAppointment(appt.id) });
  }),
);

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

customerRouter.get(
  '/wallet',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const cid = customerId(req);
    const wallet = walletView(salonId, cid);
    const rows = ledger(wallet.id, 100).map(toWalletTransaction);
    const settings = readSettings(one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings);
    const offers = all('SELECT * FROM recharge_offers WHERE salonId = ? AND active = 1 ORDER BY sortOrder', salonId)
      .map((o) => ({ ...o, totalValue: o.payAmount + o.bonusAmount }));
    res.json({
      wallet,
      transactions: rows,
      offers,
      spendingOrder: settings.spendingOrder,
      bonusExpiryDays: settings.bonusExpiryDays,
      terms: [
        'Promotional bonus is spent before cash balance and is non-refundable.',
        `Cash value purchased with money never expires${settings.bonusExpiryDays ? `; promotional bonus expires after ${settings.bonusExpiryDays} days` : '; promotional bonus currently has no expiry'}.`,
        'Wallet funds are refundable to the original payment method only through an authorised salon refund.',
        'Wallet value is usable only at SalonPro branches.',
      ],
    });
  }),
);

customerRouter.get(
  '/wallet/receipt/:transactionId',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const row = one(
      'SELECT * FROM wallet_transactions WHERE id = ? AND customerId = ?',
      req.params.transactionId!,
      customerId(req),
    );
    if (!row) throw notFound('Transaction not found.');
    const order = row.paymentId
      ? one('SELECT * FROM payment_orders WHERE paymentId = ? OR id = ?', row.paymentId, row.referenceId ?? '')
      : null;
    const salon = one<{ name: string; address: string }>('SELECT name, address FROM salons WHERE id = ?', salonId);
    const user = one<{ name: string; phone: string }>('SELECT name, phone FROM users WHERE id = ?', customerId(req));
    res.json({
      receipt: {
        number: `SP-${String(row.id).slice(0, 8).toUpperCase()}`,
        issuedAt: row.createdAt,
        salon,
        customer: user,
        type: row.type,
        balanceType: row.balanceType,
        amount: row.amount,
        status: row.status,
        payment: order,
        note: row.reason,
      },
    });
  }),
);

customerRouter.get(
  '/wallet/transactions.csv',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const wallet = walletView(salonId, customerId(req));
    const rows = ledger(wallet.id, 1000);
    const header = 'date,type,balance_type,amount_inr,status,reference,reason\n';
    const csv = rows
      .map((r) =>
        [r.createdAt, r.type, r.balanceType, (r.amount / 100).toFixed(2), r.status, r.referenceId ?? '', JSON.stringify(r.reason ?? '')].join(','),
      )
      .join('\n');
    res.setHeader('content-type', 'text/csv');
    res.setHeader('content-disposition', 'attachment; filename="salonpro-wallet.csv"');
    res.send(header + csv);
  }),
);

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

customerRouter.get(
  '/referrals',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const data = referralDashboard(customerId(req), salonId);
    const settings = readSettings(one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings);
    res.json({
      ...data,
      link: `${req.protocol}://${req.get('host')}`.replace(/:\d+$/, ':5173') + `/join/${data.code}`,
      token: createAttributionToken(data.code),
      config: settings.referral,
      rules: [
        'Your friend must be new to the salon.',
        'The reward is issued after their first completed and paid visit.',
        'Cancelled, unpaid, refunded or no-show visits never qualify.',
        'One qualifying referral per new customer. No self-referrals.',
      ],
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Offers & loyalty                                                    */
/* ------------------------------------------------------------------ */

customerRouter.get(
  '/offers',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const now = new Date().toISOString();
    const coupons = all('SELECT * FROM coupons WHERE salonId = ? AND active = 1 AND endAt >= ?', salonId, now);
    const offers = all('SELECT * FROM recharge_offers WHERE salonId = ? AND active = 1 ORDER BY sortOrder', salonId);
    const loyalty = one('SELECT * FROM loyalty_accounts WHERE customerId = ?', customerId(req)) ?? {
      points: 0,
      lifetimePoints: 0,
    };
    res.json({ coupons, rechargeOffers: offers.map((o) => ({ ...o, totalValue: o.payAmount + o.bonusAmount })), loyalty });
  }),
);

/* ------------------------------------------------------------------ */
/* Profile, consent, notifications                                     */
/* ------------------------------------------------------------------ */

customerRouter.get(
  '/profile',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const profile = customerProfile(salonId, customerId(req));
    const prefs = preferences(customerId(req));
    const user = one('SELECT id, name, phone, email, createdAt FROM users WHERE id = ?', customerId(req));
    res.json({ user, profile, preferences: prefs });
  }),
);

customerRouter.patch(
  '/profile',
  requireAuth,
  handler((req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        email: z.string().email().nullable().optional(),
        birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .parse(req.body);
    const now = new Date().toISOString();
    if (body.name) run('UPDATE users SET name = ?, updatedAt = ? WHERE id = ?', body.name, now, customerId(req));
    if (body.email !== undefined) run('UPDATE users SET email = ?, updatedAt = ? WHERE id = ?', body.email, now, customerId(req));
    if (body.birthday !== undefined) {
      run('UPDATE customer_profiles SET birthday = ? WHERE customerId = ?', body.birthday, customerId(req));
    }
    const salonId = scopedSalonId(req.auth!);
    res.json({ profile: customerProfile(salonId, customerId(req)) });
  }),
);

customerRouter.patch(
  '/preferences',
  requireAuth,
  handler((req, res) => {
    const body = z
      .object({
        whatsappConsent: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        promotionalConsent: z.boolean().optional(),
        quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      })
      .parse(req.body);
    const next = savePreferences(customerId(req), body);
    if (body.promotionalConsent !== undefined) {
      run('UPDATE customer_profiles SET marketingConsent = ? WHERE customerId = ?', body.promotionalConsent, customerId(req));
    }
    audit(customerId(req), 'customer.preferences', 'user', customerId(req), body, req.ip);
    res.json({ preferences: next });
  }),
);

customerRouter.get(
  '/notifications',
  requireAuth,
  handler((req, res) => {
    const salonId = scopedSalonId(req.auth!);
    const rows = all(
      'SELECT * FROM notifications WHERE customerId = ? ORDER BY createdAt DESC LIMIT 50',
      customerId(req),
    );
    void salonId;
    res.json({
      notifications: rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        template: r.template,
        stage: r.stage,
        status: r.status,
        sentAt: r.sentAt,
        scheduledAt: r.scheduledAt,
        body: r.body,
        errorDetails: r.errorDetails,
      })),
    });
  }),
);

customerRouter.post(
  '/notifications/:id/retry',
  requireAuth,
  handler(async (req, res) => {
    const row = one('SELECT * FROM notifications WHERE id = ? AND customerId = ?', req.params.id!, customerId(req));
    if (!row) throw notFound('Notification not found.');
    const updated = await attemptSendAsync(row.id);
    res.json({ notification: updated });
  }),
);

customerRouter.post(
  '/push-subscription',
  requireAuth,
  handler((req, res) => {
    const body = z.object({ endpoint: z.string().url(), keys: z.record(z.string()) }).parse(req.body);
    run(
      'INSERT INTO push_subscriptions (id, customerId, endpoint, keysJson, createdAt) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET keysJson = excluded.keysJson',
      crypto.randomUUID(),
      customerId(req),
      body.endpoint,
      JSON.stringify(body.keys),
      new Date().toISOString(),
    );
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ */
/* Privacy: export & delete                                            */
/* ------------------------------------------------------------------ */

customerRouter.get(
  '/data-export',
  requireAuth,
  handler((req, res) => {
    const cid = customerId(req);
    const salonId = scopedSalonId(req.auth!);
    const payload = {
      exportedAt: new Date().toISOString(),
      user: one('SELECT id, name, phone, email, createdAt FROM users WHERE id = ?', cid),
      profile: customerProfile(salonId, cid),
      preferences: preferences(cid),
      appointments: all('SELECT * FROM appointments WHERE customerId = ?', cid),
      serviceRecords: all('SELECT * FROM service_records WHERE customerId = ?', cid),
      wallet: one('SELECT * FROM wallets WHERE customerId = ?', cid),
      walletTransactions: all('SELECT * FROM wallet_transactions WHERE customerId = ?', cid),
      referrals: all('SELECT * FROM referrals WHERE referrerId = ? OR referredCustomerId = ?', cid, cid),
      rewards: all('SELECT * FROM reward_transactions WHERE customerId = ?', cid),
      notifications: all('SELECT * FROM notifications WHERE customerId = ?', cid),
    };
    res.json(payload);
  }),
);

customerRouter.post(
  '/account-deletion',
  requireAuth,
  handler((req, res) => {
    const body = z.object({ confirm: z.literal('DELETE') }).parse(req.body);
    void body;
    const cid = customerId(req);
    tx(() => {
      run(
        'INSERT INTO data_requests (id, customerId, kind, status, createdAt) VALUES (?,?,?,?,?)',
        crypto.randomUUID(),
        cid,
        'deletion',
        'pending',
        new Date().toISOString(),
      );
      /* Anonymise immediately; financial records are retained as required for accounting. */
      run("UPDATE users SET name = 'Deleted customer', email = NULL, status = 'deactivated', updatedAt = ? WHERE id = ?", new Date().toISOString(), cid);
      run('UPDATE customer_profiles SET marketingConsent = 0, birthday = NULL WHERE customerId = ?', cid);
      savePreferences(cid, { whatsappConsent: false, pushEnabled: false, promotionalConsent: false });
      run('DELETE FROM sessions WHERE userId = ?', cid);
    });
    res.json({
      ok: true,
      message: 'Your account has been deactivated and personal details anonymised. Financial records are retained for accounting.',
    });
  }),
);
