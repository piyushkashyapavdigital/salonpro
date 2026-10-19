/**
 * The API, as one transport-agnostic dispatcher.
 *
 * `apps/next/app/api/[...path]/route.ts` turns a Vercel request into a
 * `dispatch()` call and the answer back into a `Response`; the test harness and
 * `scripts/serve.sh` reuse the same function. There is exactly one place that
 * knows about HTTP status codes, CORS and error shapes, so the Next deployment
 * and the tests can never drift apart.
 */
import { ZodError } from 'zod';
import { env, integrations } from './env';
import { HttpError } from './lib/http';
import { Router, type RequestLike, type ResponseLike } from './lib/router';
import { authRouter } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { customerRouter } from './routes/customer';
import { adminRouter } from './routes/admin';
import { paymentsRouter } from './routes/payments';
import { REFUND_POLICY } from './lib/policy';

/* ------------------------------------------------------------------ */
/* Router tree                                                         */
/* ------------------------------------------------------------------ */

/**
 * Origins allowed to call the API from a browser context.
 *
 * The native apps don't send an `Origin` header, so CORS is a no-op for them;
 * this allow-list is for local tooling and any future web surface. `WEB_ORIGIN`
 * is appended at request time.
 */
const APP_ORIGINS = ['https://localhost', 'http://localhost'];

export function buildRouter() {
  const root = new Router();

  root.get('/api/health', (_req, res) => {
    return res.json({
      ok: true,
      time: new Date().toISOString(),
      nodeEnv: env.nodeEnv,
      integrations,
      policy: { refund: REFUND_POLICY },
    });
  });

  root.use('/api/auth', authRouter);
  root.use('/api/catalog', catalogRouter);
  root.use('/api/customer', customerRouter);
  root.use('/api/payments', paymentsRouter);
  root.use('/api/admin', adminRouter);

  return root;
}

let cachedRouter: Router | null = null;
function router(): Router {
  cachedRouter ??= buildRouter();
  return cachedRouter;
}

/** Every route the API answers — used by the route-surface tests. */
export function routeList(prefix = '/api'): { method: string; path: string }[] {
  return router().list(prefix === '/api' ? '' : prefix);
}

/* ------------------------------------------------------------------ */
/* Request / response shims                                            */
/* ------------------------------------------------------------------ */

export interface DispatchInput {
  method: string;
  /** Full path with query, e.g. `/api/admin/customers?page=1`. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  /** Raw request body (empty for GET/HEAD). */
  body?: Uint8Array;
  /** Overrides the address derived from the headers (tests, local dev). */
  ip?: string;
}

export interface DispatchOutput {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** The webhook is verified against the bytes Razorpay signed, never re-encoded. */
export function isRawBodyPath(path: string): boolean {
  return path === '/api/payments/webhook';
}

/**
 * Body limits, the same ones the Express middleware chain enforced: a request
 * larger than this is refused with 413 instead of being parsed.
 */
const MAX_JSON_BODY = 2 * 1024 * 1024;
const MAX_RAW_BODY = 1024 * 1024;

function parseQuery(search: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    query[key] = values.length > 1 ? values : values[0]!;
  }
  return query;
}

function lowerHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    /* Repeated headers arrive as arrays and are joined the way Node joins
     * them, so handlers keep reading plain strings. */
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function firstHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  return headers[name];
}

function makeResponse(headers: Record<string, string>) {
  let statusCode = 200;
  let body: Uint8Array | null = null;

  const finish = () => {
    res.__ended = true;
    res.__onEnd?.();
  };

  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    type(value: string) {
      res.setHeader('content-type', value);
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(value: unknown) {
      if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8';
      body = new TextEncoder().encode(JSON.stringify(value ?? null));
      finish();
      return res;
    },
    send(value?: unknown) {
      body =
        value === undefined
          ? new Uint8Array()
          : typeof value === 'string'
            ? new TextEncoder().encode(value)
            : new TextEncoder().encode(JSON.stringify(value));
      finish();
      return res;
    },
    sendStatus(code: number) {
      statusCode = code;
      /* 204/304 must not carry a body — that is what makes them statuses. */
      if (code === 204 || code === 304) {
        body = new Uint8Array();
        finish();
        return res;
      }
      return res.send(String(code));
    },
    redirect(url: string, code = 302) {
      statusCode = code;
      res.setHeader('location', url);
      return res.send('');
    },
    end(value?: unknown) {
      if (value !== undefined) {
        res.send(value);
        return;
      }
      body ??= new Uint8Array();
      finish();
    },
    __ended: false,
  } as ResponseLike;

  return {
    res,
    result(): DispatchOutput {
      return { status: statusCode, headers, body: body ?? new Uint8Array() };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

/**
 * Answer one API request. Never throws: every failure becomes a JSON response
 * with the same shape the browser and the mobile apps already handle.
 */
export async function dispatch(input: DispatchInput): Promise<DispatchOutput> {
  const started = Date.now();
  const parsed = new URL(input.url, 'http://internal');
  const path = parsed.pathname;
  const headers = lowerHeaders(input.headers);
  const { res, result } = makeResponse({});

  /* Hardening + CORS (the rules the packaged apps and the PWA rely on). */
  const origin = firstHeader(headers, 'origin');
  const allowed = [env.webOrigin, `http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`, ...APP_ORIGINS];
  if (origin && (allowed.includes(origin) || env.nodeEnv !== 'production')) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
  }
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-razorpay-signature');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'DENY');

  const method = (input.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    res.status(204).send('');
    return result();
  }

  const body = input.body ?? new Uint8Array();
  const raw = isRawBodyPath(path);
  const limit = raw ? MAX_RAW_BODY : MAX_JSON_BODY;
  if (body.byteLength > limit) {
    res.status(413).json({
      error: 'payload_too_large',
      message: `The request body is larger than the ${Math.round(limit / 1024 / 1024)} MB limit.`,
    });
    return result();
  }

  let parsedBody: unknown = undefined;
  if (!raw && body.byteLength > 0) {
    const text = new TextDecoder().decode(body);
    try {
      parsedBody = text ? JSON.parse(text) : {};
    } catch {
      res.status(400).json({ error: 'bad_request', message: 'The request body is not valid JSON.' });
      return result();
    }
  } else if (raw) {
    parsedBody = Buffer.from(body);
  }

  const req: RequestLike = {
    method,
    url: input.url,
    path,
    params: {},
    query: parseQuery(parsed.searchParams),
    body: parsedBody,
    headers,
    ip: input.ip ?? firstHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    protocol: firstHeader(headers, 'x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http',
    get(name: string) {
      return firstHeader(headers, name.toLowerCase());
    },
    socket: { remoteAddress: firstHeader(headers, 'x-forwarded-for') },
  };

  try {
    const answered = await router().handle(req, res);
    if (!answered) {
      res.status(404).json({ error: 'not_found', message: `${method} ${path} is not a route.` });
    }
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'validation_error',
        message: err.issues[0]?.message ?? 'Please check the form and try again.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    } else {
      const status = (err as { status?: number }).status ?? 500;
      const message = (err as Error)?.message ?? 'Something went wrong.';
      if (status >= 500) console.error(err);
      res.status(status).json({ error: 'server_error', message });
    }
  }

  const output = result();
  if (output.status >= 400 && env.nodeEnv !== 'test') {
    console.warn(`  ${output.status} ${method} ${path} (${Date.now() - started}ms)`);
  }
  return output;
}

/**
 * Which integrations are actually configured — surfaced by `/api/health` so a
 * client can tell "not configured" from "broken".
 */
export { integrations };
