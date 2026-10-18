import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/layout';
import { Button } from '../components/ui';
import { IconGift, IconShield, IconSparkle, IconWallet } from '../components/icons';
import { api } from '../lib/api';

interface JoinInfo {
  valid: boolean;
  code: string;
  referrerName: string;
  salonName: string;
  reward: string;
}

const PILLARS = [
  {
    icon: IconSparkle,
    title: 'Book in seconds',
    body: 'Pick a branch, choose your stylist and see only genuinely free slots — every slot is checked on the server before it is offered.',
  },
  {
    icon: IconWallet,
    title: 'Prepaid wallet with bonus',
    body: 'Pay ₹500 and get ₹550 of value. Purchased cash never expires and your bonus terms are shown before you pay.',
  },
  {
    icon: IconGift,
    title: '₹50 + ₹50 referrals',
    body: 'Share your link. When your friend completes their first paid visit, you both get ₹50 in promotional credit.',
  },
  {
    icon: IconShield,
    title: 'Honest by design',
    body: 'Payments are credited only after server-side verification. Nothing is ever marked “sent” unless a provider accepted it.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    localStorage.setItem('salonpro.referralCode', code.toUpperCase());
    api<JoinInfo>(`/catalog/join/${code}`, { anonymous: true })
      .then(setJoin)
      .catch((err: Error) => setJoinError(err.message));
  }, [code]);

  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <div className="grid-lines">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
          <Logo dark />
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost btn-sm !border-white/15 !bg-white/5 !text-white hover:!bg-white/10">
              Sign in
            </Link>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-14 pt-6 lg:grid-cols-[1.05fr_.95fr] lg:pt-14">
          <div className="animate-fade-up">
            {join ? (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-4">
                <span className="text-xl">🎁</span>
                <div className="text-[13px] leading-relaxed">
                  <p className="font-semibold text-brand-200">
                    {join.referrerName} invited you to {join.salonName}
                  </p>
                  <p className="mt-0.5 text-ink-200">{join.reward}</p>
                  <p className="mt-1 text-[12px] text-brand-300">
                    Code <span className="font-semibold tracking-wide">{join.code}</span> is saved to this device.
                  </p>
                </div>
              </div>
            ) : null}

            {joinError ? (
              <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-200">
                {joinError}
              </div>
            ) : null}

            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">
              Unisex salon platform · India
            </p>
            <h1 className="text-balance font-display text-[38px] leading-[1.06] sm:text-[52px]">
              Your Salon.
              <br />
              Your Style.
              <span className="block bg-brand-sheen bg-clip-text text-transparent"> Your Rewards.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-200">
              SalonPro is the complete salon platform: a customer app for booking, prepaid wallet and referrals, plus a
              live owner dashboard for appointments, revenue and retention — with every financial action written to an
              append-only ledger.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="brand" size="lg" onClick={() => navigate('/login')}>
                Get started
              </Button>
              <a
                href="#how"
                className="btn-ghost !border-white/15 !bg-white/5 !text-white hover:!bg-white/10"
                style={{ padding: '0.75rem 1.5rem', fontSize: '15px' }}
              >
                How it works
              </a>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-center">
              {[
                { k: '₹500 → ₹550', v: 'Recharge value' },
                { k: '₹50 + ₹50', v: 'Referral reward' },
                { k: '7 / 14 / 30', v: 'Day reminders' },
              ].map((item) => (
                <div key={item.v}>
                  <dt className="font-display text-[19px] text-brand-300">{item.k}</dt>
                  <dd className="mt-1 text-[11.5px] uppercase tracking-wide text-ink-400">{item.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div id="how" className="space-y-3">
            {PILLARS.map((pillar, index) => (
              <div
                key={pillar.title}
                className="card-dark animate-fade-up p-5"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300">
                    <pillar.icon size={21} />
                  </span>
                  <div>
                    <h2 className="text-[15.5px] font-semibold">{pillar.title}</h2>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-200">{pillar.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 px-5 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 text-[12.5px] text-ink-400">
          <p>© {new Date().getFullYear()} SalonPro. Demo deployment — payments run in simulated test mode unless live keys are configured.</p>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-white">
              Customer sign in
            </Link>
            <Link to="/login?mode=staff" className="hover:text-white">
              Salon owner sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
