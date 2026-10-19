/**
 * Payments, from the app's side.
 *
 * The rule this file exists to enforce: the app never decides that money moved.
 * It opens the provider's sheet (or, on a simulated server, the provider's own
 * simulated signature), and the *server* verifies the signature before anything
 * is marked paid. If verification fails, the app says the payment failed.
 */
import { ApiError } from './api';
import { payments } from './endpoints';
import type { CreateOrderResponse } from './types';

export type PaymentOutcome =
  | { status: 'paid'; message: string }
  | { status: 'cancelled'; message: string }
  | { status: 'failed'; message: string };

interface RazorpayModule {
  open(options: Record<string, unknown>): Promise<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }>;
}

/**
 * The native sheet is loaded lazily: a build without the module (or a simulator
 * without the SDK installed) must still work for wallet and pay-at-salon flows.
 */
function loadProvider(): RazorpayModule | null {
  try {
    const mod = require('react-native-razorpay');
    return (mod?.default ?? mod) as RazorpayModule;
  } catch {
    return null;
  }
}

export async function startCheckout(
  order: CreateOrderResponse,
  prefill: { name?: string; contact?: string } = {},
): Promise<PaymentOutcome> {
  const checkout = order.checkout;

  /* --- Simulated server -------------------------------------------------
   * No Razorpay keys are configured, so the API signed the payment itself.
   * The signature still goes through the normal verification endpoint: the
   * test path exercises production code instead of bypassing it. */
  if (checkout.mode === 'simulated') {
    if (checkout.simulatedSignature && checkout.simulatedPaymentId) {
      try {
        await payments.verify({
          razorpayOrderId: checkout.orderId,
          razorpayPaymentId: checkout.simulatedPaymentId,
          razorpaySignature: checkout.simulatedSignature,
        });
        return {
          status: 'paid',
          message: 'Simulated payment verified by the server. No money moved — this server has no Razorpay keys.',
        };
      } catch (err) {
        return { status: 'failed', message: err instanceof ApiError ? err.message : 'Verification failed.' };
      }
    }
    try {
      await payments.simulate({ razorpayOrderId: checkout.orderId });
      return { status: 'paid', message: 'Simulated payment recorded. No money moved.' };
    } catch (err) {
      return { status: 'failed', message: err instanceof ApiError ? err.message : 'Simulation failed.' };
    }
  }

  /* --- Real provider ----------------------------------------------------- */
  const provider = loadProvider();
  if (!provider) {
    return {
      status: 'failed',
      message:
        'This build has no Razorpay sheet installed, so card/UPI payment is unavailable. Use the wallet or pay at the salon.',
    };
  }

  let response: Awaited<ReturnType<RazorpayModule['open']>>;
  try {
    response = await provider.open({
      description: checkout.description,
      currency: checkout.currency,
      key: checkout.keyId,
      amount: String(checkout.amount),
      name: checkout.name,
      order_id: checkout.orderId,
      prefill: {
        name: prefill.name ?? checkout.prefill.name,
        contact: prefill.contact ?? checkout.prefill.contact,
      },
      theme: { color: '#DB2777' },
    });
  } catch (err) {
    const description = (err as { description?: string; message?: string })?.description ?? (err as Error)?.message;
    if (/cancel/i.test(String(description))) {
      return { status: 'cancelled', message: 'Payment cancelled — nothing was charged.' };
    }
    return { status: 'failed', message: description ? String(description) : 'The payment could not be completed.' };
  }

  /* The provider said "done"; the server decides whether that is true. */
  try {
    await payments.verify({
      razorpayOrderId: response.razorpay_order_id,
      razorpayPaymentId: response.razorpay_payment_id,
      razorpaySignature: response.razorpay_signature,
    });
    return { status: 'paid', message: 'Payment verified by the server.' };
  } catch (err) {
    return {
      status: 'failed',
      message: err instanceof ApiError
        ? `${err.message} If money left your account, the salon can see the payment and will reconcile it.`
        : 'The server could not verify the payment.',
    };
  }
}
