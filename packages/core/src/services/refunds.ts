import crypto from 'node:crypto';
import { audit } from '../auth';
import { one, run, tx } from '../db';
import { badRequest, conflict } from '../lib/http';
import { env, integrations } from '../env';
import { getOrCreateWallet, postEntry } from './wallet';
import { reverseIfQualifyingCancelled } from './referral';

export interface RefundArgs {
  salonId: string;
  actorId: string;
  customerId: string;
  amount: number;
  reason: string;
  paymentOrderId?: string;
  appointmentId?: string;
  toWallet?: boolean;
}

/**
 * Refund a payment.
 *
 * A wallet credit is an append-only ledger entry with an idempotency key, so a
 * double-click on "Refund" cannot pay twice. Live Razorpay refunds are only
 * attempted when keys are configured.
 */
export async function refundPayment(args: RefundArgs) {
  const order = args.paymentOrderId
    ? await one<Record<string, any>>('SELECT * FROM payment_orders WHERE id = ? AND salonId = ?', args.paymentOrderId, args.salonId)
    : args.appointmentId
      ? await one<Record<string, any>>(
          "SELECT * FROM payment_orders WHERE referenceId = ? AND salonId = ? ORDER BY createdAt DESC LIMIT 1",
          args.appointmentId,
          args.salonId,
        )
      : null;

  const refundable = order ? order.amountPaid - (await refundedAmount(order.id)) : Number.MAX_SAFE_INTEGER;
  if (order && args.amount > refundable) {
    throw conflict(`You can refund at most \u20b9${(refundable / 100).toFixed(2)} on that payment.`);
  }
  if (!order && !args.toWallet) {
    throw badRequest('Specify the payment to refund, or refund to the customer wallet.');
  }

  let providerRefundId: string | null = null;
  let status: 'processed' | 'pending' | 'failed' = 'processed';
  let note = 'Wallet credit issued';

  if (order && order.status === 'paid' && order.mode !== 'simulated') {
    if (!integrations.razorpayLive) {
      status = 'pending';
      note = 'razorpay_not_configured — recorded as pending, no money moved';
    } else {
      try {
        const res = await fetch(`https://api.razorpay.com/v1/payments/${order.paymentId}/refund`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64')}`,
          },
          body: JSON.stringify({ amount: args.amount, notes: { reason: args.reason }, speed: 'normal' }),
        });
        if (!res.ok) {
          status = 'failed';
          note = `razorpay_refund_failed_${res.status}`;
        } else {
          const data = (await res.json()) as { id?: string };
          providerRefundId = data.id ?? null;
          note = `Razorpay refund ${providerRefundId}`;
        }
      } catch (err) {
        status = 'failed';
        note = `razorpay_error:${(err as Error).message}`;
      }
    }
  }

  return tx(async () => {
    const refundId = crypto.randomUUID();
    const now = new Date().toISOString();
    let walletTransactionId: string | null = null;

    if (status === 'processed' && args.toWallet !== false) {
      const wallet = await getOrCreateWallet(args.salonId, args.customerId);
      const entry = await postEntry({
        walletId: wallet.id,
        customerId: args.customerId,
        salonId: args.salonId,
        type: 'refund',
        amount: args.amount,
        balanceType: 'cash',
        idempotencyKey: `refund_${order?.id ?? args.appointmentId ?? wallet.id}_${args.amount}`,
        referenceId: order?.paymentId ?? args.appointmentId ?? null,
        reason: args.reason,
        actorId: args.actorId,
      });
      walletTransactionId = entry.id;
    }

    await run(
      `INSERT INTO refunds (id, paymentOrderId, appointmentId, customerId, salonId, amount, reason, status, actorId, walletTransactionId, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      refundId,
      order?.id ?? null,
      args.appointmentId ?? null,
      args.customerId,
      args.salonId,
      args.amount,
      args.reason,
      status,
      args.actorId,
      walletTransactionId,
      now,
    );

    if (order) {
      const totalRefunded = await refundedAmount(order.id);
      const nextStatus = totalRefunded >= order.amountPaid ? 'refunded' : 'partially_refunded';
      if (status === 'processed') {
        await run('UPDATE payment_orders SET status = ? WHERE id = ?', nextStatus, order.id);
      }
    }

    if (args.appointmentId) {
      await run("UPDATE appointments SET paymentStatus = 'refunded', paidAmount = 0, updatedAt = ? WHERE id = ?", now, args.appointmentId);
      await reverseIfQualifyingCancelled(args.appointmentId);
    }

    await audit(args.actorId, 'payment.refund', order ? 'payment_order' : 'appointment', order?.id ?? args.appointmentId ?? refundId, {
      amount: args.amount,
      reason: args.reason,
      status,
      toWallet: args.toWallet !== false,
    });

    return {
      refund: {
        id: refundId,
        amount: args.amount,
        status,
        note,
        walletTransactionId,
        providerRefundId,
      },
    };
  });
}

export async function refundedAmount(paymentOrderId: string): Promise<number> {
  const row = await one<{ total: number }>(
    "SELECT COALESCE(SUM(amount),0) AS total FROM refunds WHERE paymentOrderId = ? AND status = 'processed'",
    paymentOrderId,
  );
  return row?.total ?? 0;
}
