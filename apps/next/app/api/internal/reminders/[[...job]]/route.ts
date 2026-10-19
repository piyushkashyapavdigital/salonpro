/**
 * Scheduled jobs endpoint.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`, and the
 * GitHub Actions workflow in the repo calls it every 15 minutes, which is what
 * covers the free plan's once-a-day limit. Without a configured secret the
 * endpoint refuses with 503 rather than running unprotected.
 *
 *   GET /api/internal/reminders                  → day 7/14/30 reminder passes
 *   GET /api/internal/reminders/appointments     → tomorrow's appointment reminders
 *
 * The job name is a path segment (not a query string) because Vercel Cron paths
 * must be static.
 */
import crypto from 'node:crypto';
import { ensureSchema } from '@salonpro/core/db';
import { env } from '@salonpro/core/env';
import {
  runAllAppointmentReminders,
  runAllReminderPasses,
} from '@salonpro/core/services/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** A sweep over every salon can legitimately take a while. */
export const maxDuration = 60;

function tokenFrom(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return new URL(request.url).searchParams.get('secret')?.trim() ?? '';
}

function authorized(request: Request): boolean {
  if (!env.cronSecret) return false;
  const provided = Buffer.from(tokenFrom(request));
  const expected = Buffer.from(env.cronSecret);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

async function run(
  request: Request,
  context: { params: Promise<{ job?: string[] }> },
): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json(
      {
        error: 'not_configured',
        message: 'Set CRON_SECRET before using the scheduled jobs endpoint.',
      },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return Response.json(
      { error: 'unauthorized', message: 'A valid cron secret is required.' },
      { status: 401 },
    );
  }

  await ensureSchema();

  const { job: segments } = await context.params;
  const job = segments?.[0] ?? new URL(request.url).searchParams.get('job') ?? 'reminders';
  const started = Date.now();

  if (job === 'appointments') {
    const result = await runAllAppointmentReminders();
    return Response.json({ ok: true, job, ...result, ms: Date.now() - started });
  }

  const result = await runAllReminderPasses();
  return Response.json({ ok: true, job: 'reminders', ...result, ms: Date.now() - started });
}

export const GET = run;
export const POST = run;
