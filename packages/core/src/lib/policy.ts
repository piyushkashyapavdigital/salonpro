/**
 * Written policies the UI and API both surface, so what customers are told and
 * what the system does cannot drift apart.
 */

export const REFUND_POLICY = {
  summary: 'Wallet-funded cancellations return to your wallet in full.',
  rules: [
    'Cancel more than 4 hours before the appointment: wallet funds are returned to the wallet in full.',
    'Cancel within 4 hours: the salon may retain up to 20% as a late-cancellation fee.',
    'No-shows are not refunded automatically; the salon can issue a goodwill credit with a recorded reason.',
    'Online payments are refunded to the original payment method after owner approval.',
    'Promotional bonus is never refunded as cash. It returns as promotional bonus where applicable.',
  ],
};

export const BONUS_TERMS = {
  summary: 'Promotional bonus is spent before cash balance.',
  rules: [
    'Bonus is a promotional credit, not purchased money, and is non-refundable.',
    'Purchased cash value never expires and is not silently reduced by the salon.',
    'Bonus can be excluded from certain offers or restricted services where stated.',
  ],
};
