#!/usr/bin/env bun
/**
 * Give a demo deployment the workspace accounts the app's developer switcher
 * offers.
 *
 * The sign-in screen can open Platform, Salon owner, Client, Manager or
 * Reception. The developer PIN resolves whichever seeded account exists for
 * that role — so a deployment that only has an owner and a customer (which is
 * what a hand-built salon looks like) cannot open the other three.
 *
 * This script creates the missing ones for the **existing** salon. It never
 * touches customers, bookings or money, and it is idempotent: run it twice and
 * nothing changes.
 *
 *   DATABASE_URL=postgresql://… bun scripts/ensure-demo-workspaces.ts
 *   DATABASE_URL=postgresql://… bun scripts/ensure-demo-workspaces.ts --salon <salonId>
 *
 * The accounts it creates are marked `isDemo = 1`, so they stay out of
 * production reporting exactly like the seeded demo users do.
 */
import crypto from 'node:crypto';
import { one, run, tx } from '../packages/core/src/db.ts';
import { hashPassword } from '../packages/core/src/auth.ts';
import { fullWeekWorkingHours } from '../packages/core/src/services/settings.ts';

const DEMO_PASSWORD = 'salonpro123';

const PLATFORM = { name: 'SalonPro Support', phone: '9999999999', role: 'super_admin', email: 'support@salonpro.app' };
const MANAGER = { name: 'Sanjay Bhat', phone: '9800000002', role: 'branch_manager', email: 'manager@salonpro.app' };
const RECEPTION = { name: 'Ritu Singh', phone: '9800000003', role: 'receptionist', email: 'reception@salonpro.app' };

const args = process.argv.slice(2);
const salonArg = args.includes('--salon') ? args[args.indexOf('--salon') + 1] : undefined;

const iso = (d: Date) => d.toISOString();

async function ensureUser(person: { name: string; phone: string; role: string; email: string }) {
  const now = new Date();
  const existing = await one<{ id: string }>('SELECT id FROM users WHERE phone = ?', person.phone);
  if (existing) {
    await run(
      'UPDATE users SET name = ?, role = ?, status = ?, isDemo = 1, updatedAt = ? WHERE id = ?',
      person.name,
      person.role,
      'active',
      iso(now),
      existing.id,
    );
    return { id: existing.id, created: false };
  }
  const id = crypto.randomUUID();
  await run(
    'INSERT INTO users (id, name, phone, email, role, status, passwordHash, isDemo, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id,
    person.name,
    person.phone,
    person.email,
    person.role,
    'active',
    hashPassword(DEMO_PASSWORD),
    1,
    iso(now),
    iso(now),
  );
  return { id, created: true };
}

/** A manager or receptionist needs a staff row, or the session has no salon. */
async function ensureStaff(userId: string, salonId: string, branchId: string, designation: string) {
  const now = new Date();
  const existing = await one<{ id: string }>(
    'SELECT id FROM staff WHERE userId = ? AND salonId = ? AND status = ? LIMIT 1',
    userId,
    salonId,
    'active',
  );
  if (!existing) {
    await run(
      'INSERT INTO staff (id, salonId, branchId, userId, designation, workingHours, commissionRules, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      crypto.randomUUID(),
      salonId,
      branchId,
      userId,
      designation,
      JSON.stringify(fullWeekWorkingHours('10:00', '20:00')),
      JSON.stringify({ serviceBps: 800, productBps: 300 }),
      'active',
      iso(now),
    );
  }
  const linked = await one<{ userId: string }>(
    'SELECT userId FROM user_branches WHERE userId = ? AND branchId = ?',
    userId,
    branchId,
  );
  if (!linked) {
    await run(
      'INSERT INTO user_branches (userId, branchId) VALUES (?,?)',
      userId,
      branchId,
    );
  }
}

const salon = salonArg
  ? await one<{ id: string; name: string }>('SELECT id, name FROM salons WHERE id = ?', salonArg)
  : await one<{ id: string; name: string }>(
      `SELECT s.id, s.name FROM salons s
         JOIN users u ON u.id = s.ownerId
        WHERE u.role = 'salon_owner'
        ORDER BY s.createdAt
        LIMIT 1`,
    );

if (!salon) {
  console.error('No salon found — pass --salon <salonId>.');
  process.exit(1);
}

const branch = await one<{ id: string; name: string }>(
  'SELECT id, name FROM branches WHERE salonId = ? AND status = ? ORDER BY createdAt LIMIT 1',
  salon.id,
  'active',
);
if (!branch) {
  console.error(`Salon "${salon.name}" has no active branch.`);
  process.exit(1);
}

await tx(async () => {
  const platform = await ensureUser(PLATFORM);
  const manager = await ensureUser(MANAGER);
  const reception = await ensureUser(RECEPTION);
  await ensureStaff(manager.id, salon.id, branch.id, 'Branch Manager');
  await ensureStaff(reception.id, salon.id, branch.id, 'Receptionist');

  console.log(`salon      : ${salon.name} (${salon.id})`);
  console.log(`branch     : ${branch.name}`);
  for (const [person, result] of [
    [PLATFORM, platform],
    [MANAGER, manager],
    [RECEPTION, reception],
  ] as const) {
    console.log(
      `${person.role.padEnd(14)}: ${person.name} · ${person.phone} · ${result.created ? 'created' : 'updated'}`,
    );
  }
});

console.log('\nThe developer switcher can now open Platform, Manager and Reception on this server.');
process.exit(0);
