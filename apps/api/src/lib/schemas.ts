import { z } from 'zod';
import { APPOINTMENT_STATUSES, ROLES } from '@salonpro/shared';

export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const bookingCreateSchema = z.object({
  branchId: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1, 'Choose at least one service'),
  staffId: z.string().min(1).optional().nullable(),
  date: dateSchema,
  startTime: timeSchema,
  couponCode: z.string().max(40).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  paymentPreference: z.enum(['wallet', 'online', 'pay_at_salon']).optional(),
  bookingSource: z.enum(['app', 'walk_in', 'referral', 'admin']).optional(),
  referralToken: z.string().max(400).optional().nullable(),
  idempotencyKey: z.string().max(120).optional().nullable(),
  customerId: z.string().optional(),
});

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  description: z.string().max(500).default(''),
  price: z.number().int().min(0).max(100_000_00),
  durationMinutes: z.number().int().min(5).max(600),
  active: z.boolean().default(true),
  imageEmoji: z.string().max(8).default('✂️'),
  sortOrder: z.number().int().default(0),
});

export const roleSchema = z.enum(ROLES);

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().email().nullable().optional(),
  role: roleSchema.optional(),
  status: z.enum(['active', 'invited', 'deactivated']).optional(),
});

export const couponSchema = z.object({
  code: z.string().trim().min(3).max(30),
  type: z.enum(['percent', 'flat']),
  value: z.number().int().min(1),
  minAmount: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(0).nullable().default(null),
  startAt: z.string(),
  endAt: z.string(),
  usageLimit: z.number().int().min(1).nullable().default(null),
  active: z.boolean().default(true),
  description: z.string().max(200).default(''),
});

export const branchSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(4).max(200),
  contact: z.string().max(40).nullable().default(null),
  openingHours: z.record(
    z.object({ closed: z.boolean(), open: timeSchema, close: timeSchema }),
  ),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const staffSchema = z.object({
  userId: z.string().optional(),
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().optional(),
  branchId: z.string().min(1).optional(),
  designation: z.string().trim().min(2).max(60).optional(),
  workingHours: z.record(z.object({ off: z.boolean(), start: timeSchema, end: timeSchema })).optional(),
  commissionRules: z.object({ serviceBps: z.number().int().min(0).max(10000), productBps: z.number().int().min(0).max(10000) }).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const rechargeOfferSchema = z.object({
  payAmount: z.number().int().min(100),
  bonusAmount: z.number().int().min(0),
  label: z.string().max(40).default(''),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
