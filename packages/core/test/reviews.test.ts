import { test, beforeAll as before, afterAll as after, beforeEach, describe } from 'bun:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, getHarness, type Harness } from './harness';
import { googleReviewUrl, normalizeGooglePlaceId } from '../src/services/reviews';

/**
 * The review funnel is deliberately asymmetric:
 *   • 4–5★ gets a Google hand-off URL;
 *   • 1–3★ is saved locally and the server never returns a Google URL;
 *   • only the owner can connect Google;
 *   • managers can read feedback, receptionists cannot.
 */
describe('salon reviews', () => {
  let h: Harness;
  let salonId: string;
  let ownerToken: string;
  let managerToken: string;
  let receptionistToken: string;

  before(async () => {
    h = await getHarness();
    await h.reset();
    salonId = await h.db.scalar<string>('SELECT id FROM salons LIMIT 1');
    ownerToken = await h.login(ACCOUNTS.owner);
    managerToken = await h.login(ACCOUNTS.manager);
    receptionistToken = await h.login(ACCOUNTS.receptionist);
  });

  beforeEach(async () => {
    await h.reset();
    salonId = await h.db.scalar<string>('SELECT id FROM salons LIMIT 1');
    ownerToken = await h.login(ACCOUNTS.owner);
    managerToken = await h.login(ACCOUNTS.manager);
    receptionistToken = await h.login(ACCOUNTS.receptionist);
  });

  after(async () => {
    await h.close();
  });

  test('normalises raw Place IDs and Google Maps URLs', () => {
    const id = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
    assert.equal(normalizeGooglePlaceId(id), id);
    assert.equal(
      normalizeGooglePlaceId(`https://www.google.com/maps/place/Salon/@1,2,3z/data=!4m2!3m1!1s${id}`),
      id,
    );
    assert.equal(
      normalizeGooglePlaceId(`https://www.google.com/maps/search/?api=1&query=salon&query_place_id=${id}`),
      id,
    );
    assert.equal(normalizeGooglePlaceId(''), null);
    assert.equal(normalizeGooglePlaceId('not a place id'), null);
    assert.equal(
      googleReviewUrl(id),
      `https://search.google.com/local/writereview?placeid=${id}`,
    );
  });

  test('the owner can connect Google, and invalid IDs are rejected', async () => {
    const before = await h.get(`/public/reviews/${salonId}`);
    assert.equal(before.status, 200);
    assert.equal(before.data.googleConfigured, false);
    assert.equal(before.data.googleReviewUrl, null);

    const bad = await h.patch('/admin/settings', { googlePlaceId: 'not a place id' }, ownerToken);
    assert.equal(bad.status, 400);

    const id = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
    const saved = await h.patch('/admin/settings', { googlePlaceId: id }, ownerToken);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.settings.googlePlaceId, id);

    const after = await h.get(`/public/reviews/${salonId}`);
    assert.equal(after.status, 200);
    assert.equal(after.data.googleConfigured, true);
    assert.equal(after.data.googleReviewUrl, googleReviewUrl(id));
    assert.equal(after.data.salon.name.length > 0, true);
    assert.equal('contact' in after.data.salon, false);
  });

  test('4–5★ gets a Google URL; 1–3★ is private and never gets one', async () => {
    const id = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
    await h.patch('/admin/settings', { googlePlaceId: id }, ownerToken);

    const positive = await h.post(
      `/public/reviews/${salonId}`,
      { rating: 5, message: 'Loved the haircut', name: 'Asha', phone: '9876543210' },
    );
    assert.equal(positive.status, 201);
    assert.equal(positive.data.review.rating, 5);
    assert.equal(positive.data.review.googleRedirected, true);
    assert.equal(positive.data.googleReviewUrl, googleReviewUrl(id));
    assert.equal(positive.data.savedLocally, true);

    const privateFeedback = await h.post(
      `/public/reviews/${salonId}`,
      { rating: 2, message: 'The wait was too long', name: 'Ravi' },
    );
    assert.equal(privateFeedback.status, 201);
    assert.equal(privateFeedback.data.review.rating, 2);
    assert.equal(privateFeedback.data.review.googleRedirected, false);
    assert.equal(privateFeedback.data.googleReviewUrl, null);

    const list = await h.get('/admin/reviews', ownerToken);
    assert.equal(list.status, 200);
    assert.equal(list.data.reviews.length, 2);
    assert.equal(list.data.stats.total, 2);
    assert.equal(list.data.stats.positive, 1);
    assert.equal(list.data.stats.privateFeedback, 1);
    assert.equal(list.data.stats.average, 3.5);
    assert.equal(list.data.reviews[0].message, 'The wait was too long');
  });

  test('without a Place ID even 5★ stays local and gets no Google URL', async () => {
    const res = await h.post(`/public/reviews/${salonId}`, { rating: 5, message: 'Great service' });
    assert.equal(res.status, 201);
    assert.equal(res.data.review.googleRedirected, false);
    assert.equal(res.data.googleReviewUrl, null);
    assert.equal(res.data.review.message, 'Great service');
  });

  test('managers can read reviews; receptionists cannot', async () => {
    const manager = await h.get('/admin/reviews', managerToken);
    assert.equal(manager.status, 200);
    const reception = await h.get('/admin/reviews', receptionistToken);
    assert.equal(reception.status, 403);
    const anonymous = await h.get('/admin/reviews');
    assert.equal(anonymous.status, 401);
  });

  test('an unknown or suspended salon has no public review page', async () => {
    const missing = await h.get('/public/reviews/does-not-exist');
    assert.equal(missing.status, 404);

    await h.db.run("UPDATE salons SET status = 'suspended' WHERE id = ?", salonId);
    const suspended = await h.get(`/public/reviews/${salonId}`);
    assert.equal(suspended.status, 404);
  });
});
