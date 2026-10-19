/**
 * Next-app test environment.
 *
 * The API tests' environment (PGlite, test secrets, generous rate limits) plus
 * the cron secret the reminders endpoint authenticates with. This module MUST be
 * the first import in every test here: `src/env.ts` is parsed on first use and
 * only reads values that are already set.
 */
import '../../../packages/core/test/setup-env';

process.env.CRON_SECRET = 'test-cron-secret';
