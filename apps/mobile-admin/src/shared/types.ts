/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: apps/mobile-shared/src/types.ts
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
/**
 * Response envelopes the mobile apps read.
 *
 * Domain objects (Appointment, Service, Wallet, …) come from `../core`, which is
 * a copy of the shared package the API uses — so a field rename on the server
 * fails the mobile typecheck instead of silently showing blanks.
 */
import type {
  Appointment,
  Branch,
  RechargeOffer,
  Salon,
  SalonSettings,
  Service,
  SessionUser,
  Staff,
  User,
  Wallet,
  WalletTransaction,
} from '../core';

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export interface SessionResponse {
  token: string;
  user: SessionUser;
  wallet: Wallet | null;
  /** Present on sign-up: what the customer can do next. */
  notice?: string;
  isNewUser?: boolean;
}

export interface OtpRequestResponse {
  ok: true;
  phone: string;
  isNewUser: boolean;
  deliveryMode: 'development_mock' | 'sms' | 'whatsapp';
  expiresInSeconds: number;
  /** Development mode only — no SMS is ever claimed when this is absent. */
  devCode?: string;
  notice?: string;
}

export interface DemoAccount {
  name: string;
  phone: string;
  role: string;
  label?: string;
}

export interface DemoAccountsResponse {
  mode: string;
  notice: string;
  password: string;
  accounts: DemoAccount[];
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export interface CatalogSalonResponse {
  salon: Salon;
  integrations: IntegrationFlags;
  payments: { mode: string };
}

export interface IntegrationFlags {
  razorpayLive: boolean;
  razorpayWebhook: boolean;
  whatsapp: boolean;
  push: boolean;
  otpDelivery: boolean;
}

export interface ServicesResponse {
  services: Service[];
  categories: string[];
}

export interface BranchesResponse {
  branches: Branch[];
}

export interface StaffResponse {
  staff: (Staff & { name?: string })[];
}

export interface RechargeOffersResponse {
  offers: RechargeOffer[];
}

export interface CouponsResponse {
  coupons: Coupon[];
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'flat';
  value: number;
  minAmount: number;
  maxDiscount: number | null;
  description: string;
  active: boolean;
  startAt: string;
  endAt: string;
  usedCount: number;
  usageLimit: number | null;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  staffId: string;
  staffName: string;
}

export interface AvailabilityResponse {
  date: string;
  durationMinutes: number;
  slots: AvailabilitySlot[];
  closed: boolean;
  reason?: string;
  subtotal: number;
  services: { serviceId: string; name: string; price: number; durationMinutes: number }[];
}

export interface ReferralInfoResponse {
  valid: boolean;
  salonName?: string;
  referrerName?: string;
  reward?: number;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Customer                                                            */
/* ------------------------------------------------------------------ */

export interface CustomerProfile {
  customerId: string;
  name: string;
  phone: string;
  lastVisitAt: string | null;
  totalVisits: number;
  totalCompletedSpend: number;
  averageSpend: number;
  preferredServices: string[];
  marketingConsent: boolean;
  birthday: string | null;
  wallet: Wallet | null;
  successfulReferrals: number;
  createdAt: string;
}

export interface HomeResponse {
  profile: CustomerProfile;
  wallet: Wallet;
  loyalty: { points: number; lifetimePoints: number };
  loyaltyEnabled: boolean;
  upcoming: Appointment[];
  popular: (Service & { bookings?: number })[];
  offers: Coupon[];
  referral: { code: string; rewardsEarned: number };
  recentPayments: PaymentOrder[];
  visitsThisMonth: number;
  birthdayReward: boolean;
}

export interface BookingsResponse {
  appointments: Appointment[];
}

export interface BookingResponse {
  appointment: Appointment;
  paymentPreference: 'wallet' | 'online' | 'pay_at_salon';
  /** Paise taken from the wallet at booking time (0 when nothing was applied). */
  walletDebit: number;
  wallet: Wallet | null;
}

export interface WalletResponse {
  wallet: Wallet;
  transactions: WalletTransaction[];
  offers: RechargeOffer[];
  spendingOrder: string[];
  bonusExpiryDays: number | null;
  terms: string[];
}

export interface OffersResponse {
  coupons: Coupon[];
  rechargeOffers: RechargeOffer[];
  loyalty: { points: number; lifetimePoints: number };
}

export interface NotificationRecord {
  id: string;
  channel: string;
  template: string;
  stage: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'suppressed';
  sentAt: string | null;
  scheduledAt: string;
  body: string;
  errorDetails: string | null;
  customerName?: string;
}

export interface NotificationsResponse {
  notifications: NotificationRecord[];
}

export interface ReferralsResponse {
  code: string;
  link: string;
  totalInvitations: number;
  registered: number;
  qualified: number;
  pendingRewards: number;
  creditedRewards: number;
  currency: string;
  referrals: Referral[];
  leaderboard: { customerId: string; name: string; qualified: number; earned: number }[];
  config: ReferralConfig;
  rules: string[];
}

export interface ReferralConfig {
  referrerReward: number;
  refereeReward: number;
  currency: string;
  maxRewardsPerMonth: number;
  requireFirstPaidVisit: boolean;
}

export interface Referral {
  id: string;
  referrerName: string;
  referredCustomerName: string;
  referralCode: string;
  status: string;
  referrerRewardStatus: string;
  refereeRewardStatus: string;
  createdAt: string;
  qualifiedAt: string | null;
}

export interface ProfileResponse {
  user: { id: string; name: string; phone: string; email: string | null; createdAt: string };
  profile: CustomerProfile;
  preferences: {
    customerId: string;
    whatsappConsent: boolean;
    pushEnabled: boolean;
    promotionalConsent: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export interface PaymentOrder {
  id: string;
  customerId: string;
  customerName?: string;
  razorpayOrderId: string;
  paymentId: string | null;
  amount: number;
  amountPaid: number;
  currency: string;
  purpose: string;
  status: 'created' | 'attempted' | 'paid' | 'failed' | 'refunded';
  mode: string;
  receipt: string | null;
  createdAt?: string;
}

export interface PaymentsConfigResponse {
  provider: string;
  mode: 'live' | 'test' | 'simulated';
  keyId: string;
  configured: boolean;
  webhookConfigured: boolean;
  simulationAllowed: boolean;
  currency: string;
  spendingOrder: string[];
}

export interface CreateOrderResponse {
  order: PaymentOrder;
  checkout: {
    provider: string;
    mode: 'live' | 'test' | 'simulated';
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill: { name?: string; contact?: string };
    /** Simulated mode only, so the real verification path can be exercised. */
    simulatedSignature?: string;
    simulatedPaymentId?: string;
  };
  offer?: { payAmount: number; bonusAmount: number; totalValue: number; label: string };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export interface AdminMeResponse {
  user: SessionUser;
  salon: Salon;
  branches: { id: string; name: string; status: string }[];
  capabilities: Record<string, boolean>;
}

export interface AdminOverviewResponse {
  overview: {
    date: string;
    customersVisited: number;
    newCustomers: number;
    returningCustomers: number;
    appointmentsBooked: number;
    completed: number;
    cancelled: number;
    pending: number;
    walkIns: number;
    online: number;
    revenueCollected: number;
    walletPayments: number;
    directPayments: number;
    newRegistrations: number;
  };
  settings: SalonSettings;
  payments: { mode: string };
  upcomingToday: Appointment[];
  referralStats: ReferralStats;
  reminderStats: ReminderStats;
  topCustomers: TopCustomer[];
  trend: { date: string; revenue: number; visits: number; appointments: number }[];
}

export interface ReferralStats {
  total: number;
  registered: number;
  qualified: number;
  rewarded: number;
  reversed: number;
  rewardExpense: number;
  topReferrers: { customerId: string; name: string; qualified: number; invited: number }[];
  recent: Referral[];
}

export interface ReminderStats {
  byStatus: { status: string; count: number }[];
  byStage: { stage: string; count: number }[];
  conversions: { stage: string; sent: number; booked: number }[];
}

export interface TopCustomer {
  customerId: string;
  name: string;
  phoneMasked: string;
  totalSpend: number;
  visits: number;
  averageSpend: number;
  lastVisitAt: string | null;
  walletBalance: number;
  referrals: number;
}

export interface AdminAppointmentsResponse {
  appointments: Appointment[];
}

export interface AdminCustomersResponse {
  customers: CustomerProfile[];
}

export interface AdminServicesResponse {
  services: (Service & { completions?: number; revenue?: number })[];
}

export interface AdminStaffResponse {
  staff: (Staff & {
    name: string;
    phone: string;
    email: string | null;
    userStatus: string;
    branchName: string | null;
  })[];
}

export interface AdminBranchesResponse {
  branches: (Branch & {
    staffCount: number;
    revenue: number;
    customers: number;
    appointments: number;
    holidays: { id: string; date: string; reason: string | null }[];
  })[];
}

export interface AdminSettingsResponse {
  salon: Salon;
  integrations: IntegrationFlags;
  payments: { mode: string };
  refundPolicy: string;
}

export interface AdminOffersResponse {
  rechargeOffers: RechargeOffer[];
  coupons: Coupon[];
}

export interface AdminRemindersResponse {
  settings: {
    stages: string[];
    channels: string[];
    intervals: Record<string, number>;
    enabled: boolean;
  };
  templates: Record<string, string>;
  notifications: NotificationRecord[];
  stats: ReminderStats;
  mode?: string;
  /** What the salon's messaging integrations can actually do right now. */
  integrations?: IntegrationFlags;
}

export interface AdminPaymentsResponse {
  orders: PaymentOrder[];
  refunds: (import('./endpoints').RefundRecord & { customerName?: string })[];
  mode: string;
  summary: { collected: number; pending: number; failed: number; refunded?: number };
}

export interface AdminWalletResponse {
  transactions: (WalletTransaction & { customerName?: string })[];
  liabilities: { cash: number; bonus: number; total: number };
  recentRecharges: PaymentOrder[];
}

export interface AdminAuditResponse {
  logs: {
    id: string;
    actorId: string | null;
    actorName: string | null;
    action: string;
    entityType: string;
    entityId: string;
    ip: string | null;
    timestamp: string;
    meta: Record<string, unknown>;
  }[];
}

export interface AdminUsersResponse {
  users: (User & { branchNames: string; activeSessions: number })[];
}

export interface RevenueReportResponse {
  report: {
    from: string;
    to: string;
    grossServiceSales: number;
    discounts: number;
    refunds: number;
    netCollected: number;
    outstanding: number;
    walletCashCollected: number;
    walletBonusGranted: number;
    directCollected: number;
    referralRewardExpense: number;
    cashLiability: number;
    bonusLiability: number;
    byService: { serviceId: string; name: string; revenue: number; count: number }[];
    byMethod: { method: string; amount: number; count: number }[];
    series: { date: string; net: number; gross: number }[];
  };
}

export interface RetentionReportResponse {
  report: {
    inactive30: number;
    inactive60: number;
    inactive90: number;
    popularServices: { name: string; count: number }[];
    repeatCustomerPercent: number;
    averageSpend: number;
    referralAcquisition: number;
    reminderConversions: { stage: string; sent: number; booked: number; conversion: number }[];
  };
}

export interface AdminCustomersResponseWithDetail extends AdminCustomersResponse {}
