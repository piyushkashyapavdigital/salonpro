import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, LogOut, Menu } from 'lucide-react';
import { ROLE_LABEL } from '@salonpro/shared';
import { useAuth } from '../lib/auth';
import { isAdminApp } from '../lib/mode';
import { hapticTap } from '../lib/native';
import {
  IconBell,
  IconCalendar,
  IconChart,
  IconGift,
  IconHome,
  IconMore,
  IconReceipt,
  IconScissors,
  IconSettings,
  IconSparkle,
  IconStore,
  IconUser,
  IconUsers,
  IconWallet,
  IconX,
} from './icons';
import { Avatar } from './ui';
import { DockAction, TabDock, type DockItem } from './magic/tab-dock';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './shadcn/sheet';
import { Separator } from './shadcn/separator';

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

export function Logo({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-sheen shadow-brand">
        <span className="font-display text-[17px] font-bold text-white">S</span>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-mint-500" />
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className={`block font-display text-[17px] font-bold tracking-tight ${dark ? 'text-white' : 'text-ink-900'}`}>
            SalonPro
          </span>
          <span className={`block text-[10.5px] font-medium uppercase tracking-[0.14em] ${dark ? 'text-brand-200' : 'text-brand-500'}`}>
            Salon · Style · Rewards
          </span>
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Banners                                                             */
/* ------------------------------------------------------------------ */

export function DevBanner({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'ink' }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12px] leading-snug ${
        tone === 'brand' ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-border bg-ink-50 text-ink-500'
      }`}
    >
      <span className="mt-[1px] shrink-0 font-bold">{tone === 'brand' ? 'DEV' : 'i'}</span>
      <div>{children}</div>
    </div>
  );
}

export function InstallPrompt() {
  const [event, setEvent] = useState<Event | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('salonpro.install.dismissed') === '1');

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!event || dismissed) return null;
  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2.5">
      <span className="text-lg">📲</span>
      <p className="flex-1 text-[12.5px] leading-snug text-brand-700">
        Install SalonPro for one-tap booking and faster wallet top-ups.
      </p>
      <button
        className="btn-brand btn-sm"
        onClick={async () => {
          setDismissed(true);
          localStorage.setItem('salonpro.install.dismissed', '1');
          await (event as unknown as { prompt: () => Promise<void> }).prompt();
        }}
      >
        Install
      </button>
      <button
        aria-label="Dismiss"
        className="text-brand-700/70 hover:text-brand-700"
        onClick={() => {
          setDismissed(true);
          localStorage.setItem('salonpro.install.dismissed', '1');
        }}
      >
        <IconX size={16} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Menu sheet (mobile "More")                                          */
/* ------------------------------------------------------------------ */

interface MenuItem {
  to: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

function MenuList({ items, onNavigate }: { items: MenuItem[]; onNavigate: () => void }) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <NavLink
          key={item.to + item.label}
          to={item.to}
          onClick={() => {
            void hapticTap();
            onNavigate();
          }}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
              isActive ? 'bg-brand-100' : 'active:bg-brand-50'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  isActive ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-600'
                }`}
              >
                <item.icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14.5px] font-semibold ${isActive ? 'text-brand-700' : 'text-ink-800'}`}>
                  {item.label}
                </span>
                {item.hint ? <span className="block text-[12px] text-ink-400">{item.hint}</span> : null}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page transition                                                     */
/* ------------------------------------------------------------------ */

function PageTransition() {
  const outlet = useOutlet();
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

/** Soft brand glow behind the top of every mobile screen. */
function ShellGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-brand-200/45 via-brand-100/20 to-transparent"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Customer app shell                                                  */
/* ------------------------------------------------------------------ */

const CUSTOMER_TABS: DockItem[] = [
  { to: '/app', label: 'Home', icon: IconHome, end: true },
  { to: '/app/services', label: 'Services', icon: IconScissors },
  { to: '/app/bookings', label: 'Bookings', icon: IconCalendar },
  { to: '/app/wallet', label: 'Wallet', icon: IconWallet },
  { to: '/app/profile', label: 'Profile', icon: IconUser },
];

const CUSTOMER_MENU: MenuItem[] = [
  { to: '/app/referrals', label: 'Refer & earn', hint: '₹50 for you, ₹50 for them', icon: IconUsers },
  { to: '/app/offers', label: 'Offers & coupons', hint: 'Live discounts near you', icon: IconGift },
  { to: '/app/notifications', label: 'Notifications', hint: 'Visits, rewards and reminders', icon: IconBell },
  { to: '/app/profile', label: 'My profile', hint: 'Phone, birthday and data controls', icon: IconUser },
];

export function CustomerShell() {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative min-h-full overflow-x-clip bg-ink-50">
      <ShellGlow />
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col">
        <header className="safe-top sticky top-0 z-30">
          <div className="glass flex items-center justify-between border-b px-4 py-3">
            <Logo compact />
            <div className="flex items-center gap-1.5">
              <NavLink to="/app/notifications" className="btn-quiet btn-sm" aria-label="Notifications">
                <IconBell size={18} />
              </NavLink>
              <button
                className="ml-0.5 rounded-full ring-2 ring-brand-100 transition active:scale-95"
                aria-label="Open menu"
                onClick={() => setMenuOpen(true)}
              >
                <Avatar name={user?.name ?? 'You'} size={32} tone="brand" />
              </button>
            </div>
          </div>
        </header>

        <InstallPrompt />

        <main className="flex-1 pb-nav">
          <PageTransition />
        </main>

        <nav className="safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[560px] -translate-x-1/2">
          <div className="glass m-3 flex items-stretch rounded-[26px] border shadow-[0_16px_40px_-22px_rgba(190,24,93,0.55)]">
            <TabDock items={CUSTOMER_TABS} layoutId="customer-dock" onSelect={() => void hapticTap()} />
          </div>
        </nav>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="bottom" maxHeight="64vh" className="pb-6">
            <SheetHeader className="mb-4">
              <SheetTitle>Hi{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋</SheetTitle>
              <p className="text-[13px] text-ink-400">{user ? ROLE_LABEL[user.role] : ''}</p>
            </SheetHeader>
            <MenuList items={CUSTOMER_MENU} onNavigate={() => setMenuOpen(false)} />
            <Separator className="my-4" />
            <div className="space-y-1">
              {isAdmin ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/admin');
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-brand-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lilac-100 text-lilac-500">
                    <IconSparkle size={18} />
                  </span>
                  <span className="flex-1 text-[14.5px] font-semibold text-ink-800">Owner dashboard</span>
                  <ChevronRight className="h-4 w-4 text-ink-300" />
                </button>
              ) : null}
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                  navigate('/');
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-rose-100/60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-500">
                  <LogOut size={18} />
                </span>
                <span className="flex-1 text-[14.5px] font-semibold text-rose-500">Sign out</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin / staff shell                                                 */
/* ------------------------------------------------------------------ */

const ADMIN_NAV: MenuItem[] = [
  { to: '/admin', label: 'Dashboard', hint: 'Today at a glance', icon: IconChart },
  { to: '/admin/appointments', label: 'Appointments', hint: 'Calendar and check-ins', icon: IconCalendar },
  { to: '/admin/customers', label: 'Customers', hint: 'Profiles and history', icon: IconUsers },
  { to: '/admin/services', label: 'Services', hint: 'Menu and pricing', icon: IconScissors },
  { to: '/admin/payments', label: 'Wallet & Payments', hint: 'Balances and refunds', icon: IconWallet },
  { to: '/admin/referrals', label: 'Referrals', hint: 'Reward payouts', icon: IconGift },
  { to: '/admin/reminders', label: 'Reminders', hint: '7 / 14 / 30-day nudges', icon: IconBell },
  { to: '/admin/staff', label: 'Staff', hint: 'Roles and branches', icon: IconUser },
  { to: '/admin/branches', label: 'Branches', hint: 'Locations and hours', icon: IconStore },
  { to: '/admin/reports', label: 'Reports', hint: 'Revenue and retention', icon: IconReceipt },
  { to: '/admin/settings', label: 'Settings', hint: 'Salon preferences', icon: IconSettings },
];

const ADMIN_TABS: DockItem[] = [
  { to: '/admin', label: 'Home', icon: IconChart, end: true },
  { to: '/admin/appointments', label: 'Calendar', icon: IconCalendar },
  { to: '/admin/customers', label: 'Clients', icon: IconUsers },
  { to: '/admin/services', label: 'Services', icon: IconScissors },
];

/** Everything not pinned to the dock, for the slide-in sidebar / menu sheet. */
const ADMIN_MORE = ADMIN_NAV.slice(4);

export function AdminShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const accountFooter = (
    <div className="space-y-1">
      <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
        <Avatar name={user?.name ?? 'User'} size={40} tone="brand" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink-900">{user?.name}</p>
          <p className="truncate text-[11.5px] text-ink-400">{user ? ROLE_LABEL[user.role] : ''}</p>
        </div>
      </div>
      {!isAdminApp ? (
        <button onClick={() => navigate('/app')} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-brand-50">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <IconSparkle size={18} />
          </span>
          <span className="flex-1 text-[14.5px] font-semibold text-ink-800">Customer app</span>
          <ChevronRight className="h-4 w-4 text-ink-300" />
        </button>
      ) : null}
      <button
        onClick={async () => {
          setMenuOpen(false);
          await signOut();
          navigate('/');
        }}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-rose-100/60"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-500">
          <LogOut size={18} />
        </span>
        <span className="flex-1 text-[14.5px] font-semibold text-rose-500">Sign out</span>
      </button>
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between px-5 py-5">
        <Logo />
        <button className="btn-quiet btn-sm lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          <IconX size={18} />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {ADMIN_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] font-medium transition ${
                isActive ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-brand-50 hover:text-brand-700'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">{accountFooter}</div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-x-clip bg-ink-50 lg:flex">
      <ShellGlow />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-border lg:block">{sidebar}</aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-[286px] animate-fade-in shadow-lift">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col pb-nav lg:pb-0 lg:pl-[248px]">
        <header className="safe-top sticky top-0 z-30 lg:hidden">
          <div className="glass flex items-center gap-3 border-b px-4 py-3">
            <Logo compact />
            <div className="ml-auto flex items-center gap-1.5">
              <NavLink to="/admin/reminders" className="btn-quiet btn-sm" aria-label="Reminders">
                <IconBell size={18} />
              </NavLink>
              <button className="btn-quiet btn-sm" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                <Menu size={19} />
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <PageTransition />
        </main>
      </div>

      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-30 lg:hidden">
        <div className="glass m-3 flex items-stretch rounded-[26px] border shadow-[0_16px_40px_-22px_rgba(190,24,93,0.55)]">
          <TabDock items={ADMIN_TABS} layoutId="admin-dock" onSelect={() => void hapticTap()} />
          <DockAction label="More" icon={IconMore} active={menuOpen} onClick={() => setMenuOpen(true)} />
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" maxHeight="70vh" className="pb-6">
          <SheetHeader className="mb-4">
            <SheetTitle>Menu</SheetTitle>
            <p className="text-[13px] text-ink-400">Everything else in the dashboard</p>
          </SheetHeader>
          <MenuList items={ADMIN_MORE} onNavigate={() => setMenuOpen(false)} />
          <Separator className="my-4" />
          {accountFooter}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[22px] font-semibold text-ink-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-ink-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
