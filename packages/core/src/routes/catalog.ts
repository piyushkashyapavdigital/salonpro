import { Router } from '../lib/router';
import { z } from 'zod';
import { requireAuth, scopedSalonId } from '../auth';
import { all, one, parseJson } from '../db';
import { handler, notFound } from '../lib/http';
import { findSlots, staffForBranch } from '../services/availability';
import { resolveServices, toCoupon, totalDuration, subtotalOf, validateCoupon } from '../services/booking';
import { readSettings } from '../services/settings';
import { getOrderByRazorpayId } from '../services/payments';
import { verifyAttributionToken } from '../services/referral';
import { integrations } from '../env';
import { PAYMENT_MODE } from '../services/payments';

export const catalogRouter = new Router();

catalogRouter.get(
  '/salon',
  requireAuth,
  handler(async (req, res) => {
    const salonId = await scopedSalonId(req.auth!);
    const salon = await one<{ id: string; name: string; address: string; contact: string; currency: string; timezone: string; settings: string }>(
      'SELECT * FROM salons WHERE id = ?',
      salonId,
    );
    if (!salon) throw notFound('Salon not found.');
    res.json({
      salon: {
        ...salon,
        settings: readSettings(salon.settings),
      },
      integrations,
      payments: { mode: PAYMENT_MODE },
    });
  }),
);

catalogRouter.get(
  '/branches',
  requireAuth,
  handler(async (req, res) => {
    const salonId = await scopedSalonId(req.auth!);
    const branches = (
      await all(
        "SELECT * FROM branches WHERE salonId = ? AND status = 'active' ORDER BY name",
        salonId,
      )
    ).map((b) => ({ ...b, openingHours: parseJson(b.openingHours, {}) }));
    res.json({ branches });
  }),
);

catalogRouter.get(
  '/services',
  requireAuth,
  handler(async (req, res) => {
    const salonId = await scopedSalonId(req.auth!);
    const includeInactive = req.query.includeInactive === 'true' && req.auth!.role !== 'customer';
    const services = await all(
      `SELECT * FROM services WHERE salonId = ? ${includeInactive ? '' : 'AND active = 1'} ORDER BY sortOrder, name`,
      salonId,
    );
    const categories = [...new Set(services.map((s) => s.category))];
    res.json({ services: services.map((s) => ({ ...s, active: !!s.active })), categories });
  }),
);

catalogRouter.get(
  '/staff',
  requireAuth,
  handler(async (req, res) => {
    const branchId = z.string().min(1).parse(req.query.branchId);
    const includeInactive = req.query.includeInactive === 'true' && req.auth!.role !== 'customer';
    const staff = await staffForBranch(branchId, includeInactive);
    const rows = [];
    for (const s of staff) {
      const staffRow = (await one<{ workingHours: string; commissionRules: string; salonId: string }>(
        'SELECT workingHours, commissionRules, salonId FROM staff WHERE id = ?',
        s.id,
      ))!;
      rows.push({
        id: s.id,
        name: s.name,
        designation: s.designation,
        branchId: s.branchId,
        status: s.status,
        workingHours: parseJson(staffRow.workingHours, {}),
        commissionRules: parseJson(staffRow.commissionRules, {}),
      });
    }
    res.json({ staff: rows });
  }),
);

/** Availability for a set of services on a date, for one stylist or "any". */
catalogRouter.get(
  '/availability',
  requireAuth,
  handler(async (req, res) => {
    const query = z
      .object({
        branchId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        serviceIds: z.string().min(1),
        staffId: z.string().optional(),
      })
      .parse(req.query);

    const salonId = await scopedSalonId(req.auth!);
    const serviceIds = query.serviceIds.split(',').filter(Boolean);
    const services = await resolveServices(salonId, query.branchId, serviceIds);
    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId))?.settings,
    );

    const today = new Date().toISOString().slice(0, 10);
    const nowMinutes =
      query.date === today ? new Date().getHours() * 60 + new Date().getMinutes() : undefined;

    const result = await findSlots({
      branchId: query.branchId,
      date: query.date,
      durationMinutes: totalDuration(services),
      staffId: query.staffId ?? null,
      stepMinutes: settings.slotGranularityMinutes,
      nowMinutes,
    });
    res.json({
      ...result,
      subtotal: subtotalOf(services),
      services,
    });
  }),
);

catalogRouter.get(
  '/coupons',
  requireAuth,
  handler(async (req, res) => {
    const salonId = await scopedSalonId(req.auth!);
    const now = new Date().toISOString();
    const rows = await all(
      'SELECT * FROM coupons WHERE salonId = ? AND active = 1 AND endAt >= ? ORDER BY minAmount',
      salonId,
      now,
    );
    res.json({ coupons: rows.map(toCoupon) });
  }),
);

catalogRouter.post(
  '/coupons/validate',
  requireAuth,
  handler(async (req, res) => {
    const body = z.object({ code: z.string().min(1), amount: z.number().int().nonnegative() }).parse(req.body);
    const salonId = await scopedSalonId(req.auth!);
    const { coupon, discount } = await validateCoupon(salonId, body.code, body.amount);
    res.json({
      ok: true,
      code: coupon.code,
      discount,
      description: coupon.description,
      type: coupon.type,
      value: coupon.value,
    });
  }),
);

catalogRouter.get(
  '/recharge-offers',
  requireAuth,
  handler(async (req, res) => {
    const salonId = await scopedSalonId(req.auth!);
    const offers = (
      await all(
        'SELECT * FROM recharge_offers WHERE salonId = ? AND active = 1 ORDER BY sortOrder',
        salonId,
      )
    ).map((o) => ({ ...o, totalValue: o.payAmount + o.bonusAmount }));
    res.json({ offers });
  }),
);

/** Public: resolve a referral link so the app can prefill the code. */
catalogRouter.get(
  '/join/:code',
  handler(async (req, res) => {
    const code = String(req.params.code ?? '').toUpperCase();
    const row = await one<{ code: string; customerId: string; salonId: string; status: string }>(
      'SELECT code, customerId, salonId, status FROM referral_codes WHERE code = ?',
      code,
    );
    if (!row || row.status !== 'active') throw notFound('That referral link is no longer valid.');
    const referrer = await one<{ name: string }>('SELECT name FROM users WHERE id = ?', row.customerId);
    const salon = await one<{ name: string }>('SELECT name FROM salons WHERE id = ?', row.salonId);
    res.json({
      valid: true,
      code: row.code,
      referrerName: (referrer?.name ?? 'A friend').split(' ')[0],
      salonName: salon?.name ?? 'SalonPro',
      reward: 'You get \u20b950 in wallet credit after your first completed visit. Your friend gets \u20b950 too.',
    });
  }),
);

/** Public: a limited view of the customer flow that needs no login. */
catalogRouter.get(
  '/referral-info',
  handler(async (req, res) => {
    const token = String(req.query.token ?? '');
    const verified = token ? verifyAttributionToken(token) : null;
    res.json({ valid: Boolean(verified) });
  }),
);

catalogRouter.get(
  '/payment-status/:razorpayOrderId',
  handler(async (req, res) => {
    const order = await getOrderByRazorpayId(req.params.razorpayOrderId!);
    if (!order) throw notFound('Payment order not found.');
    res.json({ status: order.status, amountPaid: order.amountPaid, mode: order.mode });
  }),
);

catalogRouter.get(
  '/cities',
  handler(async (_req, res) => {
    res.json({ cities: ['Bengaluru'] });
  }),
);
