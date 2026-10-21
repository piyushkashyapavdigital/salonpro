import { test, beforeAll as before, afterAll as after, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { getHarness, ACCOUNTS, type Harness } from './harness';

let h: Harness;
before(async () => {
  h = await getHarness();
});
beforeEach(async () => {
  await h.reset();
});
after(async () => {
  await h.close();
});

async function platformToken() {
  return h.login(ACCOUNTS.superAdmin);
}

async function createSalon(phone = '9812345678') {
  const token = await platformToken();
  const res = await h.post<any>(
    '/platform/salons',
    {
      name: 'Indiranagar Studio',
      address: '100 Feet Road, Bengaluru',
      contact: '08012345678',
      ownerName: 'Nisha Rao',
      ownerPhone: phone,
    },
    token,
  );
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

async function signInOwner(phone: string) {
  const request = await h.post<any>('/auth/otp/request', { phone });
  assert.equal(request.status, 200, JSON.stringify(request.data));
  const verify = await h.post<any>('/auth/otp/verify', {
    phone,
    code: request.data.devCode,
    name: 'Nisha Rao',
  });
  assert.equal(verify.status, 200, JSON.stringify(verify.data));
  return verify.data;
}

test('the platform surface is closed to every non-platform role', async () => {
  const anonymous = await h.get('/platform/overview');
  assert.equal(anonymous.status, 401);

  for (const phone of [ACCOUNTS.owner, ACCOUNTS.manager, ACCOUNTS.customer1]) {
    const token = await h.login(phone);
    const res = await h.get('/platform/overview', token);
    assert.equal(res.status, 403, `${phone} must not read platform metrics`);
  }
});

test('sessions carry the permission bundle and workspace', async () => {
  const admin = await h.login(ACCOUNTS.superAdmin);
  const adminMe = await h.get<any>('/auth/me', admin);
  assert.equal(adminMe.data.user.workspace, 'platform');
  assert.ok(adminMe.data.user.permissions.includes('platform.salon.manage'));

  const owner = await h.login(ACCOUNTS.owner);
  const ownerMe = await h.get<any>('/auth/me', owner);
  assert.equal(ownerMe.data.user.workspace, 'vendor');
  assert.ok(ownerMe.data.user.permissions.includes('salon.settings.manage'));
  assert.equal(ownerMe.data.user.permissions.includes('platform.salon.manage'), false);

  const customer = await h.login(ACCOUNTS.customer1);
  const customerMe = await h.get<any>('/auth/me', customer);
  assert.equal(customerMe.data.user.workspace, 'client');
  assert.ok(customerMe.data.user.permissions.includes('client.booking.create'));
  assert.equal(customerMe.data.user.permissions.includes('salon.appointment.manage'), false);
});

test('platform creates a salon, its first branch and an invited owner', async () => {
  const detail = await createSalon();
  assert.equal(detail.salon.name, 'Indiranagar Studio');
  assert.equal(detail.salon.status, 'active');
  assert.equal(detail.salon.plan, 'trial');
  assert.equal(detail.salon.branchCount, 1);
  assert.equal(detail.salon.owner.name, 'Nisha Rao');
  assert.equal(detail.branches.length, 1);

  const ownerRow = await h.db.one<any>('SELECT id, role, status FROM users WHERE phone = ?', '9812345678');
  assert.equal(ownerRow.role, 'salon_owner');
  assert.equal(ownerRow.status, 'invited');

  const offers = await h.db.all<any>('SELECT payAmount, bonusAmount FROM recharge_offers WHERE salonId = ? ORDER BY sortOrder', detail.salon.id);
  assert.deepEqual(
    offers.map((o) => [o.payAmount, o.bonusAmount]),
    [
      [50_000, 5_000],
      [100_000, 15_000],
      [200_000, 40_000],
    ],
  );

  const signedIn = await signInOwner('9812345678');
  assert.equal(signedIn.user.role, 'salon_owner');
  assert.equal(signedIn.user.salonId, detail.salon.id);
  assert.equal(signedIn.user.workspace, 'vendor');

  const me = await h.get<any>('/admin/me', signedIn.token);
  assert.equal(me.status, 200);
  assert.equal(me.data.salon.name, 'Indiranagar Studio');
});

test('platform lists salons and vendors without leaking another tenant', async () => {
  const created = await createSalon();
  const admin = await platformToken();
  const salons = await h.get<any>('/platform/salons', admin);
  assert.equal(salons.status, 200);
  const row = salons.data.salons.find((s: any) => s.id === created.salon.id);
  assert.ok(row);
  assert.equal(row.owner.phone, '9812345678');

  const vendors = await h.get<any>('/platform/vendors', admin);
  assert.equal(vendors.status, 200);
  assert.ok(vendors.data.vendors.some((v: any) => v.phone === '9812345678' && v.salonId === created.salon.id));

  const owner = await signInOwner('9812345678');
  const forbidden = await h.get(`/platform/salons/${created.salon.id}`, owner.token);
  assert.equal(forbidden.status, 403);
});

test('suspending a salon blocks its owner immediately and reactivation restores access', async () => {
  const created = await createSalon();
  const owner = await signInOwner('9812345678');
  const admin = await platformToken();

  assert.equal((await h.get('/admin/overview', owner.token)).status, 200);

  const suspended = await h.patch<any>(`/platform/salons/${created.salon.id}`, { status: 'suspended' }, admin);
  assert.equal(suspended.status, 200);
  assert.equal(suspended.data.salon.status, 'suspended');
  assert.equal((await h.get('/admin/overview', owner.token)).status, 401);

  const active = await h.patch<any>(`/platform/salons/${created.salon.id}`, { status: 'active' }, admin);
  assert.equal(active.status, 200);
  assert.equal((await h.get('/admin/overview', owner.token)).status, 200);
});

test('a suspended salon cannot mint a new OTP or demo session', async () => {
  const admin = await platformToken();
  const salon = await h.db.one<any>('SELECT id FROM salons WHERE ownerId = (SELECT id FROM users WHERE phone = ?)', ACCOUNTS.owner);
  assert.ok(salon?.id);

  const suspended = await h.patch<any>(`/platform/salons/${salon.id}`, { status: 'suspended' }, admin);
  assert.equal(suspended.status, 200);

  const request = await h.post<any>('/auth/otp/request', { phone: ACCOUNTS.owner });
  assert.equal(request.status, 200);
  const verify = await h.post<any>('/auth/otp/verify', {
    phone: ACCOUNTS.owner,
    code: request.data.devCode,
  });
  assert.equal(verify.status, 401, JSON.stringify(verify.data));
  assert.equal(verify.data.token, undefined);

  const dev = await h.post<any>('/auth/dev-login', { pin: '1234', phone: ACCOUNTS.owner });
  assert.equal(dev.status, 401, JSON.stringify(dev.data));
  assert.equal(dev.data.token, undefined);

  // The platform admin is not scoped to the suspended tenant and keeps access.
  assert.equal((await h.get('/platform/overview', admin)).status, 200);
});

test('platform writes are audited', async () => {
  const created = await createSalon();
  const admin = await platformToken();
  const audit = await h.get<any>('/platform/audit?entityType=salon&limit=100', admin);
  assert.equal(audit.status, 200);
  assert.ok(
    audit.data.audit.some(
      (entry: any) => entry.action === 'platform.salon.create' && entry.entityId === created.salon.id,
    ),
  );
});

test('a phone number cannot be reused for a second owner', async () => {
  await createSalon();
  const admin = await platformToken();
  const again = await h.post<any>(
    '/platform/salons',
    {
      name: 'Second Studio',
      address: 'Some other address',
      ownerName: 'Nisha Rao',
      ownerPhone: '9812345678',
    },
    admin,
  );
  assert.equal(again.status, 409);
});
