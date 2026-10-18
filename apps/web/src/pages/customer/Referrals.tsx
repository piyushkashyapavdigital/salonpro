import { useState } from 'react';
import { formatDate, formatMoney, type Referral, type ReferralDashboard } from '@salonpro/shared';
import { useApi } from '../../lib/hooks';
import { useCopy } from '../../lib/hooks';
import { Alert, Avatar, Badge, Button, Card, EmptyState, LoadingBlock, ProgressBar, SectionTitle, StatusPill } from '../../components/ui';
import { IconCopy, IconGift, IconShare, IconTrend } from '../../components/icons';
import { useToast } from '../../components/Toast';
import { isNative, shareText as shareViaNative } from '../../lib/native';

interface ReferralResponse extends ReferralDashboard {
  link: string;
  token: string;
  config: { referrerReward: number; refereeReward: number; maxRewardsPerMonth: number };
  rules: string[];
}

export default function ReferralsPage() {
  const { data, isLoading } = useApi<ReferralResponse>('/customer/referrals');
  const { copied, copy } = useCopy();
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'qualified'>('pending');

  if (isLoading) return <div className="px-4 py-5"><LoadingBlock rows={4} /></div>;
  if (!data) return null;

  const shareText = `Hey! Book your next salon visit at SalonPro and we both get ₹50 in wallet credit. Use my link: ${data.link}`;
  const stat = {
    invited: data.totalInvitations,
    registered: data.registered,
    qualified: data.qualified,
  };
  const listed = data.referrals.filter((r) =>
    tab === 'qualified' ? ['qualified', 'rewarded'].includes(r.status) : !['qualified', 'rewarded'].includes(r.status),
  );

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <h1 className="font-display text-[24px] text-ink-900">Refer &amp; earn</h1>
        <p className="mt-1 text-[13px] text-ink-400">
          You get {formatMoney(data.config.referrerReward)} and your friend gets {formatMoney(data.config.refereeReward)} —
          credited after their first completed and paid visit.
        </p>
      </div>

      <div className="card-dark relative overflow-hidden p-5">
        <div className="grid-lines absolute inset-0 opacity-60" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
              <IconGift size={21} />
            </span>
            <div>
              <p className="text-[11.5px] uppercase tracking-[0.16em] text-brand-300">Your referral code</p>
              <p className="font-display text-[26px] tracking-[0.18em] text-white">{data.code}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="break-all text-[12px] text-ink-200">{data.link}</p>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant="brand"
              className="flex-1"
              onClick={() => {
                void copy(data.link);
                toast.success('Link copied');
              }}
              icon={copied ? undefined : <IconCopy size={16} />}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
            <button
              type="button"
              className="btn-ghost flex-1 !border-white/15 !bg-white/5 !text-white hover:!bg-white/10"
              onClick={async () => {
                // On a device, hand off to the OS share sheet (WhatsApp, SMS,
                // anything installed). On the web, fall back to WhatsApp Web.
                if (isNative()) {
                  await shareViaNative('Join me on SalonPro', shareText);
                  return;
                }
                window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
              }}
            >
              <IconShare size={16} /> Share
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Invited', value: stat.invited },
          { label: 'Registered', value: stat.registered },
          { label: 'Qualified', value: stat.qualified },
        ].map((item) => (
          <Card key={item.label} className="p-3.5 text-center">
            <p className="font-display text-[22px] text-ink-900">{item.value}</p>
            <p className="mt-0.5 text-[11.5px] uppercase tracking-wide text-ink-400">{item.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12.5px] text-ink-400">Credited rewards</p>
            <p className="font-display text-[24px] text-ink-900">{formatMoney(data.creditedRewards)}</p>
          </div>
          <div className="text-right">
            <p className="text-[12.5px] text-ink-400">Pending</p>
            <p className="font-display text-[24px] text-brand-600">{formatMoney(data.pendingRewards)}</p>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={data.qualified}
            max={Math.max(1, data.totalInvitations)}
          />
          <p className="mt-1.5 text-[11.5px] text-ink-400">
            {data.qualified} of {data.totalInvitations || 1} invitations converted to a qualifying paid visit.
          </p>
        </div>
      </Card>

      <Alert tone="info" title="How qualification works">
        <ul className="mt-1 space-y-1">
          {data.rules.map((rule) => (
            <li key={rule}>• {rule}</li>
          ))}
        </ul>
      </Alert>

      <section>
        <SectionTitle title="Your invitations" />
        <div className="mb-3 flex gap-1.5">
          {(['pending', 'qualified'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`chip ${
                tab === id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500 hover:text-ink-800'
              }`}
            >
              {id === 'pending' ? 'In progress' : 'Qualified'}
            </button>
          ))}
        </div>

        {listed.length === 0 ? (
          <Card>
            <EmptyState
              icon="🎁"
              title={tab === 'pending' ? 'No pending invitations' : 'No qualified referrals yet'}
              description="Share your link on WhatsApp — rewards land in your wallet automatically once your friend's first visit is completed and paid."
            />
          </Card>
        ) : (
          <Card className="divide-y divide-ink-100">
            {listed.map((referral: Referral) => (
              <div key={referral.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={referral.referredCustomerName ?? 'Invited friend'} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink-800">
                    {referral.referredCustomerName ?? 'Awaiting sign-up'}
                  </p>
                  <p className="text-[11.5px] text-ink-400">Invited {formatDate(referral.createdAt.slice(0, 10))}</p>
                </div>
                <StatusPill status={referral.status} />
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle title="Leaderboard" subtitle="Top referrers at this salon" />
        <Card className="divide-y divide-ink-100">
          {data.leaderboard.length === 0 ? (
            <EmptyState icon="🏆" title="No referrals yet" description="Be the first to top the leaderboard." />
          ) : (
            data.leaderboard.map((entry, index) => (
              <div key={entry.customerId} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                    index === 0 ? 'bg-brand-sheen text-ink-950' : 'bg-ink-100 text-ink-500'
                  }`}
                >
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink-800">{entry.name}</p>
                <Badge tone="muted">
                  <IconTrend size={12} /> {entry.qualified}
                </Badge>
                <span className="w-20 text-right text-[13px] font-semibold text-brand-700">{formatMoney(entry.earned)}</span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
