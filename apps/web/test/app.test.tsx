import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/App';
import { AuthProvider } from '../src/lib/auth';
import { ToastProvider } from '../src/components/Toast';
import { setToken } from '../src/lib/api';
import type { SessionUser } from '@salonpro/shared';

/*
 * Full-app render smoke tests.
 *
 * These mount the real router, auth provider and pages against a mocked fetch,
 * which is the fastest way to catch "white screen of death" regressions: a bad
 * import, a hook used outside a provider, or a page that crashes on unexpected
 * data. Route guards and role enforcement are checked here too.
 */

const CUSTOMER: SessionUser = {
  id: 'cust-1',
  name: 'Priya Sharma',
  phone: '9700000001',
  email: null,
  role: 'customer',
  status: 'active',
  salonId: 'salon-1',
  branchIds: [],
  permissions: [],
} as unknown as SessionUser;

const OWNER: SessionUser = {
  id: 'owner-1',
  name: 'Salon Owner',
  phone: '9800000001',
  email: null,
  role: 'salon_owner',
  status: 'active',
  salonId: 'salon-1',
  branchIds: ['branch-1'],
  permissions: [],
} as unknown as SessionUser;

let signedIn: SessionUser | null = null;

const HOME_PAYLOAD = {
  profile: { name: 'Priya Sharma' },
  wallet: {
    id: 'wallet-1',
    salonId: 'salon-1',
    customerId: 'cust-1',
    status: 'active',
    cashBalance: 100000,
    bonusBalance: 5000,
    totalBalance: 105000,
    createdAt: new Date().toISOString(),
  },
  loyalty: { points: 120, lifetimePoints: 400 },
  loyaltyEnabled: true,
  upcoming: [],
  popular: [],
  offers: [],
  referral: { code: 'PRIYA50', rewardsEarned: 5000 },
  recentPayments: [],
  visitsThisMonth: 2,
  birthdayReward: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function installFetchMock() {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('/api/auth/me')) {
      return signedIn ? json({ user: signedIn, wallet: null }) : json({ error: 'unauthorized', message: 'No session' }, 401);
    }
    if (url.includes('/api/auth/demo-accounts')) {
      return json({ mode: 'development', notice: 'dev only', password: 'salonpro123', accounts: [] });
    }
    if (url.includes('/api/customer/home')) return json(HOME_PAYLOAD);
    /* Anything else: a realistic "no data" 404 so pages take their error path. */
    return json({ error: 'not_found', message: `No mock route for ${url}` }, 404);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  signedIn = null;
  installFetchMock();
});

describe('public routes', () => {
  it('renders the landing page for a signed-out visitor', async () => {
    renderApp('/');
    expect(await screen.findByText(/your salon\./i)).toBeInTheDocument();
    expect(screen.getByText(/get started/i)).toBeInTheDocument();
  });

  it('renders the sign-in page', async () => {
    renderApp('/login');
    expect(await screen.findByPlaceholderText('98XX XX XX XX')).toBeInTheDocument();
  });

  it('renders a friendly 404 for an unknown route', async () => {
    renderApp('/definitely/not/a/route');
    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
  });
});

describe('customer area', () => {
  it('redirects a signed-out visitor to the login page', async () => {
    renderApp('/app');
    expect(await screen.findByPlaceholderText('98XX XX XX XX')).toBeInTheDocument();
  });

  it('renders the customer shell, greeting and bottom navigation', async () => {
    signedIn = CUSTOMER;
    setToken('customer-token');
    renderApp('/app');
    expect(await screen.findByRole('heading', { name: /priya/i })).toBeInTheDocument();
    for (const label of ['Home', 'Services', 'Bookings', 'Wallet', 'Profile']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('blocks a customer from the owner dashboard', async () => {
    signedIn = CUSTOMER;
    setToken('customer-token');
    renderApp('/admin');
    expect(await screen.findByText(/dashboard access only/i)).toBeInTheDocument();
  });
});

describe('admin area', () => {
  it('redirects a signed-out visitor away from the dashboard', async () => {
    renderApp('/admin');
    expect(await screen.findByPlaceholderText('98XX XX XX XX')).toBeInTheDocument();
  });

  it('renders the admin shell with its navigation for an owner', async () => {
    signedIn = OWNER;
    setToken('owner-token');
    renderApp('/admin');
    expect(await screen.findByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Wallet & Payments')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });
});
