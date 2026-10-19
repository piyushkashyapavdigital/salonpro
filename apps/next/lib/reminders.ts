/**
 * Opportunistic reminder catch-up.
 *
 * A serverless host has no long-lived process, so the reminder engine is driven
 * from outside: `/api/internal/reminders` (Vercel Cron, GitHub Actions, or any
 * pinger). Free-tier cron runs once a day and scheduled workflows pause in an
 * inactive repository, so every `/api/health` also checks whether the last
 * sweep is stale and runs one if it is.
 *
 * Safe by construction: the staleness check is a single indexed read, a stampede
 * is collapsed into one in-flight promise per instance, and a failure is logged
 * rather than surfaced (a health check must never fail because a reminder pass
 * did).
 */
import { one } from '@salonpro/core/db';
import { runAllReminderPasses } from '@salonpro/core/services/notifications';

/** A sweep older than this is considered stale. */
const STALE_MS = 15 * 60 * 1000;

let inFlight: Promise<void> | null = null;

export function maybeReminderSweep(): Promise<void> {
  inFlight ??= sweep().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function sweep(): Promise<void> {
  try {
    const row = await one<{ lastReminderRunAt: string | null }>(
      'SELECT lastReminderRunAt FROM app_meta WHERE id = 1',
    );
    const last = row?.lastReminderRunAt ? Date.parse(row.lastReminderRunAt) : 0;
    if (Number.isFinite(last) && Date.now() - last < STALE_MS) return;

    const result = await runAllReminderPasses();
    console.log('reminder sweep (opportunistic)', JSON.stringify(result));
  } catch (err) {
    console.error('reminder sweep failed', err);
  }
}
