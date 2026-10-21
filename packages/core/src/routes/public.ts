import { Router } from '../lib/router';
import { z } from 'zod';
import { one } from '../db';
import { clientIp, handler, notFound } from '../lib/http';
import { assertUnderRateLimit, recordAttempt } from '../auth';
import { readSettings } from '../services/settings';
import { createSalonReview, googleReviewUrl, normalizeGooglePlaceId } from '../services/reviews';

/**
 * Public, unauthenticated endpoints used by the hosted review page.
 *
 * They deliberately expose only what a customer needs to review one salon:
 * its display name/address and whether Google is connected. Owner, contact,
 * staff, customers and settings stay private.
 */
export const publicRouter = new Router();

type PublicSalon = {
  id: string;
  name: string;
  address: string;
  status: string;
  settings: string;
};

async function findSalon(salonId: string): Promise<PublicSalon> {
  const salon = await one<PublicSalon>(
    'SELECT id, name, address, status, settings FROM salons WHERE id = ?',
    salonId,
  );
  if (!salon || salon.status !== 'active') throw notFound('That salon review page is not available.');
  return salon;
}

publicRouter.get(
  '/reviews/:salonId',
  handler(async (req, res) => {
    const salon = await findSalon(req.params.salonId!);
    const settings = readSettings(salon.settings);
    const placeId = normalizeGooglePlaceId(settings.googlePlaceId);
    res.setHeader('cache-control', 'no-store');
    res.json({
      salon: { id: salon.id, name: salon.name, address: salon.address },
      googleConfigured: Boolean(placeId),
      googleReviewUrl: placeId ? googleReviewUrl(placeId) : null,
      ratingPolicy: { googleMin: 4, privateMax: 3 },
    });
  }),
);

publicRouter.post(
  '/reviews/:salonId',
  handler(async (req, res) => {
    const salon = await findSalon(req.params.salonId!);
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        message: z.string().trim().max(1500).optional(),
        name: z.string().trim().max(80).optional(),
        phone: z.string().trim().max(30).optional(),
      })
      .parse(req.body);

    const ip = clientIp(req);
    await assertUnderRateLimit(`review:${salon.id}:${ip}`, 'review_submit', 10, 60);

    const settings = readSettings(salon.settings);
    const placeId = normalizeGooglePlaceId(settings.googlePlaceId);
    /* Only positive ratings are ever offered the Google hand-off. The server
     * decides this, not the browser: a 1–3★ request cannot receive a Google
     * URL even if a caller edits the page. */
    const googleRedirected = body.rating >= 4 && Boolean(placeId);

    const review = await createSalonReview({
      salonId: salon.id,
      rating: body.rating,
      message: body.message,
      customerName: body.name,
      customerPhone: body.phone,
      googleRedirected,
      source: 'hosted_review',
      userAgent: req.get('user-agent'),
      ip,
    });
    await recordAttempt(`review:${salon.id}:${ip}`, 'review_submit');

    res.status(201).json({
      ok: true,
      review,
      savedLocally: true,
      googleReviewUrl: googleRedirected && placeId ? googleReviewUrl(placeId) : null,
      message: googleRedirected
        ? 'Your review is ready for Google.'
        : 'Thank you — this feedback stays private with the salon.',
    });
  }),
);
