import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatDate,
  formatMoney,
  formatMoneyShort,
  formatTime12,
  isoDate,
  type Appointment,
  type DailyTrendPoint,
  type SalonSettings,
  type TodayOverview,
  type TopCustomer,
} from '@salonpro/shared';
import { useApi } from '../../lib/hooks';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingBlock,
  Stat,
  StatusPill,
  Table,
  Td,
} from '../../components/ui';
import { IconCalendar, IconGift, IconTrend, IconUsers, IconWallet } from '../../components/icons';
import { NumberTicker } from '../../components/magic/number-ticker';
import { BlurFade } from '../../components/magic/blur-fade';
import { useAuth } from '../../lib/auth';

/** Lazily imported so recharts stays out of the customer app's startup bundle. */
const RevenueTrendChart = lazy(() => import('../../components/charts/revenue-trend-chart'));

interface OverviewResponse {
  overview: TodayOverview;
  settings: SalonSettings;
  payments: { mode: string };
  upcomingToday: Appointment[];
  referralStats: {
    total: number;
    registered: number;
    qualified: number;
    rewarded: number;
    reversed: number;
    rewardExpense: number;
    topReferrers: { customerId: string; name: string; qualified: number; invited: number }[];
  };
  reminderStats: { byStatus: { status: string; n: number }[]; byStage: { stage: string; n: number }[] };
  topCustomers: TopCustomer[];
  trend: DailyTrendPoint[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const [date, setDate] = useState(isoDate());
  const { data, isLoading, error } = useApi<OverviewResponse>(`/admin/overview?date=${date}`);

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error || !data) {
    return (
      <Card>
        <EmptyState icon="⚠️" title="Could not load the dashboard" description={error?.message ?? 'Please try again.'} />
      </Card>
    );
  }

  const { overview, settings, payments } = data;
  const firstName = (user?.name ?? 'there').split(' ')[0];

  const statusBreakdown = [
    { label: 'Completed', value: overview.completed, color: '#EC4899' },
    { label: 'Pending', value: overview.pending, color: '#F8A8CE' },
    { label: 'Cancelled', value: overview.cancelled, color: '#D8CBD3' },
  ].filter((s) => s.value > 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const trendRevenue = data.trend.reduce((sum, point) => sum + point.revenue, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-400">{greeting},</p>
          <h1 className="font-display text-[25px] font-semibold leading-tight text-ink-900">{firstName}! 👋</h1>
          <p className="mt-1 text-[12.5px] text-ink-400">Here's your salon at a glance</p>
        </div>
        <Avatar name={user?.name ?? 'Owner'} size={46} tone="brand" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          className="field w-auto rounded-full py-2"
          value={date}
          max={isoDate()}
          onChange={(e) => setDate(e.target.value)}
        />
        {date !== isoDate() ? (
          <Button variant="ghost" size="sm" onClick={() => setDate(isoDate())}>
            Today
          </Button>
        ) : (
          <span className="text-[12.5px] text-ink-400">{formatDate(date)}</span>
        )}
      </div>

      {payments.mode !== 'live' ? (
        <div className="flex items-start gap-3 rounded-xl border border-brand-300/70 bg-brand-100 px-4 py-3 text-[12.5px] text-brand-700">
          <span className="font-bold">DEV</span>
          <span>
            Razorpay is in <strong>{payments.mode}</strong> mode. Payments run through SalonPro's test gateway with real
            server-side signature verification — no live money moves.
          </span>
        </div>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <BlurFade delay={0}>
          <Stat
            tone="dark"
            label="Revenue collected today"
            value={<NumberTicker value={overview.revenueCollected} format={(n) => formatMoney(Math.round(n))} />}
            sub={`${formatMoney(overview.walletPayments)} wallet · ${formatMoney(overview.directPayments)} direct`}
            icon={<IconTrend size={16} />}
          />
        </BlurFade>
        <BlurFade delay={0.06}>
          <Stat
            label="Appointments"
            value={<NumberTicker value={overview.appointmentsBooked} />}
            sub={`${overview.completed} completed · ${overview.pending} pending`}
            icon={<IconCalendar size={16} />}
          />
        </BlurFade>
        <BlurFade delay={0.12}>
          <Stat
            label="Customers visited"
            value={<NumberTicker value={overview.customersVisited} />}
            sub={`${overview.newCustomers} new · ${overview.returningCustomers} returning`}
            icon={<IconUsers size={16} />}
          />
        </BlurFade>
        <BlurFade delay={0.18}>
          <Stat
            tone="brand"
            label="Wallet liability"
            value={
              <NumberTicker
                value={overview.walletCashLiability + overview.walletBonusLiability}
                format={(n) => formatMoneyShort(Math.round(n))}
              />
            }
            sub={`${formatMoney(overview.walletCashLiability)} cash · ${formatMoney(overview.walletBonusLiability)} bonus`}
            icon={<IconWallet size={16} />}
          />
        </BlurFade>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Today's appointments */}
        <Card className="relative overflow-hidden xl:col-span-2">
          <CardHeader
            title="Today's schedule"
            subtitle={`${overview.appointmentsBooked} booked · ${overview.walkIns} walk-in · ${overview.online} online`}
            action={
              <Link to="/admin/appointments" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                Open calendar
              </Link>
            }
          />
          {data.upcomingToday.length === 0 ? (
            <EmptyState icon="📅" title="Nothing scheduled" description="No appointments on the books for this date." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.upcomingToday.slice(0, 8).map((appointment) => (
                <div key={appointment.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-[13px] font-semibold text-ink-900">{formatTime12(appointment.startTime)}</p>
                    <p className="text-[11px] text-ink-400">{appointment.durationMinutes}m</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink-800">{appointment.customerName}</p>
                    <p className="truncate text-[12px] text-ink-400">
                      {appointment.services.map((s) => s.name).join(' + ')} · {appointment.staffName ?? 'Any stylist'}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-[13px] font-semibold text-ink-900">{formatMoney(appointment.totalAmount)}</p>
                    <StatusPill status={appointment.paymentStatus} />
                  </div>
                  <StatusPill status={appointment.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Operations snapshot */}
        <Card>
          <CardHeader title="Operations snapshot" subtitle="Today at a glance" />
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-400">Appointment mix</p>
              {statusBreakdown.length ? (
                <div className="mt-3 space-y-2.5">
                  {statusBreakdown.map((s) => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                      <span className="flex-1 text-[13px] text-ink-600">{s.label}</span>
                      <span className="text-[13px] font-semibold text-ink-900">{s.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-ink-400">No appointments recorded.</p>
              )}
            </div>
            <div className="border-t border-ink-100 pt-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-medium uppercase tracking-wide text-ink-400">Collected · last 7 days</p>
                <span className="text-[12px] font-semibold text-ink-700">{formatMoney(trendRevenue)}</span>
              </div>
              <Suspense fallback={<div className="mt-2 h-[118px] w-full animate-pulse rounded-xl bg-ink-50" />}>
                <RevenueTrendChart data={data.trend} />
              </Suspense>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-ink-100 pt-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">New registrations</p>
                <p className="mt-1 text-[18px] font-semibold text-ink-900">{overview.newRegistrations}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Referral visits</p>
                <p className="mt-1 text-[18px] font-semibold text-ink-900">{overview.referralVisits}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Referral expense</p>
                <p className="mt-1 text-[18px] font-semibold text-ink-900">{formatMoney(overview.referralRewardExpense)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Loyalty</p>
                <p className="mt-1 text-[18px] font-semibold text-ink-900">{settings.loyaltyEnabled ? 'On' : 'Off'}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Top customers */}
        <Card>
          <CardHeader
            title="Top customers"
            subtitle="By completed spend"
            action={
              <Link to="/admin/customers" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {data.topCustomers.length === 0 ? (
            <EmptyState icon="👑" title="No customer spend yet" />
          ) : (
            <Table head={['Customer', 'Visits', 'Spend', 'Wallet']}>
              {data.topCustomers.map((customer) => (
                <tr key={customer.customerId} className="hover:bg-ink-50">
                  <Td>
                    <p className="font-medium text-ink-800">{customer.name}</p>
                    <p className="text-[11.5px] text-ink-400">{customer.phoneMasked}</p>
                  </Td>
                  <Td>{customer.visits}</Td>
                  <Td className="font-semibold text-ink-900">{formatMoney(customer.totalSpend)}</Td>
                  <Td>{formatMoney(customer.walletBalance)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Referrals */}
        <Card>
          <CardHeader
            title="Referral program"
            subtitle={`${data.referralStats.rewarded} rewarded · ${formatMoney(data.referralStats.rewardExpense)} paid out`}
            action={
              <Link to="/admin/referrals" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                Manage
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-5 pb-3">
            <Stat label="Invited" value={data.referralStats.total} />
            <Stat label="Qualified" value={data.referralStats.qualified} tone="brand" />
          </div>
          {data.referralStats.topReferrers.length ? (
            <div className="divide-y divide-ink-100">
              {data.referralStats.topReferrers.slice(0, 5).map((referrer, index) => (
                <div key={referrer.customerId} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                      index === 0 ? 'bg-brand-sheen text-ink-950' : 'bg-ink-100 text-ink-500'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13.5px] text-ink-700">{referrer.name}</p>
                  <Badge tone="brand">
                    <IconGift size={12} /> {referrer.qualified}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="🎁" title="No referrals yet" />
          )}
        </Card>
      </div>
    </div>
  );
}
