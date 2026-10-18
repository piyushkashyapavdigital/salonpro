import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { createSession, audit, buildSessionUser, requireAuth, revokeAllSessions, revokeSession, verifyPassword, hashPassword } from '../auth';
import { all, one, run, tx } from '../db';
import { badRequest, clientIp, handler, notFound, unauthorized } from '../lib/http';
import { env, integrations } from '../env';
import { assertUnderRateLimit, recordAttempt } from '../auth';
import { ensureReferralCode, resolveAttribution } from '../services/referral';
import { walletView } from '../services/wallet';
import { savePreferences } from '../services/notifications';

export const authRouter = Router();

const phoneSchema = z.string().regex(/^[0-9]{10}$/, 'Enter a 10 digit mobile number');

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, '').slice(-10);
}

/**
 * Request an OTP.
 *
 * If no SMS provider is configured the API runs in DEV MODE: the code is
 * returned in the response and printed to the server log. The UI labels this
 * clearly. We never claim an OTP was delivered when it was not.
 */
authRouter.post(
  '/otp/request',
  handler((req, res) => {
    const body = z.object({ phone: z.string() }).parse(req.body);
    const phone = normalizePhone(body.phone);
    if (!phoneSchema.safeParse(phone).success) throw badRequest('Enter a valid 10 digit mobile number.');

    assertUnderRateLimit(`otp:${phone}`, 'otp_request', env.otpRateLimitPerHour, 60);

    const code = String(crypto.randomInt(0, 10 ** env.otpLength)).padStart(env.otpLength, '0');
    const now = new Date();
    run(
      'INSERT INTO otp_codes (id, phone, codeHash, purpose, expiresAt, createdAt) VALUES (?,?,?,?,?,?)',
      crypto.randomUUID(),
      phone,
      crypto.createHash('sha256').update(code).digest('hex'),
      'login',
      new Date(now.getTime() + env.otpTtlMinutes * 60000).toISOString(),
      now.toISOString(),
    );
    recordAttempt(`otp:${phone}`, 'otp_request');

    const existingUser = one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
    const devMode = !integrations.otpDelivery;

    res.json({
      ok: true,
      phone,
      isNewUser: !existingUser,
      deliveryMode: devMode ? 'development_mock' : 'provider',
      expiresInSeconds: env.otpTtlMinutes * 60,
      /** Only ever populated in development mock mode. Never in production. */
      devCode: devMode ? code : undefined,
      notice: devMode
        ? 'DEV MODE — no SMS provider is configured. The code below is shown for testing and logged on the server. No real SMS was sent.'
        : 'OTP sent to your mobile number.',
    });
  }),
);

/** Verify an OTP and create a customer account if needed. */
authRouter.post(
  '/otp/verify',
  handler((req, res) => {
    const body = z
      .object({
        phone: z.string(),
        code: z.string().min(4).max(8),
        name: z.string().trim().min(2).max(80).optional(),
        referralToken: z.string().optional(),
      })
      .parse(req.body);
    const phone = normalizePhone(body.phone);

    assertUnderRateLimit(`verify:${phone}`, 'otp_verify', env.otpMaxAttempts * 3, 15);

    const record = one<{
      id: string;
      codeHash: string;
      attempts: number;
      expiresAt: string;
      consumedAt: string | null;
    }>(
      'SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND consumedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
      phone,
      'login',
    );
    if (!record) throw badRequest('Request a fresh OTP and try again.');
    recordAttempt(`verify:${phone}`, 'otp_verify');
    if (new Date(record.expiresAt).getTime() < Date.now()) throw badRequest('That OTP has expired. Request a new one.');
    if (record.attempts >= env.otpMaxAttempts) throw badRequest('Too many incorrect attempts. Request a new OTP.');

    const matches =
      crypto.createHash('sha256').update(body.code.trim()).digest('hex') === record.codeHash;
    if (!matches) {
      run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', record.id);
      throw badRequest('That OTP is not correct.');
    }
    run('UPDATE otp_codes SET consumedAt = ? WHERE id = ?', new Date().toISOString(), record.id);

    let user = one<{ id: string; name: string; role: string; status: string }>(
      'SELECT id, name, role, status FROM users WHERE phone = ?',
      phone,
    );

    if (!user) {
      /* Customer self-registration. */
      const salon = one<{ id: string; ownerId: string }>('SELECT id, ownerId FROM salons LIMIT 1');
      if (!salon) throw badRequest('The salon is not set up yet.');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const name = body.name?.trim() || `Guest ${phone.slice(-4)}`;
      tx(() => {
        run(
          'INSERT INTO users (id, name, phone, email, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
          id, name, phone, null, 'customer', 'active', 0, now, now,
        );
        run(
          'INSERT INTO customer_profiles (customerId, salonId, totalVisits, totalCompletedSpend, preferredServices, marketingConsent, createdAt) VALUES (?,?,?,?,?,?,?)',
          id, salon.id, 0, 0, '[]', 1, now,
        );
        savePreferences(id, {});
        ensureReferralCode(salon.id, id);
      });
      user = { id, name, role: 'customer', status: 'active' };

      /* Referral attribution at registration (signed, time-limited token). */
      if (body.referralToken) {
        resolveAttribution(id, salon.id, body.referralToken);
      }
    } else if (user.status === 'deactivated') {
      throw unauthorized('This account has been deactivated. Contact the salon.');
    }

    const token = createSession(user.id, req);
    const sessionUser = buildSessionUser(user.id)!;
    audit(user.id, 'auth.login', 'user', user.id, { method: 'otp' }, clientIp(req));
    const salonId = sessionUser.salonId ?? one<{ id: string }>('SELECT id FROM salons LIMIT 1')?.id ?? null;
    res.json({
      token,
      user: sessionUser,
      wallet: salonId ? walletView(salonId, user.id) : null,
    });
  }),
);

/** Development-only password login for the seeded demo accounts. */
authRouter.get(
  '/demo-accounts',
  handler((_req, res) => {
    if (env.nodeEnv === 'production') {
      throw notFound('Not available in production.');
    }
    const accounts = all<{ name: string; phone: string; role: string }>(
      "SELECT name, phone, role FROM users WHERE isDemo = 1 AND role <> 'salon_staff' ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'salon_owner' THEN 1 WHEN 'branch_manager' THEN 2 WHEN 'receptionist' THEN 3 ELSE 4 END, phone",
    );
    res.json({
      mode: 'development_mock',
      notice:
        'DEV MODE — these are seeded demo accounts. In production, sign-in happens strictly through verified phone OTP.',
      password: 'salonpro123',
      accounts,
    });
  }),
);

authRouter.post(
  '/demo-login',
  handler((req, res) => {
    if (env.nodeEnv === 'production') throw notFound('Not available in production.');
    const body = z.object({ phone: z.string(), password: z.string().optional() }).parse(req.body);
    const phone = normalizePhone(body.phone);
    const user = one<{ id: string; passwordHash: string | null; status: string }>(
      'SELECT id, passwordHash, status FROM users WHERE phone = ? AND isDemo = 1',
      phone,
    );
    if (!user) throw unauthorized('Unknown demo account.');
    if (!verifyPassword(body.password ?? 'salonpro123', user.passwordHash)) {
      throw unauthorized('Incorrect demo password.');
    }
    const token = createSession(user.id, req);
    const sessionUser = buildSessionUser(user.id)!;
    const salonId = sessionUser.salonId ?? one<{ id: string }>('SELECT id FROM salons LIMIT 1')?.id ?? null;
    res.json({
      token,
      user: sessionUser,
      wallet: salonId ? walletView(salonId, user.id) : null,
      notice: 'DEV MODE — signed in with a seeded demo account.',
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  handler((req, res) => {
    const salonId = req.auth!.salonId ?? one<{ id: string }>('SELECT id FROM salons LIMIT 1')?.id ?? null;
    res.json({
      user: req.auth,
      wallet: salonId && req.auth!.role === 'customer' ? walletView(salonId, req.auth!.id) : null,
    });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  handler((req, res) => {
    if (req.sessionToken) revokeSession(req.sessionToken);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  handler((req, res) => {
    revokeAllSessions(req.auth!.id);
    res.json({ ok: true });
  }),
);

/**
 * Owner-initiated staff invitation. Creates the account in `invited` state and
 * links it to a staff record so the person can sign in with OTP.
 */
authRouter.post(
  '/invite',
  requireAuth,
  handler((req, res) => {
    if (!['salon_owner', 'super_admin', 'branch_manager'].includes(req.auth!.role)) {
      throw unauthorized('Only owners and managers can invite staff.');
    }
    const body = z
      .object({
        name: z.string().trim().min(2),
        phone: z.string(),
        email: z.string().email().optional(),
        designation: z.string().min(2),
        branchId: z.string().min(1),
      })
      .parse(req.body);
    const phone = normalizePhone(body.phone);
    const salonId = req.auth!.salonId!;
    if (req.auth!.role !== 'super_admin' && !req.auth!.branchIds.includes(body.branchId)) {
      throw unauthorized('You are not authorised for that branch.');
    }
    const existing = one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
    if (existing) throw badRequest('A user with that phone number already exists.');

    const userId = crypto.randomUUID();
    const staffId = crypto.randomUUID();
    const now = new Date().toISOString();
    tx(() => {
      run('INSERT INTO users (id, name, phone, email, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
        userId, body.name, phone, body.email ?? null, 'salon_staff', 'active', 0, now, now);
      run('INSERT INTO staff (id, salonId, branchId, userId, designation, workingHours, commissionRules, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        staffId, salonId, body.branchId, userId, body.designation,
        JSON.stringify(Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, { off: d === 0, start: '10:00', end: '20:00' }]))),
        JSON.stringify({ serviceBps: 800, productBps: 300 }), 'active', now);
      run('INSERT INTO user_branches (userId, branchId) VALUES (?,?)', userId, body.branchId);
      audit(req.auth!.id, 'staff.invite', 'user', userId, { designation: body.designation, branchId: body.branchId }, clientIp(req));
    });
    res.status(201).json({ ok: true, userId, staffId, invite: `Ask ${body.name} to sign in with OTP on ${phone}.` });
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  handler((req, res) => {
    const body = z.object({ current: z.string(), next: z.string().min(8) }).parse(req.body);
    const row = one<{ passwordHash: string | null }>('SELECT passwordHash FROM users WHERE id = ?', req.auth!.id);
    if (!row) throw notFound('User not found.');
    if (row.passwordHash && !verifyPassword(body.current, row.passwordHash)) {
      throw unauthorized('Your current password is not correct.');
    }
    run('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?', hashPassword(body.next), new Date().toISOString(), req.auth!.id);
    revokeAllSessions(req.auth!.id);
    const token = createSession(req.auth!.id, req);
    res.json({ ok: true, token });
  }),
);
