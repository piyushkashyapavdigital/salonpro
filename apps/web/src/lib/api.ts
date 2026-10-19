import type { ApiErrorShape, SessionUser, Wallet } from '@salonpro/shared';

const TOKEN_KEY = 'salonpro.token';
const BASE_KEY = 'salonpro.apiBase';

/**
 * Base URL for API calls. Empty in the browser (requests go to `/api` and are
 * proxied by Vite / served by the API). Set `VITE_API_BASE` when the UI is
 * packaged into a native shell (Capacitor APK), where relative requests cannot
 * reach the server, e.g. `VITE_API_BASE=http://192.168.1.34:4000`.
 *
 * The build value is only a *default*: the phone can be pointed at another
 * server at runtime (see `ServerCard`, shown on the native login screen), which
 * is what makes one APK usable by anyone with any reachable API address.
 */
const BUILD_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? '';

/** The address the app was built against ('' means same origin, i.e. the web build). */
export function buildApiBase(): string {
  return BUILD_BASE;
}

/**
 * Normalise what a person types into a base URL:
 * `192.168.1.34:4000` → `http://192.168.1.34:4000`,
 * `https://salon.example.com/api/` → `https://salon.example.com`.
 */
export function normalizeApiBase(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/api$/i, '');
}

/** The API address in use right now: the phone's own setting, else the build default. */
export function getApiBase(): string {
  try {
    const stored = localStorage.getItem(BASE_KEY);
    if (stored !== null) return stored;
  } catch {
    /* storage unavailable (private mode) — fall back to the build default */
  }
  return BUILD_BASE;
}

/** Store (or clear, with `''`) the phone's server address. */
export function setApiBase(base: string | null) {
  try {
    const clean = normalizeApiBase(base ?? '');
    if (!clean || clean === BUILD_BASE) localStorage.removeItem(BASE_KEY);
    else localStorage.setItem(BASE_KEY, clean);
  } catch {
    /* storage unavailable — the session simply keeps the build default */
  }
}

/** Absolute URL for an API path, honouring the configured server address. */
export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${getApiBase()}/api${path}`;
}

export interface ServerCheck {
  ok: boolean;
  /** What to show the person: success text or the reason it failed. */
  message: string;
}

/**
 * Ask an address whether it is a SalonPro API, before committing to it.
 *
 * This is deliberately honest: a captive portal, a wrong port or someone else's
 * web server must not be accepted as "connected".
 */
export async function checkApiBase(input: string): Promise<ServerCheck> {
  const base = normalizeApiBase(input);
  if (!base) return { ok: false, message: 'Enter your salon server address first.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/health`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) {
      return { ok: false, message: `That address answered with HTTP ${res.status}. Check it is the SalonPro server.` };
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!body || body.ok !== true) {
      return { ok: false, message: 'That address is not a SalonPro server.' };
    }
    return { ok: true, message: 'Connected to your SalonPro server.' };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      message: timedOut
        ? 'No answer after 8 seconds. Check the address and that the phone can reach the server.'
        : 'Could not reach that address. Check the address and the network.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — the session simply will not persist */
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Set for endpoints that must not include the auth header. */
  anonymous?: boolean;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const token = options.anonymous ? null : getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: 'same-origin',
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const shape = (data ?? {}) as ApiErrorShape;
    if (response.status === 401 && !options.anonymous) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('salonpro:signed-out'));
    }
    throw new ApiError(
      response.status,
      shape.error ?? 'request_failed',
      shape.message ?? 'Something went wrong. Please try again.',
      shape.details,
    );
  }

  return data as T;
}

/** Trigger a browser download from an endpoint that streams a file. */
export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const response = await fetch(apiUrl(path), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, 'download_failed', 'Could not download that file.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Typed endpoints                                                     */
/* ------------------------------------------------------------------ */

export interface SessionResponse {
  token?: string;
  user: SessionUser;
  wallet: Wallet | null;
  notice?: string;
}

export const endpoints = {
  requestOtp: (phone: string) =>
    api<{
      ok: true;
      phone: string;
      isNewUser: boolean;
      deliveryMode: 'development_mock' | 'provider';
      expiresInSeconds: number;
      devCode?: string;
      notice: string;
    }>('/auth/otp/request', { method: 'POST', body: { phone }, anonymous: true }),

  verifyOtp: (body: { phone: string; code: string; name?: string; referralToken?: string }) =>
    api<SessionResponse>('/auth/otp/verify', { method: 'POST', body, anonymous: true }),

  demoAccounts: () =>
    api<{ mode: string; notice: string; password: string; accounts: { name: string; phone: string; role: string }[] }>(
      '/auth/demo-accounts',
      { anonymous: true },
    ),

  demoLogin: (phone: string, password?: string) =>
    api<SessionResponse>('/auth/demo-login', { method: 'POST', body: { phone, password }, anonymous: true }),

  me: () => api<{ user: SessionUser; wallet: Wallet | null }>('/auth/me'),

  logout: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),

  health: () => api<{ ok: boolean; integrations: Record<string, boolean> }>('/health', { anonymous: true }),
};
