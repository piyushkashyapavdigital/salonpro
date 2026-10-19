import crypto from 'node:crypto';
import type { Request } from 'express';
import { all, one } from '../db';
import { forbidden, notFound } from './http';

/**
 * Branch/salon scoping for every admin request.
 *
 * The scope is derived from the **session**, never from the request body, so a
 * staff member cannot widen their own access by editing a payload.
 */
export async function SCOPED(req: Request): Promise<{ salonId: string; branchIds: string[] }> {
  const auth = req.auth;
  if (!auth) throw forbidden();

  const requestedSalon = typeof req.query.salonId === 'string' ? req.query.salonId : undefined;
  let salonId: string;

  if (auth.role === 'super_admin' && requestedSalon) {
    salonId = requestedSalon;
  } else if (auth.salonId) {
    salonId = auth.salonId;
  } else {
    const salon = await one<{ id: string }>('SELECT id FROM salons LIMIT 1');
    if (!salon) throw notFound('No salon is configured yet.');
    salonId = salon.id;
  }

  let branchIds = auth.branchIds;
  if (auth.role === 'super_admin' || auth.role === 'salon_owner') {
    branchIds = (await all<{ id: string }>('SELECT id FROM branches WHERE salonId = ?', salonId)).map((b) => b.id);
  }

  return { salonId, branchIds };
}

/** Generate a short, human-readable booking reference. */
export function bookingReference(prefix = 'SP'): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `${prefix}-${out}`;
}

/** Simple in-process rate limiter for expensive endpoints. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs = 60000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > max) {
    const err = new Error('Too many requests. Please slow down.') as Error & { status?: number };
    err.status = 429;
    throw err;
  }
}
