/**
 * The HTTP layer, owned.
 *
 * SalonPro used Express; it no longer does. This is the whole surface the route
 * modules need — path params, middleware that can call `next(err)`, and the
 * `res.json/status/send/setHeader` expressions they already use — so the
 * handlers (and their tests) survive unchanged while the runtime becomes a
 * Next.js route handler on Vercel.
 *
 * Deliberate limits: no view engine, no body parser (the dispatcher hands the
 * handler a parsed body), no wildcards beyond `:param`, no streaming. Anything
 * more would be re-implementing the framework we just removed.
 */
import type { SessionUser } from '@salonpro/shared';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface RequestLike {
  method: string;
  /** Path + query, e.g. `/api/admin/customers?page=2`. */
  url: string;
  /** Path only, e.g. `/api/admin/customers`. */
  path: string;
  /** Route placeholders, e.g. `/api/admin/customers/:id` → `{ id: 'c1' }`. */
  params: Record<string, string>;
  /** Query string as an object; repeated keys become an array. */
  query: Record<string, string | string[]>;
  /** Parsed JSON body, or a Buffer for the raw-body routes (payment webhooks). */
  body: any;
  /** Lower-cased header names; repeated headers are comma-joined like Node. */
  headers: Record<string, string | undefined>;
  ip: string;
  /** `http` or `https` — from `x-forwarded-proto` behind a proxy. */
  protocol: string;
  /** Set by `requireAuth`; present on every authenticated route. */
  auth?: SessionUser;
  sessionToken?: string;
  get(name: string): string | undefined;
  socket: { remoteAddress?: string };
}

export interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): ResponseLike;
  send(body?: unknown): ResponseLike;
  sendStatus(code: number): ResponseLike;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | undefined;
  type(value: string): ResponseLike;
  redirect(url: string, status?: number): ResponseLike;
  end(body?: unknown): void;

  /** Internal: the dispatcher resolves the chain through these. */
  __ended?: boolean;
  __onEnd?: () => void;
}

export type NextFunction = (err?: unknown) => void;
export type Handler = (req: RequestLike, res: ResponseLike, next: NextFunction) => unknown;
export type Method = 'get' | 'post' | 'patch' | 'put' | 'delete' | 'options' | 'head';

/** Kept as aliases so route modules read exactly like they always did. */
export type Request = RequestLike;
export type Response = ResponseLike;

type Layer =
  | { kind: 'route'; method: Method; pattern: string; handlers: Handler[] }
  | { kind: 'use'; pattern: string; handlers: Handler[] }
  | { kind: 'mount'; pattern: string; router: Router };

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

const split = (path: string) => path.split('/').filter(Boolean);

/** `/bookings/:id` against `/bookings/abc` → `{ id: 'abc' }`, or null. */
function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = split(pattern);
  const pathParts = split(path);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]!;
    const actual = pathParts[i]!;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

/** `use('/api/auth')` matches `/api/auth` and anything under it. */
function matchPrefix(pattern: string, path: string): Record<string, string> | null {
  if (pattern === '/' || pattern === '') return {};
  const patternParts = split(pattern);
  const pathParts = split(path);
  if (pathParts.length < patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]!;
    const actual = pathParts[i]!;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

function stripPrefix(path: string, prefix: string): string {
  if (prefix === '/' || prefix === '') return path;
  const stripped = path.slice(prefix.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export class Router {
  private layers: Layer[] = [];

  use(router: Router): this;
  use(handler: Handler): this;
  use(pattern: string, router: Router): this;
  use(pattern: string, ...handlers: Handler[]): this;
  use(first: string | Handler | Router, ...rest: (Handler | Router)[]): this {
    if (first instanceof Router) {
      this.layers.push({ kind: 'mount', pattern: '/', router: first });
      return this;
    }
    if (typeof first === 'function') {
      this.layers.push({ kind: 'use', pattern: '/', handlers: [first, ...(rest as Handler[])] });
      return this;
    }
    const [next, ...others] = rest;
    if (next instanceof Router) {
      this.layers.push({ kind: 'mount', pattern: first, router: next });
      return this;
    }
    this.layers.push({ kind: 'use', pattern: first, handlers: others as Handler[] });
    return this;
  }

  get(pattern: string, ...handlers: Handler[]): this {
    return this.route('get', pattern, handlers);
  }
  post(pattern: string, ...handlers: Handler[]): this {
    return this.route('post', pattern, handlers);
  }
  patch(pattern: string, ...handlers: Handler[]): this {
    return this.route('patch', pattern, handlers);
  }
  put(pattern: string, ...handlers: Handler[]): this {
    return this.route('put', pattern, handlers);
  }
  delete(pattern: string, ...handlers: Handler[]): this {
    return this.route('delete', pattern, handlers);
  }
  options(pattern: string, ...handlers: Handler[]): this {
    return this.route('options', pattern, handlers);
  }
  head(pattern: string, ...handlers: Handler[]): this {
    return this.route('head', pattern, handlers);
  }

  private route(method: Method, pattern: string, handlers: Handler[]): this {
    this.layers.push({ kind: 'route', method, pattern, handlers });
    return this;
  }

  /** Every route this router owns (mounts included) — the tested inventory. */
  list(prefix = ''): { method: string; path: string }[] {
    const out: { method: string; path: string }[] = [];
    for (const layer of this.layers) {
      if (layer.kind === 'route') out.push({ method: layer.method.toUpperCase(), path: `${prefix}${layer.pattern}` });
      if (layer.kind === 'mount') out.push(...layer.router.list(`${prefix}${layer.pattern === '/' ? '' : layer.pattern}`));
    }
    return out;
  }

  /**
   * Run this router for one request. Returns true when something answered
   * (a route ran, or middleware finished the response); false when nothing
   * matched, so the caller can try the next mount point or return 404.
   */
  async handle(req: RequestLike, res: ResponseLike): Promise<boolean> {
    for (const layer of this.layers) {
      if (layer.kind === 'route') {
        if (layer.method !== req.method.toLowerCase()) continue;
        const params = matchPath(layer.pattern, req.path);
        if (!params) continue;
        const saved = req.params;
        req.params = { ...saved, ...params };
        const answered = await runChain(layer.handlers, req, res);
        req.params = saved;
        if (answered) return true;
        continue;
      }

      const params = matchPrefix(layer.pattern, req.path);
      if (!params) continue;

      if (layer.kind === 'use') {
        const saved = req.params;
        req.params = { ...saved, ...params };
        const answered = await runChain(layer.handlers, req, res);
        req.params = saved;
        if (answered) return true;
        continue;
      }

      const saved = { path: req.path, url: req.url, params: req.params };
      req.path = stripPrefix(req.path, layer.pattern);
      req.url = req.path + saved.url.slice(saved.path.length);
      req.params = { ...saved.params, ...params };
      const answered = await layer.router.handle(req, res);
      req.path = saved.path;
      req.url = saved.url;
      req.params = saved.params;
      if (answered) return true;
    }

    return false;
  }
}

/**
 * Execute one layer's handlers in order. `next()` continues, `next(err)` stops
 * with that error, and finishing the response (through the `__onEnd` hook the
 * dispatcher installs) is an answer — the contract the route modules were
 * written against.
 */
function runChain(handlers: Handler[], req: RequestLike, res: ResponseLike): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let index = 0;
    let settled = false;

    const finish = (answered: boolean) => {
      if (settled) return;
      settled = true;
      resolve(answered);
    };

    res.__onEnd = () => finish(true);

    const step: NextFunction = (err) => {
      if (settled) return;
      if (err) {
        settled = true;
        reject(err);
        return;
      }
      const handler = handlers[index++];
      if (!handler) {
        finish(false);
        return;
      }
      try {
        const result = handler(req, res, step);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          Promise.resolve(result).catch((e) => {
            if (!settled) {
              settled = true;
              reject(e);
            }
          });
        }
      } catch (e) {
        settled = true;
        reject(e);
      }
    };

    step();
  });
}

/**
 * Marker middleware for the payment webhook: the dispatcher hands that route
 * the raw bytes, because a signature can only be verified against the exact
 * body the provider signed.
 */
export function rawBody(): Handler {
  return (_req, _res, next) => next();
}
