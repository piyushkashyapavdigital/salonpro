/**
 * Test environment.
 *
 * This module MUST be the first import in every test file. ESM evaluates
 * imported modules in source order, so setting env vars here guarantees they
 * are in place before the harness (and transitively `src/env.ts`, `src/db.ts`)
 * is evaluated.
 */
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.SERVE_STATIC = 'false';
process.env.SESSION_SECRET = 'test-session-secret-do-not-use-in-prod';
process.env.ALLOW_PAYMENT_SIMULATION = 'true';
/* Generous limits so the suite never trips the auth rate limiter. */
process.env.OTP_RATE_LIMIT_PER_HOUR = '100000';
process.env.OTP_MAX_ATTEMPTS = '100000';
/* One throwaway database per test process. */
process.env.DATABASE_FILE = path.join(
  os.tmpdir(),
  `salonpro-test-${process.pid}-${crypto.randomBytes(4).toString('hex')}.db`,
);

export const TEST_DATABASE_FILE = process.env.DATABASE_FILE;
