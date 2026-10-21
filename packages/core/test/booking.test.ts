import { test, beforeAll as before, afterAll as after, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { getHarness, ACCOUNTS, dayFrom, type Harness } from './harness';

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

/** Resolve a branch/service and the first free slot for a future day. */
async function pickBooking(token: string, dayOffset = 3) {
  const branches = await h.get<{ branches: any[] }>('/catalog/branches', token);
  const services = await h.get<{ services: any[] }>('/catalog/services', token);
  const branchId = branches.data.branches[0].id;
  const service = services.data.services[0];
  const date = dayFrom(dayOffset);
  const avail = await h.get<{ slots: any[] }>(
    `/catalog/availability?branchId=${branchId}&date=${date}&serviceIds=${service.id}`,
    token,
  );
  return { branchId, service, date, slot: avail.data.slots[0] };
}

async function walkToCompleted(appointmentId: string, token: string, method = 'cash') {
  for (const status of ['confirmed', 'checked_in', 'in_progress']) {
    const res = await h.post(`/admin/appointments/${appointmentId}/status`, { status }, token);
    assert.equal(res.status, 200, `transition to ${status} failed: ${JSON.stringify(res.data)}`);
  }
  return h.post(`/admin/appointments/${appointmentId}/status`, { status: 'completed', paymentMethod: method }, token);
}

test('availability returns bookable slots with staff assignments', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const { slot } = await pickBooking(token);
  assert.ok(slot, 'at least one slot is offered');
  assert.match(slot.startTime, /^\d{2}:\d{2}$/);
  assert.ok(slot.staffId);
});

test('a customer can create a booking and receives a confirmation', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const { branchId, service, date, slot } = await pickBooking(token);
  const res = await h.post(
    '/customer/bookings',
    {
      branchId,
      serviceIds: [service.id],
      date,
      startTime: slot.startTime,
      staffId: slot.staffId,
      paymentPreference: 'pay_at_salon',
      idempotencyKey: 'test-booking-1',
    },
    token,
  );
  assert.equal(res.status, 201);
  assert.equal(res.data.appointment.status, 'booked');
  assert.equal(res.data.appointment.totalAmount, service.price);
  assert.equal(res.data.appointment.date, date);
});

test('a repeated booking idempotency key does not double-book', async () => {
  const token = await h.login(ACCOUNTS.customer1);
  const { branchId, service, date, slot } = await pickBooking(token);
  const body = {
    branchId,
    serviceIds: [service.id],
    date,
    startTime: slot.startTime,
    staffId: slot.staffId,
    idempotencyKey: 'test-booking-dup',
  };
  const first = await h.post('/customer/bookings', body, token);
  const second = await h.post('/customer/bookings', body, token);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.data.appointment.id, first.data.appointment.id, 'same appointment returned');
  const count = await h.db.scalar<number>(
    'SELECT COUNT(*) FROM appointments WHERE customerId = (SELECT id FROM users WHERE phone = ?) AND date = ?',
    ACCOUNTS.customer1,
    date,
  );
  assert.equal(count, 1);
});

test('two customers cannot book the same stylist at the same time', async () => {
  const a = await h.login(ACCOUNTS.customer1);
  const { branchId, service, date, slot } = await pickBooking(a);
  const first = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, staffId: slot.staffId },
    a,
  );
  assert.equal(first.status, 201);

  const b = await h.login(ACCOUNTS.customer2);
  const clash = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, staffId: slot.staffId },
    b,
  );
  assert.equal(clash.status, 409, 'overlap must be rejected with a conflict');
});

test('the appointment status machine rejects an illegal jump', async () => {
  const customer = await h.login(ACCOUNTS.customer1);
  const { branchId, service, date, slot } = await pickBooking(customer);
  const created = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, staffId: slot.staffId },
    customer,
  );
  const reception = await h.login(ACCOUNTS.receptionist);
  const jump = await h.post(
    `/admin/appointments/${created.data.appointment.id}/status`,
    { status: 'completed', paymentMethod: 'cash' },
    reception,
  );
  assert.equal(jump.status, 409);
});

test('completing a visit writes a service record and stamps the profile', async () => {
  const customer = await h.login(ACCOUNTS.customer1);
  const { branchId, service, date, slot } = await pickBooking(customer);
  const created = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, staffId: slot.staffId },
    customer,
  );
  const id = created.data.appointment.id;
  const reception = await h.login(ACCOUNTS.receptionist);
  const done = await walkToCompleted(id, reception, 'cash');
  assert.equal(done.status, 200);
  assert.equal(done.data.appointment.status, 'completed');
  assert.equal(done.data.appointment.paymentStatus, 'paid');

  const record = await h.db.one('SELECT * FROM service_records WHERE appointmentId = ?', id);
  assert.ok(record, 'a service record is written exactly once');
  assert.equal(record.finalAmount, service.price);

  const profile = await h.db.one(
    'SELECT totalVisits FROM customer_profiles WHERE customerId = (SELECT id FROM users WHERE phone = ?)',
    ACCOUNTS.customer1,
  );
  assert.ok(profile!.totalVisits >= 1);
});

test('a customer cannot read another customer\'s booking (row-level security)', async () => {
  const owner = await h.db.one<{ id: string }>(
    'SELECT id FROM appointments WHERE customerId = (SELECT id FROM users WHERE phone = ?) LIMIT 1',
    ACCOUNTS.customer1,
  );
  assert.ok(owner, 'seed has an appointment for customer 1');
  const other = await h.login(ACCOUNTS.customer2);
  const res = await h.get(`/customer/bookings/${owner.id}`, other);
  assert.equal(res.status, 403);
});

test('a booking can be rescheduled to another available slot', async () => {
  const customer = await h.login(ACCOUNTS.customer1);
  const { branchId, service, date, slot } = await pickBooking(customer);
  const created = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, staffId: slot.staffId },
    customer,
  );
  const id = created.data.appointment.id;
  const avail = await h.get<{ slots: any[] }>(
    `/catalog/availability?branchId=${branchId}&date=${dayFrom(5)}&serviceIds=${service.id}`,
    customer,
  );
  const target = avail.data.slots[0];
  const moved = await h.post(
    `/customer/bookings/${id}/reschedule`,
    { date: dayFrom(5), startTime: target.startTime, staffId: target.staffId },
    customer,
  );
  assert.equal(moved.status, 200);
  assert.equal(moved.data.appointment.date, dayFrom(5));
  assert.equal(moved.data.appointment.startTime, target.startTime);
});

test('a customer can cancel an upcoming booking', async () => {
  const customer = await h.login(ACCOUNTS.customer1);
  const { branchId, service, date, slot } = await pickBooking(customer);
  const created = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [service.id], date, startTime: slot.startTime, staffId: slot.staffId },
    customer,
  );
  const id = created.data.appointment.id;
  const cancelled = await h.post(`/customer/bookings/${id}/cancel`, { reason: 'Change of plans' }, customer);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.appointment.status, 'cancelled');
});

test('booking validation rejects a missing service selection', async () => {
  const customer = await h.login(ACCOUNTS.customer1);
  const { branchId, date, slot } = await pickBooking(customer);
  const res = await h.post(
    '/customer/bookings',
    { branchId, serviceIds: [], date, startTime: slot.startTime },
    customer,
  );
  assert.equal(res.status, 400);
  assert.equal(res.data.error, 'validation_error');
});
