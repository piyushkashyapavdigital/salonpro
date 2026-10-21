import crypto from 'node:crypto';
import { maskPhone, type SalonReview } from '@salonpro/shared';
import { all, one, run } from '../db';
import { env } from '../env';

/**
 * Google review funnel.
 *
 * A Place ID is the only thing the salon has to configure. Google does not let
 * a website pre-fill the review text, so the hosted page copies the customer's
 * words to the clipboard and then opens Google's own review form. 1–3★
 * feedback is stored only in SalonPro and never redirected to Google.
 *
 * Customers who are already signed in to the app receive a short-lived signed
 * review token. The hosted page exchanges that token for the customer identity
 * on the server, so the reviewer never has to type their name or phone again.
 */

const PLACE_ID = /^[A-Za-z0-9_-]{5,300}$/;
const REVIEW_TOKEN_DAYS = 14;

/**
 * Accept either a raw Place ID or a Google Maps URL that contains one.
 * Returns null for an empty value or something that does not look like a
 * Place ID, so callers can decide whether to reject or clear the setting.
 */
export function normalizeGooglePlaceId(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  let value = raw;
  if (/^https?:\/\//i.test(raw) || raw.includes('google.')) {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      /* keep the original if it is not valid percent-encoding */
    }
    const match =
      decoded.match(/(?:place_id[:=]|query_place_id=)([A-Za-z0-9_-]{5,300})/i) ??
      decoded.match(/!1s((?!0x)[A-Za-z0-9_-]{5,300})/i) ??
      decoded.match(/\/place\/(ChIJ[A-Za-z0-9_-]{5,300})/i);
    if (match) value = match[1]!;
  }

  return PLACE_ID.test(value) ? value : null;
}

export function googleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/* ------------------------------------------------------------------ */
/* Signed, short-lived review hand-off tokens                          */
/* ------------------------------------------------------------------ */

interface ReviewTokenPayload {
  v: 1;
  customerId: string;
  salonId: string;
  appointmentId: string;
  exp: number;
}

function signReviewBody(body: string): string {
  return crypto.createHmac('sha256', env.sessionSecret).update(body).digest('base64url');
}

/**
 * Issue a token that can only review one appointment at one salon. It is
 * signed with the server secret, so the client cannot invent a customer id.
 */
export function createReviewToken(input: {
  customerId: string;
  salonId: string;
  appointmentId: string;
  ttlDays?: number;
}): { token: string; expiresAt: string } {
  const days = Math.max(1, Math.min(30, input.ttlDays ?? REVIEW_TOKEN_DAYS));
  const payload: ReviewTokenPayload = {
    v: 1,
    customerId: input.customerId,
    salonId: input.salonId,
    appointmentId: input.appointmentId,
    exp: Date.now() + days * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {
    token: `${body}.${signReviewBody(body)}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export function verifyReviewToken(token: string | null | undefined, salonId?: string): ReviewTokenPayload | null {
  const raw = (token ?? '').trim();
  if (!raw) return null;
  const [body, signature] = raw.split('.');
  if (!body || !signature) return null;

  const expected = signReviewBody(body);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ReviewTokenPayload;
    if (
      payload.v !== 1 ||
      typeof payload.customerId !== 'string' ||
      typeof payload.salonId !== 'string' ||
      typeof payload.appointmentId !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now()
    ) {
      return null;
    }
    if (salonId && payload.salonId !== salonId) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface ReviewIdentity {
  customerId: string;
  appointmentId: string;
  name: string;
  phone: string;
  phoneMasked: string;
  visitDate: string;
}

/**
 * Resolve a token to a real customer + completed visit. A token is not trusted
 * on its own: the appointment must still belong to that customer at that salon.
 */
export async function reviewerFromToken(
  token: string | null | undefined,
  salonId: string,
): Promise<ReviewIdentity | null> {
  const payload = verifyReviewToken(token, salonId);
  if (!payload) return null;

  const row = await one<{
    id: string;
    name: string;
    phone: string;
    appointmentId: string;
    completedAt: string;
  }>(
    `SELECT u.id, u.name, u.phone, sr.appointmentId, sr.completedAt
       FROM users u
       JOIN service_records sr ON sr.customerId = u.id
      WHERE u.id = ?
        AND u.role = 'customer'
        AND u.status <> 'deactivated'
        AND sr.salonId = ?
        AND sr.appointmentId = ?
      LIMIT 1`,
    payload.customerId,
    salonId,
    payload.appointmentId,
  );
  if (!row) return null;

  return {
    customerId: row.id,
    appointmentId: row.appointmentId,
    name: row.name,
    phone: row.phone,
    phoneMasked: maskPhone(row.phone),
    visitDate: row.completedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

export interface ReviewInput {
  salonId: string;
  rating: number;
  message?: string;
  customerId?: string | null;
  appointmentId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  googleRedirected: boolean;
  source?: string;
  userAgent?: string | null;
  ip?: string | null;
}

export interface ReviewStats {
  total: number;
  average: number;
  fiveStar: number;
  fourStar: number;
  threeStar: number;
  twoStar: number;
  oneStar: number;
  positive: number;
  privateFeedback: number;
  googleRedirected: number;
}

function toReview(row: Record<string, any>): SalonReview {
  return {
    id: row.id,
    salonId: row.salonId,
    rating: Number(row.rating),
    message: row.message ?? '',
    customerId: row.customerId ?? null,
    appointmentId: row.appointmentId ?? null,
    customerName: row.customerName ?? null,
    customerPhone: row.customerPhone ?? null,
    googleRedirected: Boolean(row.googleRedirected),
    source: row.source ?? 'hosted_review',
    createdAt: row.createdAt,
  };
}

export async function createSalonReview(input: ReviewInput): Promise<SalonReview> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO salon_reviews
       (id, salonId, rating, message, customerId, appointmentId, customerName, customerPhone, googleRedirected, source, userAgent, ip, createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    input.salonId,
    input.rating,
    input.message?.trim() ?? '',
    input.customerId ?? null,
    input.appointmentId ?? null,
    input.customerName?.trim() || null,
    input.customerPhone?.trim() || null,
    input.googleRedirected ? 1 : 0,
    input.source ?? 'hosted_review',
    input.userAgent?.slice(0, 300) || null,
    input.ip?.slice(0, 80) || null,
    createdAt,
  );
  return {
    id,
    salonId: input.salonId,
    rating: input.rating,
    message: input.message?.trim() ?? '',
    customerId: input.customerId ?? null,
    appointmentId: input.appointmentId ?? null,
    customerName: input.customerName?.trim() || null,
    customerPhone: input.customerPhone?.trim() || null,
    googleRedirected: input.googleRedirected,
    source: input.source ?? 'hosted_review',
    createdAt,
  };
}

export async function listSalonReviews(salonId: string, limit = 100): Promise<SalonReview[]> {
  const rows = await all(
    `SELECT id, salonId, rating, message, customerId, appointmentId, customerName, customerPhone, googleRedirected, source, createdAt
       FROM salon_reviews
      WHERE salonId = ?
      ORDER BY createdAt DESC
      LIMIT ?`,
    salonId,
    Math.max(1, Math.min(500, Math.floor(limit))),
  );
  return rows.map(toReview);
}

export async function reviewForAppointment(appointmentId: string): Promise<SalonReview | null> {
  const row = await one(
    `SELECT id, salonId, rating, message, customerId, appointmentId, customerName, customerPhone, googleRedirected, source, createdAt
       FROM salon_reviews
      WHERE appointmentId = ?
      LIMIT 1`,
    appointmentId,
  );
  return row ? toReview(row) : null;
}

export async function reviewStats(salonId: string): Promise<ReviewStats> {
  const row = await one<Record<string, any>>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(AVG(rating), 0) AS average,
       COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0) AS fiveStar,
       COALESCE(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END), 0) AS fourStar,
       COALESCE(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END), 0) AS threeStar,
       COALESCE(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END), 0) AS twoStar,
       COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0) AS oneStar,
       COALESCE(SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END), 0) AS positive,
       COALESCE(SUM(CASE WHEN rating <= 3 THEN 1 ELSE 0 END), 0) AS privateFeedback,
       COALESCE(SUM(CASE WHEN googleRedirected = 1 THEN 1 ELSE 0 END), 0) AS googleRedirected
     FROM salon_reviews
     WHERE salonId = ?`,
    salonId,
  );

  return {
    total: Number(row?.total ?? 0),
    average: Math.round(Number(row?.average ?? 0) * 10) / 10,
    fiveStar: Number(row?.fiveStar ?? 0),
    fourStar: Number(row?.fourStar ?? 0),
    threeStar: Number(row?.threeStar ?? 0),
    twoStar: Number(row?.twoStar ?? 0),
    oneStar: Number(row?.oneStar ?? 0),
    positive: Number(row?.positive ?? 0),
    privateFeedback: Number(row?.privateFeedback ?? 0),
    googleRedirected: Number(row?.googleRedirected ?? 0),
  };
}
