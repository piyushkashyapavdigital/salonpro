/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: packages/shared/src/index.ts
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
export * from './format';

/**
 * SalonPro shared domain types.
 *
 * These types are the contract between the API and the web clients.
 * They are consumed directly as TypeScript source by both apps (no build step).
 *
 * All money values are integers in **paise** (1 INR = 100 paise).
 * Never use floating point for money.
 */

/* ------------------------------------------------------------------ */
/* Roles & permissions                                                 */
/* ------------------------------------------------------------------ */

export const ROLES = [
  'super_admin',
  'salon_owner',
  'branch_manager',
  'receptionist',
  'salon_staff',
  'customer',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Platform Admin',
  salon_owner: 'Salon Owner',
  branch_manager: 'Branch Manager',
  receptionist: 'Receptionist',
  salon_staff: 'Salon Staff',
  customer: 'Customer',
};

/** Roles that can open a staff/vendor workspace. */
export const ADMIN_ROLES: Role[] = [
  'super_admin',
  'salon_owner',
  'branch_manager',
  'receptionist',
  'salon_staff',
];

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

/**
 * The permission catalog is the contract between the API and every client.
 *
 * Roles are only bundles of these strings. The API checks the permission on
 * every sensitive route; the mobile app uses the same list to decide what to
 * render. Hiding a tab is a UX decision, never a security boundary.
 */
export const PERMISSIONS = [
  /* platform */
  'platform.metrics.read',
  'platform.salon.read',
  'platform.salon.manage',
  'platform.vendor.read',
  'platform.vendor.invite',
  'platform.audit.read',

  /* salon / vendor */
  'salon.read',
  'salon.settings.manage',
  'salon.branch.read',
  'salon.branch.manage',
  'salon.service.read',
  'salon.service.manage',
  'salon.staff.read',
  'salon.staff.manage',
  'salon.customer.read',
  'salon.customer.manage',
  'salon.appointment.read',
  'salon.appointment.manage',
  'salon.appointment.complete',
  'salon.payment.read',
  'salon.payment.collect',
  'salon.payment.refund',
  'salon.wallet.adjust',
  'salon.report.read',
  'salon.offer.read',
  'salon.offer.manage',
  'salon.reminder.read',
  'salon.reminder.manage',
  'salon.referral.read',
  'salon.referral.manage',
  'salon.user.manage',
  'salon.audit.read',

  /* client */
  'client.profile.read',
  'client.profile.manage',
  'client.booking.read',
  'client.booking.create',
  'client.booking.cancel',
  'client.wallet.read',
  'client.payment.create',
  'client.offer.read',
  'client.referral.read',
  'client.notification.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PLATFORM_PERMISSIONS: readonly Permission[] = [
  'platform.metrics.read',
  'platform.salon.read',
  'platform.salon.manage',
  'platform.vendor.read',
  'platform.vendor.invite',
  'platform.audit.read',
];

const ALL_SALON_PERMISSIONS: readonly Permission[] = [
  'salon.read',
  'salon.settings.manage',
  'salon.branch.read',
  'salon.branch.manage',
  'salon.service.read',
  'salon.service.manage',
  'salon.staff.read',
  'salon.staff.manage',
  'salon.customer.read',
  'salon.customer.manage',
  'salon.appointment.read',
  'salon.appointment.manage',
  'salon.appointment.complete',
  'salon.payment.read',
  'salon.payment.collect',
  'salon.payment.refund',
  'salon.wallet.adjust',
  'salon.report.read',
  'salon.offer.read',
  'salon.offer.manage',
  'salon.reminder.read',
  'salon.reminder.manage',
  'salon.referral.read',
  'salon.referral.manage',
  'salon.user.manage',
  'salon.audit.read',
];

const MANAGER_PERMISSIONS: readonly Permission[] = [
  'salon.read',
  'salon.branch.read',
  'salon.service.read',
  'salon.service.manage',
  'salon.staff.read',
  'salon.staff.manage',
  'salon.customer.read',
  'salon.customer.manage',
  'salon.appointment.read',
  'salon.appointment.manage',
  'salon.appointment.complete',
  'salon.payment.read',
  'salon.payment.collect',
  'salon.payment.refund',
  'salon.report.read',
  'salon.offer.read',
  'salon.reminder.read',
  'salon.referral.read',
];

const RECEPTION_PERMISSIONS: readonly Permission[] = [
  'salon.read',
  'salon.branch.read',
  'salon.service.read',
  'salon.customer.read',
  'salon.customer.manage',
  'salon.appointment.read',
  'salon.appointment.manage',
  'salon.appointment.complete',
  'salon.payment.read',
  'salon.payment.collect',
];

const STAFF_PERMISSIONS: readonly Permission[] = [
  'salon.read',
  'salon.branch.read',
  'salon.service.read',
  'salon.appointment.read',
  'salon.appointment.complete',
];

const CLIENT_PERMISSIONS: readonly Permission[] = [
  'client.profile.read',
  'client.profile.manage',
  'client.booking.read',
  'client.booking.create',
  'client.booking.cancel',
  'client.wallet.read',
  'client.payment.create',
  'client.offer.read',
  'client.referral.read',
  'client.notification.read',
];

/**
 * Role -> permission bundles.
 *
 * `super_admin` keeps the salon bundle temporarily so the existing admin
 * screens keep working while the platform console is introduced. The target
 * state is platform permissions only, plus an audited support-mode token.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: [...PLATFORM_PERMISSIONS, ...ALL_SALON_PERMISSIONS],
  salon_owner: ALL_SALON_PERMISSIONS,
  branch_manager: MANAGER_PERMISSIONS,
  receptionist: RECEPTION_PERMISSIONS,
  salon_staff: STAFF_PERMISSIONS,
  customer: CLIENT_PERMISSIONS,
};

export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/* ------------------------------------------------------------------ */
/* Workspaces                                                          */
/* ------------------------------------------------------------------ */

export const WORKSPACES = ['platform', 'vendor', 'client'] as const;
export type Workspace = (typeof WORKSPACES)[number];

export function workspaceForRole(role: Role): Workspace {
  if (role === 'super_admin') return 'platform';
  if (role === 'customer') return 'client';
  return 'vendor';
}

export type UserStatus = 'active' | 'invited' | 'deactivated';

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export interface User {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  salonId: string | null;
  branchIds: string[];
  /** staff row id when the user is a stylist/staff member */
  staffId: string | null;
  /**
   * The role's permission bundle, resolved by the server on every request.
   * Clients may render from it, but every route still enforces it server-side.
   */
  permissions: Permission[];
  /** Which workspace the unified app should open. */
  workspace: Workspace;
}

export interface Branch {
  id: string;
  salonId: string;
  name: string;
  address: string;
  contact: string | null;
  status: 'active' | 'inactive';
  openingHours: OpeningHours;
  timezone: string;
  createdAt: string;
}

export interface OpeningHours {
  /** 0 = Sunday ... 6 = Saturday */
  [weekday: number]: DayHours;
}

export interface DayHours {
  closed: boolean;
  open: string; // "09:00"
  close: string; // "21:00"
}

export interface Salon {
  id: string;
  name: string;
  address: string;
  contact: string | null;
  timezone: string;
  currency: string;
  ownerId: string;
  settings: SalonSettings;
  createdAt: string;
}

export interface SalonSettings {
  /** ordered list of balances to spend from */
  spendingOrder: BalanceType[];
  /** stages that are enabled */
  reminderStages: ReminderStage[];
  reminderChannels: NotificationChannel[];
  referral: ReferralConfig;
  bonusExpiryDays: number | null;
  cashExpiryDays: null; // purchased cash value never expires (spec: do not silently expire)
  slotGranularityMinutes: number;
  loyaltyEnabled: boolean;
  loyaltyPointsPerHundred: number;
  templates: Record<ReminderTemplate, string>;
}

export interface ReferralConfig {
  referrerReward: number; // paise
  refereeReward: number; // paise
  currency: string;
  maxRewardsPerMonth: number;
  requireFirstPaidVisit: boolean;
}

export const REMINDER_STAGES = ['day7', 'day14', 'day30', 'appointment'] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

export const REMINDER_TEMPLATES = [
  'day7',
  'day14',
  'day30',
  'appointment_confirmation',
  'referral_reward',
  'wallet_credit',
] as const;
export type ReminderTemplate = (typeof REMINDER_TEMPLATES)[number];

export type NotificationChannel = 'whatsapp' | 'push' | 'sms' | 'email';

export interface Staff {
  id: string;
  salonId: string;
  branchId: string;
  userId: string;
  name: string;
  designation: string;
  workingHours: WorkingHours;
  commissionRules: CommissionRules;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface WorkingHours {
  [weekday: number]: { off: boolean; start: string; end: string };
}

export interface CommissionRules {
  /** percent of net service value, in basis points (500 = 5%) */
  serviceBps: number;
  /** percent of product sales, in basis points */
  productBps: number;
}

export interface StaffBreak {
  id: string;
  staffId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface Service {
  id: string;
  salonId: string;
  name: string;
  category: string;
  description: string;
  price: number; // paise
  durationMinutes: number;
  active: boolean;
  imageEmoji: string;
  createdAt: string;
}

export const APPOINTMENT_STATUSES = [
  'booked',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that hold a slot on the calendar. */
export const BLOCKING_STATUSES: AppointmentStatus[] = [
  'booked',
  'confirmed',
  'checked_in',
  'in_progress',
];

export type BookingSource = 'app' | 'walk_in' | 'referral' | 'admin';
export type PaymentMethod = 'wallet' | 'online' | 'pay_at_salon' | 'cash' | 'upi_card';

export interface Appointment {
  id: string;
  salonId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  staffId: string | null;
  staffName: string | null;
  services: AppointmentService[];
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  status: AppointmentStatus;
  bookingSource: BookingSource;
  referralId: string | null;
  couponCode: string | null;
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  serviceRecords?: ServiceRecord[];
}

export interface AppointmentService {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded';

export interface ServiceRecord {
  id: string;
  appointmentId: string;
  customerId: string;
  staffId: string | null;
  services: AppointmentService[];
  grossAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: PaymentMethod;
  walletAmount: number;
  onlineAmount: number;
  cashAmount: number;
  completedAt: string;
  createdAt: string;
}

/* -------------------------- wallet -------------------------------- */

export type BalanceType = 'bonus' | 'cash';

export type WalletTransactionType =
  | 'recharge'
  | 'spend'
  | 'refund'
  | 'referral_bonus'
  | 'adjustment'
  | 'reversal'
  | 'expiry';

export type WalletTransactionStatus = 'posted' | 'pending' | 'reversed';

export interface Wallet {
  id: string;
  salonId: string;
  customerId: string;
  status: 'active' | 'frozen';
  cashBalance: number;
  bonusBalance: number;
  totalBalance: number;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  customerId: string;
  type: WalletTransactionType;
  amount: number; // signed paise (credit positive, debit negative)
  balanceType: BalanceType;
  paymentId: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  status: WalletTransactionStatus;
  reason: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface RechargeOffer {
  id: string;
  salonId: string;
  payAmount: number; // paise
  bonusAmount: number; // paise
  totalValue: number; // paise
  label: string;
  active: boolean;
  sortOrder: number;
}

/* -------------------------- payments ------------------------------ */

export type PaymentOrderStatus =
  | 'created'
  | 'attempted'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export interface PaymentOrder {
  id: string;
  salonId: string;
  customerId: string;
  customerName?: string;
  razorpayOrderId: string;
  paymentId: string | null;
  amount: number;
  amountPaid: number;
  currency: string;
  purpose: 'wallet_recharge' | 'appointment';
  status: PaymentOrderStatus;
  mode: 'live' | 'test' | 'simulated';
  referenceId: string | null;
  receipt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface Refund {
  id: string;
  paymentOrderId: string;
  appointmentId: string | null;
  customerId: string;
  amount: number;
  reason: string;
  status: 'processed' | 'pending' | 'failed';
  actorId: string;
  walletTransactionId: string | null;
  createdAt: string;
}

/* -------------------------- referrals ----------------------------- */

export interface ReferralCode {
  id: string;
  salonId: string;
  customerId: string;
  code: string;
  status: 'active' | 'disabled';
  createdAt: string;
}

export type ReferralStatus =
  | 'pending_attribution'
  | 'registered'
  | 'qualified'
  | 'rewarded'
  | 'rejected'
  | 'reversed';

export type RewardStatus = 'pending' | 'credited' | 'reversed' | 'rejected';

export interface Referral {
  id: string;
  salonId: string;
  referrerId: string;
  referrerName?: string;
  referredCustomerId: string | null;
  referredCustomerName?: string | null;
  referralCode: string;
  status: ReferralStatus;
  qualifyingAppointmentId: string | null;
  referrerRewardStatus: RewardStatus;
  refereeRewardStatus: RewardStatus;
  createdAt: string;
  qualifiedAt: string | null;
}

export interface RewardTransaction {
  id: string;
  customerId: string;
  referralId: string;
  amount: number;
  type: 'referrer' | 'referee' | 'reversal';
  status: RewardStatus;
  walletTransactionId: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface ReferralDashboard {
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
}

/* -------------------------- notifications ------------------------- */

export type NotificationStatus = 'queued' | 'pending' | 'sent' | 'delivered' | 'failed' | 'suppressed';

export interface NotificationRecord {
  id: string;
  salonId: string;
  customerId: string;
  customerName?: string;
  channel: NotificationChannel;
  template: ReminderTemplate;
  stage: ReminderStage | 'transactional';
  scheduledAt: string;
  sentAt: string | null;
  status: NotificationStatus;
  errorDetails: string | null;
  body: string | null;
  reminderKey: string;
  appointmentId: string | null;
  attempts: number;
  createdAt: string;
}

export interface NotificationPreferences {
  customerId: string;
  whatsappConsent: boolean;
  pushEnabled: boolean;
  promotionalConsent: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

/* -------------------------- coupons ------------------------------- */

export interface Coupon {
  id: string;
  salonId: string;
  code: string;
  type: 'percent' | 'flat';
  value: number; // percent (whole) or paise
  minAmount: number;
  maxDiscount: number | null;
  startAt: string;
  endAt: string;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  description: string;
}

/* -------------------------- misc ---------------------------------- */

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

export interface AuditLog {
  id: string;
  actorId: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: Record<string, unknown> | null;
  ip: string | null;
  timestamp: string;
}

export interface LoyaltyAccount {
  customerId: string;
  points: number;
  lifetimePoints: number;
  updatedAt: string;
}

/* -------------------------- analytics ----------------------------- */

export interface TodayOverview {
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
  referralVisits: number;
  walletCashLiability: number;
  walletBonusLiability: number;
  referralRewardExpense: number;
}

export interface DailyTrendPoint {
  date: string;
  revenue: number;
  visits: number;
  appointments: number;
}

export interface RevenueReport {
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

export interface RetentionReport {
  inactive30: number;
  inactive60: number;
  inactive90: number;
  popularServices: { name: string; count: number }[];
  repeatCustomerPercent: number;
  averageSpend: number;
  referralAcquisition: number;
  reminderConversions: { stage: ReminderStage; sent: number; booked: number; conversion: number }[];
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
  /** true when the branch is closed or the day is a holiday */
  closed: boolean;
  reason?: string;
}

export interface ApiErrorShape {
  error: string;
  message: string;
  details?: unknown;
}
