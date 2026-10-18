import crypto from 'node:crypto';
import type { PaymentMethod, PaymentOrder, PaymentOrderStatus } from '@salonpro/shared';
import { all, one, parseJson, run, tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import { env, integrations } from '../env';
import { DbRow } from '../lib/types';

/**
 * Razorpay integration.
 *
 * Truth rules enforced here:
 *  - A payment is only ever credited after the **server** verifies the
 *    signature (checkout flow) or a signed webhook (async flow).
 *  - Every payment event is stored with a unique event id and processed once.
 *  - When no live keys are configured the service runs in SIMULATED mode. It
 *    still performs the real signature verification maths against a local dev
 *    secret, so the verification path is genuinely exercised. Simulated orders
 *    are always labelled `mode = 'simulated'` and are excluded from production
 *    reporting.
 */

const DEV_SECRET = 'dev_razorpay_secret_not_for_production';

export function keyId(): string {
  return env.razorpayKeyId || 'rzp_test_simulated';
}

function keySecret(): string {
  return env.razorpayKeySecret || DEV_SECRET;
}

export const PAYMENT_MODE: PaymentOrder['mode'] = integrations.razorpayLive ? 'live' : 'simulated';

/* ------------------------------------------------------------------ */
/* Signature maths                                                     */
/* ------------------------------------------------------------------ */

export function signCheckout(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', keySecret()).update(`${orderId}|${paymentId}`).digest('hex');
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = signCheckout(orderId, paymentId);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = env.razorpayWebhookSecret || DEV_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

interface CreateOrderArgs {
  salonId: string;
  customerId: string;
  amount: number;
  purpose: 'wallet_recharge' | 'appointment';
  referenceId?: string | null;
  receipt?: string;
  notes?: Record<string, string>;
  idempotencyKey?: string;
}

export function createOrder(args: CreateOrderArgs) {
  return tx(() => {
    if (args.idempotencyKey) {
      const existing = one<DbRow>(
        'SELECT * FROM payment_orders WHERE idempotencyKey = ?',
        args.idempotencyKey,
      );
      if (existing) return existing;
    }
    if (args.amount < 100) throw badRequest('The minimum payment is \u20b91.');

    const razorpayOrderId = integrations.razorpayLive
      ? `order_pending_${crypto.randomUUID()}` // replaced after the live API call
      : `order_sim_${crypto.randomBytes(8).toString('hex')}`;
    const id = crypto.randomUUID();
    run(
      `INSERT INTO payment_orders
        (id, salonId, customerId, razorpayOrderId, amount, amountPaid, currency, purpose, status, mode, referenceId, receipt, notes, idempotencyKey, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      args.salonId,
      args.customerId,
      razorpayOrderId,
      args.amount,
      0,
      'INR',
      args.purpose,
      'created',
      PAYMENT_MODE,
      args.referenceId ?? null,
      args.receipt ?? null,
      args.notes ? JSON.stringify(args.notes) : null,
      args.idempotencyKey ?? `order_${id}`,
      new Date().toISOString(),
    );
    return one<DbRow>('SELECT * FROM payment_orders WHERE id = ?', id)!;
  });
}

/** Called from the payments route after the live order is created upstream. */
export function attachRazorpayOrderId(orderId: string, razorpayOrderId: string) {
  run('UPDATE payment_orders SET razorpayOrderId = ? WHERE id = ?', razorpayOrderId, orderId);
}

export function getOrderByRazorpayId(razorpayOrderId: string) {
  return one<DbRow>('SELECT * FROM payment_orders WHERE razorpayOrderId = ?', razorpayOrderId);
}

export function getOrder(id: string) {
  return one<DbRow>('SELECT * FROM payment_orders WHERE id = ?', id);
}

/** Record a payment attempt (no money moves). */
export function markAttempted(orderId: string) {
  run("UPDATE payment_orders SET status = 'attempted' WHERE id = ? AND status = 'created'", orderId);
}

export function markFailed(orderId: string, reason?: string) {
  run(
    "UPDATE payment_orders SET status = 'failed', notes = COALESCE(?, notes) WHERE id = ? AND status IN ('created','attempted')",
    reason ?? null,
    orderId,
  );
}

export function markPaid(orderId: string, paymentId: string, signature: string | null) {
  run(
    "UPDATE payment_orders SET status = 'paid', paymentId = ?, signature = ?, amountPaid = amount, verifiedAt = ? WHERE id = ?",
    paymentId,
    signature,
    new Date().toISOString(),
    orderId,
  );
}

/* ------------------------------------------------------------------ */
/* Webhook / event idempotency                                         */
/* ------------------------------------------------------------------ */

/**
 * Claim a provider event id. Returns false when the event was already
 * processed — the caller then returns 200 without repeating side effects.
 */
export function claimEvent(eventId: string, type: string, paymentOrderId: string | null, payload: unknown): boolean {
  const existing = one<{ id: string }>('SELECT id FROM payment_events WHERE eventId = ?', eventId);
  if (existing) return false;
  run(
    'INSERT INTO payment_events (id, paymentOrderId, eventId, type, payload, processedAt, createdAt) VALUES (?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    paymentOrderId,
    eventId,
    type,
    JSON.stringify(payload ?? {}),
    new Date().toISOString(),
    new Date().toISOString(),
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* Mapping / presentation                                              */
/* ------------------------------------------------------------------ */

export function toPaymentOrder(row: DbRow, customerName?: string): PaymentOrder {
  return {
    id: row.id,
    salonId: row.salonId,
    customerId: row.customerId,
    customerName,
    razorpayOrderId: row.razorpayOrderId,
    paymentId: row.paymentId,
    amount: row.amount,
    amountPaid: row.amountPaid,
    currency: row.currency,
    purpose: row.purpose,
    status: row.status as PaymentOrderStatus,
    mode: row.mode,
    referenceId: row.referenceId,
    receipt: row.receipt,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
  };
}

export function listOrders(salonId: string, opts: { limit?: number; status?: string; customerId?: string } = {}) {
  const clauses = ['o.salonId = ?'];
  const params: (string | number)[] = [salonId];
  if (opts.status) {
    clauses.push('o.status = ?');
    params.push(opts.status);
  }
  if (opts.customerId) {
    clauses.push('o.customerId = ?');
    params.push(opts.customerId);
  }
  params.push(opts.limit ?? 100);
  return all<DbRow>(
    `SELECT o.*, u.name AS customerName FROM payment_orders o
       JOIN users u ON u.id = o.customerId
      WHERE ${clauses.join(' AND ')}
      ORDER BY o.createdAt DESC LIMIT ?`,
    ...params,
  ).map((r) => toPaymentOrder(r, r.customerName));
}

export function parseOrderNotes(row: DbRow): Record<string, string> {
  return parseJson<Record<string, string>>(row.notes, {});
}

/** Razorpay's public key id for the browser checkout (never the secret). */
export function publicConfig() {
  return {
    provider: 'razorpay' as const,
    mode: PAYMENT_MODE,
    keyId: keyId(),
    configured: integrations.razorpayLive,
    webhookConfigured: integrations.razorpayWebhook,
    simulationAllowed: env.allowPaymentSimulation && !integrations.razorpayLive,
  };
}
