import { test } from 'bun:test';
import assert from 'node:assert/strict';
import {
  addDays,
  daysBetween,
  formatDuration,
  formatMoney,
  formatMoneyShort,
  formatTime12,
  initials,
  maskPhone,
  minutesToTime,
  paiseToRupees,
  rupeesToPaise,
  statusLabel,
  timeToMinutes,
} from '../src/format';

/*
 * Money is stored as integer paise everywhere, so these formatting helpers are
 * the boundary between the ledger and everything a human reads. They are worth
 * pinning down precisely.
 */

test('formatMoney renders Indian grouping and paise', () => {
  assert.equal(formatMoney(0), '₹0');
  assert.equal(formatMoney(55000), '₹550');
  assert.equal(formatMoney(123456), '₹1,234.56');
  assert.equal(formatMoney(100000000), '₹10,00,000');
  assert.equal(formatMoney(-5000), '-₹50');
});

test('formatMoneyShort compacts to k / L / Cr', () => {
  assert.equal(formatMoneyShort(50000), '₹500');
  assert.equal(formatMoneyShort(150000), '₹1.5k');
  assert.equal(formatMoneyShort(25000000), '₹2.50L');
  assert.equal(formatMoneyShort(1500000000), '₹1.50Cr');
});

test('rupee <-> paise round-trips without floating point drift', () => {
  assert.equal(rupeesToPaise(499.99), 49999);
  assert.equal(paiseToRupees(49999), 499.99);
  assert.equal(rupeesToPaise(paiseToRupees(123456)), 123456);
});

test('maskPhone never reveals a full number', () => {
  assert.equal(maskPhone('9700000001'), '97••••01');
  assert.equal(maskPhone(''), '');
  assert.equal(maskPhone('123'), '••••');
  assert.ok(!maskPhone('9700000001').includes('000000'));
});

test('time helpers convert both ways', () => {
  assert.equal(timeToMinutes('14:30'), 870);
  assert.equal(minutesToTime(870), '14:30');
  assert.equal(formatTime12('14:30'), '2:30 PM');
  assert.equal(formatTime12('09:05'), '9:05 AM');
  assert.equal(formatTime12('00:15'), '12:15 AM');
  assert.equal(formatTime12('12:00'), '12:00 PM');
});

test('formatDuration is human friendly', () => {
  assert.equal(formatDuration(30), '30 min');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(90), '1h 30m');
});

test('addDays and daysBetween agree', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-01-01', '2026-01-10'), 9);
  assert.equal(daysBetween('2026-01-10', '2026-01-01'), -9);
});

test('statusLabel maps raw statuses to readable copy', () => {
  assert.equal(statusLabel('in_progress'), 'In progress');
  assert.equal(statusLabel('no_show'), 'No show');
  assert.equal(statusLabel('refunded'), 'Refunded');
  assert.equal(statusLabel('some_new_status'), 'Some New Status');
});

test('initials takes at most two letters', () => {
  assert.equal(initials('Aarav Mehta'), 'AM');
  assert.equal(initials('Priya'), 'P');
  assert.equal(initials('  '), '');
});
