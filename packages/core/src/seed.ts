/**
 * Data seeding for SalonPro.
 *
 *   bun run seed                          demo data (development & tests)
 *   bun run seed:reset                    drop everything, then reseed demo data
 *   bun run seed:bootstrap -- --phone 98xxxxxxxx [--owner "Name"] [--salon "Name"] [--address "…"]
 *                                         production bootstrap: one salon, one owner,
 *                                         one branch and the standard recharge offers.
 *                                         No demo customers, appointments or staff.
 *
 * Demo records are flagged `isDemo = 1` on users.
 */
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { hashPassword } from './auth';
import { all, one, resetDatabase, migrate, run, closeDatabase, tx } from './db';
import { fullWeekHours, fullWeekWorkingHours, readSettings } from './services/settings';
import * as wallet from './services/wallet';
import { newId } from '@salonpro/shared';

const DEMO_PASSWORD = 'salonpro123';

/** Wallet recharge offers the brief specifies: ₹500→₹550, ₹1000→₹1150, ₹2000→₹2400. */
const STANDARD_OFFERS = [
  { pay: 50000, bonus: 5000, label: 'Starter' },
  { pay: 100000, bonus: 15000, label: 'Popular' },
  { pay: 200000, bonus: 40000, label: 'Best value' },
];

/* Deterministic pseudo-random so seeds are reproducible. */
let seedState = 987654321;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function randInt(min: number, max: number) {
  return Math.floor(min + rand() * (max - min + 1));
}

const now = new Date();
const iso = (d: Date) => d.toISOString();
const day = (offset: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const at = (dateStr: string, time = '12:00') => new Date(`${dateStr}T${time}:00.000Z`).toISOString();

const SERVICES: { name: string; category: string; price: number; duration: number; emoji: string; description: string }[] = [
  { name: 'Signature Haircut', category: 'Hair', price: 79900, duration: 45, emoji: '✂️', description: 'Consultation, precision cut, wash and blow-dry finish.' },
  { name: 'Beard Styling & Shave', category: 'Hair', price: 39900, duration: 30, emoji: '🪒', description: 'Hot towel, line-up, shape and conditioning balm.' },
  { name: 'Hair Spa Ritual', category: 'Hair', price: 159900, duration: 60, emoji: '💆', description: 'Deep conditioning ritual with scalp massage and steam.' },
  { name: 'Global Hair Colour', category: 'Colour', price: 349900, duration: 120, emoji: '🎨', description: 'Ammonia-free global colour with post-colour mask.' },
  { name: 'Root Touch-Up', category: 'Colour', price: 179900, duration: 60, emoji: '🖌️', description: 'Precision root application for grey coverage.' },
  { name: 'Signature Facial', category: 'Skin', price: 189900, duration: 60, emoji: '✨', description: 'Deep-cleanse, exfoliation, massage and glow mask.' },
  { name: 'Detan & Hydra Glow', category: 'Skin', price: 129900, duration: 45, emoji: '💧', description: 'De-tan pack with hyaluronic hydration boost.' },
  { name: 'Full Face Waxing', category: 'Waxing', price: 89900, duration: 30, emoji: '🌸', description: 'Gentle rica wax for face and neck.' },
  { name: 'Full Arms & Legs Wax', category: 'Waxing', price: 149900, duration: 45, emoji: '🌿', description: 'Rica wax full arms and legs.' },
  { name: 'Luxury Manicure', category: 'Nails', price: 99900, duration: 45, emoji: '💅', description: 'Soak, scrub, cuticle care, massage and polish.' },
  { name: 'Luxury Pedicure', category: 'Nails', price: 129900, duration: 60, emoji: '🦶', description: 'Foot soak, callus removal, massage and polish.' },
  { name: 'Bridal Makeup', category: 'Bridal', price: 1499900, duration: 180, emoji: '👰', description: 'HD bridal makeup with draping and hair styling.' },
  { name: 'Party Makeup', category: 'Bridal', price: 449900, duration: 90, emoji: '💄', description: 'Evening party look with lashes and hair finish.' },
  { name: 'Head Massage (30 min)', category: 'Spa', price: 59900, duration: 30, emoji: '🧘', description: 'Relaxing ayurvedic head, neck and shoulder massage.' },
];

const CUSTOMER_NAMES = [
  'Aarav Mehta', 'Priya Sharma', 'Rohit Iyer', 'Ananya Nair', 'Vikram Rao', 'Sneha Kulkarni',
  'Karthik Reddy', 'Meera Joshi', 'Arjun Patel', 'Divya Menon', 'Rahul Verma', 'Ishita Bose',
  'Nikhil Gupta', 'Tanvi Desai', 'Aditya Krishnan', 'Neha Pillai', 'Siddharth Malhotra', 'Pooja Ranganathan',
  'Manish Agarwal', 'Kavya Suresh',
];

const STAFF = [
  { name: 'Rakesh Kumar', designation: 'Senior Stylist', off: [1], skill: 'Hair' },
  { name: 'Farhan Ali', designation: 'Master Barber', off: [2], skill: 'Hair' },
  { name: 'Anita Dsouza', designation: 'Beauty Therapist', off: [3], skill: 'Skin' },
  { name: 'Shreya Kapoor', designation: 'Colour Specialist', off: [4], skill: 'Colour' },
  { name: 'Imran Sheikh', designation: 'Spa Therapist', off: [0], skill: 'Spa' },
];

/* ------------------------------------------------------------------ */
/* Production bootstrap                                                */
/* ------------------------------------------------------------------ */

export interface BootstrapArgs {
  ownerName: string;
  ownerPhone: string;
  salonName: string;
  address: string;
  contact?: string;
  branchName?: string;
}

/**
 * Minimal, honest production setup: a salon with one branch, one owner account
 * and the standard recharge offers. Nothing is invented — every value comes
 * from the arguments, and the owner signs in with a real OTP.
 */
export async function runBootstrap(args: BootstrapArgs): Promise<boolean> {
  await migrate();

  const existingSalon = await one<{ id: string; name: string }>('SELECT id, name FROM salons LIMIT 1');
  if (existingSalon) {
    console.log(`· a salon already exists ("${existingSalon.name}") — nothing to bootstrap.`);
    return false;
  }

  const phone = args.ownerPhone.replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) {
    console.error('· --phone must be a 10 digit mobile number.');
    return false;
  }

  const nowIso = new Date().toISOString();
  const ownerId = crypto.randomUUID();
  const salonId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const settings = readSettings(null);

  await tx(async () => {
    const existingUser = await one<{ id: string }>('SELECT id FROM users WHERE phone = ?', phone);
    const userId = existingUser?.id ?? ownerId;
    if (!existingUser) {
      await run(
        'INSERT INTO users (id, name, phone, email, role, status, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
        userId, args.ownerName, phone, null, 'salon_owner', 'active', 0, nowIso, nowIso,
      );
    } else {
      await run('UPDATE users SET role = ?, name = ?, updatedAt = ? WHERE id = ?', 'salon_owner', args.ownerName, nowIso, userId);
    }

    await run(
      'INSERT INTO salons (id, name, address, contact, timezone, currency, ownerId, settings, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      salonId, args.salonName, args.address, args.contact ?? null, 'Asia/Kolkata', 'INR', userId,
      JSON.stringify(settings), nowIso,
    );

    await run(
      'INSERT INTO branches (id, salonId, name, address, contact, timezone, openingHours, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      branchId, salonId, args.branchName ?? `${args.salonName} — Main branch`, args.address, args.contact ?? null,
      'Asia/Kolkata', JSON.stringify(fullWeekHours('09:00', '21:00', [])), 'active', nowIso,
    );

    await run('INSERT INTO user_branches (userId, branchId) VALUES (?,?) ON CONFLICT DO NOTHING', userId, branchId);

    for (const [i, offer] of STANDARD_OFFERS.entries()) {
      await run(
        'INSERT INTO recharge_offers (id, salonId, payAmount, bonusAmount, label, active, sortOrder) VALUES (?,?,?,?,?,?,?)',
        crypto.randomUUID(), salonId, offer.pay, offer.bonus, offer.label, 1, i,
      );
    }

    await run(
      'INSERT INTO audit_logs (id, actorId, action, entityType, entityId, meta, ip, timestamp) VALUES (?,?,?,?,?,?,?,?)',
      crypto.randomUUID(), userId, 'salon.bootstrap', 'salon', salonId, JSON.stringify({ via: 'seed --bootstrap' }), null, nowIso,
    );
  });

  console.log('\n✅ Bootstrap complete.\n');
  console.log(`   Salon    ${args.salonName}`);
  console.log(`   Owner    ${args.ownerName} (${phone})`);
  console.log(`   Branch   ${args.branchName ?? `${args.salonName} — Main branch`}`);
  console.log('');
  console.log('   Sign in on the admin app with that mobile number. OTP delivery follows');
  console.log('   server configuration: without an SMS provider you get the development');
  console.log('   code on screen (never a fake "SMS sent" message).');
  console.log('');
  console.log('   Next: add services, staff and branches from the admin app. No demo data was created.');
  console.log('');
  return true;
}

/* ------------------------------------------------------------------ */
/* Demo data                                                           */
/* ------------------------------------------------------------------ */

export async function runSeed(reset: boolean): Promise<boolean> {
  if (reset) {
    await resetDatabase();
    console.log('· dropped existing tables');
  }
  await migrate();

  const existing = await one<{ n: number }>('SELECT COUNT(*) AS n FROM users');
  if ((existing?.n ?? 0) > 0 && !reset) {
    console.log('· database already has data — run with --reset to reseed');
    return false;
  }

  await tx(async () => {
    await run('DELETE FROM notification_preferences');
    await seedCore();
  });
  return true;
}

async function seedCore() {
  const demoUsers: string[] = [];

  const createUser = async (name: string, phone: string, role: string, email: string | null = null, isDemo = true) => {
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO users (id, name, phone, email, role, status, passwordHash, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id,
      name,
      phone,
      email,
      role,
      'active',
      hashPassword(DEMO_PASSWORD),
      isDemo,
      iso(new Date(now.getTime() - randInt(30, 400) * 86400000)),
      iso(now),
    );
    demoUsers.push(id);
    return id;
  };

  /* ---------------- salon, branches, owner ---------------- */
  const superAdminId = await createUser('SalonPro Support', '9999999999', 'super_admin', 'support@salonpro.app');
  const ownerId = await createUser('Deepa Menon', '9800000001', 'salon_owner', 'owner@salonpro.app');
  const managerId = await createUser('Sanjay Bhat', '9800000002', 'branch_manager', 'manager@salonpro.app');
  const receptionId = await createUser('Ritu Singh', '9800000003', 'receptionist', 'reception@salonpro.app');

  const salonId = crypto.randomUUID();
  const settings = readSettings(null);
  await run(
    'INSERT INTO salons (id, name, address, contact, timezone, currency, ownerId, settings, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    salonId,
    'SalonPro',
    '100 Feet Road, Indiranagar, Bengaluru 560038',
    '+91 80 4000 1234',
    'Asia/Kolkata',
    'INR',
    ownerId,
    JSON.stringify(settings),
    iso(now),
  );

  const branches = [
    { id: crypto.randomUUID(), name: 'Indiranagar Flagship', address: '100 Feet Road, Indiranagar, Bengaluru', closed: [] as number[] },
    { id: crypto.randomUUID(), name: 'Koramangala Studio', address: '5th Block, Koramangala, Bengaluru', closed: [2] },
    { id: crypto.randomUUID(), name: 'Whitefield Lounge', address: 'ITPL Main Road, Whitefield, Bengaluru', closed: [] as number[] },
  ];
  for (const b of branches) {
    await run(
      'INSERT INTO branches (id, salonId, name, address, contact, timezone, openingHours, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      b.id,
      salonId,
      b.name,
      b.address,
      '+91 80 4000 1234',
      'Asia/Kolkata',
      JSON.stringify(fullWeekHours('09:00', '21:00', b.closed)),
      'active',
      iso(now),
    );
  }

  /* a holiday to prove the availability engine respects it */
  await run('INSERT INTO holidays (id, branchId, date, reason) VALUES (?,?,?,?)', crypto.randomUUID(), branches[0]!.id, day(6), 'Annual staff training day');

  /* ---------------- services ---------------- */
  const serviceIds: { id: string; name: string; price: number; duration: number }[] = [];
  for (const [index, s] of SERVICES.entries()) {
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO services (id, salonId, name, category, description, price, durationMinutes, active, imageEmoji, sortOrder, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id,
      salonId,
      s.name,
      s.category,
      s.description,
      s.price,
      s.duration,
      1,
      s.emoji,
      index,
      iso(now),
    );
    serviceIds.push({ id, name: s.name, price: s.price, duration: s.duration });
  }

  /* branch 3 does not offer bridal makeup; branch 2 has a premium on colour */
  const bridal = serviceIds.find((s) => s.name === 'Bridal Makeup')!;
  await run('INSERT INTO branch_services (id, branchId, serviceId, price, active) VALUES (?,?,?,?,?)', crypto.randomUUID(), branches[2]!.id, bridal.id, null, 0);

  /* ---------------- staff ---------------- */
  const staffIds: { id: string; name: string; branchId: string }[] = [];
  for (const [i, s] of STAFF.entries()) {
    const userId = await createUser(s.name, `98000000${10 + i}`, 'salon_staff', null);
    const staffId = crypto.randomUUID();
    const branchId = branches[i % branches.length]!.id;
    await run(
      'INSERT INTO staff (id, salonId, branchId, userId, designation, workingHours, commissionRules, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      staffId,
      salonId,
      branchId,
      userId,
      s.designation,
      JSON.stringify(fullWeekWorkingHours('10:00', '20:00', s.off)),
      JSON.stringify({ serviceBps: 800 + i * 50, productBps: 300 }),
      'active',
      iso(now),
    );
    const secondBranch = branches[(i + 1) % branches.length]!;
    if (i < 2) {
      await run('INSERT INTO staff (id, salonId, branchId, userId, designation, workingHours, commissionRules, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        crypto.randomUUID(), salonId, secondBranch.id, userId, s.designation,
        JSON.stringify(fullWeekWorkingHours('10:00', '20:00', s.off)),
        JSON.stringify({ serviceBps: 800, productBps: 300 }), 'active', iso(now));
    }
    /* lunch break 14:00–15:00 on working days */
    for (let d = 0; d < 7; d++) {
      if (s.off.includes(d)) continue;
      await run('INSERT INTO staff_breaks (id, staffId, weekday, startTime, endTime) VALUES (?,?,?,?,?)', crypto.randomUUID(), staffId, d, '14:00', '15:00');
    }
    staffIds.push({ id: staffId, name: s.name, branchId });
  }

  await run('INSERT INTO user_branches (userId, branchId) VALUES (?,?)', managerId, branches[0]!.id);
  await run('INSERT INTO user_branches (userId, branchId) VALUES (?,?)', managerId, branches[1]!.id);
  await run('INSERT INTO user_branches (userId, branchId) VALUES (?,?)', receptionId, branches[0]!.id);

  /* ---------------- recharge offers ---------------- */
  const offers = STANDARD_OFFERS;
  for (const [i, o] of offers.entries()) {
    await run('INSERT INTO recharge_offers (id, salonId, payAmount, bonusAmount, label, active, sortOrder) VALUES (?,?,?,?,?,?,?)',
      crypto.randomUUID(), salonId, o.pay, o.bonus, o.label, 1, i);
  }

  /* ---------------- coupons ---------------- */
  const coupons = [
    { code: 'WELCOME20', type: 'percent', value: 20, min: 50000, max: 30000, desc: '20% off your first visit (max ₹300)', limit: 500 },
    { code: 'GLOW150', type: 'flat', value: 15000, min: 120000, max: null, desc: '₹150 off on bookings above ₹1,200', limit: 200 },
    { code: 'SPA10', type: 'percent', value: 10, min: 100000, max: 20000, desc: '10% off hair spa rituals', limit: 300 },
  ];
  for (const c of coupons) {
    await run(
      'INSERT INTO coupons (id, salonId, code, type, value, minAmount, maxDiscount, startAt, endAt, usageLimit, usedCount, active, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      crypto.randomUUID(), salonId, c.code, c.type, c.value, c.min, c.max,
      iso(new Date(now.getTime() - 30 * 86400000)), iso(new Date(now.getTime() + 120 * 86400000)),
      c.limit, 0, 1, c.desc,
    );
  }

  /* ---------------- customers ---------------- */
  const customers: { id: string; name: string; phone: string; createdAt: string }[] = [];
  for (const [i, name] of CUSTOMER_NAMES.entries()) {
    const phone = `97000000${String(i + 1).padStart(2, '0')}`;
    const id = await createUser(name, phone, 'customer', null);
    const created = new Date(now.getTime() - randInt(40, 300) * 86400000);
    await run(
      'INSERT INTO customer_profiles (customerId, salonId, lastVisitAt, totalVisits, totalCompletedSpend, preferredServices, marketingConsent, birthday, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      id, salonId, null, 0, 0, '[]', i % 7 === 0 ? 0 : 1,
      `${1975 + randInt(0, 25)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
      iso(created),
    );
    await run('INSERT INTO notification_preferences (customerId, whatsappConsent, pushEnabled, promotionalConsent, quietHoursStart, quietHoursEnd, updatedAt) VALUES (?,?,?,?,?,?,?)',
      id, 1, 1, 1, '21:00', '09:00', iso(now));
    await wallet.getOrCreateWallet(salonId, id);
    customers.push({ id, name, phone, createdAt: iso(created) });
  }

  /* ---------------- wallet recharges (ledger consistent) ---------------- */
  for (const [index, customer] of customers.slice(0, 10).entries()) {
    const offer = offers[index % offers.length]!;
    const w = await wallet.getOrCreateWallet(salonId, customer.id);
    const orderId = crypto.randomUUID();
    const rzpOrder = `order_sim_seed${index}${crypto.randomBytes(4).toString('hex')}`;
    const paidAt = iso(new Date(now.getTime() - randInt(5, 60) * 86400000));
    await run(
      `INSERT INTO payment_orders (id, salonId, customerId, razorpayOrderId, paymentId, amount, amountPaid, currency, purpose, status, mode, receipt, idempotencyKey, verifiedAt, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      orderId, salonId, customer.id, rzpOrder, `pay_sim_seed${index}`, offer.pay, offer.pay, 'INR',
      'wallet_recharge', 'paid', 'simulated', `rcpt_seed_${index}`, `seed_recharge_${customer.id}`, paidAt, paidAt,
    );
    await wallet.postEntry({
      walletId: w.id, customerId: customer.id, salonId, type: 'recharge', amount: offer.pay,
      balanceType: 'cash', paymentId: `pay_sim_seed${index}`, referenceId: orderId,
      idempotencyKey: `seed_recharge_cash_${customer.id}`, reason: 'Wallet recharge',
    });
    await wallet.postEntry({
      walletId: w.id, customerId: customer.id, salonId, type: 'recharge', amount: offer.bonus,
      balanceType: 'bonus', paymentId: `pay_sim_seed${index}`, referenceId: orderId,
      idempotencyKey: `seed_recharge_bonus_${customer.id}`, reason: 'Recharge bonus',
    });
  }

  /* ---------------- referral codes ---------------- */
  const codes: { customerId: string; code: string }[] = [];
  for (const [i, customer] of customers.entries()) {
    const code = `${customer.name.split(' ')[0]!.toUpperCase().slice(0, 5)}${String(1000 + i)}`;
    await run('INSERT INTO referral_codes (id, salonId, customerId, code, status, createdAt) VALUES (?,?,?,?,?,?)',
      crypto.randomUUID(), salonId, customer.id, code, 'active', iso(now));
    codes.push({ customerId: customer.id, code });
  }

  /* ---------------- history: appointments + service records ---------------- */
  const historyAppointments: { id: string; customerId: string; completedAt: string }[] = [];
  /** Each customer gets a recency band so retention analytics has real shape. */
  const bandFor = (index: number): [number, number] => {
    if (index % 4 === 1) return [45, 95]; // lapsed
    if (index % 4 === 2) return [16, 40]; // slipping
    return [1, 30]; // active
  };
  for (let i = 0; i < 260; i++) {
    const customerIndex = randInt(0, customers.length - 1);
    const customer = customers[customerIndex]!;
    const [minDays, maxDays] = bandFor(customerIndex);
    const daysAgo = randInt(minDays, maxDays);
    const date = day(-daysAgo);
    const staff = pick(staffIds);
    const svcCount = randInt(1, 2);
    const chosen: typeof serviceIds = [];
    for (let c = 0; c < svcCount; c++) chosen.push(pick(serviceIds));
    const unique = [...new Map(chosen.map((s) => [s.id, s])).values()];
    const subtotal = unique.reduce((sum, s) => sum + s.price, 0);
    const duration = unique.reduce((sum, s) => sum + s.duration, 0);
    const hour = randInt(10, 19);
    const startTime = `${String(hour).padStart(2, '0')}:${pick(['00', '30'])}`;
    const endMinutes = hour * 60 + Number(startTime.slice(3)) + duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    const method = pick(['wallet', 'cash', 'online', 'upi_card'] as const);
    const completed = rand() > 0.12;
    const cancelled = !completed && rand() > 0.5;
    const status = completed ? 'completed' : cancelled ? 'cancelled' : 'no_show';
    const completedAt = at(date, startTime);
    const id = crypto.randomUUID();
    const bookingSource = rand() > 0.75 ? 'walk_in' : 'app';

    await run(
      `INSERT INTO appointments (id, salonId, branchId, customerId, staffId, servicesJson, date, startTime, endTime, durationMinutes,
        status, bookingSource, subtotal, discount, totalAmount, paidAmount, paymentStatus, paymentMethod, createdBy, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, salonId, staff.branchId, customer.id, staff.id, JSON.stringify(unique.map((s) => ({ serviceId: s.id, name: s.name, price: s.price, durationMinutes: s.duration }))),
      date, startTime, endTime, duration, status, bookingSource, subtotal, 0, subtotal,
      completed ? subtotal : 0, completed ? 'paid' : 'unpaid', completed ? method : null,
      ownerId, completedAt, completedAt,
    );

    if (!completed) continue;

    await run(
      `INSERT INTO service_records (id, appointmentId, customerId, staffId, salonId, branchId, servicesJson, grossAmount, discount,
        finalAmount, paymentMethod, walletAmount, onlineAmount, cashAmount, completedAt, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), id, customer.id, staff.id, salonId, staff.branchId,
      JSON.stringify(unique.map((s) => ({ serviceId: s.id, name: s.name, price: s.price, durationMinutes: s.duration }))),
      subtotal, 0, subtotal, method,
      method === 'wallet' ? subtotal : 0, method === 'online' ? subtotal : 0, method === 'cash' || method === 'upi_card' ? subtotal : 0,
      completedAt, completedAt,
    );

    if (method === 'wallet') {
      const w = await wallet.getOrCreateWallet(salonId, customer.id);
      const b = await wallet.balances(w.id);
      if (b.total >= subtotal) {
        await wallet.debit({
          walletId: w.id, customerId: customer.id, salonId, amount: subtotal,
          settings, idempotencyKey: `seed_spend_${id}`, referenceId: id, reason: 'Service payment',
        });
      }
    }
    historyAppointments.push({ id, customerId: customer.id, completedAt });
  }

  /* recompute customer profile aggregates from the records (source of truth) */
  const aggregates = await all<{ customerId: string; visits: number; spend: number; last: string; preferred: string }>(
    `SELECT sr.customerId,
            COUNT(*) AS visits,
            SUM(sr.finalAmount) AS spend,
            MAX(sr.completedAt) AS last,
            (SELECT servicesJson FROM service_records x WHERE x.customerId = sr.customerId ORDER BY completedAt DESC LIMIT 1) AS preferred
       FROM service_records sr WHERE sr.salonId = ? GROUP BY sr.customerId`,
    salonId,
  );
  for (const agg of aggregates) {
    const preferred = [
      ...new Set(
        (
          await all<{ servicesJson: string }>('SELECT servicesJson FROM service_records WHERE customerId = ?', agg.customerId)
        )
          .flatMap((r) => JSON.parse(r.servicesJson) as { serviceId: string }[])
          .map((s) => s.serviceId),
      ),
    ];
    await run(
      'UPDATE customer_profiles SET lastVisitAt = ?, totalVisits = ?, totalCompletedSpend = ?, preferredServices = ? WHERE customerId = ?',
      agg.last, agg.visits, agg.spend, JSON.stringify(preferred), agg.customerId,
    );
  }

  /* ---------------- referrals (mixed states) ---------------- */
  const attribution = [
    { referrer: customers[0]!, referred: customers[5]!, state: 'rewarded' },
    { referrer: customers[0]!, referred: customers[11]!, state: 'rewarded' },
    { referrer: customers[1]!, referred: customers[8]!, state: 'registered' },
    { referrer: customers[2]!, referred: customers[13]!, state: 'rewarded' },
    { referrer: customers[3]!, referred: customers[16]!, state: 'registered' },
    { referrer: customers[4]!, referred: customers[18]!, state: 'qualified' },
  ];
  for (const a of attribution) {
    const id = crypto.randomUUID();
    const createdAt = iso(new Date(now.getTime() - randInt(10, 80) * 86400000));
    const rewarded = a.state === 'rewarded';
    await run(
      `INSERT INTO referrals (id, salonId, referrerId, referredCustomerId, referralCode, status, qualifyingAppointmentId,
        referrerRewardStatus, refereeRewardStatus, referrerRewardAmount, refereeRewardAmount, createdAt, qualifiedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, salonId, a.referrer.id, a.referred.id,
      codes.find((c) => c.customerId === a.referrer.id)!.code,
      rewarded ? 'rewarded' : a.state === 'qualified' ? 'qualified' : 'registered',
      rewarded ? historyAppointments.find((h) => h.customerId === a.referred.id)?.id ?? null : null,
      rewarded ? 'credited' : 'pending', rewarded ? 'credited' : 'pending', 5000, 5000, createdAt,
      rewarded ? createdAt : null,
    );
    if (!rewarded) continue;

    for (const [customerId, kind] of [[a.referrer.id, 'referrer'], [a.referred.id, 'referee']] as const) {
      const w = await wallet.getOrCreateWallet(salonId, customerId);
      const key = `referral_${id}_${kind}`;
      const entry = await wallet.postEntry({
        walletId: w.id, customerId, salonId, type: 'referral_bonus', amount: 5000,
        balanceType: 'bonus', idempotencyKey: key, referenceId: id,
        reason: kind === 'referrer' ? 'Referral reward — you referred a friend' : 'Referral reward — welcome bonus',
      });
      await run('INSERT INTO reward_transactions (id, customerId, referralId, amount, type, status, walletTransactionId, idempotencyKey, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        crypto.randomUUID(), customerId, id, 5000, kind, 'credited', entry.id, key, createdAt);
    }
  }

  /* ---------------- notifications history ---------------- */
  const stages = ['day7', 'day14', 'day30'] as const;
  for (const [index, customer] of customers.entries()) {
    const stage = stages[index % 3]!;
    const statuses = ['sent', 'pending', 'failed', 'suppressed', 'sent'] as const;
    const status = statuses[index % statuses.length]!;
    const createdAt = iso(new Date(now.getTime() - randInt(1, 30) * 86400000));
    const errorDetails =
      status === 'pending' ? 'whatsapp_not_configured'
        : status === 'failed' ? 'whatsapp_http_470'
          : status === 'suppressed' ? 'customer_opted_out'
            : null;
    await run(
      `INSERT INTO notifications (id, salonId, customerId, channel, template, stage, scheduledAt, sentAt, status, errorDetails, body, reminderKey, attempts, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), salonId, customer.id, index % 4 === 0 ? 'push' : 'whatsapp', stage, stage,
      createdAt, status === 'sent' ? createdAt : null, status, errorDetails,
      `Hello ${customer.name.split(' ')[0]}! It’s time for your next grooming session at SalonPro. Book your preferred time: http://localhost:5173/book`,
      `${customer.id}:seed:${stage}`, status === 'sent' ? 1 : 0, createdAt,
    );
  }

  /* ---------------- today's calendar ---------------- */
  const today = day(0);
  const times = ['10:00', '11:00', '12:00', '13:00', '15:30', '16:30', '17:30', '18:30'];
  for (const [i, time] of times.entries()) {
    const customer = customers[i % customers.length]!;
    const staff = staffIds[i % staffIds.length]!;
    const svc = serviceIds[i % serviceIds.length]!;
    const duration = svc.duration;
    const startMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const status = i < 2 ? 'completed' : i < 3 ? 'in_progress' : i < 5 ? 'confirmed' : 'booked';
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO appointments (id, salonId, branchId, customerId, staffId, servicesJson, date, startTime, endTime, durationMinutes,
        status, bookingSource, subtotal, discount, totalAmount, paidAmount, paymentStatus, paymentMethod, createdBy, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, salonId, staff.branchId, customer.id, staff.id,
      JSON.stringify([{ serviceId: svc.id, name: svc.name, price: svc.price, durationMinutes: duration }]),
      today, time, `${String(Math.floor((startMin + duration) / 60)).padStart(2, '0')}:${String((startMin + duration) % 60).padStart(2, '0')}`,
      duration, status, i % 3 === 0 ? 'walk_in' : 'app', svc.price, 0, svc.price,
      status === 'completed' ? svc.price : 0, status === 'completed' ? 'paid' : 'unpaid',
      status === 'completed' ? 'upi_card' : null, ownerId, iso(now), iso(now),
    );
    if (status === 'completed') {
      await run(
        `INSERT INTO service_records (id, appointmentId, customerId, staffId, salonId, branchId, servicesJson, grossAmount, discount,
          finalAmount, paymentMethod, walletAmount, onlineAmount, cashAmount, completedAt, createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        crypto.randomUUID(), id, customer.id, staff.id, salonId, staff.branchId,
        JSON.stringify([{ serviceId: svc.id, name: svc.name, price: svc.price, durationMinutes: duration }]),
        svc.price, 0, svc.price, 'upi_card', 0, 0, svc.price, iso(now), iso(now),
      );
    }
  }

  /* ---------------- future bookings ---------------- */
  for (let i = 1; i <= 6; i++) {
    const customer = customers[(i + 3) % customers.length]!;
    const staff = staffIds[(i + 1) % staffIds.length]!;
    const svc = serviceIds[(i + 5) % serviceIds.length]!;
    const date = day(i);
    const time = ['11:00', '12:30', '16:00', '17:30'][i % 4]!;
    const startMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    await run(
      `INSERT INTO appointments (id, salonId, branchId, customerId, staffId, servicesJson, date, startTime, endTime, durationMinutes,
        status, bookingSource, subtotal, discount, totalAmount, paidAmount, paymentStatus, createdBy, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), salonId, staff.branchId, customer.id, staff.id,
      JSON.stringify([{ serviceId: svc.id, name: svc.name, price: svc.price, durationMinutes: svc.duration }]),
      date, time, `${String(Math.floor((startMin + svc.duration) / 60)).padStart(2, '0')}:${String((startMin + svc.duration) % 60).padStart(2, '0')}`,
      svc.duration, 'confirmed', 'app', svc.price, 0, svc.price, 0, 'unpaid', ownerId, iso(now), iso(now),
    );
  }

  /* ---------------- staff attendance ---------------- */
  for (const staff of staffIds) {
    for (let d = 0; d <= 5; d++) {
      const date = day(-d);
      const checkIn = at(date, '09:55');
      await run('INSERT INTO staff_attendance (id, staffId, branchId, date, checkInAt, checkOutAt, status) VALUES (?,?,?,?,?,?,?)',
        crypto.randomUUID(), staff.id, staff.branchId, date, checkIn, d === 0 ? null : at(date, '20:15'), 'present');
    }
  }

  /* ---------------- audit trail sample ---------------- */
  await run('INSERT INTO audit_logs (id, actorId, action, entityType, entityId, meta, ip, timestamp) VALUES (?,?,?,?,?,?,?,?)',
    crypto.randomUUID(), ownerId, 'salon.seed', 'salon', salonId, JSON.stringify({ source: 'seeder' }), '127.0.0.1', iso(now));

  void newId;
  void superAdminId;
  void demoUsers;
  console.log(`· ${customers.length} customers, ${serviceIds.length} services, ${historyAppointments.length} historical visits`);
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Values for the bootstrap can come from the command line or the environment.
 * Environment variables are the reliable route, because a package runner can
 * swallow flags it does not recognise:
 *
 *   BOOTSTRAP_OWNER_PHONE=98… BOOTSTRAP_OWNER_NAME="Deepa Menon" \
 *   BOOTSTRAP_SALON_NAME="Blush Studio" bun run seed:bootstrap
 *
 * Or pass them through explicitly:  bun run seed:bootstrap -- --phone 98…
 */
function bootstrapOptions() {
  return {
    phone: argValue('--phone') ?? process.env.BOOTSTRAP_OWNER_PHONE,
    ownerName: argValue('--owner') ?? process.env.BOOTSTRAP_OWNER_NAME,
    salonName: argValue('--salon') ?? process.env.BOOTSTRAP_SALON_NAME,
    address: argValue('--address') ?? process.env.BOOTSTRAP_ADDRESS,
    contact: argValue('--contact') ?? process.env.BOOTSTRAP_CONTACT,
    branchName: argValue('--branch') ?? process.env.BOOTSTRAP_BRANCH,
  };
}

async function main() {
  const options = bootstrapOptions();

  if (process.argv.includes('--bootstrap') || process.env.BOOTSTRAP_OWNER_PHONE) {
    const phone = options.phone;
    if (!phone) {
      console.error('· bootstrap needs an owner mobile number (--phone, or BOOTSTRAP_OWNER_PHONE).');
      process.exitCode = 1;
      return;
    }
    const salonName = options.salonName ?? 'SalonPro';
    await runBootstrap({
      ownerName: options.ownerName ?? 'Salon Owner',
      ownerPhone: phone,
      salonName,
      address: options.address ?? 'Address not set — update it in Settings',
      contact: options.contact,
      branchName: options.branchName ?? `${salonName} — Main branch`,
    });
    return;
  }

  const reset = process.argv.includes('--reset');
  if (!(await runSeed(reset))) return;
  console.log('\n✅ Seed complete.\n');
  console.log('Demo accounts (development only — password: %s)', DEMO_PASSWORD);
  console.log('  Super Admin     9999999999');
  console.log('  Salon Owner     9800000001');
  console.log('  Branch Manager  9800000002');
  console.log('  Receptionist    9800000003');
  console.log('  Stylist         9800000010');
  console.log('  Customer 1      9700000001   (Aarav Mehta — top spender, has referrals)');
  console.log('  Customer 2      9700000002   (Priya Sharma — inactive, reminder target)');
  console.log('');
}

/* Only run the CLI when this file is executed directly, not when imported
 * (the test harness imports `runSeed`). */
const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main()
    .then(() => closeDatabase())
    .catch(async (err) => {
      console.error(err);
      await closeDatabase();
      process.exitCode = 1;
    });
}
