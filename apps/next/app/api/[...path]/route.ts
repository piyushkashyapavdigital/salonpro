/**
 * The whole SalonPro API, as one Vercel serverless function.
 *
 * `dispatch()` (in `@salonpro/core`) is the same code path the test suite and
 * `scripts/serve.sh` run, so what is deployed here is exactly what the tests
 * proved — the only thing this file adds is the Request/Response translation
 * and the one-time schema check per instance.
 *
 * One function rather than a file per route is deliberate: on a serverless host
 * a single warm instance keeps one Neon pool and answers every path, which is
 * both faster and cheaper than dozens of cold-starting functions that each open
 * their own connections. `app/api/internal/reminders` stays separate because
 * cron is a different contract (secret-authenticated, excluded from the public
 * surface).
 */
import { waitUntil } from '@vercel/functions';
import { ensureSchema } from '@salonpro/core/db';
import { dispatch } from '@salonpro/core/server';
import { maybeReminderSweep } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create/upgrade the schema once per instance.
 *
 * A failed attempt is not cached: the next request retries, and a database
 * outage surfaces as a 500 with a message instead of a poisoned memo.
 */
let ready: Promise<'created' | 'current' | 'upgraded'> | null = null;
function ensureReady() {
  ready ??= ensureSchema().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** Work that outlives the response without delaying it. */
function background(task: Promise<unknown>) {
  const guarded = task.catch((err) => console.error('background task failed', err));
  try {
    waitUntil(guarded);
  } catch {
    /* Not on Vercel (local dev): the instance keeps running anyway. */
    void guarded;
  }
}

async function handle(request: Request): Promise<Response> {
  await ensureReady();

  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array();

  const out = await dispatch({
    method: request.method,
    url: url.pathname + url.search,
    headers,
    body,
  });

  /* The mobile apps poll /api/health whenever they open. If the scheduled
   * reminder sweep has not run for a while (free-tier cron is once a day, and
   * cron can be paused on an inactive repo), this catches up out of band. */
  if (url.pathname === '/api/health' && out.status === 200) background(maybeReminderSweep());

  /* 204/304 must not carry a body — the Response constructor rejects it. */
  const nullBody = out.status === 204 || out.status === 304;
  return new Response(nullBody ? null : Buffer.from(out.body), {
    status: out.status,
    headers: out.headers,
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
