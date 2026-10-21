import crypto from 'node:crypto';
import { Router } from '../lib/router';
import { z } from 'zod';
import { audit, requireAuth, requirePermission } from '../auth';
import { all, one, parseJson, run, scalar, tx } from '../db';
import { badRequest, clientIp, conflict, handler, notFound } from '../lib/http';
import { fullWeekHours, readSettings } from '../services/settings';
import { isoDate } from '@salonpro/shared';

/**
 * Platform console API.
 *
 * This is the only router whose scope is the whole installation rather than a
 * single salon. Every route is guarded by an explicit platform permission; the
 * tenant id is never taken from the caller for a write.
 */
export const platformRouter = new Router();

platformRouter.use(requireAuth);

const planSchema = z.enum(['trial', 'growth', 'pro']);
const statusSchema = z.enum(['active', 'suspended']);

const salonCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(4).max(200),
  contact: z.string().trim().max(40).nullable().optional(),
  ownerName: z.string().trim().min(2).max(80),
  ownerPhone: z.string().trim().min(10).max(20),
  branchName: z.string().trim().min(2).max(80).optional(),
  plan: planSchema.default('trial'),
});

const salonUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().min(4).max(200).optional(),
  contact: z.string().trim().max(40).nullable().optional(),
  status: statusSchema.optional(),
  plan: planSchema.optional(),
});

/** Standard recharge offers, copied from the salon bootstrap defaults. */
const STANDARD_OFFERS = [
  { pay: 50_000, bonus: 5_000, label: 'Starter' },
  { pay: 100_000, bonus: 15_000, label: 'Popular' },
  { pay: 200_000, bonus: 40_000, label: 'Best value' },
];

const SALON_LIST_SELECT = `
  SELECT s.id, s.name, s.address, s.contact, s.timezone, s.currency, s.settings,
         s.status, s.plan, s.trialEndsAt, s.createdAt, s.updatedAt,
         u.id AS "ownerId", u.name AS "ownerName", u.phone AS "ownerPhone",
         u.email AS "ownerEmail", u.status AS "ownerStatus",
         CAST((SELECT COUNT(*) FROM branches b WHERE b.salonId = s.id) AS INTEGER) AS "branchCount",
         CAST((SELECT COUNT(*) FROM staff st WHERE st.salonId = s.id AND st.status = 'active') AS INTEGER) AS "staffCount",
         CAST((SELECT COUNT(*) FROM customer_profiles cp WHERE cp.salonId = s.id) AS INTEGER) AS "customerCount",
         CAST((SELECT COUNT(*) FROM appointments a WHERE a.salonId = s.id) AS INTEGER) AS "appointmentCount",
         CAST((SELECT COALESCE(SUM(sr.finalAmount), 0) FROM service_records sr WHERE sr.salonId = s.id) AS INTEGER) AS "completedValue"
    FROM salons s
    LEFT JOIN users u ON u.id = s.ownerId`;

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, '').slice(-10);
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function mapSalon(row: Record<string, any>, includeSettings = false) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contact: row.contact ?? null,
    timezone: row.timezone,
    currency: row.currency,
    status: row.status,
    plan: row.plan,
    trialEndsAt: row.trialEndsAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
    owner: row.ownerId
      ? {
          id: row.ownerId,
          name: row.ownerName,
          phone: row.ownerPhone,
          email: row.ownerEmail ?? null,
          status: row.ownerStatus,
        }
      : null,
    branchCount: numberValue(row.branchCount),
    staffCount: numberValue(row.staffCount),
    customerCount: numberValue(row.customerCount),
    appointmentCount: numberValue(row.appointmentCount),
    completedValue: numberValue(row.completedValue),
    ...(includeSettings ? { settings: readSettings(row.settings) } : {}),
  };
}

async function salonDetail(id: string) {
  const row = await one<Record<string, any>>(
    `${SALON_LIST_SELECT} WHERE s.id = ?`,
    id,
  );
  if (!row) return null;
  const branches = await all<Record<string, any>>(
    `SELECT id, name, address, contact, status, createdAt
       FROM branches WHERE salonId = ? ORDER BY createdAt ASC`,
    id,
  );
  const recentAudit = await all<Record<string, any>>(
    `SELECT a.id, a.actorId, a.action, a.entityType, a.entityId, a.meta, a.timestamp,
            u.name AS "actorName", u.role AS "actorRole"
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actorId
      WHERE (a.entityType = 'salon' AND a.entityId = ?)
         OR a.actorId IN (SELECT id FROM users WHERE id = ?)
      ORDER BY a.timestamp DESC LIMIT 25`,
    id,
    row.ownerId ?? '',
  );
  return {
    salon: mapSalon(row, true),
    branches,
    recentAudit: recentAudit.map((entry) => ({ ...entry, meta: parseJson(entry.meta, null) })),
  };
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

platformRouter.get(
  '/overview',
  requirePermission('platform.metrics.read'),
  handler(async (_req, res) => {
    const today = isoDate();
    const salons = await scalar<number>('SELECT COUNT(*) FROM salons');
    const activeSalons = await scalar<number>("SELECT COUNT(*) FROM salons WHERE status = 'active'");
    const suspendedSalons = await scalar<number>("SELECT COUNT(*) FROM salons WHERE status = 'suspended'");
    const vendors = await scalar<number>("SELECT COUNT(*) FROM users WHERE role = 'salon_owner'");
    const clients = await scalar<number>("SELECT COUNT(*) FROM users WHERE role = 'customer'");
    const appointments = await scalar<number>('SELECT COUNT(*) FROM appointments');
    const todayAppointments = await scalar<number>('SELECT COUNT(*) FROM appointments WHERE date = ?', today);
    const completedValue = await scalar<number>('SELECT COALESCE(SUM(finalAmount), 0) FROM service_records');
    const recentSalons = await all<Record<string, any>>(`${SALON_LIST_SELECT} ORDER BY s.createdAt DESC LIMIT 5`);
    const recentAudit = await all<Record<string, any>>(
      `SELECT a.id, a.actorId, a.action, a.entityType, a.entityId, a.meta, a.timestamp,
              u.name AS "actorName", u.role AS "actorRole"
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actorId
        ORDER BY a.timestamp DESC LIMIT 8`,
    );

    res.json({
      metrics: {
        salons: numberValue(salons),
        activeSalons: numberValue(activeSalons),
        suspendedSalons: numberValue(suspendedSalons),
        vendors: numberValue(vendors),
        clients: numberValue(clients),
        appointments: numberValue(appointments),
        todayAppointments: numberValue(todayAppointments),
        completedValue: numberValue(completedValue),
      },
      recentSalons: recentSalons.map((row) => mapSalon(row)),
      recentAudit: recentAudit.map((entry) => ({ ...entry, meta: parseJson(entry.meta, null) })),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Salons                                                              */
/* ------------------------------------------------------------------ */

platformRouter.get(
  '/salons',
  requirePermission('platform.salon.read'),
  handler(async (req, res) => {
    const params: (string | number)[] = [];
    const where: string[] = [];
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status === 'active' || status === 'suspended') {
      where.push('s.status = ?');
      params.push(status);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      where.push('(s.name ILIKE ? OR u.name ILIKE ? OR u.phone LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const sql = `${SALON_LIST_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY s.createdAt DESC`;
    const rows = await all<Record<string, any>>(sql, ...params);
    res.json({ salons: rows.map((row) => mapSalon(row)) });
  }),
);

platformRouter.post(
  '/salons',
  requirePermission('platform.salon.manage'),
  handler(async (req, res) => {
    const body = salonCreateSchema.parse(req.body);
    const ownerPhone = normalizePhone(body.ownerPhone);
    if (ownerPhone.length !== 10) throw badRequest('Enter a valid 10 digit owner mobile number.');

    const existing = await one<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE phone = ?',
      ownerPhone,
    );
    if (existing) {
      throw conflict(
        existing.role === 'salon_owner'
          ? 'That mobile number already belongs to a salon owner.'
          : 'That mobile number already belongs to another account. Use a different number for the owner.',
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const ownerId = crypto.randomUUID();
    const salonId = crypto.randomUUID();
    const branchId = crypto.randomUUID();
    const trialEndsAt = new Date(now.getTime() + 14 * 86_400_000).toISOString();

    await tx(async () => {
      await run(
        'INSERT INTO users (id, name, phone, email, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
        ownerId,
        body.ownerName,
        ownerPhone,
        null,
        'salon_owner',
        'invited',
        0,
        nowIso,
        nowIso,
      );
      await run(
        `INSERT INTO salons
           (id, name, address, contact, timezone, currency, ownerId, settings,
            status, plan, trialEndsAt, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        salonId,
        body.name,
        body.address,
        body.contact ?? null,
        'Asia/Kolkata',
        'INR',
        ownerId,
        JSON.stringify(readSettings(null)),
        'active',
        body.plan,
        trialEndsAt,
        nowIso,
        nowIso,
      );
      await run(
        `INSERT INTO branches
           (id, salonId, name, address, contact, timezone, openingHours, status, createdAt)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        branchId,
        salonId,
        body.branchName ?? `${body.name} — Main branch`,
        body.address,
        body.contact ?? null,
        'Asia/Kolkata',
        JSON.stringify(fullWeekHours('09:00', '21:00', [])),
        'active',
        nowIso,
      );
      await run(
        'INSERT INTO user_branches (userId, branchId) VALUES (?,?) ON CONFLICT DO NOTHING',
        ownerId,
        branchId,
      );
      for (const [index, offer] of STANDARD_OFFERS.entries()) {
        await run(
          'INSERT INTO recharge_offers (id, salonId, payAmount, bonusAmount, label, active, sortOrder) VALUES (?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          salonId,
          offer.pay,
          offer.bonus,
          offer.label,
          1,
          index,
        );
      }
      await audit(
        req.auth!.id,
        'platform.salon.create',
        'salon',
        salonId,
        { ownerId, ownerPhone, plan: body.plan },
        clientIp(req),
      );
    });

    const detail = await salonDetail(salonId);
    res.status(201).json(detail);
  }),
);

platformRouter.get(
  '/salons/:id',
  requirePermission('platform.salon.read'),
  handler(async (req, res) => {
    const detail = await salonDetail(req.params.id!);
    if (!detail) throw notFound('Salon not found.');
    res.json(detail);
  }),
);

platformRouter.patch(
  '/salons/:id',
  requirePermission('platform.salon.manage'),
  handler(async (req, res) => {
    const id = req.params.id!;
    const existing = await one<Record<string, any>>('SELECT * FROM salons WHERE id = ?', id);
    if (!existing) throw notFound('Salon not found.');

    const body = salonUpdateSchema.parse(req.body);
    const updates: string[] = [];
    const params: (string | null)[] = [];
    if (body.name !== undefined) {
      updates.push('name = ?');
      params.push(body.name);
    }
    if (body.address !== undefined) {
      updates.push('address = ?');
      params.push(body.address);
    }
    if (body.contact !== undefined) {
      updates.push('contact = ?');
      params.push(body.contact);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      params.push(body.status);
    }
    if (body.plan !== undefined) {
      updates.push('plan = ?');
      params.push(body.plan);
    }

    if (updates.length) {
      const nowIso = new Date().toISOString();
      updates.push('updatedAt = ?');
      params.push(nowIso);
      params.push(id);
      await run(`UPDATE salons SET ${updates.join(', ')} WHERE id = ?`, ...params);
      await audit(
        req.auth!.id,
        'platform.salon.update',
        'salon',
        id,
        { changes: body },
        clientIp(req),
      );
    }

    const detail = await salonDetail(id);
    res.json(detail);
  }),
);

/* ------------------------------------------------------------------ */
/* Vendors                                                             */
/* ------------------------------------------------------------------ */

platformRouter.get(
  '/vendors',
  requirePermission('platform.vendor.read'),
  handler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const params: string[] = [];
    let where = "WHERE u.role = 'salon_owner'";
    if (q) {
      where += ' AND (u.name ILIKE ? OR u.phone LIKE ? OR s.name ILIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const rows = await all<Record<string, any>>(
      `SELECT u.id, u.name, u.phone, u.email, u.status AS "userStatus", u.createdAt,
              s.id AS "salonId", s.name AS "salonName", s.status AS "salonStatus", s.plan,
              CAST((SELECT COUNT(*) FROM staff st WHERE st.salonId = s.id AND st.status = 'active') AS INTEGER) AS "staffCount",
              CAST((SELECT COUNT(*) FROM customer_profiles cp WHERE cp.salonId = s.id) AS INTEGER) AS "customerCount"
         FROM users u
         LEFT JOIN salons s ON s.ownerId = u.id
         ${where}
        ORDER BY u.createdAt DESC`,
      ...params,
    );
    res.json({
      vendors: rows.map((row) => ({
        ...row,
        staffCount: numberValue(row.staffCount),
        customerCount: numberValue(row.customerCount),
      })),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

platformRouter.get(
  '/audit',
  requirePermission('platform.audit.read'),
  handler(async (req, res) => {
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
    const params: (string | number)[] = [];
    let where = '';
    if (entityType) {
      where = 'WHERE a.entityType = ?';
      params.push(entityType);
    }
    params.push(limit);
    const rows = await all<Record<string, any>>(
      `SELECT a.id, a.actorId, a.action, a.entityType, a.entityId, a.meta, a.ip, a.timestamp,
              u.name AS "actorName", u.role AS "actorRole"
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actorId
         ${where}
        ORDER BY a.timestamp DESC LIMIT ?`,
      ...params,
    );
    res.json({
      audit: rows.map((entry) => ({ ...entry, meta: parseJson(entry.meta, null) })),
    });
  }),
);
