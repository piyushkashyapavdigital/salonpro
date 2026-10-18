import type { ApiErrorShape, SessionUser, Wallet } from '@salonpro/shared';

const TOKEN_KEY = 'salonpro.token';

/**
 * Base URL for API calls. Empty in the browser (requests go to `/api` and are
 * proxied by Vite / served by the API). Set `VITE_API_BASE` when the UI is
 * packaged into a native shell (Capacitor APK), where relative requests cannot
 * reach the server, e.g. `VITE_API_BASE=http://192.168.1.34:4000`.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? '';

/** Absolute URL for an API path, honouring an external API base when set. */
export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}/api${path}`;
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
