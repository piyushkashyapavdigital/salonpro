import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError, downloadFile, endpoints, getToken, setToken } from '../src/lib/api';

/*
 * The API client is the single choke point every screen uses, so its error and
 * auth behaviour is worth pinning down: it must attach the bearer token, surface
 * the server's error shape, and clear a dead session on 401.
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch mock whose call tuples are typed, so `.mock.calls[0]` reads cleanly. */
function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl);
}

beforeEach(() => {
  localStorage.clear();
});

describe('api client', () => {
  it('prefixes the /api base path and parses JSON', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api<{ ok: boolean }>('/thing');

    expect(data).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/thing');
  });

  it('attaches the bearer token when one is stored', async () => {
    setToken('tok_123');
    const fetchMock = mockFetch(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await api('/private');

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok_123');
  });

  it('omits the token for anonymous requests', async () => {
    setToken('tok_123');
    const fetchMock = mockFetch(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await api('/public', { anonymous: true });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('throws a typed ApiError carrying the server message and code', async () => {
    vi.stubGlobal('fetch', mockFetch(async () => jsonResponse({ error: 'validation_error', message: 'Phone is required.' }, 400)));

    await expect(api('/thing')).rejects.toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Phone is required.',
    });
  });

  it('clears the session and announces sign-out on a 401', async () => {
    setToken('tok_123');
    const onSignedOut = vi.fn();
    window.addEventListener('salonpro:signed-out', onSignedOut);
    vi.stubGlobal('fetch', mockFetch(async () => jsonResponse({ error: 'unauthorized', message: 'Session expired.' }, 401)));

    await expect(api('/private')).rejects.toBeInstanceOf(ApiError);

    expect(getToken()).toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    window.removeEventListener('salonpro:signed-out', onSignedOut);
  });

  it('does not clear the session when an anonymous request 401s', async () => {
    setToken('tok_123');
    vi.stubGlobal('fetch', mockFetch(async () => jsonResponse({ error: 'unauthorized', message: 'nope' }, 401)));

    await expect(api('/login', { anonymous: true })).rejects.toBeInstanceOf(ApiError);

    expect(getToken()).toBe('tok_123');
  });

  it('returns undefined for an empty 204 response', async () => {
    vi.stubGlobal('fetch', mockFetch(async () => new Response(null, { status: 204 })));
    await expect(api('/thing', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('falls back to the raw body when an error is not JSON', async () => {
    vi.stubGlobal('fetch', mockFetch(async () => new Response('upstream gateway timeout', { status: 502 })));

    await expect(api('/thing')).rejects.toMatchObject({
      status: 502,
      code: 'request_failed',
      message: 'upstream gateway timeout',
    });
  });
});

describe('downloadFile', () => {
  it('requests the file with the token and clicks a download link', async () => {
    setToken('tok_123');
    const blob = new Blob(['a,b,c'], { type: 'text/csv' });
    const fetchMock = mockFetch(async () => new Response(blob, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    // jsdom does not implement these.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadFile('/admin/wallet.csv', 'wallet.csv');

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok_123');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('throws when the download endpoint fails', async () => {
    vi.stubGlobal('fetch', mockFetch(async () => new Response('nope', { status: 403 })));
    await expect(downloadFile('/admin/wallet.csv', 'wallet.csv')).rejects.toMatchObject({ status: 403 });
  });
});

describe('typed endpoints', () => {
  it('requestOtp posts anonymously to the OTP route', async () => {
    setToken('tok_should_not_be_sent');
    const fetchMock = mockFetch(async () => jsonResponse({ ok: true, deliveryMode: 'development_mock' }));
    vi.stubGlobal('fetch', fetchMock);

    await endpoints.requestOtp('9700000001');

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/otp/request');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ phone: '9700000001' });
  });
});
