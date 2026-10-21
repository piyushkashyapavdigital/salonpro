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

  test('a signed-in customer reviews through their own session — no name or phone form', async () => {
    const customerToken = await h.login(ACCOUNTS.customer1);
    const profile = await h.get('/customer/profile', customerToken);
    assert.equal(profile.status, 200);

    const link = await h.post('/customer/reviews/link', {}, customerToken);
    assert.equal(link.status, 200);
    assert.equal(link.data.alreadyReviewed, false);
    assert.ok(link.data.token, 'a signed review token is issued');
    assert.ok(link.data.path.startsWith(`/r/${salonId}`), 'the link points at the hosted page');

    const page = await h.get(`/public/reviews/${salonId}?t=${encodeURIComponent(link.data.token)}`);
    assert.equal(page.status, 200);
    assert.equal(page.data.tokenInvalid, false);
    assert.equal(page.data.reviewer.name, profile.data.user.name);
    assert.equal(page.data.reviewer.phoneMasked.includes(profile.data.user.phone), false, 'the raw phone never leaves the server');

    /* A customer can ask for the link of one specific visit, but only of
     * their own completed visit. */
    const visit = await h.db.one<{ appointmentId: string }>(
      'SELECT appointmentId FROM service_records WHERE customerId = ? ORDER BY completedAt DESC LIMIT 1',
      profile.data.user.id,
    );
    const specific = await h.post('/customer/reviews/link', { appointmentId: visit!.appointmentId }, customerToken);
    assert.equal(specific.status, 200);
    assert.equal(specific.data.appointmentId, visit!.appointmentId);

    const foreign = await h.post('/customer/reviews/link', { appointmentId: 'someone-elses-visit' }, customerToken);
    assert.equal(foreign.status, 404);

    const submitted = await h.post(`/public/reviews/${salonId}`, {
      rating: 5,
      message: 'Loved the service',
      token: link.data.token,
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.data.verified, true);
    assert.equal(submitted.data.review.customerId, profile.data.user.id);
    assert.equal(submitted.data.review.customerName, profile.data.user.name);
    assert.equal(submitted.data.review.appointmentId, link.data.appointmentId);

    const list = await h.get('/admin/reviews', ownerToken);
    assert.equal(list.status, 200);
    assert.equal(list.data.reviews[0].customerId, profile.data.user.id);

    /* A second review for the same visit is refused, so one tap cannot spam. */
    const again = await h.post(`/public/reviews/${salonId}`, { rating: 1, token: link.data.token });
    assert.equal(again.status, 409);
  });

  test('a review link that is not signed by the server is refused', async () => {
    const customerToken = await h.login(ACCOUNTS.customer1);
    const link = await h.post('/customer/reviews/link', {}, customerToken);
    const tampered = `${String(link.data.token).slice(0, -4)}0000`;

    const page = await h.get(`/public/reviews/${salonId}?t=${encodeURIComponent(tampered)}`);
    assert.equal(page.status, 200);
    assert.equal(page.data.reviewer, null);
    assert.equal(page.data.tokenInvalid, true);

    const submitted = await h.post(`/public/reviews/${salonId}`, { rating: 4, token: tampered });
    assert.equal(submitted.status, 401);
  });

  test('only a customer account can mint a review link', async () => {
    const owner = await h.post('/customer/reviews/link', {}, ownerToken);
    assert.equal(owner.status, 403);
  });

  test('an unknown or suspended salon has no public review page', async () => {
    const missing = await h.get('/public/reviews/does-not-exist');
    assert.equal(missing.status, 404);

    await h.db.run("UPDATE salons SET status = 'suspended' WHERE id = ?", salonId);
    const suspended = await h.get(`/public/reviews/${salonId}`);
    assert.equal(suspended.status, 404);
  });
});
