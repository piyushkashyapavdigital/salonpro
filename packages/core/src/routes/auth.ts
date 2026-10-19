import crypto from 'node:crypto';
import { Router } from '../lib/router';
import { z } from 'zod';
import { createSession, audit, buildSessionUser, requireAuth, revokeAllSessions, revokeSession, verifyPassword, hashPassword } from '../auth';
import { all, one, run, tx } from '../db';
import { badRequest, clientIp, forbidden, handler, HttpError, notFound, unauthorized } from '../lib/http';
import { env, integrations } from '../env';
import { assertUnderRateLimit, recordAttempt } from '../auth';
import { ensureReferralCode, resolveAttribution } from '../services/referral';
import { walletView } from '../services/wallet';
import { savePreferences } from '../services/notifications';

export const authRouter = new Router();

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
  handler(async (req, res) => {
    const body = z.object({ phone: z.string() }).parse(req.body);
    const phone = normalizePhone(body.phone);
    if (!phoneSchema.safeParse(phone).success) throw badRequest('Enter a valid 10 digit mobile number.');

    await assertUnderRateLimit(`otp:${phone}`, 'otp_request', env.otpRateLimitPerHour, 60);

    /*
     * Truth rule: never claim an SMS went out when no provider is configured.
     * In production, an unconfigured provider is an error, not a fake success.
     */
    if (!integrations.otpDelivery && env.nodeEnv === 'production' && !env.allowDevOtp) {
      throw new HttpError(
        503,
        'otp_unavailable',
        'SMS delivery is not configured on this server, so an OTP cannot be sent. Configure an SMS provider first.',
      );
    }
    /* Dev mode is either a development server (the default) or a hosted demo
     * that opted in with ALLOW_DEV_OTP=true. Either way the response says the
     * code was not delivered by SMS — see the notice below. */
    const devMode = !integrations.otpDelivery;

    const code = String(crypto.randomInt(0, 10 ** env.otpLength)).padStart(env.otpLength, '0');
    const now = new Date();
    await run(
      'INSERT INTO otp_codes (id, phone, codeHash, purpose, expiresAt, createdAt) VALUES (?,?,?,?,?,?)',
      crypto.randomUUID(),
      phone,
      crypto.createHash('sha256').update(code).digest('hex'),
      'login',
      new Date(now.getTime() + env.otpTtlMinutes * 60000).toISOString(),
      now.toISOString(),
    );
    await recordAttempt(`otp:${phone}`, 'otp_request');

    const existingUser = await one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);

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
  handler(async (req, res) => {
    const body = z
      .object({
        phone: z.string(),
        code: z.string().min(4).max(8),
        name: z.string().trim().min(2).max(80).optional(),
        referralToken: z.string().optional(),
      })
      .parse(req.body);
    const phone = normalizePhone(body.phone);

    await assertUnderRateLimit(`verify:${phone}`, 'otp_verify', env.otpMaxAttempts * 3, 15);

    const record = await one<{
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
    await recordAttempt(`verify:${phone}`, 'otp_verify');
    if (new Date(record.expiresAt).getTime() < Date.now()) throw badRequest('That OTP has expired. Request a new one.');
    if (record.attempts >= env.otpMaxAttempts) throw badRequest('Too many incorrect attempts. Request a new OTP.');

    const matches =
      crypto.createHash('sha256').update(body.code.trim()).digest('hex') === record.codeHash;
    if (!matches) {
      await run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', record.id);
      throw badRequest('That OTP is not correct.');
    }
    await run('UPDATE otp_codes SET consumedAt = ? WHERE id = ?', new Date().toISOString(), record.id);

    let user = await one<{ id: string; name: string; role: string; status: string }>(
      'SELECT id, name, role, status FROM users WHERE phone = ?',
      phone,
    );

    if (!user) {
      /* Customer self-registration. */
      const salon = await one<{ id: string; ownerId: string }>('SELECT id, ownerId FROM salons LIMIT 1');
      if (!salon) throw badRequest('The salon is not set up yet.');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const name = body.name?.trim() || `Guest ${phone.slice(-4)}`;
      await tx(async () => {
        await run(
          'INSERT INTO users (id, name, phone, email, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
          id, name, phone, null, 'customer', 'active', 0, now, now,
        );
        await run(
          'INSERT INTO customer_profiles (customerId, salonId, totalVisits, totalCompletedSpend, preferredServices, marketingConsent, createdAt) VALUES (?,?,?,?,?,?,?)',
          id, salon.id, 0, 0, '[]', 1, now,
        );
        await savePreferences(id, {});
        await ensureReferralCode(salon.id, id);
      });
      user = { id, name, role: 'customer', status: 'active' };

      /* Referral attribution at registration (signed, time-limited token). */
      if (body.referralToken) {
        await resolveAttribution(id, salon.id, body.referralToken);
      }
    } else if (user.status === 'deactivated') {
      throw unauthorized('This account has been deactivated. Contact the salon.');
    }

    const token = await createSession(user.id, req);
    const sessionUser = (await buildSessionUser(user.id))!;
    await audit(user.id, 'auth.login', 'user', user.id, { method: 'otp' }, clientIp(req));
    const salonId = sessionUser.salonId ?? (await one<{ id: string }>('SELECT id FROM salons LIMIT 1'))?.id ?? null;
    res.json({
      token,
      user: sessionUser,
      wallet: salonId ? await walletView(salonId, user.id) : null,
    });
  }),
);

/** Development-only password login for the seeded demo accounts. */
authRouter.get(
  '/demo-accounts',
  handler(async (_req, res) => {
    if (env.nodeEnv === 'production') {
      throw notFound('Not available in production.');
    }
    const accounts = await all<{ name: string; phone: string; role: string }>(
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
  handler(async (req, res) => {
    if (env.nodeEnv === 'production') throw notFound('Not available in production.');
    const body = z.object({ phone: z.string(), password: z.string().optional() }).parse(req.body);
    const phone = normalizePhone(body.phone);
    const user = await one<{ id: string; passwordHash: string | null; status: string }>(
      'SELECT id, passwordHash, status FROM users WHERE phone = ? AND isDemo = 1',
      phone,
    );
    if (!user) throw unauthorized('Unknown demo account.');
    if (!verifyPassword(body.password ?? 'salonpro123', user.passwordHash)) {
      throw unauthorized('Incorrect demo password.');
    }
    const token = await createSession(user.id, req);
    const sessionUser = (await buildSessionUser(user.id))!;
    const salonId = sessionUser.salonId ?? (await one<{ id: string }>('SELECT id FROM salons LIMIT 1'))?.id ?? null;
    res.json({
      token,
      user: sessionUser,
      wallet: salonId ? await walletView(salonId, user.id) : null,
      notice: 'DEV MODE — signed in with a seeded demo account.',
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const salonId = req.auth!.salonId ?? (await one<{ id: string }>('SELECT id FROM salons LIMIT 1'))?.id ?? null;
    res.json({
      user: req.auth,
      wallet: salonId && req.auth!.role === 'customer' ? await walletView(salonId, req.auth!.id) : null,
    });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  handler(async (req, res) => {
    if (req.sessionToken) await revokeSession(req.sessionToken);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  handler(async (req, res) => {
    await revokeAllSessions(req.auth!.id);
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
  handler(async (req, res) => {
    if (!['salon_owner', 'super_admin', 'branch_manager'].includes(req.auth!.role)) {
      /* 403, not 401: the caller is signed in, they just may not do this. A 401
       * makes the client sign them out, which is the wrong reaction. */
      throw forbidden('Only owners and managers can invite staff.');
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
      throw forbidden('You are not authorised for that branch.');
    }
    const existing = await one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
    if (existing) throw badRequest('A user with that phone number already exists.');

    const userId = crypto.randomUUID();
    const staffId = crypto.randomUUID();
    const now = new Date().toISOString();
    await tx(async () => {
      await run('INSERT INTO users (id, name, phone, email, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
        userId, body.name, phone, body.email ?? null, 'salon_staff', 'active', 0, now, now);
      await run('INSERT INTO staff (id, salonId, branchId, userId, designation, workingHours, commissionRules, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        staffId, salonId, body.branchId, userId, body.designation,
        JSON.stringify(Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, { off: d === 0, start: '10:00', end: '20:00' }]))),
        JSON.stringify({ serviceBps: 800, productBps: 300 }), 'active', now);
      await run('INSERT INTO user_branches (userId, branchId) VALUES (?,?)', userId, body.branchId);
      await audit(req.auth!.id, 'staff.invite', 'user', userId, { designation: body.designation, branchId: body.branchId }, clientIp(req));
    });
    res.status(201).json({ ok: true, userId, staffId, invite: `Ask ${body.name} to sign in with OTP on ${phone}.` });
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  handler(async (req, res) => {
    const body = z.object({ current: z.string(), next: z.string().min(8) }).parse(req.body);
    const row = await one<{ passwordHash: string | null }>('SELECT passwordHash FROM users WHERE id = ?', req.auth!.id);
    if (!row) throw notFound('User not found.');
    if (row.passwordHash && !verifyPassword(body.current, row.passwordHash)) {
      throw unauthorized('Your current password is not correct.');
    }
    await run('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?', hashPassword(body.next), new Date().toISOString(), req.auth!.id);
    await revokeAllSessions(req.auth!.id);
    const token = await createSession(req.auth!.id, req);
    res.json({ ok: true, token });
  }),
);
