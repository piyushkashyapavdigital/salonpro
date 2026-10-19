/**
 * Test environment.
 *
 * This module MUST be the first import in every test file. ESM evaluates
 * imported modules in source order, so setting env vars here guarantees they
 * are in place before the harness (and transitively `src/env.ts`, `src/db.ts`)
 * is evaluated.
 */
process.env.NODE_ENV = 'test';
process.env.SERVE_STATIC = 'false';
process.env.SESSION_SECRET = 'test-session-secret-do-not-use-in-prod';
process.env.ALLOW_PAYMENT_SIMULATION = 'true';
/* Generous limits so the suite never trips the auth rate limiter. */
process.env.OTP_RATE_LIMIT_PER_HOUR = '100000';
process.env.OTP_MAX_ATTEMPTS = '100000';
/**
 * Real Postgres compiled to WebAssembly (PGlite), in memory. The suite needs no
 * database server and never touches the configured Neon database: `env.ts` only
 * fills in values that are still undefined, so this wins over `.env`.
 */
process.env.DATABASE_URL = 'pglite:memory:';

export const TEST_DATABASE_URL = process.env.DATABASE_URL;
