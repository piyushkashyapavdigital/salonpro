import { Link, useNavigate } from 'react-router-dom';
import { formatDate, formatMoney, formatTime12, relativeTime } from '@salonpro/shared';
import type { Appointment, Coupon, Service, Wallet, CustomerProfile } from '@salonpro/shared';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { Avatar, Badge, Button, Card, EmptyState, LoadingBlock, SectionTitle, StatusPill } from '../../components/ui';
import { IconCalendar, IconChevron, IconClock, IconGift, IconSparkle, IconWallet } from '../../components/icons';
import { NumberTicker } from '../../components/magic/number-ticker';
import { BlurFade } from '../../components/magic/blur-fade';
import { MagicCard } from '../../components/magic/magic-card';

interface HomeResponse {
  profile: CustomerProfile | null;
  wallet: Wallet;
  loyalty: { points: number; lifetimePoints: number };
  loyaltyEnabled: boolean;
  upcoming: Appointment[];
  popular: Service[];
  offers: Coupon[];
  referral: { code: string; rewardsEarned: number };
  recentPayments: {
    id: string;
    amount: number;
    status: string;
    purpose: string;
    verifiedAt: string | null;
    createdAt: string;
  }[];
  visitsThisMonth: number;
  birthdayReward: boolean;
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error } = useApi<HomeResponse>('/customer/home');

  if (isLoading) {
    return (
      <div className="space-y-4 px-4 py-5">
        <LoadingBlock rows={2} />
        <LoadingBlock rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 py-6">
        <Card>
          <EmptyState
            icon="⚠️"
            title="We could not load your home screen"
            description={error?.message ?? 'Please try again in a moment.'}
          />
        </Card>
      </div>
    );
  }

  const next = data.upcoming[0];
  const firstName = (data.profile?.name ?? user?.name ?? 'there').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 px-4 py-5">
      {/* Greeting + wallet */}
      <section className="flex animate-fade-up items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-400">{greeting},</p>
          <h1 className="font-display text-[26px] font-semibold leading-tight text-ink-900">{firstName}! 👋</h1>
          {data.birthdayReward ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-[12px] font-medium text-brand-700">
              🎂 Happy birthday month — a reward is waiting for you
            </p>
          ) : null}
        </div>
        <Avatar name={data.profile?.name ?? user?.name ?? 'You'} size={46} tone="brand" />
      </section>

      <section className="animate-fade-up">
        <div className="card-dark relative overflow-hidden p-5">
          <div className="grid-lines absolute inset-0 opacity-60" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">Wallet balance</p>
                <p className="mt-2 font-display text-[34px] leading-none text-white">
                  <NumberTicker value={data.wallet.totalBalance} format={(n) => formatMoney(Math.round(n))} />
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                <IconWallet size={20} />
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Cash value</p>
                <p className="mt-0.5 text-[15px] font-semibold text-white">{formatMoney(data.wallet.cashBalance)}</p>
              </div>
              <div className="rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-brand-300">Bonus</p>
                <p className="mt-0.5 text-[15px] font-semibold text-brand-200">{formatMoney(data.wallet.bonusBalance)}</p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="brand" className="flex-1" onClick={() => navigate('/app/wallet')}>
                Add money
              </Button>
              <Button
                variant="ghost"
                className="flex-1 !border-white/15 !bg-white/5 !text-white hover:!bg-white/10"
                onClick={() => navigate('/app/book')}
              >
                Book now
              </Button>
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-ink-400">
              Bonus is spent before cash. Purchased cash value never expires.
            </p>
          </div>
        </div>
      </section>

      {/* Next appointment */}
      <section className="animate-fade-up">
        <SectionTitle
          title="Next appointment"
          action={
            <Link to="/app/bookings" className="text-[12.5px] font-medium text-brand-700 hover:underline">
              All bookings
            </Link>
          }
        />
        {next ? (
          <Card className="overflow-hidden">
            <div className="flex items-start gap-4 p-4">
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <span className="text-[10.5px] font-semibold uppercase">{formatDate(next.date, { month: 'short' })}</span>
                <span className="font-display text-[19px] leading-none">{new Date(`${next.date}T00:00:00`).getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink-900">
                  {next.services.map((s) => s.name).join(' + ')}
                </p>
                <p className="mt-1 flex items-center gap-3 text-[12.5px] text-ink-400">
                  <span className="inline-flex items-center gap-1">
                    <IconClock size={13} /> {formatTime12(next.startTime)} · {next.durationMinutes} min
                  </span>
                </p>
                <p className="mt-1 text-[12.5px] text-ink-500">
                  with {next.staffName ?? 'any available stylist'} · {formatMoney(next.totalAmount)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusPill status={next.status} />
                  <StatusPill status={next.paymentStatus} />
                </div>
              </div>
              <IconChevron size={18} className="mt-1 shrink-0 text-ink-300" />
            </div>
            <div className="flex border-t border-ink-100">
              <button
                className="flex-1 py-2.5 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
                onClick={() => navigate('/app/bookings')}
              >
                Manage booking
              </button>
              <button
                className="flex-1 border-l border-ink-100 py-2.5 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
                onClick={() => navigate('/app/book')}
              >
                Book another
              </button>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="📅"
              title="No upcoming appointments"
              description="Pick a service and grab a slot — most visits take under an hour."
              action={
                <Button variant="brand" onClick={() => navigate('/app/book')}>
                  <IconCalendar size={16} /> Book an appointment
                </Button>
              }
            />
          </Card>
        )}
      </section>

      {/* Referral + loyalty */}
      <section className="grid grid-cols-1 gap-3">
        <Link to="/app/referrals" className="card-dark flex items-center gap-4 p-4 transition hover:brightness-110">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
            <IconGift size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-white">Earn ₹50 for every friend</p>
            <p className="mt-0.5 truncate text-[12px] text-ink-300">
              Your code <span className="font-semibold tracking-wide text-brand-300">{data.referral.code}</span> · earned{' '}
              {formatMoney(data.referral.rewardsEarned)}
            </p>
          </div>
          <IconChevron size={18} className="shrink-0 text-ink-400" />
        </Link>

        {data.loyaltyEnabled ? (
          <Card className="flex items-center gap-4 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <IconSparkle size={20} />
            </span>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-ink-900">Loyalty points</p>
              <p className="mt-0.5 text-[12px] text-ink-400">
                {data.loyalty.points} points available · {data.visitsThisMonth} visit
                {data.visitsThisMonth === 1 ? '' : 's'} this month
              </p>
            </div>
            <span className="font-display text-[22px] text-ink-900">
              <NumberTicker value={data.loyalty.points} />
            </span>
          </Card>
        ) : null}
      </section>

      {/* Popular services */}
      <section>
        <SectionTitle
          title="Popular right now"
          subtitle="Most booked at your salon"
          action={
            <Link to="/app/services" className="text-[12.5px] font-medium text-brand-700 hover:underline">
              See all
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          {data.popular.slice(0, 4).map((service, i) => (
            <BlurFade key={service.id} delay={i * 0.06} className="h-full">
              <MagicCard className="h-full">
                <button
                  onClick={() => navigate(`/app/book?service=${service.id}`)}
                  className="card h-full w-full overflow-hidden p-3.5 text-left transition active:scale-[.98]"
                >
                  <span className="text-2xl">{service.imageEmoji}</span>
                  <p className="mt-2 line-clamp-1 text-[13.5px] font-semibold text-ink-900">{service.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-400">{service.durationMinutes} min</p>
                  <p className="mt-2 text-[14px] font-semibold text-brand-700">{formatMoney(service.price)}</p>
                </button>
              </MagicCard>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* Offers */}
      {data.offers.length ? (
        <section>
          <SectionTitle
            title="Offers for you"
            action={
              <Link to="/app/offers" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                All offers
              </Link>
            }
          />
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {data.offers.map((coupon) => (
              <div key={coupon.id} className="card w-[220px] shrink-0 snap-start overflow-hidden">
                <div className="bg-brand-sheen px-3.5 py-2">
                  <p className="font-display text-[17px] font-bold tracking-wide text-ink-950">{coupon.code}</p>
                </div>
                <div className="p-3.5">
                  <p className="text-[12.5px] leading-snug text-ink-600">{coupon.description}</p>
                  <p className="mt-2 text-[11px] text-ink-400">Ends {formatDate(coupon.endAt.slice(0, 10))}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Recent activity */}
      <section>
        <SectionTitle title="Recent activity" subtitle="Latest wallet and payment events" />
        {data.recentPayments.length ? (
          <Card className="divide-y divide-ink-100">
            {data.recentPayments.map((payment) => (
              <div key={payment.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-[15px]">
                  {payment.purpose === 'wallet_recharge' ? '💳' : '🧾'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink-800">
                    {payment.purpose === 'wallet_recharge' ? 'Wallet recharge' : 'Appointment payment'}
                  </p>
                  <p className="text-[11.5px] text-ink-400">{relativeTime(payment.verifiedAt ?? payment.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13.5px] font-semibold text-ink-900">{formatMoney(payment.amount)}</p>
                  <StatusPill status={payment.status} />
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <Card>
            <EmptyState icon="🧾" title="Nothing here yet" description="Your wallet top-ups and visit payments will show up here." />
          </Card>
        )}
      </section>

      <section className="pb-2">
        <Card className="flex items-center gap-4 bg-brand-soft p-4">
          <span className="text-2xl">🏷️</span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-ink-900">Save more with prepaid top-ups</p>
            <p className="mt-0.5 text-[12px] text-ink-500">Pay ₹1,000 and get ₹1,150 of salon value instantly.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/app/wallet')}>
            Top up
          </Button>
        </Card>
      </section>

      <div className="flex items-center justify-center gap-2 pb-4 pt-2 text-[11px] text-ink-300">
        <Badge tone="muted">SalonPro</Badge>
        <span>·</span>
        <span>Prices include GST where applicable</span>
      </div>
    </div>
  );
}
