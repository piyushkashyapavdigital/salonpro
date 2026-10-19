/**
 * The API client both apps share.
 *
 * Differences from the browser version, and why:
 *   - The server address lives in AsyncStorage and can be changed at runtime
 *     from the sign-in screen, so one APK works against any reachable SalonPro
 *     server (a hosted URL, a laptop on the same Wi-Fi, a salon's own box).
 *   - A 401 clears the session and notifies the app through a listener instead
 *     of a window event; React Native has no `window`.
 *   - Requests to `http://` addresses fail on Android 9+ unless the app opts
 *     in, which `AndroidManifest.xml` does (see `usesCleartextTraffic`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiErrorShape } from '../core';
import { BUILD_API_BASE } from '../config';

const TOKEN_KEY = 'salonpro.token';
const BASE_KEY = 'salonpro.apiBase';

/* ------------------------------------------------------------------ */
/* Server address                                                      */
/* ------------------------------------------------------------------ */

/**
 * Normalise what a person types:
 * `192.168.1.34:4000` → `http://192.168.1.34:4000`,
 * `https://salon.example.com/api/` → `https://salon.example.com`.
 */
export function normalizeApiBase(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/api$/i, '');
}

let cachedBase: string | null = null;

/** The API address in use right now: the phone's own setting, else the build default. */
export function getApiBase(): string {
  return cachedBase ?? BUILD_API_BASE;
}

/** Load the stored address once at start-up. */
export async function initApiBase(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(BASE_KEY);
    cachedBase = stored && stored.length > 0 ? stored : null;
  } catch {
    cachedBase = null;
  }
}

/** Store (or clear, with `null`) the phone's server address. */
export async function setApiBase(base: string | null): Promise<void> {
  const clean = normalizeApiBase(base ?? '');
  cachedBase = clean && clean !== BUILD_API_BASE ? clean : null;
  try {
    if (cachedBase) await AsyncStorage.setItem(BASE_KEY, cachedBase);
    else await AsyncStorage.removeItem(BASE_KEY);
  } catch {
    /* storage unavailable — the session keeps the build default */
  }
}

export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${getApiBase()}/api${path}`;
}

export interface ServerCheck {
  ok: boolean;
  message: string;
}

/**
 * Ask an address whether it is a SalonPro API before committing to it. A
 * captive portal or someone else's server must not be accepted as "connected",
 * so the answer has to be a real `/api/health` with `ok: true`.
 */
export async function checkApiBase(input: string): Promise<ServerCheck> {
  const base = normalizeApiBase(input);
  if (!base) return { ok: false, message: 'Enter your salon server address first.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, message: `That address answered with HTTP ${res.status}. Check it is the SalonPro server.` };
    }
    const payload = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!payload || payload.ok !== true) {
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

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

let cachedToken: string | null = null;

export async function initToken(): Promise<string | null> {
  try {
    cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export function getToken(): string | null {
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* the session simply will not persist */
  }
}

type Listener = () => void;
const signOutListeners = new Set<Listener>();

/** Called when the server rejects the session (expired/revoked token). */
export function onSignedOut(listener: Listener): () => void {
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  anonymous?: boolean;
  timeoutMs?: number;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const token = options.anonymous ? null : cachedToken;
  if (token) headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'The server took too long to answer. Check your connection.');
    }
    throw new ApiError(
      0,
      'network',
      `Could not reach the salon server at ${getApiBase()}. Check the address and that both are online.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown;
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
      await setToken(null);
      for (const listener of signOutListeners) listener();
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
