import crypto from 'node:crypto';
import type {
  Appointment,
  AppointmentService,
  AppointmentStatus,
  BookingSource,
  Coupon,
  PaymentMethod,
  PaymentStatus,
  SalonSettings,
} from '@salonpro/shared';
import { minutesToTime, timeToMinutes } from '@salonpro/shared';
import { all, one, parseJson, run, scalar, tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import { assertBranchAccess, audit } from '../auth';
import type { SessionUser } from '@salonpro/shared';
import { isFree, pickAvailableStaff } from './availability';
import { DbRow } from '../lib/types';
import { readSettings } from './settings';
import * as walletService from './wallet';
import * as referralService from './referral';

/* ------------------------------------------------------------------ */
/* Services & pricing                                                  */
/* ------------------------------------------------------------------ */

export function serviceRows(salonId: string, ids: string[]): Promise<DbRow[]> {
  if (!ids.length) return Promise.resolve([]);
  const placeholders = ids.map(() => '?').join(',');
  return all<DbRow>(
    `SELECT * FROM services WHERE salonId = ? AND id IN (${placeholders})`,
    salonId,
    ...ids,
  );
}

export async function resolveServices(salonId: string, branchId: string, serviceIds: string[]): Promise<AppointmentService[]> {
  if (!serviceIds.length) throw badRequest('Select at least one service.');
  const rows = await serviceRows(salonId, serviceIds);
  if (rows.length !== new Set(serviceIds).size) throw badRequest('One or more services could not be found.');
  const resolved: AppointmentService[] = [];
  for (const id of serviceIds) {
    const row = rows.find((r) => r.id === id)!;
    if (!row.active) throw badRequest(`"${row.name}" is no longer available.`);
    const override = await one<{ price: number | null; active: number }>(
      'SELECT price, active FROM branch_services WHERE branchId = ? AND serviceId = ?',
      branchId,
      id,
    );
    if (override && !override.active) throw badRequest(`"${row.name}" is not offered at this branch.`);
    resolved.push({
      serviceId: row.id,
      name: row.name,
      price: override?.price ?? row.price,
      durationMinutes: row.durationMinutes,
    });
  }
  return resolved;
}

export function totalDuration(services: AppointmentService[]) {
  return services.reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function subtotalOf(services: AppointmentService[]) {
  return services.reduce((sum, s) => sum + s.price, 0);
}

/* ------------------------------------------------------------------ */
/* Coupons                                                             */
/* ------------------------------------------------------------------ */

export function couponDiscount(coupon: DbRow, amount: number): number {
  if (amount < coupon.minAmount) return 0;
  let discount =
    coupon.type === 'percent' ? Math.round((amount * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return Math.max(0, Math.min(discount, amount));
}

export async function findCoupon(salonId: string, code: string): Promise<{ coupon: DbRow; discount: number } | null> {
  const coupon = await one<DbRow>(
    'SELECT * FROM coupons WHERE salonId = ? AND UPPER(code) = UPPER(?) AND active = 1',
    salonId,
    code,
  );
  return coupon ? { coupon, discount: 0 } : null;
}

export async function validateCoupon(salonId: string, code: string, amount: number) {
  const found = await findCoupon(salonId, code);
  if (!found) throw notFound('That coupon code is not valid.');
  const { coupon } = found;
  const now = new Date().toISOString();
  if (coupon.startAt > now) throw badRequest('This coupon is not active yet.');
  if (coupon.endAt < now) throw badRequest('This coupon has expired.');
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw conflict('This coupon has reached its usage limit.');
  }
  const discount = couponDiscount(coupon, amount);
  if (discount <= 0) throw badRequest(`This coupon needs a minimum order of \u20b9${coupon.minAmount / 100}.`);
  return { coupon, discount };
}

export function toCoupon(row: DbRow): Coupon {
  return {
    id: row.id,
    salonId: row.salonId,
    code: row.code,
    type: row.type,
    value: row.value,
    minAmount: row.minAmount,
    maxDiscount: row.maxDiscount,
    startAt: row.startAt,
    endAt: row.endAt,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    active: !!row.active,
    description: row.description,
  };
}

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export interface CreateBookingArgs {
  auth: SessionUser;
  salonId: string;
  branchId: string;
  customerId: string;
  staffId?: string | null;
  serviceIds: string[];
  date: string;
  startTime: string;
  bookingSource: BookingSource;
  couponCode?: string | null;
  notes?: string | null;
  paymentPreference: 'wallet' | 'online' | 'pay_at_salon';
  referralToken?: string | null;
  idempotencyKey?: string | null;
}

export function createBooking(args: CreateBookingArgs): Promise<{ appointment: Appointment; walletDebit: number }> {
  return tx(async () => {
    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', args.salonId))?.settings,
    );

    /* Idempotent replay: identical key returns the same appointment. */
    if (args.idempotencyKey) {
      const existing = await one<DbRow>('SELECT * FROM appointments WHERE idempotencyKey = ?', args.idempotencyKey);
      if (existing) {
        return { appointment: await hydrateAppointment(existing), walletDebit: existing.paidAmount };
      }
    }

    const branch = await one<DbRow>('SELECT * FROM branches WHERE id = ? AND salonId = ?', args.branchId, args.salonId);
    if (!branch) throw notFound('Branch not found.');
    if (branch.status !== 'active') throw badRequest('That branch is not accepting bookings.');

    const services = await resolveServices(args.salonId, args.branchId, args.serviceIds);
    const duration = totalDuration(services);
    const start = timeToMinutes(args.startTime);
    const end = start + duration;

    /* ---- concurrency-safe conflict check (inside the transaction) ---- */
    const staffId = await pickAvailableStaff(args.branchId, args.date, start, end, args.staffId ?? null);
    if (!staffId) {
      throw conflict('That time slot was just taken. Please choose another slot.', {
        code: 'slot_unavailable',
      });
    }

    const subtotal = subtotalOf(services);
    let discount = 0;
    let coupon: DbRow | null = null;
    if (args.couponCode) {
      const validated = await validateCoupon(args.salonId, args.couponCode, subtotal);
      coupon = validated.coupon;
      discount = validated.discount;
    }
    const total = Math.max(0, subtotal - discount);

    /* ---- referral attribution ---- */
    let referralId: string | null = null;
    const referredBy = await referralService.resolveAttribution(args.customerId, args.salonId, args.referralToken ?? null);
    if (referredBy) referralId = referredBy.id;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO appointments
        (id, salonId, branchId, customerId, staffId, servicesJson, date, startTime, endTime, durationMinutes,
         status, bookingSource, referralId, couponCode, subtotal, discount, totalAmount, paidAmount,
         paymentStatus, paymentMethod, notes, createdBy, idempotencyKey, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      args.salonId,
      args.branchId,
      args.customerId,
      staffId,
      JSON.stringify(services),
      args.date,
      args.startTime,
      minutesToTime(end),
      duration,
      'booked',
      args.bookingSource,
      referralId,
      coupon?.code ?? null,
      subtotal,
      discount,
      total,
      0,
      'unpaid',
      null,
      args.notes ?? null,
      args.auth.id,
      args.idempotencyKey ?? null,
      now,
      now,
    );

    if (coupon) {
      await run('UPDATE coupons SET usedCount = usedCount + 1 WHERE id = ?', coupon.id);
      await run(
        'INSERT INTO coupon_redemptions (id, couponId, customerId, appointmentId, amount, createdAt) VALUES (?,?,?,?,?,?)',
        crypto.randomUUID(),
        coupon.id,
        args.customerId,
        id,
        discount,
        now,
      );
    }

    /* ---- wallet payment at booking (optional) ---- */
    let walletDebit = 0;
    if (args.paymentPreference === 'wallet' && total > 0) {
      const w = await walletService.getOrCreateWallet(args.salonId, args.customerId);
      const b = await walletService.balances(w.id);
      if (b.total < total) {
        throw conflict('Insufficient wallet balance for this booking.', {
          required: total,
          available: b.total,
        });
      }
      await walletService.debit({
        walletId: w.id,
        customerId: args.customerId,
        salonId: args.salonId,
        amount: total,
        settings,
        idempotencyKey: `appt_pay_${id}`,
        referenceId: id,
        reason: 'Appointment prepayment',
        type: 'spend',
      });
      walletDebit = total;
      await run(
        "UPDATE appointments SET paidAmount = ?, paymentStatus = 'paid', paymentMethod = 'wallet' WHERE id = ?",
        total,
        id,
      );
    }

    await audit(args.auth.id, 'appointment.create', 'appointment', id, {
      branchId: args.branchId,
      customerId: args.customerId,
      staffId,
      total,
      source: args.bookingSource,
    });

    const created = (await one<DbRow>('SELECT * FROM appointments WHERE id = ?', id))!;
    return { appointment: await hydrateAppointment(created), walletDebit };
  });
}

export async function hydrateAppointment(row: DbRow): Promise<Appointment> {
  const customer = await one<{ name: string; phone: string }>(
    'SELECT name, phone FROM users WHERE id = ?',
    row.customerId,
  );
  const staff = row.staffId
    ? await one<{ name: string; designation: string }>(
        'SELECT u.name, s.designation FROM staff s JOIN users u ON u.id = s.userId WHERE s.id = ?',
        row.staffId,
      )
    : null;
  return {
    id: row.id,
    salonId: row.salonId,
    branchId: row.branchId,
    customerId: row.customerId,
    customerName: customer?.name ?? 'Customer',
    customerPhone: customer?.phone ?? '',
    staffId: row.staffId,
    staffName: staff?.name ?? null,
    services: parseJson<AppointmentService[]>(row.servicesJson, []),
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    durationMinutes: row.durationMinutes,
    status: row.status,
    bookingSource: row.bookingSource,
    referralId: row.referralId,
    couponCode: row.couponCode,
    subtotal: row.subtotal,
    discount: row.discount,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    serviceRecords: [],
  };
}

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function assertTransition(from: AppointmentStatus, to: AppointmentStatus) {
  if (from === to) return;
  if (!TRANSITIONS[from]?.includes(to)) {
    throw conflict(`An appointment that is "${from.replace('_', ' ')}" cannot be moved to "${to.replace('_', ' ')}".`);
  }
}

export interface StatusChangeArgs {
  auth: SessionUser;
  appointmentId: string;
  status: AppointmentStatus;
  reason?: string;
  paymentMethod?: PaymentMethod;
}

/**
 * Status changes. Completing an appointment writes the service record,
 * stamps the customer profile and triggers referral qualification — all inside
 * one transaction so a partial completion is impossible.
 */
export function changeStatus(args: StatusChangeArgs): Promise<Appointment> {
  return tx(async () => {
    const appt = await one<DbRow>('SELECT * FROM appointments WHERE id = ?', args.appointmentId);
    if (!appt) throw notFound('Appointment not found.');
    assertBranchAccess(args.auth, appt.branchId);
    assertTransition(appt.status as AppointmentStatus, args.status);

    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', appt.salonId))?.settings,
    );
    const now = new Date().toISOString();

    if (args.status === 'completed') {
      const services = parseJson<AppointmentService[]>(appt.servicesJson, []);
      const method: PaymentMethod = args.paymentMethod ?? appt.paymentMethod ?? 'pay_at_salon';
      const due = appt.totalAmount - appt.paidAmount;
      let walletAmount = appt.paymentMethod === 'wallet' ? appt.paidAmount : 0;
      let cashAmount = 0;
      let onlineAmount = appt.paymentMethod === 'online' ? appt.paidAmount : 0;

      if (due > 0 && method === 'wallet') {
        const w = await walletService.getOrCreateWallet(appt.salonId, appt.customerId);
        await walletService.debit({
          walletId: w.id,
          customerId: appt.customerId,
          salonId: appt.salonId,
          amount: due,
          settings,
          idempotencyKey: `appt_settle_${appt.id}`,
          referenceId: appt.id,
          reason: 'Service payment at completion',
          type: 'spend',
        });
        walletAmount += due;
      } else if (due > 0 && (method === 'cash' || method === 'pay_at_salon')) {
        cashAmount = due;
      } else if (due > 0) {
        onlineAmount = due;
      }

      const paidAmount = appt.totalAmount;

      await run(
        `INSERT INTO service_records
           (id, appointmentId, customerId, staffId, salonId, branchId, servicesJson, grossAmount, discount,
            finalAmount, paymentMethod, walletAmount, onlineAmount, cashAmount, completedAt, createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(appointmentId) DO NOTHING`,
        crypto.randomUUID(),
        appt.id,
        appt.customerId,
        appt.staffId,
        appt.salonId,
        appt.branchId,
        appt.servicesJson,
        appt.subtotal,
        appt.discount,
        appt.totalAmount,
        method,
        walletAmount,
        onlineAmount,
        cashAmount,
        now,
        now,
      );

      const existingProfile = await one<DbRow>(
        'SELECT * FROM customer_profiles WHERE customerId = ?',
        appt.customerId,
      );
      const preferred = new Set<string>(
        parseJson<string[]>(existingProfile?.preferredServices, []),
      );
      services.forEach((s) => preferred.add(s.serviceId));

      if (existingProfile) {
        await run(
          `UPDATE customer_profiles
              SET lastVisitAt = ?, totalVisits = totalVisits + 1,
                  totalCompletedSpend = totalCompletedSpend + ?, preferredServices = ?
            WHERE customerId = ?`,
          now,
          appt.totalAmount,
          JSON.stringify([...preferred]),
          appt.customerId,
        );
      } else {
        await run(
          `INSERT INTO customer_profiles (customerId, salonId, lastVisitAt, totalVisits, totalCompletedSpend, preferredServices, marketingConsent, createdAt)
           VALUES (?,?,?,?,?,?,?,?)`,
          appt.customerId,
          appt.salonId,
          now,
          1,
          appt.totalAmount,
          JSON.stringify([...preferred]),
          1,
          now,
        );
      }

      if (settings.loyaltyEnabled) {
        const points = Math.floor((appt.totalAmount / 10000) * settings.loyaltyPointsPerHundred);
        if (points > 0) {
          const acc = await one<DbRow>('SELECT * FROM loyalty_accounts WHERE customerId = ?', appt.customerId);
          if (acc) {
            await run(
              'UPDATE loyalty_accounts SET points = points + ?, lifetimePoints = lifetimePoints + ?, updatedAt = ? WHERE customerId = ?',
              points,
              points,
              now,
              appt.customerId,
            );
          } else {
            await run(
              'INSERT INTO loyalty_accounts (customerId, points, lifetimePoints, updatedAt) VALUES (?,?,?,?)',
              appt.customerId,
              points,
              points,
              now,
            );
          }
          await run(
            'INSERT INTO loyalty_transactions (id, customerId, points, reason, referenceId, createdAt) VALUES (?,?,?,?,?,?)',
            crypto.randomUUID(),
            appt.customerId,
            points,
            'Service completed',
            appt.id,
            now,
          );
        }
      }

      await run(
        "UPDATE appointments SET status = 'completed', paidAmount = ?, paymentStatus = 'paid', paymentMethod = ?, updatedAt = ? WHERE id = ?",
        paidAmount,
        method,
        now,
        appt.id,
      );

      /* Referral qualification happens only on a completed, paid first visit. */
      await referralService.qualifyForAppointment(appt.id);
      await audit(args.auth.id, 'appointment.complete', 'appointment', appt.id, {
        finalAmount: appt.totalAmount,
        method,
      });
    } else {
      await run(
        'UPDATE appointments SET status = ?, cancelledReason = COALESCE(?, cancelledReason), updatedAt = ? WHERE id = ?',
        args.status,
        args.reason ?? null,
        now,
        appt.id,
      );

      if (args.status === 'cancelled' || args.status === 'no_show') {
        /* Release prepaid wallet funds back to the customer (append-only refund rows). */
        if (appt.paidAmount > 0 && appt.paymentMethod === 'wallet') {
          const spent = await all<DbRow>(
            "SELECT * FROM wallet_transactions WHERE referenceId = ? AND type = 'spend' AND status = 'posted'",
            appt.id,
          );
          let i = 0;
          for (const entry of spent) {
            await walletService.postEntry({
              walletId: entry.walletId,
              customerId: entry.customerId,
              salonId: entry.salonId,
              type: 'refund',
              amount: Math.abs(entry.amount),
              balanceType: entry.balanceType,
              idempotencyKey: `refund_${appt.id}_${i++}`,
              referenceId: appt.id,
              reason: 'Wallet refund for cancelled appointment',
              actorId: args.auth.id,
            });
          }
          await run(
            "UPDATE appointments SET paidAmount = 0, paymentStatus = 'refunded' WHERE id = ?",
            appt.id,
          );
        }
        await referralService.reverseIfQualifyingCancelled(appt.id);
      }
      await audit(args.auth.id, `appointment.${args.status}`, 'appointment', appt.id, {
        reason: args.reason ?? null,
      });
    }

    return await hydrateAppointment((await one<DbRow>('SELECT * FROM appointments WHERE id = ?', appt.id))!);
  });
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface AppointmentQuery {
  salonId: string;
  branchIds?: string[];
  from?: string;
  to?: string;
  date?: string;
  status?: AppointmentStatus;
  customerId?: string;
  staffId?: string;
  limit?: number;
}

export async function listAppointments(q: AppointmentQuery): Promise<Appointment[]> {
  const clauses = ['a.salonId = ?'];
  const params: (string | number)[] = [q.salonId];
  if (q.branchIds && q.branchIds.length) {
    clauses.push(`a.branchId IN (${q.branchIds.map(() => '?').join(',')})`);
    params.push(...q.branchIds);
  }
  if (q.date) {
    clauses.push('a.date = ?');
    params.push(q.date);
  }
  if (q.from) {
    clauses.push('a.date >= ?');
    params.push(q.from);
  }
  if (q.to) {
    clauses.push('a.date <= ?');
    params.push(q.to);
  }
  if (q.status) {
    clauses.push('a.status = ?');
    params.push(q.status);
  }
  if (q.customerId) {
    clauses.push('a.customerId = ?');
    params.push(q.customerId);
  }
  if (q.staffId) {
    clauses.push('a.staffId = ?');
    params.push(q.staffId);
  }
  params.push(q.limit ?? 200);
  const rows = await all<DbRow>(
    `SELECT a.* FROM appointments a WHERE ${clauses.join(' AND ')}
      ORDER BY a.date DESC, a.startTime DESC LIMIT ?`,
    ...params,
  );
  const out: Appointment[] = [];
  for (const row of rows) out.push(await hydrateAppointment(row));
  return out;
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const row = await one<DbRow>('SELECT * FROM appointments WHERE id = ?', id);
  if (!row) return null;
  const appt = await hydrateAppointment(row);
  const records = await all<DbRow>('SELECT * FROM service_records WHERE appointmentId = ?', id);
  appt.serviceRecords = records.map((r) => ({
    id: r.id,
    appointmentId: r.appointmentId,
    customerId: r.customerId,
    staffId: r.staffId,
    services: parseJson<AppointmentService[]>(r.servicesJson, []),
    grossAmount: r.grossAmount,
    discount: r.discount,
    finalAmount: r.finalAmount,
    paymentMethod: r.paymentMethod,
    walletAmount: r.walletAmount,
    onlineAmount: r.onlineAmount,
    cashAmount: r.cashAmount,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
  return appt;
}

export async function upcomingForCustomer(customerId: string): Promise<Appointment[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await all<DbRow>(
    `SELECT * FROM appointments
      WHERE customerId = ? AND date >= ? AND status IN ('booked','confirmed','checked_in','in_progress')
      ORDER BY date ASC, startTime ASC LIMIT 5`,
    customerId,
    today,
  );
  const out: Appointment[] = [];
  for (const row of rows) out.push(await hydrateAppointment(row));
  return out;
}

export function countUpcoming(customerId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  return scalar<number>(
    `SELECT COUNT(*) FROM appointments
      WHERE customerId = ? AND date >= ? AND status IN ('booked','confirmed','checked_in','in_progress')`,
    customerId,
    today,
  );
}
