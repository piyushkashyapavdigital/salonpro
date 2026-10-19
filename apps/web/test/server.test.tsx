import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServerCard } from '../src/components/ServerCard';
import Login from '../src/pages/Login';
import { AuthProvider } from '../src/lib/auth';
import { ToastProvider } from '../src/components/Toast';
import { apiUrl, buildApiBase, checkApiBase, getApiBase, normalizeApiBase, setApiBase } from '../src/lib/api';

/**
 * Pretend to be the Android shell when a test flips the flag. Mocking the
 * Capacitor bridge (rather than the app's own helpers) keeps `lib/native.ts`
 * in the picture, so the real `isNative()` gate is what gets exercised.
 */
let nativePlatform = false;
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativePlatform,
    getPlatform: () => (nativePlatform ? 'android' : 'web'),
  },
}));

/*
 * "Which server does this app talk to?"
 *
 * A shared APK cannot be compiled against every salon's address, so the phone
 * keeps one that can be changed at runtime and is *verified* before it is
 * stored. These tests pin that: no address is accepted as connected unless the
 * server really answers like SalonPro, and every request path goes through the
 * configured base (a bare `/api/...` fetch is unreachable inside the native
 * shell — that bug silently broke reschedule slots and the consent toggle).
 */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  localStorage.clear();
});

describe('normalizeApiBase', () => {
  it('adds a scheme when the person types a bare address', () => {
    expect(normalizeApiBase('192.168.1.34:4000')).toBe('http://192.168.1.34:4000');
    expect(normalizeApiBase('salon.example.com')).toBe('http://salon.example.com');
  });

  it('keeps an explicit https address as https', () => {
    expect(normalizeApiBase('https://salon.example.com')).toBe('https://salon.example.com');
  });

  it('strips trailing slashes and a trailing /api', () => {
    expect(normalizeApiBase('  http://10.0.0.5:4000/  ')).toBe('http://10.0.0.5:4000');
    expect(normalizeApiBase('http://10.0.0.5:4000/api')).toBe('http://10.0.0.5:4000');
    expect(normalizeApiBase('http://10.0.0.5:4000/api/')).toBe('http://10.0.0.5:4000');
  });

  it('treats an empty entry as "no address"', () => {
    expect(normalizeApiBase('   ')).toBe('');
  });
});

describe('the configured base', () => {
  it('starts at the build default (empty means same origin)', () => {
    expect(getApiBase()).toBe(buildApiBase());
    expect(apiUrl('/auth/me')).toBe(`${buildApiBase()}/api/auth/me`);
  });

  it('routes every request through a stored address', () => {
    setApiBase('10.0.0.5:4000/');
    expect(getApiBase()).toBe('http://10.0.0.5:4000');
    expect(apiUrl('/admin/overview?date=2026-10-19')).toBe('http://10.0.0.5:4000/api/admin/overview?date=2026-10-19');
    /* Absolute URLs are never rewritten (WhatsApp/callback links). */
    expect(apiUrl('https://elsewhere.example/x')).toBe('https://elsewhere.example/x');
  });

  it('goes back to the build default when cleared', () => {
    setApiBase('http://10.0.0.5:4000');
    setApiBase('');
    expect(getApiBase()).toBe(buildApiBase());
    expect(localStorage.getItem('salonpro.apiBase')).toBeNull();
  });
});

describe('checkApiBase', () => {
  it('accepts a server that answers the health check', async () => {
    const mock = vi.fn(async (_input: RequestInfo | URL) => json({ ok: true, integrations: {} }));
    vi.stubGlobal('fetch', mock);

    const check = await checkApiBase('10.0.0.5:4000');
    expect(check.ok).toBe(true);
    expect(check.message).toMatch(/connected/i);
    /* The probe itself must use the configured (normalised) base. */
    expect(mock.mock.calls[0]?.[0]).toBe('http://10.0.0.5:4000/api/health');
  });

  it('refuses an address that is not a SalonPro server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false })));
    expect((await checkApiBase('http://10.0.0.5:4000')).ok).toBe(false);

    /* A captive portal or a random web server returning HTML. */
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Hello</html>', { status: 200 })));
    const html = await checkApiBase('http://10.0.0.5:4000');
    expect(html.ok).toBe(false);
    expect(html.message).toMatch(/not a salonpro server/i);
  });

  it('reports an HTTP error instead of pretending to connect', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'nope' }, 500)));
    const check = await checkApiBase('http://10.0.0.5:4000');
    expect(check.ok).toBe(false);
    expect(check.message).toContain('500');
  });

  it('explains a network failure in plain words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const check = await checkApiBase('http://10.0.0.5:4000');
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/could not reach/i);
  });

  it('asks for an address when the field is empty', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    const check = await checkApiBase('   ');
    expect(check.ok).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('ServerCard', () => {
  it('tests the address before saving it, and reports success', async () => {
    const user = userEvent.setup();
    const mock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', mock);
    const saved = vi.fn();

    render(<ServerCard defaultOpen onSaved={saved} />);
    const input = screen.getByLabelText(/salonpro server address/i);
    await user.clear(input);
    await user.type(input, '10.0.0.5:4000');
    await user.click(screen.getByRole('button', { name: /test and save/i }));

    expect(await screen.findByText(/connected to your salonpro server/i)).toBeInTheDocument();
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('salonpro.apiBase')).toBe('http://10.0.0.5:4000');
    expect(screen.getByText('http://10.0.0.5:4000')).toBeInTheDocument();
  });

  it('keeps the old address and says why when the new one fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const saved = vi.fn();

    render(<ServerCard defaultOpen onSaved={saved} />);
    await user.type(screen.getByLabelText(/salonpro server address/i), '10.9.9.9:4000');
    await user.click(screen.getByRole('button', { name: /test and save/i }));

    expect(await screen.findByText(/could not reach/i)).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
    expect(localStorage.getItem('salonpro.apiBase')).toBeNull();
  });

  it('stays collapsed until it is tapped, showing the current address', async () => {
    const user = userEvent.setup();
    render(<ServerCard />);
    expect(screen.queryByLabelText(/salonpro server address/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /server/i }));
    expect(screen.getByLabelText(/salonpro server address/i)).toBeInTheDocument();
  });
});

describe('the login screen', () => {
  function renderLogin() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <ToastProvider>
              <Login />
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    nativePlatform = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/auth/me')) return json({ error: 'unauthorized', message: 'No session' }, 401);
        if (url.includes('/api/auth/demo-accounts')) return json({ accounts: [], password: 'x' });
        return json({ error: 'not_found', message: url }, 404);
      }),
    );
  });

  it('offers the server address in the packaged app, which needs it to reach any API', async () => {
    nativePlatform = true;
    renderLogin();
    expect(await screen.findByPlaceholderText('98XX XX XX XX')).toBeInTheDocument();
    /* A build with no baked-in address opens the setting immediately — the
     * first thing a newly installed shared APK needs is where the API lives. */
    expect(await screen.findByLabelText(/salonpro server address/i)).toBeInTheDocument();
  });

  it('points at the server setting when the API cannot be reached', async () => {
    nativePlatform = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/auth/me')) return json({ error: 'unauthorized', message: 'No session' }, 401);
        if (url.includes('/api/auth/demo-accounts')) return json({ accounts: [], password: 'x' });
        throw new TypeError('Failed to fetch');
      }),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(await screen.findByPlaceholderText('98XX XX XX XX'), '9800000001');
    await user.click(screen.getByRole('button', { name: /send one-time code/i }));

    expect(await screen.findByText(/could not be reached/i)).toBeInTheDocument();
    expect(screen.getByText(/server address below/i)).toBeInTheDocument();
  });

  it('does not clutter the web sign-in with a server setting', async () => {
    renderLogin();
    expect(await screen.findByPlaceholderText('98XX XX XX XX')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /server/i })).not.toBeInTheDocument();
  });
});
