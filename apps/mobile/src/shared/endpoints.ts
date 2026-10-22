/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: apps/mobile-shared/src/endpoints.ts
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
/**
 * Every endpoint the apps call, in one place.
 *
 * Kept as plain functions over `api()` rather than generated code so the
 * apps and the tests all read the same server contract, and a response-shape
 * change shows up as a type error rather than a blank screen.
 */
import { api } from './api';
import type { Appointment, Wallet, WalletTransaction } from '../core';
import type {
  AdminAppointmentsResponse,
  AdminAuditResponse,
  AdminBranchesResponse,
  AdminCustomersResponse,
  AdminMeResponse,
  AdminOffersResponse,
  AdminOverviewResponse,
  AdminPaymentsResponse,
  AdminRemindersResponse,
  AdminReviewsResponse,
  AdminServicesResponse,
  AdminSettingsResponse,
  AdminStaffResponse,
  AdminUsersResponse,
  AdminWalletResponse,
  CustomerProfile,
  AvailabilityResponse,
  BookingResponse,
  BookingsResponse,
  BranchesResponse,
  CatalogSalonResponse,
  CouponsResponse,
  CreateOrderResponse,
  DemoAccountsResponse,
  HomeResponse,
  NotificationRecord,
  NotificationsResponse,
  OffersResponse,
  OtpRequestResponse,
  PaymentsConfigResponse,
  PlatformAuditResponse,
  PlatformCreateSalonInput,
  PlatformOverviewResponse,
  PlatformSalonDetailResponse,
  PlatformSalonsResponse,
  PlatformVendorsResponse,
  ProfileResponse,
  RechargeOffersResponse,
  ReviewLinkResponse,
  DevLoginRole,
  DevModeResponse,
  ReferralsResponse,
  Referral,
  ReferralInfoResponse,
  RetentionReportResponse,
  RevenueReportResponse,
  ServicesResponse,
  SessionResponse,
  TopCustomer,
  StaffResponse,
  WalletResponse,
} from './types';

const qs = (params: Record<string, string | number | boolean | undefined | null>): string => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

export const auth = {
  requestOtp: (phone: string) =>
    api<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: { phone }, anonymous: true }),

  verifyOtp: (body: { phone: string; code: string; name?: string; role?: string; inviteToken?: string }) =>
    api<SessionResponse>('/auth/otp/verify', { method: 'POST', body, anonymous: true }),

  me: () => api<{ user: SessionResponse['user']; wallet: SessionResponse['wallet'] }>('/auth/me'),

  logout: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),

  logoutEverywhere: () => api<{ ok: true }>('/auth/logout-all', { method: 'POST' }),

  demoAccounts: () => api<DemoAccountsResponse>('/auth/demo-accounts', { anonymous: true }),

  demoLogin: (phone: string) =>
    api<SessionResponse>('/auth/demo-login', { method: 'POST', body: { phone }, anonymous: true }),

  /**
   * Demo servers only: sign in with the developer PIN. Omit `phone` to sign in
   * as the salon owner. The server refuses this unless ALLOW_DEV_OTP is on.
   */
  devLogin: (body: { pin: string; phone?: string; role?: DevLoginRole }) =>
    api<SessionResponse>('/auth/dev-login', { method: 'POST', body, anonymous: true }),

  /**
   * Ask the server whether developer sign-in is switched on there. The app
   * only shows the demo workspace shortcuts when it is.
   */
  devMode: () => api<DevModeResponse>('/auth/dev-mode', { anonymous: true }),

  invite: (body: { name: string; phone: string; role: string; branchId?: string; email?: string }) =>
    api<{ ok: true; inviteToken?: string; message?: string }>('/auth/invite', { method: 'POST', body }),

  setPassword: (body: { phone: string; password: string; code?: string }) =>
    api<{ ok: true }>('/auth/password', { method: 'POST', body, anonymous: true }),
};

/* ------------------------------------------------------------------ */
/* Catalog (public)                                                    */
/* ------------------------------------------------------------------ */

export const catalog = {
  salon: () => api<CatalogSalonResponse>('/catalog/salon'),
  branches: () => api<BranchesResponse>('/catalog/branches'),
  cities: () => api<{ cities: string[] }>('/catalog/cities', { anonymous: true }),
  services: () => api<ServicesResponse>('/catalog/services'),
  staff: (branchId?: string) => api<StaffResponse>(`/catalog/staff${qs({ branchId })}`),
  rechargeOffers: () => api<RechargeOffersResponse>('/catalog/recharge-offers'),
  coupons: () => api<CouponsResponse>('/catalog/coupons'),
  referralInfo: (code: string) =>
    api<ReferralInfoResponse>(`/catalog/join/${encodeURIComponent(code)}`, { anonymous: true }),

  validateCoupon: (body: { code: string; amount: number }) =>
    api<{ code: string; discount: number; description: string }>('/catalog/coupons/validate', {
      method: 'POST',
      body,
    }),

  availability: (params: { branchId: string; date: string; serviceIds: string[]; staffId?: string }) =>
    api<AvailabilityResponse>(`/catalog/availability${qs({ ...params, serviceIds: params.serviceIds.join(',') })}`),

  paymentStatus: (razorpayOrderId: string) =>
    api<{ status: string; amount: number; purpose: string }>(
      `/catalog/payment-status/${encodeURIComponent(razorpayOrderId)}`,
      { anonymous: true },
    ),
};

/* ------------------------------------------------------------------ */
/* Customer                                                            */
/* ------------------------------------------------------------------ */

export const customer = {
  home: () => api<HomeResponse>('/customer/home'),
  profile: () => api<ProfileResponse>('/customer/profile'),
  updateProfile: (body: { name?: string; email?: string; birthday?: string | null }) =>
    api<{ ok: true; profile?: unknown }>('/customer/profile', { method: 'PATCH', body }),
  updatePreferences: (body: {
    whatsappConsent?: boolean;
    pushEnabled?: boolean;
    promotionalConsent?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }) => api<{ ok: true }>('/customer/preferences', { method: 'PATCH', body }),

  bookings: (status?: string) => api<BookingsResponse>(`/customer/bookings${qs({ status })}`),
  booking: (id: string) => api<{ appointment: BookingsResponse['appointments'][number] }>(`/customer/bookings/${id}`),
  book: (body: {
    branchId: string;
    serviceIds: string[];
    date: string;
    startTime: string;
    staffId?: string | null;
    couponCode?: string | null;
    notes?: string | null;
    paymentPreference?: 'wallet' | 'online' | 'pay_at_salon';
    referralToken?: string | null;
    idempotencyKey?: string | null;
  }) => api<BookingResponse>('/customer/bookings', { method: 'POST', body }),
  cancel: (id: string, reason?: string) =>
    api<{ appointment: BookingsResponse['appointments'][number] }>(`/customer/bookings/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  reschedule: (id: string, body: { date: string; startTime: string; staffId?: string }) =>
    api<{ appointment: BookingsResponse['appointments'][number] }>(`/customer/bookings/${id}/reschedule`, {
      method: 'POST',
      body,
    }),

  wallet: () => api<WalletResponse>('/customer/wallet'),
  offers: () => api<OffersResponse>('/customer/offers'),
  notifications: () => api<NotificationsResponse>('/customer/notifications'),
  retryNotification: (id: string) => api<{ ok: true }>(`/customer/notifications/${id}/retry`, { method: 'POST' }),
  referrals: () => api<ReferralsResponse>('/customer/referrals'),
  reviewLink: (appointmentId?: string) =>
    api<ReviewLinkResponse>('/customer/reviews/link', { method: 'POST', body: { appointmentId } }),
  pushSubscription: (body: { token: string; platform: string }) =>
    api<{ ok: true; mode?: string }>('/customer/push-subscription', { method: 'POST', body }),
  requestAccountDeletion: (body: { reason?: string; confirm: true }) =>
    api<{ ok: true; message: string }>('/customer/account-deletion', { method: 'POST', body }),
  walletReceipt: (transactionId: string) =>
    api<{ receipt: string; transactionId: string }>(`/customer/wallet/receipt/${transactionId}`),
};

/* ------------------------------------------------------------------ */
/* Payments (Razorpay)                                                 */
/* ------------------------------------------------------------------ */

export const payments = {
  config: () => api<PaymentsConfigResponse>('/payments/config', { anonymous: true }),
  createOrder: (body: {
    purpose: 'wallet_recharge' | 'appointment' | 'package';
    amount: number;
    referenceId?: string;
    couponCode?: string;
  }) => api<CreateOrderResponse>('/payments/orders', { method: 'POST', body }),
  verify: (body: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => api<{ ok: true; status: string; wallet?: unknown }>('/payments/verify', { method: 'POST', body }),
  fail: (id: string, body: { reason?: string } = {}) =>
    api<{ ok: true }>(`/payments/orders/${id}/fail`, { method: 'POST', body }),
  /** Development-only: completes a simulated payment server-side. */
  simulate: (body: { razorpayOrderId: string; outcome?: 'success' | 'failure' }) =>
    api<{ ok: true; status: string; notice?: string }>('/payments/simulate', { method: 'POST', body }),
};

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const admin = {
  me: () => api<AdminMeResponse>('/admin/me'),
  overview: (date?: string) => api<AdminOverviewResponse>(`/admin/overview${qs({ date })}`),

  appointments: (params: { date?: string; from?: string; to?: string; status?: string; branchId?: string } = {}) =>
    api<AdminAppointmentsResponse>(`/admin/appointments${qs(params)}`),
  appointment: (id: string) => api<{ appointment: unknown; timeline?: unknown[] }>(`/admin/appointments/${id}`),
  createAppointment: (body: {
    branchId: string;
    serviceIds: string[];
    date: string;
    startTime: string;
    staffId?: string | null;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    couponCode?: string | null;
    notes?: string | null;
    paymentPreference?: 'wallet' | 'online' | 'pay_at_salon' | 'cash';
    bookingSource?: 'app' | 'walk_in' | 'referral' | 'admin';
    idempotencyKey?: string;
  }) => api<BookingResponse>('/admin/appointments', { method: 'POST', body }),
  setAppointmentStatus: (
    id: string,
    body: { status: string; reason?: string; paymentMethod?: 'wallet' | 'online' | 'pay_at_salon' | 'cash' | 'upi_card' },
  ) =>
    api<{ appointment: BookingsResponse['appointments'][number] }>(`/admin/appointments/${id}/status`, {
      method: 'POST',
      body,
    }),
  /** No body: the server records the no-show with its own reason. */
  markNoShow: (id: string) =>
    api<{ appointment: BookingsResponse['appointments'][number] }>(`/admin/appointments/${id}/no-show`, {
      method: 'POST',
      body: {},
    }),
  calendar: (params: { date: string; branchId?: string; staffId?: string }) =>
    api<{
      appointments: Appointment[];
      openingHours: Record<string, { closed: boolean; open: string; close: string }>;
      holidays: { id: string; date: string; reason: string | null }[];
    }>(`/admin/appointments/calendar${qs(params)}`),

  customers: (params: { search?: string; limit?: number } = {}) =>
    api<AdminCustomersResponse>(`/admin/customers${qs(params)}`),
  customer: (id: string) =>
    api<{
      profile: CustomerProfile;
      wallet: Wallet | null;
      appointments: Appointment[];
      transactions: WalletTransaction[];
      rewards: { id: string; points: number; type: string; reason: string | null; createdAt: string }[];
      referrals: Referral[];
      notifications: NotificationRecord[];
      loyalty: { points: number; lifetimePoints: number } | null;
    }>(`/admin/customers/${id}`),
  topCustomers: (params: { from?: string; to?: string; sort?: 'spend' | 'visits' | 'referrals'; limit?: number } = {}) =>
    api<{ customers: TopCustomer[] }>(`/admin/customers/top${qs(params)}`),
  setConsent: (id: string, body: { marketingConsent: boolean }) =>
    api<{ ok: true }>(`/admin/customers/${id}/consent`, { method: 'POST', body }),
  /** `amount` is signed in paise: positive credits, negative debits. */
  adjustWallet: (id: string, body: { amount: number; balanceType: 'cash' | 'bonus'; reason: string }) =>
    api<{ transaction: WalletTransaction; wallet: Wallet }>(`/admin/customers/${id}/wallet/adjust`, {
      method: 'POST',
      body,
    }),

  staff: () => api<AdminStaffResponse>('/admin/staff'),
  createStaff: (body: Record<string, unknown>) => api<{ staff: unknown }>('/admin/staff', { method: 'POST', body }),
  updateStaff: (id: string, body: Record<string, unknown>) =>
    api<{ staff: unknown }>(`/admin/staff/${id}`, { method: 'PATCH', body }),
  markAttendance: (
    id: string,
    body: { date: string; status?: 'present' | 'absent' | 'leave' | 'half_day'; checkInAt?: string | null; checkOutAt?: string | null },
  ) => api<{ ok: true }>(`/admin/staff/${id}/attendance`, { method: 'POST', body }),

  services: () => api<AdminServicesResponse>('/admin/services'),
  createService: (body: Record<string, unknown>) =>
    api<{ service: unknown }>('/admin/services', { method: 'POST', body }),
  updateService: (id: string, body: Record<string, unknown>) =>
    api<{ service: unknown }>(`/admin/services/${id}`, { method: 'PATCH', body }),

  branches: () => api<AdminBranchesResponse>('/admin/branches'),
  createBranch: (body: Record<string, unknown>) => api<{ branch: unknown }>('/admin/branches', { method: 'POST', body }),
  updateBranch: (id: string, body: Record<string, unknown>) =>
    api<{ branch: unknown }>(`/admin/branches/${id}`, { method: 'PATCH', body }),
  addHoliday: (id: string, body: { date: string; reason?: string }) =>
    api<{ ok: true }>(`/admin/branches/${id}/holidays`, { method: 'POST', body }),

  settings: () => api<AdminSettingsResponse>('/admin/settings'),
  updateSettings: (body: Record<string, unknown>) => api<{ ok: true; salon?: unknown }>('/admin/settings', { method: 'PATCH', body }),

  reviews: (params: { limit?: number } = {}) => api<AdminReviewsResponse>(`/admin/reviews${qs(params)}`),

  offers: () => api<AdminOffersResponse>('/admin/offers'),
  createRechargeOffer: (body: Record<string, unknown>) =>
    api<{ offer: unknown }>('/admin/offers/recharge', { method: 'POST', body }),
  updateRechargeOffer: (id: string, body: Record<string, unknown>) =>
    api<{ offer: unknown }>(`/admin/offers/recharge/${id}`, { method: 'PATCH', body }),
  createCoupon: (body: Record<string, unknown>) => api<{ coupon: unknown }>('/admin/coupons', { method: 'POST', body }),
  updateCoupon: (id: string, body: Record<string, unknown>) =>
    api<{ coupon: unknown }>(`/admin/coupons/${id}`, { method: 'PATCH', body }),

  referrals: () => api<ReferralStatsResponse>('/admin/referrals'),
  updateReferralConfig: (body: Record<string, unknown>) =>
    api<{ config: unknown }>('/admin/referrals/config', { method: 'PATCH', body }),

  /** Refunds go to the customer's wallet unless the salon chooses otherwise. */
  refunds: (body: {
    customerId: string;
    amount: number;
    reason: string;
    paymentOrderId?: string;
    appointmentId?: string;
    toWallet?: boolean;
  }) => api<{ refund: RefundRecord; wallet?: Wallet | null; status?: string; note?: string }>('/admin/refunds', { method: 'POST', body }),

  reminders: () => api<AdminRemindersResponse>('/admin/reminders'),
  runReminders: () => api<{ ok: true; result: unknown }>('/admin/reminders/run', { method: 'POST' }),
  retryReminder: (id: string) => api<{ ok: true }>(`/admin/reminders/${id}/retry`, { method: 'POST' }),
  updateReminderSettings: (body: Record<string, unknown>) =>
    api<{ ok: true }>('/admin/reminders/settings', { method: 'PATCH', body }),
  updateReminderTemplates: (body: {
    day7?: string;
    day14?: string;
    day30?: string;
    appointment_confirmation?: string;
    referral_reward?: string;
    wallet_credit?: string;
  }) => api<{ ok: true }>('/admin/reminders/templates', { method: 'PATCH', body }),

  payments: (params: { status?: string; limit?: number } = {}) =>
    api<AdminPaymentsResponse>(`/admin/payments${qs(params)}`),
  wallet: (params: { customerId?: string; type?: string; balanceType?: 'cash' | 'bonus'; limit?: number } = {}) =>
    api<AdminWalletResponse>(`/admin/wallet${qs(params)}`),
  audit: (params: { limit?: number } = {}) => api<AdminAuditResponse>(`/admin/audit${qs(params)}`),
  users: () => api<AdminUsersResponse>('/admin/users'),
  updateUser: (id: string, body: { status?: string; role?: string; branchIds?: string[] }) =>
    api<{ user: unknown }>(`/admin/users/${id}`, { method: 'PATCH', body }),

  revenueReport: (params: { from: string; to: string; branchId?: string }) =>
    api<RevenueReportResponse>(`/admin/reports/revenue${qs(params)}`),
  retentionReport: () => api<RetentionReportResponse>('/admin/reports/retention'),
  availability: (params: { branchId: string; date: string; serviceIds: string[]; staffId?: string }) =>
    api<AvailabilityResponse>(`/admin/availability${qs({ ...params, serviceIds: params.serviceIds.join(',') })}`),
};

/* ------------------------------------------------------------------ */
/* Platform console                                                    */
/* ------------------------------------------------------------------ */

export const platform = {
  overview: () => api<PlatformOverviewResponse>('/platform/overview'),
  salons: (params: { status?: string; q?: string } = {}) =>
    api<PlatformSalonsResponse>(`/platform/salons${qs(params)}`),
  salon: (id: string) => api<PlatformSalonDetailResponse>(`/platform/salons/${encodeURIComponent(id)}`),
  createSalon: (body: PlatformCreateSalonInput) =>
    api<PlatformSalonDetailResponse>('/platform/salons', { method: 'POST', body }),
  updateSalon: (id: string, body: { name?: string; address?: string; contact?: string | null; status?: 'active' | 'suspended'; plan?: 'trial' | 'growth' | 'pro' }) =>
    api<PlatformSalonDetailResponse>(`/platform/salons/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  vendors: (params: { q?: string } = {}) => api<PlatformVendorsResponse>(`/platform/vendors${qs(params)}`),
  audit: (params: { limit?: number; entityType?: string } = {}) =>
    api<PlatformAuditResponse>(`/platform/audit${qs(params)}`),
};

export interface RefundRecord {
  id: string;
  customerId: string;
  customerName?: string;
  amount: number;
  status: 'processed' | 'pending' | 'failed';
  reason: string | null;
  providerRefundId: string | null;
  createdAt: string;
}

export interface ReferralStatsResponse {
  total: number;
  registered: number;
  qualified: number;
  rewarded: number;
  reversed: number;
  rewardExpense: number;
  topReferrers: { customerId: string; name: string; qualified: number; invited: number }[];
  recent: import('./types').Referral[];
  config: import('./types').ReferralConfig;
  mode: string;
}

export const health = () => api<{ ok: boolean; time: string; nodeEnv: string; integrations: import('./types').IntegrationFlags }>('/health', { anonymous: true });
