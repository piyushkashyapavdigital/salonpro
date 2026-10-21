/**
 * In-process test harness.
 *
 * Boots the real API (the same `dispatch()` Vercel runs) on an ephemeral port
 * against a throwaway PGlite
 * database (real Postgres in WebAssembly, in memory) that was seeded with the
 * deterministic demo data. No database server, no network mocks, no external
 * services: the tests exercise the same code paths production runs.
 */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import './setup-env';

export interface ApiResponse<T = any> {
  status: number;
  data: T;
  headers: Headers;
}

export interface Harness {
  /** Base URL including the `/api` prefix. */
  base: string;
  request<T = any>(
    method: string,
    path: string,
    opts?: { token?: string; body?: unknown; raw?: string | Buffer; headers?: Record<string, string> },
  ): Promise<ApiResponse<T>>;
  get<T = any>(path: string, token?: string): Promise<ApiResponse<T>>;
  post<T = any>(path: string, body?: unknown, token?: string): Promise<ApiResponse<T>>;
  patch<T = any>(path: string, body?: unknown, token?: string): Promise<ApiResponse<T>>;
  /** Sign in as a seeded demo account and return its bearer token. */
  login(phone: string): Promise<string>;
  /** Wipe and reseed — call in `beforeEach` for isolated tests. */
  reset(): Promise<void>;
  db: typeof import('../src/db');
  close(): Promise<void>;
}

/** Demo phone numbers, kept in one place so tests read cleanly. */
export const ACCOUNTS = {
  superAdmin: '9999999999',
  owner: '9800000001',
  manager: '9800000002',
  receptionist: '9800000003',
  stylist: '9800000010',
  customer1: '9700000001',
  customer2: '9700000002',
} as const;

let harnessPromise: Promise<Harness> | null = null;

export function getHarness(): Promise<Harness> {
  if (!harnessPromise) harnessPromise = build();
  return harnessPromise;
}

async function build(): Promise<Harness> {
  const db = await import('../src/db');
  const { createNodeServer } = await import('../src/lib/node-server');
  const { runSeed } = await import('../src/seed');

  const silence = () => {
    const original = console.log;
    console.log = () => {};
    return () => {
      console.log = original;
    };
  };

  const seed = async () => {
    const restore = silence();
    try {
      await db.resetDatabase();
      await runSeed(false);
    } finally {
      restore();
    }
  };

  await seed();

  const server: Server = createNodeServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  /* Bun's test runner runs every file in one process with a shared module
   * graph, so this harness is a true singleton. Unref the server so it does not
   * keep the process alive once the tests finish. */
  server.unref();
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;

  async function request<T = any>(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; raw?: string | Buffer; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    let body: any;
    if (opts.raw !== undefined) {
      body = opts.raw as any;
    } else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(base + path, { method, headers, body });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data: data as T, headers: res.headers };
  }

  async function login(phone: string): Promise<string> {
    const res = await request<{ token: string }>('POST', '/auth/demo-login', { body: { phone } });
    if (res.status !== 200 || !res.data?.token) {
      throw new Error(`demo login failed for ${phone}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
    }
    return res.data.token;
  }

  const harness: Harness = {
    base,
    request,
    get: (path, token) => request('GET', path, { token }),
    post: (path, body, token) => request('POST', path, { body, token }),
    patch: (path, body, token) => request('PATCH', path, { body, token }),
    login,
    async reset() {
      await seed();
    },
    db,
    async close() {
      /* No-op on purpose. Node's test runner forks a process per file, but
       * Bun's runs them all in one process sharing this module instance — so
       * closing the server and database here would break every other file that
       * has not run yet. The server is unref'd and the in-memory database is
       * torn down with the process. */
    },
  };
  return harness;
}

/** Nudge the event loop so queued microtasks (notifications etc.) settle. */
export const tick = () => new Promise((r) => setTimeout(r, 25));

/** ISO `YYYY-MM-DD` for a date offset from today by `n` days. */
export function dayFrom(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
