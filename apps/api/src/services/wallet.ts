import crypto from 'node:crypto';
import type { BalanceType, Wallet, WalletTransaction, WalletTransactionType } from '@salonpro/shared';
import { all, one, run, tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import type { SalonSettings } from '@salonpro/shared';

/**
 * Wallet ledger.
 *
 * The ledger is **append-only**. Balances are never stored as a mutable number
 * that code can assign to; they are always derived from the sum of posted
 * ledger rows. Corrections happen through compensating entries, never edits.
 */

export interface LedgerRow {
  id: string;
  walletId: string;
  customerId: string;
  salonId: string;
  type: WalletTransactionType;
  amount: number;
  balanceType: BalanceType;
  paymentId: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  status: string;
  reason: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface Balances {
  cash: number;
  bonus: number;
  total: number;
}

export function getOrCreateWallet(salonId: string, customerId: string) {
  const existing = one<{ id: string; status: string; createdAt: string }>(
    'SELECT id, status, createdAt FROM wallets WHERE salonId = ? AND customerId = ?',
    salonId,
    customerId,
  );
  if (existing) return existing;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  run(
    'INSERT INTO wallets (id, salonId, customerId, status, createdAt) VALUES (?,?,?,?,?)',
    id,
    salonId,
    customerId,
    'active',
    createdAt,
  );
  return { id, status: 'active', createdAt };
}

/** Balances are always derived from the ledger. */
export function balances(walletId: string): Balances {
  const rows = all<{ balanceType: BalanceType; total: number }>(
    `SELECT balanceType, COALESCE(SUM(amount), 0) AS total
       FROM wallet_transactions
      WHERE walletId = ? AND status = 'posted'
      GROUP BY balanceType`,
    walletId,
  );
  const cash = rows.find((r) => r.balanceType === 'cash')?.total ?? 0;
  const bonus = rows.find((r) => r.balanceType === 'bonus')?.total ?? 0;
  return { cash, bonus, total: cash + bonus };
}

export function walletView(salonId: string, customerId: string): Wallet {
  const w = getOrCreateWallet(salonId, customerId);
  const b = balances(w.id);
  return {
    id: w.id,
    salonId,
    customerId,
    status: w.status as 'active' | 'frozen',
    cashBalance: b.cash,
    bonusBalance: b.bonus,
    totalBalance: b.total,
    createdAt: w.createdAt,
  };
}

export function ledger(walletId: string, limit = 200): LedgerRow[] {
  return all<LedgerRow>(
    'SELECT * FROM wallet_transactions WHERE walletId = ? ORDER BY createdAt DESC, rowid DESC LIMIT ?',
    walletId,
    limit,
  );
}

export function transactionByIdempotencyKey(key: string): LedgerRow | undefined {
  return one<LedgerRow>('SELECT * FROM wallet_transactions WHERE idempotencyKey = ?', key);
}

interface PostArgs {
  walletId: string;
  customerId: string;
  salonId: string;
  type: WalletTransactionType;
  amount: number;
  balanceType: BalanceType;
  idempotencyKey: string;
  paymentId?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  actorId?: string | null;
}

/**
 * Post a single ledger entry. Idempotent on `idempotencyKey`: replaying the same
 * key returns the original row and never double-credits.
 */
export function postEntry(args: PostArgs): LedgerRow {
  return tx(() => {
    const existing = transactionByIdempotencyKey(args.idempotencyKey);
    if (existing) return existing;
    if (args.amount === 0) throw badRequest('A ledger entry cannot be for zero.');
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    run(
      `INSERT INTO wallet_transactions
         (id, walletId, customerId, salonId, type, amount, balanceType, paymentId, referenceId, idempotencyKey, status, reason, actorId, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      args.walletId,
      args.customerId,
      args.salonId,
      args.type,
      Math.round(args.amount),
      args.balanceType,
      args.paymentId ?? null,
      args.referenceId ?? null,
      args.idempotencyKey,
      'posted',
      args.reason ?? null,
      args.actorId ?? null,
      createdAt,
    );
    return one<LedgerRow>('SELECT * FROM wallet_transactions WHERE id = ?', id)!;
  });
}

/** Credit cash value (purchased money — never expires). */
export function creditCash(args: Omit<PostArgs, 'balanceType' | 'amount'> & { amount: number }) {
  return postEntry({ ...args, balanceType: 'cash' });
}

/** Credit promotional bonus value. */
export function creditBonus(args: Omit<PostArgs, 'balanceType' | 'amount'> & { amount: number }) {
  return postEntry({ ...args, balanceType: 'bonus' });
}

/**
 * Debit the wallet using the salon's configured spending order
 * (default: promotional bonus first, then cash).
 *
 * Returns the per-balance split. Throws on insufficient funds — the wallet can
 * never go negative.
 */
export function debit(args: {
  walletId: string;
  customerId: string;
  salonId: string;
  amount: number;
  settings: SalonSettings;
  idempotencyKey: string;
  referenceId?: string | null;
  reason?: string | null;
  type?: WalletTransactionType;
}) {
  return tx(() => {
    const amount = Math.round(args.amount);
    if (amount <= 0) throw badRequest('A debit must be for a positive amount.');

    const replay = transactionByIdempotencyKey(`${args.idempotencyKey}:0`);
    if (replay) {
      const rows = all<LedgerRow>(
        'SELECT * FROM wallet_transactions WHERE idempotencyKey LIKE ? ORDER BY idempotencyKey',
        `${args.idempotencyKey}:%`,
      );
      return {
        entries: rows,
        bonus: rows.filter((r) => r.balanceType === 'bonus').reduce((s, r) => s + Math.abs(r.amount), 0),
        cash: rows.filter((r) => r.balanceType === 'cash').reduce((s, r) => s + Math.abs(r.amount), 0),
      };
    }

    const b = balances(args.walletId);
    if (b.total < amount) {
      throw conflict('Insufficient wallet balance.', {
        required: amount,
        available: b.total,
      });
    }

    let remaining = amount;
    let bonusUsed = 0;
    let cashUsed = 0;
    const entries: LedgerRow[] = [];
    let index = 0;

    for (const balanceType of args.settings.spendingOrder) {
      if (remaining <= 0) break;
      const available = balanceType === 'bonus' ? b.bonus : b.cash;
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      entries.push(
        postEntry({
          walletId: args.walletId,
          customerId: args.customerId,
          salonId: args.salonId,
          type: args.type ?? 'spend',
          amount: -take,
          balanceType,
          idempotencyKey: `${args.idempotencyKey}:${index++}`,
          referenceId: args.referenceId ?? null,
          reason: args.reason ?? null,
        }),
      );
      if (balanceType === 'bonus') bonusUsed += take;
      else cashUsed += take;
      remaining -= take;
    }

    if (remaining > 0) throw conflict('Wallet balance changed during checkout. Please retry.');

    return { entries, bonus: bonusUsed, cash: cashUsed };
  });
}

/** Reverse a specific ledger entry with a compensating row (append-only). */
export function reverseEntry(entryId: string, reason: string, actorId: string, idempotencyKey: string) {
  return tx(() => {
    const entry = one<LedgerRow>('SELECT * FROM wallet_transactions WHERE id = ?', entryId);
    if (!entry) throw notFound('Ledger entry not found.');
    const reversal = postEntry({
      walletId: entry.walletId,
      customerId: entry.customerId,
      salonId: entry.salonId,
      type: 'reversal',
      amount: -entry.amount,
      balanceType: entry.balanceType,
      idempotencyKey,
      referenceId: entry.id,
      reason,
      actorId,
    });
    run('UPDATE wallet_transactions SET status = ? WHERE id = ?', 'reversed', entry.id);
    return reversal;
  });
}

/** Manual adjustment — owner/super-admin only, requires a reason. */
export function adjust(args: {
  walletId: string;
  customerId: string;
  salonId: string;
  amount: number; // signed
  balanceType: BalanceType;
  reason: string;
  actorId: string;
  idempotencyKey?: string;
}) {
  if (!args.reason || args.reason.trim().length < 4) {
    throw badRequest('A reason is required for a manual wallet adjustment.');
  }
  if (args.amount < 0) {
    const b = balances(args.walletId);
    const available = args.balanceType === 'bonus' ? b.bonus : b.cash;
    if (available + args.amount < 0) throw conflict('Adjustment would create a negative balance.');
  }
  return postEntry({
    walletId: args.walletId,
    customerId: args.customerId,
    salonId: args.salonId,
    type: 'adjustment',
    amount: args.amount,
    balanceType: args.balanceType,
    idempotencyKey: args.idempotencyKey ?? `adjust_${crypto.randomUUID()}`,
    reason: args.reason,
    actorId: args.actorId,
  });
}

/** Total outstanding wallet liability for the salon (owner reporting). */
export function liabilities(salonId: string, from?: string) {
  const rows = all<{ balanceType: BalanceType; total: number }>(
    `SELECT balanceType, COALESCE(SUM(amount), 0) AS total
       FROM wallet_transactions
      WHERE salonId = ? AND status = 'posted' ${from ? 'AND createdAt >= ?' : ''}
      GROUP BY balanceType`,
    ...(from ? [salonId, from] : [salonId]),
  );
  const cash = rows.find((r) => r.balanceType === 'cash')?.total ?? 0;
  const bonus = rows.find((r) => r.balanceType === 'bonus')?.total ?? 0;
  return { cash, bonus, total: cash + bonus };
}

export function toWalletTransaction(row: Record<string, any>): WalletTransaction {
  return {
    id: row.id,
    walletId: row.walletId,
    customerId: row.customerId,
    type: row.type,
    amount: row.amount,
    balanceType: row.balanceType,
    paymentId: row.paymentId,
    referenceId: row.referenceId,
    idempotencyKey: row.idempotencyKey,
    status: row.status as WalletTransaction['status'],
    reason: row.reason,
    actorId: row.actorId,
    createdAt: row.createdAt,
  };
}
