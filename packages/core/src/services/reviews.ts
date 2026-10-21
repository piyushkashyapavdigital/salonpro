import crypto from 'node:crypto';
import { all, one, run } from '../db';
import type { SalonReview } from '@salonpro/shared';

/**
 * Google review funnel.
 *
 * A Place ID is the only thing the salon has to configure. Google does not let
 * a website pre-fill the review text, so the hosted page copies the customer's
 * words to the clipboard and then opens Google's own review form. 1–3★
 * feedback is stored only in SalonPro and never redirected to Google.
 */

const PLACE_ID = /^[A-Za-z0-9_-]{5,300}$/;

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

export interface ReviewInput {
  salonId: string;
  rating: number;
  message?: string;
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
       (id, salonId, rating, message, customerName, customerPhone, googleRedirected, source, userAgent, ip, createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    input.salonId,
    input.rating,
    input.message?.trim() ?? '',
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
    customerName: input.customerName?.trim() || null,
    customerPhone: input.customerPhone?.trim() || null,
    googleRedirected: input.googleRedirected,
    source: input.source ?? 'hosted_review',
    createdAt,
  };
}

export async function listSalonReviews(salonId: string, limit = 100): Promise<SalonReview[]> {
  const rows = await all(
    `SELECT id, salonId, rating, message, customerName, customerPhone, googleRedirected, source, createdAt
       FROM salon_reviews
      WHERE salonId = ?
      ORDER BY createdAt DESC
      LIMIT ?`,
    salonId,
    Math.max(1, Math.min(500, Math.floor(limit))),
  );
  return rows.map(toReview);
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
