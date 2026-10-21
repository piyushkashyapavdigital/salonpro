import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from './lib/router';
import type { Permission, Role, SessionUser } from '@salonpro/shared';
import { ADMIN_ROLES, hasPermission, permissionsForRole, workspaceForRole } from '@salonpro/shared';
import { all, one, run, tx } from './db';
import { clientIp, forbidden, HttpError, tooMany, unauthorized } from './lib/http';
import { env } from './env';

/* ------------------------------------------------------------------ */
/* Password hashing (scrypt)                                           */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== hash.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/* ------------------------------------------------------------------ */
/* Rate limiting (DB backed)                                           */
/* ------------------------------------------------------------------ */

export async function recordAttempt(key: string, kind: string) {
  await run('INSERT INTO auth_attempts (id, key, kind, createdAt) VALUES (?,?,?,?)', crypto.randomUUID(), key, kind, new Date().toISOString());
}

export async function assertUnderRateLimit(key: string, kind: string, max: number, windowMinutes: number) {
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const row = await one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND kind = ? AND createdAt >= ?',
    key,
    kind,
    since,
  );
  if ((row?.n ?? 0) >= max) {
    throw tooMany('Too many attempts. Please wait a few minutes and try again.');
  }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function createSession(userId: string, req?: Request): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 86400000).toISOString();
  await run(
    'INSERT INTO sessions (id, userId, tokenHash, expiresAt, userAgent, ip, createdAt) VALUES (?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    userId,
    sha256(token + env.sessionSecret),
    expiresAt,
    req?.headers['user-agent'] ?? null,
    req ? clientIp(req) : null,
    new Date().toISOString(),
  );
  return token;
}

export async function revokeSession(token: string) {
  await run('UPDATE sessions SET revokedAt = ? WHERE tokenHash = ?', new Date().toISOString(), sha256(token + env.sessionSecret));
}

export async function revokeAllSessions(userId: string) {
  await run('UPDATE sessions SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL', new Date().toISOString(), userId);
}

function staffRowFor(userId: string) {
  return one<{ id: string; salonId: string; branchId: string }>(
    'SELECT id, salonId, branchId FROM staff WHERE userId = ? AND status = ? LIMIT 1',
    userId,
    'active',
  );
}

export async function buildSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await one<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    role: Role;
    status: string;
  }>('SELECT id, name, phone, email, role, status FROM users WHERE id = ?', userId);
  if (!user || user.status === 'deactivated') return null;

  let salonId: string | null = null;
  const branchIds: string[] = [];

  if (user.role === 'super_admin') {
    /* A platform session is deliberately not scoped to a salon. The existing
     * salon endpoints still fall back to the first salon for compatibility, but
     * the platform console must never imply ownership of a tenant. */
    salonId = null;
  } else if (user.role === 'salon_owner') {
    const salon = await one<{ id: string }>('SELECT id FROM salons WHERE ownerId = ? LIMIT 1', userId);
    salonId = salon?.id ?? null;
    if (salonId) {
      for (const b of await all<{ id: string }>('SELECT id FROM branches WHERE salonId = ?', salonId)) {
        branchIds.push(b.id);
      }
    }
  } else if (user.role === 'customer') {
    const profile = await one<{ salonId: string | null }>(
      'SELECT salonId FROM customer_profiles WHERE customerId = ?',
      userId,
    );
    salonId =
      profile?.salonId ??
      (await one<{ id: string }>('SELECT id FROM salons LIMIT 1'))?.id ??
      null;
  } else {
    const staff = await staffRowFor(userId);
    if (staff) {
      salonId = staff.salonId;
      if (user.role === 'branch_manager' || user.role === 'receptionist') {
        const assigned = await all<{ branchId: string }>('SELECT branchId FROM user_branches WHERE userId = ?', userId);
        if (assigned.length) assigned.forEach((a) => branchIds.push(a.branchId));
        else branchIds.push(staff.branchId);
      } else {
        branchIds.push(staff.branchId);
      }
    } else {
      const assigned = await all<{ branchId: string; salonId: string }>(
        'SELECT ub.branchId, b.salonId FROM user_branches ub JOIN branches b ON b.id = ub.branchId WHERE ub.userId = ?',
        userId,
      );
      if (assigned.length) {
        salonId = assigned[0]!.salonId;
        assigned.forEach((a) => branchIds.push(a.branchId));
      }
    }
  }

  /* A suspended tenant is blocked at session resolution, not only in the UI.
   * Platform admins have no salon scope, so they can still reactivate it. */
  if (salonId && user.role !== 'super_admin') {
    const tenant = await one<{ status: string }>('SELECT status FROM salons WHERE id = ?', salonId);
    if (tenant?.status === 'suspended') return null;
  }

  const staff = await staffRowFor(userId);
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    salonId,
    branchIds,
    staffId: staff?.id ?? null,
    permissions: permissionsForRole(user.role),
    workspace: workspaceForRole(user.role),
  };
}

/* ------------------------------------------------------------------ */
/* Express middleware                                                  */
/* ------------------------------------------------------------------ */

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw unauthorized();

    const session = await one<{ userId: string; expiresAt: string; revokedAt: string | null }>(
      'SELECT userId, expiresAt, revokedAt FROM sessions WHERE tokenHash = ?',
      sha256(token + env.sessionSecret),
    );
    if (!session || session.revokedAt) throw unauthorized('Your session has ended. Please sign in again.');
    if (new Date(session.expiresAt).getTime() < Date.now()) throw unauthorized('Your session has expired.');

    const user = await buildSessionUser(session.userId);
    if (!user) throw unauthorized('This account is no longer active.');
    req.auth = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** Require the caller to hold one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}

/** Require an admin-side role. */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return next(unauthorized());
  if (!ADMIN_ROLES.includes(req.auth.role)) return next(forbidden('The owner dashboard is for salon staff.'));
  next();
};

/**
 * Capability helpers kept for the existing route modules. Each one is now a
 * named view over the single permission catalog, so the old admin API and the
 * new unified app can never disagree about what a role may do.
 */
export const can = {
  manageSalon: (r: Role) => hasPermission(r, 'salon.settings.manage'),
  manageBranches: (r: Role) => hasPermission(r, 'salon.branch.manage'),
  manageServices: (r: Role) => hasPermission(r, 'salon.service.manage'),
  manageStaff: (r: Role) => hasPermission(r, 'salon.staff.manage'),
  viewStaff: (r: Role) => hasPermission(r, 'salon.staff.read'),
  manageAppointments: (r: Role) => hasPermission(r, 'salon.appointment.manage'),
  completeService: (r: Role) => hasPermission(r, 'salon.appointment.complete'),
  adjustWallet: (r: Role) => hasPermission(r, 'salon.wallet.adjust'),
  processRefund: (r: Role) => hasPermission(r, 'salon.payment.refund'),
  viewReports: (r: Role) => hasPermission(r, 'salon.report.read'),
  viewCustomers: (r: Role) => hasPermission(r, 'salon.customer.read'),
  manageReferrals: (r: Role) => hasPermission(r, 'salon.referral.manage'),
  manageSettings: (r: Role) => hasPermission(r, 'salon.user.manage'),
  viewAudit: (r: Role) => hasPermission(r, 'salon.audit.read'),
  viewServices: (r: Role) => hasPermission(r, 'salon.service.read'),
  viewOffers: (r: Role) => hasPermission(r, 'salon.offer.read'),
  viewReminders: (r: Role) => hasPermission(r, 'salon.reminder.read'),
  viewReferrals: (r: Role) => hasPermission(r, 'salon.referral.read'),
};

/** Throw unless the caller holds an exact permission. */
export function requirePermission(permission: Permission, message?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!req.auth.permissions.includes(permission)) {
      return next(forbidden(message ?? `Your role does not include ${permission}.`));
    }
    next();
  };
}

/** Throw unless the caller's role satisfies the given capability. */
export function requireCapability(fn: (role: Role) => boolean, message?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!fn(req.auth.role)) return next(forbidden(message));
    next();
  };
}

/** Assert a branch is inside the caller's authorised scope. */
export function assertBranchAccess(auth: SessionUser, branchId: string) {
  if (auth.role === 'super_admin') return;
  /* Customers are scoped by *ownership* of the appointment (checked by the
   * caller), not by branch membership — they have no branch assignments. */
  if (auth.role === 'customer') return;
  if (auth.branchIds.includes(branchId)) return;
  throw new HttpError(403, 'forbidden', 'You are not authorised for that branch.');
}

/** The salon a caller may operate on. */
export async function scopedSalonId(auth: SessionUser, requested?: string | null): Promise<string> {
  if (auth.role === 'super_admin') {
    if (requested) return requested;
    if (auth.salonId) return auth.salonId;
    const anySalon = await one<{ id: string }>('SELECT id FROM salons LIMIT 1');
    if (!anySalon) throw new HttpError(400, 'no_salon', 'No salon exists yet.');
    return anySalon.id;
  }
  if (!auth.salonId) throw forbidden('Your account is not linked to a salon.');
  return auth.salonId;
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  meta?: Record<string, unknown>,
  ip?: string,
) {
  await run(
    'INSERT INTO audit_logs (id, actorId, action, entityType, entityId, meta, ip, timestamp) VALUES (?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    actorId,
    action,
    entityType,
    entityId,
    meta ? JSON.stringify(meta) : null,
    ip ?? null,
    new Date().toISOString(),
  );
}

export const auditInTx = audit;

export { tx, sha256 };
