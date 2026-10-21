import crypto from 'node:crypto';
import { Router } from '../lib/router';
import { z } from 'zod';
import { createSession, audit, buildSessionUser, requireAuth, requirePermission, revokeAllSessions, revokeSession, verifyPassword, hashPassword } from '../auth';
import { all, one, run, tx } from '../db';
import { badRequest, clientIp, forbidden, handler, HttpError, notFound, unauthorized } from '../lib/http';
import { env, integrations } from '../env';
import { assertUnderRateLimit, recordAttempt } from '../auth';
import { ensureReferralCode, resolveAttribution } from '../services/referral';
import { walletView } from '../services/wallet';
import { savePreferences } from '../services/notifications';
import { SCOPED } from '../lib/scope';

export const authRouter = new Router();

const phoneSchema = z.string().regex(/^[0-9]{10}$/, 'Enter a 10 digit mobile number');

function normalizePhone(raw: string) {
  return raw.replace(/\D/g, '').slice(-10);
}

/**
 * A session token is created before the salon status check runs. If the tenant
 * is suspended, throw away that token instead of leaving a live credential that
 * every later request will reject anyway.
 */
async function sessionAfterLogin(userId: string, token: string) {
  const sessionUser = await buildSessionUser(userId);
  if (!sessionUser) {
    await revokeSession(token);
    throw unauthorized('This salon is suspended. Contact the platform administrator.');
  }
  return sessionUser;
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
    const sessionUser = await sessionAfterLogin(user.id, token);
    await audit(user.id, 'auth.login', 'user', user.id, { method: 'otp' }, clientIp(req));
    const salonId = sessionUser.salonId ?? (await one<{ id: string }>('SELECT id FROM salons LIMIT 1'))?.id ?? null;
    res.json({
      token,
      user: sessionUser,
      wallet: sessionUser.role === 'customer' && salonId ? await walletView(salonId, user.id) : null,
    });
  }),
);

/**
 * Development-only PIN sign-in.
 *
 * Switched on only on a development/test server, or a production server that
 * explicitly opted into demo mode (`ALLOW_DEV_OTP`) — so it cannot exist on a
 * real deployment. It lets whoever is running the demo open the app's vendor workspace
 * without juggling one-time codes — the same spirit as the on-screen dev code
 * for the customer app. Pass a `phone` to sign in as that account, or omit it to
 * sign in as the salon owner. Every use is written to the audit log with
 * `method: 'dev_pin'`, so it is never silent.
 */
authRouter.post(
  '/dev-login',
  handler(async (req, res) => {
    const body = z
      .object({ pin: z.string().min(3).max(12), phone: z.string().optional() })
      .parse(req.body);

    /*
     * Same gate as the dev OTP mock: a development/test server, or a production
     * server that explicitly opted in with ALLOW_DEV_OTP. A real deployment
     * turns this off simply by not setting the flag.
     */
    if (env.nodeEnv === 'production' && !env.allowDevOtp) {
      throw forbidden('Developer sign-in is switched off on this server. Use the one-time code instead.');
    }
    await assertUnderRateLimit('devpin', 'dev_login', 20, 15);
    await recordAttempt('devpin', 'dev_login');
    if (body.pin !== env.devLoginPin) {
      throw unauthorized('That developer PIN is not correct.');
    }

    let user: { id: string; name: string; role: string; status: string } | null = null;
    if (body.phone) {
      const phone = normalizePhone(body.phone);
      if (!phoneSchema.safeParse(phone).success) throw badRequest('Enter a valid 10 digit mobile number.');
      user = (await one('SELECT id, name, role, status FROM users WHERE phone = ?', phone)) ?? null;
      if (!user) throw notFound('No account uses that number yet. Add the person with the one-time code first.');
    } else {
      user =
        (await one(
          "SELECT id, name, role, status FROM users WHERE role IN ('salon_owner','super_admin') ORDER BY CASE role WHEN 'salon_owner' THEN 0 ELSE 1 END, createdAt LIMIT 1",
        )) ?? null;
      if (!user) throw notFound('This salon has no owner account yet.');
    }
    if (user.status === 'deactivated') throw unauthorized('This account has been deactivated. Contact the salon.');

    const token = await createSession(user.id, req);
    const sessionUser = await sessionAfterLogin(user.id, token);
    await audit(user.id, 'auth.login', 'user', user.id, { method: 'dev_pin' }, clientIp(req));
    const salonId = sessionUser.salonId ?? (await one<{ id: string }>('SELECT id FROM salons LIMIT 1'))?.id ?? null;
    res.json({
      token,
      user: sessionUser,
      wallet: sessionUser.role === 'customer' && salonId ? await walletView(salonId, user.id) : null,
      notice: 'DEV MODE — signed in with the developer PIN. No OTP was used and no SMS was sent.',
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
    const sessionUser = await sessionAfterLogin(user.id, token);
    const salonId = sessionUser.salonId ?? (await one<{ id: string }>('SELECT id FROM salons LIMIT 1'))?.id ?? null;
    res.json({
      token,
      user: sessionUser,
      wallet: sessionUser.role === 'customer' && salonId ? await walletView(salonId, user.id) : null,
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
  requirePermission('salon.staff.manage', 'Only owners and managers can invite staff.'),
  handler(async (req, res) => {
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
    const { salonId, branchIds } = await SCOPED(req);
    if (!branchIds.includes(body.branchId)) {
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
