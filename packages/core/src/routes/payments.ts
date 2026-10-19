import crypto from 'node:crypto';
import { Router, rawBody } from '../lib/router';
import { z } from 'zod';
import { audit, requireAuth, scopedSalonId } from '../auth';
import { all, one, run, tx } from '../db';
import { badRequest, conflict, handler, HttpError, notFound } from '../lib/http';
import { env, integrations } from '../env';
import {
  attachRazorpayOrderId,
  claimEvent,
  createOrder,
  getOrder,
  getOrderByRazorpayId,
  keyId,
  markAttempted,
  markFailed,
  markPaid,
  parseOrderNotes,
  publicConfig,
  signCheckout,
  toPaymentOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  PAYMENT_MODE,
} from '../services/payments';
import { creditBonus, creditCash, getOrCreateWallet, walletView } from '../services/wallet';
import { readSettings } from '../services/settings';
import { notifyCustomer } from '../services/notifications';
import { formatMoney, type Wallet } from '@salonpro/shared';

export const paymentsRouter = new Router();

/* ------------------------------------------------------------------ */
/* Create an order                                                     */
/* ------------------------------------------------------------------ */

paymentsRouter.post(
  '/orders',
  requireAuth,
  handler(async (req, res) => {
    const body = z
      .object({
        purpose: z.enum(['wallet_recharge', 'appointment']),
        offerId: z.string().optional(),
        amount: z.number().int().min(10000).optional(),
        appointmentId: z.string().optional(),
        idempotencyKey: z.string().max(120).optional(),
      })
      .parse(req.body);

    const salonId = await scopedSalonId(req.auth!);
    const customerId = req.auth!.id;

    let amount = 0;
    let bonus = 0;
    let referenceId: string | null = null;
    let label = '';

    if (body.purpose === 'wallet_recharge') {
      const offer = body.offerId
        ? await one<{ payAmount: number; bonusAmount: number; label: string; active: number }>(
            'SELECT * FROM recharge_offers WHERE id = ? AND salonId = ?',
            body.offerId,
            salonId,
          )
        : null;
      if (body.offerId && !offer) throw notFound('That recharge offer is not available.');
      if (offer && !offer.active) throw badRequest('That recharge offer has been disabled.');
      amount = offer?.payAmount ?? body.amount ?? 0;
      bonus = offer?.bonusAmount ?? 0;
      label = offer?.label ?? 'Custom recharge';
      if (amount < 10000) throw badRequest('The minimum wallet recharge is \u20b9100.');
    } else {
      if (!body.appointmentId) throw badRequest('Which appointment is this payment for?');
      const appt = await one<Record<string, any>>(
        'SELECT * FROM appointments WHERE id = ? AND customerId = ?',
        body.appointmentId,
        customerId,
      );
      if (!appt) throw notFound('Appointment not found.');
      if (appt.paymentStatus === 'paid') throw conflict('That appointment is already paid.');
      amount = appt.totalAmount - appt.paidAmount;
      referenceId = appt.id;
      label = 'Appointment payment';
      if (amount <= 0) throw badRequest('There is nothing left to pay on that appointment.');
    }

    const order = await createOrder({
      salonId,
      customerId,
      amount,
      purpose: body.purpose,
      referenceId,
      receipt: `sp_${Date.now().toString(36)}`,
      notes: { bonus: String(bonus), label, customerId },
      idempotencyKey: body.idempotencyKey ?? undefined,
    });

    /* Live Razorpay order creation when keys are present. */
    if (integrations.razorpayLive) {
      try {
        const res = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64')}`,
          },
          body: JSON.stringify({
            amount,
            currency: 'INR',
            receipt: order.receipt,
            notes: { purpose: body.purpose, salonId, customerId },
          }),
        });
        if (!res.ok) {
          await markFailed(order.id, `razorpay_order_failed_${res.status}`);
          throw badRequest('Could not reach the payment provider. Please try again.');
        }
        const data = (await res.json()) as { id: string };
        await attachRazorpayOrderId(order.id, data.id);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        await markFailed(order.id, `razorpay_order_error:${(err as Error).message}`);
        throw badRequest('Could not reach the payment provider. Please try again.');
      }
    }

    const fresh = (await getOrder(order.id))!;
    res.status(201).json({
      order: toPaymentOrder(fresh),
      checkout: {
        provider: 'razorpay',
        mode: PAYMENT_MODE,
        keyId: keyId(),
        orderId: fresh.razorpayOrderId,
        amount: fresh.amount,
        currency: 'INR',
        name: 'SalonPro',
        description: label,
        prefill: { name: req.auth!.name, contact: req.auth!.phone },
        /** Only present in simulated mode so the test checkout can be exercised end to end. */
        simulatedSignature: PAYMENT_MODE === 'simulated' ? signCheckout(fresh.razorpayOrderId, `pay_sim_${fresh.id}`) : undefined,
        simulatedPaymentId: PAYMENT_MODE === 'simulated' ? `pay_sim_${fresh.id}` : undefined,
      },
      offer: { payAmount: amount, bonusAmount: bonus, totalValue: amount + bonus, label },
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Verify a checkout payment (client callback)                          */
/* ------------------------------------------------------------------ */

export interface RechargeResult {
  wallet?: Wallet;
  credited: boolean;
  reason?: string;
}

/**
 * Credit a verified wallet recharge. Split into two ledger rows so cash and
 * bonus stay auditable separately. Idempotent on the payment id.
 */
export function applyRecharge(orderId: string, paymentId: string, eventRef: string): Promise<RechargeResult> {
  return tx(async () => {
    const order = await getOrder(orderId);
    if (!order) throw notFound('Payment order not found.');
    const notes = parseOrderNotes(order);
    const bonus = Number(notes.bonus ?? 0);

    const fresh = (await getOrder(orderId))!;
    if (fresh.status === 'paid' && fresh.paymentId === paymentId) {
      const existing = await one(
        'SELECT id FROM wallet_transactions WHERE paymentId = ? AND type = ?',
        paymentId,
        'recharge',
      );
      if (existing) {
        return {
          credited: false,
          reason: 'already_credited',
          wallet: await walletView(order.salonId, order.customerId),
        };
      }
    }

    await markPaid(orderId, paymentId, null);

    const wallet = await getOrCreateWallet(order.salonId, order.customerId);
    await creditCash({
      walletId: wallet.id,
      customerId: order.customerId,
      salonId: order.salonId,
      amount: order.amount,
      type: 'recharge',
      idempotencyKey: `recharge_cash_${order.id}`,
      paymentId,
      referenceId: order.id,
      reason: 'Wallet recharge',
    });
    if (bonus > 0) {
      await creditBonus({
        walletId: wallet.id,
        customerId: order.customerId,
        salonId: order.salonId,
        amount: bonus,
        type: 'recharge',
        idempotencyKey: `recharge_bonus_${order.id}`,
        paymentId,
        referenceId: order.id,
        reason: 'Recharge bonus',
      });
    }

    const view = await walletView(order.salonId, order.customerId);
    await notifyCustomer({
      salonId: order.salonId,
      customerId: order.customerId,
      template: 'wallet_credit',
      stage: 'transactional',
      reminderKey: `wallet_credit_${order.id}`,
      vars: { amount: formatMoney(order.amount + bonus), balance: formatMoney(view.totalBalance) },
    });

    await run(
      'INSERT INTO audit_logs (id, actorId, action, entityType, entityId, meta, ip, timestamp) VALUES (?,?,?,?,?,?,?,?)',
      crypto.randomUUID(),
      order.customerId,
      'wallet.recharge',
      'payment_order',
      order.id,
      JSON.stringify({ amount: order.amount, bonus, paymentId, eventRef }),
      null,
      new Date().toISOString(),
    );

    return { credited: true, wallet: view };
  });
}

async function settleAppointmentPayment(orderId: string, paymentId: string) {
  const order = await getOrder(orderId);
  if (!order || !order.referenceId) return;
  const appt = await one<Record<string, any>>('SELECT * FROM appointments WHERE id = ?', order.referenceId);
  if (!appt) return;
  if (appt.paymentStatus === 'paid') return;
  await run(
    "UPDATE appointments SET paidAmount = totalAmount, paymentStatus = 'paid', paymentMethod = 'online', updatedAt = ? WHERE id = ?",
    new Date().toISOString(),
    appt.id,
  );
  await markPaid(orderId, paymentId, null);
}

paymentsRouter.post(
  '/verify',
  requireAuth,
  handler(async (req, res) => {
    const body = z
      .object({
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        razorpaySignature: z.string(),
      })
      .parse(req.body);

    const order = await getOrderByRazorpayId(body.razorpayOrderId);
    if (!order) throw notFound('Payment order not found.');
    if (order.customerId !== req.auth!.id && req.auth!.role === 'customer') {
      throw badRequest('That payment does not belong to this account.');
    }
    if (order.status === 'paid') {
      return res.json({
        ok: true,
        alreadyProcessed: true,
        order: toPaymentOrder(order),
        wallet: await walletView(order.salonId, order.customerId),
      });
    }

    /* Server-side signature verification. Never trust the client's "success". */
    const valid = verifyCheckoutSignature(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature);
    if (!valid) {
      await markFailed(order.id, 'signature_mismatch');
      throw badRequest('We could not verify that payment. No money has been moved.');
    }

    await claimEvent(`checkout:${body.razorpayPaymentId}`, 'checkout.verified', order.id, body);

    if (order.purpose === 'wallet_recharge') {
      const result = await applyRecharge(order.id, body.razorpayPaymentId, 'checkout');
      return res.json({ ok: true, ...result, order: toPaymentOrder((await getOrder(order.id))!) });
    }

    await settleAppointmentPayment(order.id, body.razorpayPaymentId);
    res.json({ ok: true, credited: true, order: toPaymentOrder((await getOrder(order.id))!) });
  }),
);

/* ------------------------------------------------------------------ */
/* Simulated test checkout (development only)                          */
/* ------------------------------------------------------------------ */

/**
 * Exercises the real verification path against a locally-signed payload so the
 * full flow can be tested without live keys. Refuses to run when live keys are
 * configured or when simulation is switched off.
 */
paymentsRouter.post(
  '/simulate',
  requireAuth,
  handler(async (req, res) => {
    if (integrations.razorpayLive) throw badRequest('Live Razorpay keys are configured — use Razorpay Checkout.');
    if (!env.allowPaymentSimulation) throw badRequest('Payment simulation is disabled.');
    const body = z
      .object({ razorpayOrderId: z.string(), outcome: z.enum(['success', 'failure']).default('success') })
      .parse(req.body);

    const order = await getOrderByRazorpayId(body.razorpayOrderId);
    if (!order) throw notFound('Payment order not found.');
    if (order.customerId !== req.auth!.id) throw badRequest('That payment does not belong to this account.');

    if (body.outcome === 'failure') {
      await markAttempted(order.id);
      await markFailed(order.id, 'simulated_failure');
      await claimEvent(`sim_fail:${order.id}`, 'payment.failed', order.id, { simulated: true });
      return res.json({ ok: false, status: 'failed', order: toPaymentOrder((await getOrder(order.id))!) });
    }

    const paymentId = `pay_sim_${order.id}`;
    const signature = signCheckout(order.razorpayOrderId, paymentId);
    const valid = verifyCheckoutSignature(order.razorpayOrderId, paymentId, signature);
    if (!valid) throw conflict('Simulated signature failed verification.');

    await claimEvent(`sim_ok:${paymentId}`, 'payment.captured', order.id, { simulated: true });
    if (order.purpose === 'wallet_recharge') {
      const result = await applyRecharge(order.id, paymentId, 'simulated');
      return res.json({ ok: true, simulated: true, ...result, order: toPaymentOrder((await getOrder(order.id))!) });
    }
    await settleAppointmentPayment(order.id, paymentId);
    res.json({ ok: true, simulated: true, order: toPaymentOrder((await getOrder(order.id))!) });
  }),
);

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

paymentsRouter.post(
  '/webhook',
  rawBody(),
  handler(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
    const signature = String(req.headers['x-razorpay-signature'] ?? '');

    if (!verifyWebhookSignature(raw, signature)) {
      /* Acknowledge nothing. Razorpay will retry, and we store nothing. */
      return res.status(400).json({ error: 'invalid_signature' });
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw badRequest('Malformed webhook payload.');
    }

    const eventId = String(payload.event_id ?? payload.id ?? '');
    const type = String(payload.event ?? 'unknown');
    const paymentEntity = payload.payload?.payment?.entity ?? {};
    const orderId: string | undefined = paymentEntity.order_id;

    if (!eventId) throw badRequest('Webhook is missing an event id.');
    if (!(await claimEvent(eventId, type, null, payload))) {
      return res.json({ ok: true, duplicate: true });
    }

    const order = orderId ? await getOrderByRazorpayId(orderId) : undefined;
    if (!order) return res.json({ ok: true, ignored: 'unknown_order' });

    if (type === 'payment.captured' || type === 'order.paid') {
      const paymentId = String(paymentEntity.id ?? `pay_wh_${order.id}`);
      if (order.purpose === 'wallet_recharge') await applyRecharge(order.id, paymentId, `webhook:${eventId}`);
      else await settleAppointmentPayment(order.id, paymentId);
      return res.json({ ok: true, credited: true });
    }

    if (type === 'payment.failed') {
      await markFailed(order.id, `webhook:${type}`);
      return res.json({ ok: true });
    }

    if (type === 'refund.processed' || type === 'refund.created') {
      const amount = Number(payload.payload?.refund?.entity?.amount ?? 0);
      if (amount > 0) {
        await run('UPDATE payment_orders SET status = ? WHERE id = ?', 'refunded', order.id);
        await run(
          'INSERT INTO audit_logs (id, actorId, action, entityType, entityId, meta, ip, timestamp) VALUES (?,?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          order.customerId,
          'payment.refund.webhook',
          'payment_order',
          order.id,
          JSON.stringify({ amount, eventId }),
          null,
          new Date().toISOString(),
        );
      }
      return res.json({ ok: true });
    }

    res.json({ ok: true, unhandled: type });
  }),
);

/* ------------------------------------------------------------------ */
/* Config & history                                                    */
/* ------------------------------------------------------------------ */

paymentsRouter.get(
  '/config',
  requireAuth,
  handler(async (_req, res) => {
    res.json({ ...publicConfig(), currency: 'INR', spendingOrder: readSettings(null).spendingOrder });
  }),
);
paymentsRouter.get(
  '/orders',
  requireAuth,
  handler(async (req, res) => {
    const salonId = await scopedSalonId(req.auth!);
    const orders = (
      await all(
        'SELECT * FROM payment_orders WHERE customerId = ? AND salonId = ? ORDER BY createdAt DESC LIMIT 50',
        req.auth!.id,
        salonId,
      )
    ).map((o) => toPaymentOrder(o));
    res.json({ orders });
  }),
);

paymentsRouter.post(
  '/orders/:id/fail',
  requireAuth,
  handler(async (req, res) => {
    const order = await getOrder(req.params.id!);
    if (!order || order.customerId !== req.auth!.id) throw notFound('Payment order not found.');
    await markFailed(order.id, 'cancelled_by_customer');
    res.json({ ok: true });
  }),
);
