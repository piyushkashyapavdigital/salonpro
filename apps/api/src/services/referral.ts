import crypto from 'node:crypto';
import type { Referral, ReferralDashboard, ReferralStatus, RewardStatus } from '@salonpro/shared';
import { all, one, run, scalar, tx } from '../db';
import { conflict } from '../lib/http';
import { env } from '../env';
import { DbRow } from '../lib/types';
import { readSettings } from './settings';
import { creditBonus } from './wallet';
import { notifyCustomer } from './notifications';
import { audit } from '../auth';

/* ------------------------------------------------------------------ */
/* Codes & attribution tokens                                          */
/* ------------------------------------------------------------------ */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 6) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export async function ensureReferralCode(salonId: string, customerId: string) {
  const existing = await one<DbRow>('SELECT * FROM referral_codes WHERE customerId = ? AND salonId = ?', customerId, salonId);
  if (existing) return existing;
  const user = await one<{ name: string }>('SELECT name FROM users WHERE id = ?', customerId);
  const prefix = (user?.name ?? 'SALON').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'SALON';
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = `${prefix}${randomCode(4)}`;
    const clash = await one<{ id: string }>('SELECT id FROM referral_codes WHERE code = ?', code);
    if (!clash) {
      const id = crypto.randomUUID();
      await run(
        'INSERT INTO referral_codes (id, salonId, customerId, code, status, createdAt) VALUES (?,?,?,?,?,?)',
        id,
        salonId,
        customerId,
        code,
        'active',
        new Date().toISOString(),
      );
      return (await one<DbRow>('SELECT * FROM referral_codes WHERE id = ?', id))!;
    }
  }
  throw conflict('Could not allocate a referral code. Please try again.');
}

/**
 * A time-limited, signed attribution token. The referrer's code is never taken
 * from editable front-end state alone — the token is signed server-side.
 */
export function createAttributionToken(code: string, ttlDays = 30) {
  const expires = Date.now() + ttlDays * 86400000;
  const payload = `${code}.${expires}`;
  const sig = crypto.createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

export function verifyAttributionToken(token: string): { code: string; expires: number } | null {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const expected = crypto.createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');
    if (expected.length !== sig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    const [code, expiresRaw] = payload.split('.');
    const expires = Number(expiresRaw);
    if (!code || !Number.isFinite(expires) || expires < Date.now()) return null;
    return { code, expires };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Attribution                                                         */
/* ------------------------------------------------------------------ */

/**
 * Link a new customer to the code they arrived with. Records a `registered`
 * referral only — rewards stay pending until a qualifying paid visit.
 * A referral is only valid for a genuinely new customer of the salon.
 */
export function resolveAttribution(customerId: string, salonId: string, token: string | null) {
  if (!token) return Promise.resolve(null);
  const verified = verifyAttributionToken(token);
  if (!verified) return Promise.resolve(null);

  return tx(async () => {
    const codeRow = await one<DbRow>('SELECT * FROM referral_codes WHERE code = ?', verified.code);
    if (!codeRow || codeRow.status !== 'active') return null;
    const referrerId = codeRow.customerId as string;
    if (referrerId === customerId) return null; // no self-referral

    const alreadyReferred = await one<DbRow>('SELECT * FROM referrals WHERE referredCustomerId = ?', customerId);
    if (alreadyReferred) return alreadyReferred;

    // Abuse check: the referred customer must be new to the salon — no completed
    // visit before attribution.
    const priorVisits = await scalar<number>(
      'SELECT COUNT(*) FROM service_records WHERE customerId = ? AND salonId = ?',
      customerId,
      salonId,
    );
    if (priorVisits > 0) return null;

    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId))?.settings,
    );

    const id = crypto.randomUUID();
    await run(
      `INSERT INTO referrals
        (id, salonId, referrerId, referredCustomerId, referralCode, status,
         referrerRewardStatus, refereeRewardStatus, referrerRewardAmount, refereeRewardAmount, attributionToken, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      salonId,
      referrerId,
      customerId,
      verified.code,
      'registered',
      'pending',
      'pending',
      settings.referral.referrerReward,
      settings.referral.refereeReward,
      token,
      new Date().toISOString(),
    );
    await run('UPDATE customer_profiles SET referredByCode = ?, referralToken = ? WHERE customerId = ?', verified.code, token, customerId);
    return (await one<DbRow>('SELECT * FROM referrals WHERE id = ?', id))!;
  });
}

/* ------------------------------------------------------------------ */
/* Qualification                                                       */
/* ------------------------------------------------------------------ */

function monthlyRewardCount(customerId: string): Promise<number> {
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  return scalar<number>(
    `SELECT COUNT(*) FROM reward_transactions
      WHERE customerId = ? AND type <> 'reversal' AND status = 'credited' AND createdAt >= ?`,
    customerId,
    since.toISOString(),
  );
}

async function creditReward(args: {
  customerId: string;
  salonId: string;
  referralId: string;
  amount: number;
  type: 'referrer' | 'referee';
}): Promise<{ status: RewardStatus; walletTransactionId: string | null }> {
  const idempotencyKey = `referral_${args.referralId}_${args.type}`;
  const existing = await one<DbRow>('SELECT * FROM reward_transactions WHERE idempotencyKey = ?', idempotencyKey);
  if (existing) {
    return { status: existing.status as RewardStatus, walletTransactionId: existing.walletTransactionId };
  }

  const settings = readSettings(
    (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', args.salonId))?.settings,
  );
  if ((await monthlyRewardCount(args.customerId)) >= settings.referral.maxRewardsPerMonth) {
    await run(
      'INSERT INTO reward_transactions (id, customerId, referralId, amount, type, status, idempotencyKey, createdAt) VALUES (?,?,?,?,?,?,?,?)',
      crypto.randomUUID(),
      args.customerId,
      args.referralId,
      args.amount,
      args.type,
      'rejected',
      idempotencyKey,
      new Date().toISOString(),
    );
    return { status: 'rejected', walletTransactionId: null };
  }

  const walletRow = await one<DbRow>('SELECT * FROM wallets WHERE salonId = ? AND customerId = ?', args.salonId, args.customerId);
  let walletId = walletRow?.id;
  if (!walletId) {
    walletId = crypto.randomUUID();
    await run(
      'INSERT INTO wallets (id, salonId, customerId, status, createdAt) VALUES (?,?,?,?,?)',
      walletId,
      args.salonId,
      args.customerId,
      'active',
      new Date().toISOString(),
    );
  }

  const entry = await creditBonus({
    walletId,
    customerId: args.customerId,
    salonId: args.salonId,
    amount: args.amount,
    type: 'referral_bonus',
    idempotencyKey,
    referenceId: args.referralId,
    reason: args.type === 'referrer' ? 'Referral reward — you referred a friend' : 'Referral reward — welcome bonus',
  });

  await run(
    'INSERT INTO reward_transactions (id, customerId, referralId, amount, type, status, walletTransactionId, idempotencyKey, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    args.customerId,
    args.referralId,
    args.amount,
    args.type,
    'credited',
    entry.id,
    idempotencyKey,
    new Date().toISOString(),
  );

  return { status: 'credited', walletTransactionId: entry.id };
}

/**
 * Called when a service is completed. Credits ₹50 + ₹50 exactly once, after the
 * referred customer's **first completed and paid** visit.
 */
export function qualifyForAppointment(appointmentId: string) {
  return tx(async () => {
    const appt = await one<DbRow>('SELECT * FROM appointments WHERE id = ?', appointmentId);
    if (!appt) return null;
    if (appt.status !== 'completed' || appt.paymentStatus !== 'paid' || appt.totalAmount <= 0) return null;

    const referral = await one<DbRow>(
      `SELECT * FROM referrals
        WHERE salonId = ? AND (referredCustomerId = ? OR referredCustomerId IS NULL)
        ORDER BY createdAt DESC LIMIT 1`,
      appt.salonId,
      appt.customerId,
    );
    if (!referral) return null;
    if (!referral.referredCustomerId) {
      await run('UPDATE referrals SET referredCustomerId = ?, status = ? WHERE id = ?', appt.customerId, 'registered', referral.id);
      referral.referredCustomerId = appt.customerId;
    }
    if (referral.status === 'rewarded' || referral.status === 'reversed') return referral;
    if (referral.referrerId === appt.customerId) return null; // self-referral guard

    const settings = readSettings(
      (await one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', appt.salonId))?.settings,
    );
    if (settings.referral.requireFirstPaidVisit) {
      const completedCount = await scalar<number>(
        'SELECT COUNT(*) FROM service_records WHERE customerId = ? AND salonId = ?',
        appt.customerId,
        appt.salonId,
      );
      if (completedCount !== 1) {
        // Not the first qualifying visit: keep it registered, do not reward.
        return referral;
      }
    }

    const now = new Date().toISOString();
    const referrerCredit = await creditReward({
      customerId: referral.referrerId,
      salonId: appt.salonId,
      referralId: referral.id,
      amount: referral.referrerRewardAmount || settings.referral.referrerReward,
      type: 'referrer',
    });
    const refereeCredit = await creditReward({
      customerId: appt.customerId,
      salonId: appt.salonId,
      referralId: referral.id,
      amount: referral.refereeRewardAmount || settings.referral.refereeReward,
      type: 'referee',
    });

    const status: ReferralStatus =
      referrerCredit.status === 'credited' && refereeCredit.status === 'credited'
        ? 'rewarded'
        : 'qualified';

    await run(
      `UPDATE referrals
          SET status = ?, qualifyingAppointmentId = ?, qualifiedAt = ?,
              referrerRewardStatus = ?, refereeRewardStatus = ?
        WHERE id = ?`,
      status,
      appointmentId,
      now,
      referrerCredit.status,
      refereeCredit.status,
      referral.id,
    );

    for (const [customerId, credit, kind] of [
      [referral.referrerId, referrerCredit, 'referrer'],
      [appt.customerId, refereeCredit, 'referee'],
    ] as const) {
      if (credit.status === 'credited') {
        await notifyCustomer({
          salonId: appt.salonId,
          customerId: customerId as string,
          template: 'referral_reward',
          stage: 'transactional',
          reminderKey: `referral_reward_${referral.id}_${kind}`,
          vars: {
            reward_amount: `\u20b9${((referral.referrerRewardAmount || settings.referral.referrerReward) / 100).toFixed(0)}`,
          },
        });
      }
    }

    await audit(referral.referrerId, 'referral.rewarded', 'referral', referral.id, {
      appointmentId,
      referrer: referrerCredit.status,
      referee: refereeCredit.status,
    });

    return await one<DbRow>('SELECT * FROM referrals WHERE id = ?', referral.id);
  });
}

/** Undo rewards with audited compensating entries if the qualifying visit is refunded. */
export function reverseRewards(referralId: string, reason: string, actorId: string) {
  return tx(async () => {
    const rewards = await all<DbRow>(
      "SELECT * FROM reward_transactions WHERE referralId = ? AND type <> 'reversal' AND status = 'credited'",
      referralId,
    );
    let index = 0;
    for (const reward of rewards) {
      const entry = reward.walletTransactionId
        ? await one<DbRow>('SELECT * FROM wallet_transactions WHERE id = ?', reward.walletTransactionId)
        : null;
      if (entry) {
        const walletRow = await one<DbRow>('SELECT * FROM wallets WHERE id = ?', entry.walletId);
        if (walletRow) {
          await creditBonus({
            walletId: entry.walletId,
            customerId: reward.customerId,
            salonId: walletRow.salonId,
            amount: -Math.abs(reward.amount),
            type: 'reversal',
            idempotencyKey: `referral_reversal_${referralId}_${reward.customerId}_${index++}`,
            referenceId: referralId,
            reason,
          });
        }
      }
      await run("UPDATE reward_transactions SET status = 'reversed' WHERE id = ?", reward.id);
    }
    await run("UPDATE referrals SET status = 'reversed', referrerRewardStatus = 'reversed', refereeRewardStatus = 'reversed' WHERE id = ?", referralId);
    await audit(actorId, 'referral.reversed', 'referral', referralId, { reason });
  });
}

export async function reverseIfQualifyingCancelled(appointmentId: string) {
  const referral = await one<DbRow>(
    "SELECT * FROM referrals WHERE qualifyingAppointmentId = ? AND status IN ('rewarded','qualified')",
    appointmentId,
  );
  if (!referral) return;
  await reverseRewards(referral.id, 'Qualifying appointment was cancelled or refunded', referral.referrerId);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function toReferral(row: DbRow): Promise<Referral> {
  const referrer = await one<{ name: string }>('SELECT name FROM users WHERE id = ?', row.referrerId);
  const referred = row.referredCustomerId
    ? await one<{ name: string }>('SELECT name FROM users WHERE id = ?', row.referredCustomerId)
    : null;
  return {
    id: row.id,
    salonId: row.salonId,
    referrerId: row.referrerId,
    referrerName: referrer?.name,
    referredCustomerId: row.referredCustomerId,
    referredCustomerName: referred?.name ?? null,
    referralCode: row.referralCode,
    status: row.status,
    qualifyingAppointmentId: row.qualifyingAppointmentId,
    referrerRewardStatus: row.referrerRewardStatus,
    refereeRewardStatus: row.refereeRewardStatus,
    createdAt: row.createdAt,
    qualifiedAt: row.qualifiedAt,
  };
}

export async function dashboard(customerId: string, salonId: string): Promise<ReferralDashboard> {
  const codeRow = await ensureReferralCode(salonId, customerId);
  const rows = await all<DbRow>('SELECT * FROM referrals WHERE referrerId = ? ORDER BY createdAt DESC', customerId);
  const referrals: Referral[] = [];
  for (const row of rows) referrals.push(await toReferral(row));
  const earned = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM reward_transactions WHERE customerId = ? AND status = 'credited' AND type <> 'reversal'`,
    customerId,
  );
  const pending = await scalar<number>(
    `SELECT COALESCE(SUM(amount),0) FROM reward_transactions WHERE customerId = ? AND status = 'pending'`,
    customerId,
  );

  const leaderboard = (
    await all<DbRow>(
      `SELECT r.referrerId AS customerId, u.name AS name,
              SUM(CASE WHEN r.status = 'rewarded' THEN 1 ELSE 0 END) AS qualified,
              COALESCE((SELECT SUM(rt.amount) FROM reward_transactions rt
                         WHERE rt.customerId = r.referrerId AND rt.status = 'credited' AND rt.type = 'referrer'), 0) AS earned
         FROM referrals r JOIN users u ON u.id = r.referrerId
        WHERE r.salonId = ?
        GROUP BY r.referrerId, u.name
        ORDER BY qualified DESC, earned DESC LIMIT 10`,
      salonId,
    )
  ).map((r) => ({ customerId: r.customerId, name: r.name, qualified: r.qualified, earned: r.earned }));

  return {
    code: codeRow.code,
    link: `${env.webOrigin}/join/${codeRow.code}`,
    totalInvitations: referrals.length,
    registered: referrals.filter((r) => r.status !== 'pending_attribution').length,
    qualified: referrals.filter((r) => r.status === 'rewarded' || r.status === 'qualified').length,
    pendingRewards: pending,
    creditedRewards: earned,
    currency: 'INR',
    referrals,
    leaderboard,
  };
}

/** Salon-wide referral analytics for the owner dashboard. */
export async function salonReferralStats(salonId: string) {
  const totals = {
    total: await scalar<number>('SELECT COUNT(*) FROM referrals WHERE salonId = ?', salonId),
    registered: await scalar<number>("SELECT COUNT(*) FROM referrals WHERE salonId = ? AND status <> 'pending_attribution'", salonId),
    qualified: await scalar<number>("SELECT COUNT(*) FROM referrals WHERE salonId = ? AND status IN ('qualified','rewarded')", salonId),
    rewarded: await scalar<number>("SELECT COUNT(*) FROM referrals WHERE salonId = ? AND status = 'rewarded'", salonId),
    reversed: await scalar<number>("SELECT COUNT(*) FROM referrals WHERE salonId = ? AND status = 'reversed'", salonId),
    rewardExpense: await scalar<number>(
      `SELECT COALESCE(SUM(amount),0) FROM reward_transactions rt
        JOIN referrals r ON r.id = rt.referralId
       WHERE r.salonId = ? AND rt.status = 'credited' AND rt.type <> 'reversal'`,
      salonId,
    ),
  };
  const topReferrers = await all<DbRow>(
    `SELECT r.referrerId AS customerId, u.name,
            SUM(CASE WHEN r.status IN ('qualified','rewarded') THEN 1 ELSE 0 END) AS qualified,
            COUNT(*) AS invited
       FROM referrals r JOIN users u ON u.id = r.referrerId
      WHERE r.salonId = ? GROUP BY r.referrerId, u.name ORDER BY qualified DESC, invited DESC LIMIT 10`,
    salonId,
  );
  const recent: Referral[] = [];
  for (const row of await all<DbRow>('SELECT * FROM referrals WHERE salonId = ? ORDER BY createdAt DESC LIMIT 50', salonId)) {
    recent.push(await toReferral(row));
  }
  return { ...totals, topReferrers, recent };
}
