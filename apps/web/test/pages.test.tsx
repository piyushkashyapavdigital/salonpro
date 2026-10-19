import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/App';
import { AuthProvider } from '../src/lib/auth';
import { ToastProvider } from '../src/components/Toast';
import { setToken } from '../src/lib/api';
import { formatMoney } from '@salonpro/shared';
import type { SessionUser } from '@salonpro/shared';

/*
 * Data-driven page tests.
 *
 * The product rule these enforce: every number on screen comes from the API. A
 * page that renders a fixed ₹1,234 or a canned chart would pass a "does it
 * render?" test and still be wrong, so each test renders the same page twice
 * with different payloads and asserts the output tracks the data. Error and
 * empty states are checked too, because those are the paths real salons hit on
 * day one (nothing sold yet, or the API is down).
 */

const CUSTOMER = {
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

const OWNER = {
  id: 'owner-1',
  name: 'Deepa Menon',
  phone: '9800000001',
  email: null,
  role: 'salon_owner',
  status: 'active',
  salonId: 'salon-1',
  branchIds: ['branch-1'],
  permissions: [],
} as unknown as SessionUser;

type RouteMap = Record<string, unknown>;

let signedIn: SessionUser | null = null;
let routes: RouteMap = {};
/** Set to a number to make the next request for a path fail with that status. */
let failures: Record<string, number> = {};
let requested: string[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function installFetchMock() {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
    const url = raw.replace(/^https?:\/\/[^/]+/, '');
    requested.push(url);

    const status = Object.entries(failures).find(([key]) => url.includes(key))?.[1];
    if (status) return json({ error: 'server_error', message: `The server refused ${url}` }, status);

    if (url.includes('/api/auth/me')) {
      return signedIn ? json({ user: signedIn, wallet: null }) : json({ error: 'unauthorized', message: 'No session' }, 401);
    }
    for (const [key, body] of Object.entries(routes)) {
      if (url.includes(key)) return json(body);
    }
    return json({ error: 'not_found', message: `No mock route for ${url}` }, 404);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 }, mutations: { retry: false } },
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

function homePayload(overrides: Record<string, unknown> = {}) {
  return {
    profile: { name: 'Priya Sharma', birthday: null },
    wallet: {
      id: 'wallet-1',
      salonId: 'salon-1',
      customerId: 'cust-1',
      status: 'active',
      cashBalance: 100000,
      bonusBalance: 5000,
      totalBalance: 105000,
      createdAt: '2026-01-01T00:00:00.000Z',
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
    ...overrides,
  };
}

function overviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    overview: {
      date: isoDay(0),
      customersVisited: 6,
      newCustomers: 2,
      returningCustomers: 4,
      appointmentsBooked: 8,
      completed: 4,
      cancelled: 1,
      pending: 3,
      walkIns: 3,
      online: 5,
      revenueCollected: 1234500,
      walletPayments: 700000,
      directPayments: 534500,
      newRegistrations: 2,
      referralVisits: 1,
      walletCashLiability: 250000,
      walletBonusLiability: 50000,
      referralRewardExpense: 10000,
    },
    settings: { loyaltyEnabled: true, bonusExpiryDays: 90, spendingOrder: ['bonus', 'cash'], referral: {} },
    payments: { mode: 'simulated' },
    upcomingToday: [],
    referralStats: { total: 6, registered: 6, qualified: 2, rewarded: 2, reversed: 0, rewardExpense: 10000, topReferrers: [] },
    reminderStats: { byStatus: [], byStage: [] },
    topCustomers: [],
    trend: [],
    ...overrides,
  };
}

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  localStorage.clear();
  signedIn = null;
  routes = {};
  failures = {};
  requested = [];
  installFetchMock();
});

/* ------------------------------------------------------------------ */
/* Customer home                                                       */
/* ------------------------------------------------------------------ */

describe('customer home', () => {
  it('renders the wallet balance that the API returned, not a fixed one', async () => {
    signedIn = CUSTOMER;
    setToken('customer-token');
    routes = { '/api/customer/home': homePayload() };
    renderApp('/app');
    expect(await screen.findByText(formatMoney(105000))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(100000))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(5000))).toBeInTheDocument();
  });

  it('tracks a different payload on a second render (no hardcoded demo numbers)', async () => {
    signedIn = CUSTOMER;
    setToken('customer-token');
    routes = {
      '/api/customer/home': homePayload({
        wallet: {
          id: 'wallet-1',
          salonId: 'salon-1',
          customerId: 'cust-1',
          status: 'active',
          cashBalance: 0,
          bonusBalance: 0,
          totalBalance: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        referral: { code: 'EMPTY7', rewardsEarned: 0 },
      }),
    };
    renderApp('/app');
    expect(await screen.findByText(/EMPTY7/)).toBeInTheDocument();
    expect(screen.getAllByText(formatMoney(0)).length).toBeGreaterThan(0);
    expect(screen.queryByText(formatMoney(105000))).not.toBeInTheDocument();
  });

  it('invites a first booking when there is nothing scheduled', async () => {
    signedIn = CUSTOMER;
    setToken('customer-token');
    routes = { '/api/customer/home': homePayload() };
    renderApp('/app');
    expect(await screen.findByText(/no upcoming appointments/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it('shows the next appointment with its stylist and price when one exists', async () => {
    signedIn = CUSTOMER;
    setToken('customer-token');
    routes = {
      '/api/customer/home': homePayload({
        upcoming: [
          {
            id: 'appt-1',
            date: isoDay(2),
            startTime: '15:30',
            endTime: '16:15',
            durationMinutes: 45,
            status: 'confirmed',
            paymentStatus: 'unpaid',
            totalAmount: 79900,
            staffName: 'Rakesh Kumar',
            services: [{ id: 'svc-1', name: 'Signature Haircut', price: 79900, durationMinutes: 45 }],
          },
        ],
        popular: [{ id: 'svc-1', name: 'Signature Haircut', price: 79900, durationMinutes: 45, imageEmoji: '✂️', active: true }],
      }),
    };
    renderApp('/app');
    /* It appears in the appointment card and again under "Popular right now". */
    expect((await screen.findAllByText('Signature Haircut')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/3:30 PM/)).toBeInTheDocument();
    expect(screen.getByText(/with Rakesh Kumar/)).toBeInTheDocument();
    expect(screen.getAllByText(formatMoney(79900)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/no upcoming appointments/i)).not.toBeInTheDocument();
  });

  it('surfaces the API error message instead of an empty screen', async () => {
    signedIn = CUSTOMER;
    setToken('customer-token');
    failures = { '/api/customer/home': 500 };
    renderApp('/app');
    expect(await screen.findByText(/could not load your home screen/i)).toBeInTheDocument();
    expect(screen.getByText(/the server refused/i)).toBeInTheDocument();
  });

  it('uses the signed-in identity for the greeting', async () => {
    signedIn = { ...CUSTOMER, name: 'Ananya Nair' } as SessionUser;
    setToken('customer-token');
    routes = { '/api/customer/home': homePayload({ profile: { name: 'Ananya Nair', birthday: null } }) };
    renderApp('/app');
    expect(await screen.findByRole('heading', { name: /ananya/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Admin dashboard                                                     */
/* ------------------------------------------------------------------ */

describe('admin dashboard', () => {
  it('draws the 7-day trend from the API series, day by day', async () => {
    signedIn = OWNER;
    setToken('owner-token');
    const trend = Array.from({ length: 7 }, (_, i) => ({ date: isoDay(i - 6), revenue: (i + 1) * 100000 }));
    routes = { '/api/admin/overview': overviewPayload({ trend }) };
    renderApp('/admin');

    /* The axis labels are derived from the payload dates, so a hardcoded chart
     * (or a fabricated series) cannot pass this. */
    const first = new Date(`${trend[0]!.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
    const last = new Date(`${trend[6]!.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
    expect(await screen.findByText(first, { selector: '.recharts-cartesian-axis-tick-value, text, tspan' })).toBeInTheDocument();
    expect(screen.getByText(last, { selector: '.recharts-cartesian-axis-tick-value, text, tspan' })).toBeInTheDocument();

    /* The headline is the sum of the returned series. */
    const total = trend.reduce((sum, point) => sum + point.revenue, 0);
    expect(screen.getByText(formatMoney(total))).toBeInTheDocument();
  });

  it('takes the whole dashboard down to the API, including the appointment mix', async () => {
    signedIn = OWNER;
    setToken('owner-token');
    routes = {
      '/api/admin/overview': overviewPayload({
        overview: {
          ...overviewPayload().overview,
          appointmentsBooked: 3,
          walkIns: 1,
          online: 2,
          completed: 7,
          pending: 5,
          cancelled: 2,
          revenueCollected: 0,
          walletPayments: 0,
          directPayments: 0,
        },
      }),
    };
    renderApp('/admin');
    expect(await screen.findByText("Today's schedule")).toBeInTheDocument();
    const mix = screen.getByText('Appointment mix').closest('div')!;
    expect(within(mix.parentElement as HTMLElement).getByText('Completed')).toBeInTheDocument();
    expect(within(mix.parentElement as HTMLElement).getByText('7')).toBeInTheDocument();
    expect(within(mix.parentElement as HTMLElement).getByText('5')).toBeInTheDocument();
  });

  it('survives a metric the API forgot to send instead of white-screening', async () => {
    signedIn = OWNER;
    setToken('owner-token');
    /* Regression: an undefined figure reached NumberTicker and threw inside
     * render, which unmounts the whole app into a blank screen. */
    const { revenueCollected, ...partial } = overviewPayload().overview;
    routes = { '/api/admin/overview': overviewPayload({ overview: partial }) };
    renderApp('/admin');
    expect(await screen.findByText("Today's schedule")).toBeInTheDocument();
    expect(screen.queryByText(/ran into a problem/i)).not.toBeInTheDocument();
  });

  it('says nothing is scheduled rather than inventing rows', async () => {
    signedIn = OWNER;
    setToken('owner-token');
    routes = { '/api/admin/overview': overviewPayload({ trend: [], topCustomers: [], upcomingToday: [] }) };
    renderApp('/admin');
    expect(await screen.findByText(/nothing scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/no customer spend yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no referrals yet/i)).toBeInTheDocument();
  });

  it('reports a failed dashboard load with the server message', async () => {
    signedIn = OWNER;
    setToken('owner-token');
    failures = { '/api/admin/overview': 503 };
    renderApp('/admin');
    expect(await screen.findByText(/could not load the dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/the server refused/i)).toBeInTheDocument();
  });

  it('ranks the Top 20 leaderboard straight from the API order', async () => {
    signedIn = OWNER;
    setToken('owner-token');
    routes = {
      '/api/admin/overview': overviewPayload({
        topCustomers: [
          { customerId: 'c1', name: 'Aarav Mehta', phoneMasked: '97••••01', visits: 12, totalSpend: 900000, averageSpend: 75000, lastVisitAt: isoDay(-2), referrals: 3 },
          { customerId: 'c2', name: 'Priya Sharma', phoneMasked: '97****02', visits: 4, totalSpend: 120000, averageSpend: 30000, lastVisitAt: isoDay(-9), referrals: 0 },
        ],
      }),
    };
    renderApp('/admin');
    expect(await screen.findByText('Aarav Mehta')).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    /* Phone numbers are always masked in the UI. */
    expect(screen.getByText('97••••01')).toBeInTheDocument();
    expect(screen.queryByText('9700000001')).not.toBeInTheDocument();
  });
});
