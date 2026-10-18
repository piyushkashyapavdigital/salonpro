import { useEffect, useState } from 'react';
import { formatDate, formatMoney, paiseToRupees, rupeesToPaise, type Referral } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Stat,
  StatusPill,
  Switch,
  Table,
  Td,
} from '../../components/ui';
import { IconGift, IconTrend } from '../../components/icons';

interface ReferralsResponse {
  total: number;
  registered: number;
  qualified: number;
  rewarded: number;
  reversed: number;
  rewardExpense: number;
  topReferrers: { customerId: string; name: string; qualified: number; invited: number }[];
  recent: Referral[];
  config: {
    referrerReward: number;
    refereeReward: number;
    maxRewardsPerMonth: number;
    requireFirstPaidVisit: boolean;
  };
  mode: string;
}

export default function ReferralsAdmin() {
  const toast = useToast();
  const { data, isLoading, refetch } = useApi<ReferralsResponse>('/admin/referrals');
  const [referrer, setReferrer] = useState('50');
  const [referee, setReferee] = useState('50');
  const [maxPerMonth, setMaxPerMonth] = useState('10');
  const [requireFirstPaid, setRequireFirstPaid] = useState(true);

  useEffect(() => {
    if (!data) return;
    setReferrer(String(paiseToRupees(data.config.referrerReward)));
    setReferee(String(paiseToRupees(data.config.refereeReward)));
    setMaxPerMonth(String(data.config.maxRewardsPerMonth));
    setRequireFirstPaid(data.config.requireFirstPaidVisit);
  }, [data]);

  const saveConfig = useApiMutation<Record<string, unknown>, { config: ReferralsResponse['config'] }>(
    'PATCH',
    '/admin/referrals/config',
    {
      onSuccess: () => {
        toast.success('Referral rewards updated');
        refetch();
      },
    },
  );

  if (isLoading || !data) return <LoadingBlock rows={6} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink-900">Referrals</h1>
        <p className="mt-1 text-[13.5px] text-ink-400">
          Word-of-mouth growth, fraud-checked: rewards only land after the referred customer's first completed and paid visit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invitations" value={data.total} sub={`${data.registered} registered`} icon={<IconGift size={16} />} />
        <Stat tone="brand" label="Qualified" value={data.qualified} sub={`${data.rewarded} fully rewarded`} />
        <Stat label="Reversed" value={data.reversed} sub="Rewards clawed back after refunds" />
        <Stat label="Reward expense" value={formatMoney(data.rewardExpense)} sub="Total credited to wallets" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        {/* Config */}
        <Card>
          <CardHeader title="Reward configuration" subtitle="Applies to new referrals going forward" />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Referrer gets (₹)">
                <Input value={referrer} inputMode="decimal" onChange={(e) => setReferrer(e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              <Field label="Friend gets (₹)">
                <Input value={referee} inputMode="decimal" onChange={(e) => setReferee(e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
            </div>
            <Field label="Max rewards per customer per month" hint="Anti-abuse cap. 0 blocks all rewards.">
              <Input value={maxPerMonth} inputMode="numeric" onChange={(e) => setMaxPerMonth(e.target.value.replace(/[^\d]/g, ''))} />
            </Field>
            <div className="rounded-xl border border-ink-100 p-4">
              <Switch
                checked={requireFirstPaid}
                onChange={setRequireFirstPaid}
                label="Require a first completed & paid visit"
                description="Strongly recommended. Off is only for trusted, fully-online salons."
              />
            </div>
            <Alert tone="info" title="Qualification rules">
              Self-referrals are blocked, one qualifying reward per new customer, and rewards are reversed if the
              qualifying visit is refunded or cancelled.
            </Alert>
            <Button
              variant="brand"
              className="w-full"
              loading={saveConfig.isPending}
              onClick={async () => {
                try {
                  await saveConfig.mutateAsync({
                    referrerReward: rupeesToPaise(Number(referrer || 0)),
                    refereeReward: rupeesToPaise(Number(referee || 0)),
                    maxRewardsPerMonth: Number(maxPerMonth || 0),
                    requireFirstPaidVisit: requireFirstPaid,
                  });
                } catch (err) {
                  toast.error('Could not save', err instanceof Error ? err.message : undefined);
                }
              }}
            >
              Save configuration
            </Button>
          </div>
        </Card>

        {/* Top referrers */}
        <Card>
          <CardHeader title="Top referrers" subtitle="Most qualified invites" />
          {data.topReferrers.length ? (
            <Table head={['#', 'Customer', 'Qualified', 'Invited']}>
              {data.topReferrers.map((referrer, index) => (
                <tr key={referrer.customerId} className="hover:bg-ink-50">
                  <Td>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${index < 3 ? 'bg-brand-sheen text-ink-950' : 'bg-ink-100 text-ink-500'}`}>
                      {index + 1}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={referrer.name} size={30} />
                      <span className="font-medium text-ink-800">{referrer.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone="brand">
                      <IconTrend size={12} /> {referrer.qualified}
                    </Badge>
                  </Td>
                  <Td>{referrer.invited}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState icon="🏆" title="No referrers yet" description="Once customers share their links, the leaderboard fills here." />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent referrals" subtitle="Newest invitation activity" />
        {data.recent.length ? (
          <Table head={['Referrer', 'Referred', 'Code', 'Status', 'Reward', 'Created']}>
            {data.recent.map((referral) => (
              <tr key={referral.id} className="hover:bg-ink-50">
                <Td className="font-medium text-ink-800">{referral.referrerName ?? '—'}</Td>
                <Td>{referral.referredCustomerName ?? <span className="text-ink-400">Awaiting sign-up</span>}</Td>
                <Td>
                  <span className="font-mono text-[12px] tracking-wide text-ink-500">{referral.referralCode}</span>
                </Td>
                <Td>
                  <StatusPill status={referral.status} />
                </Td>
                <Td>
                  <StatusPill status={referral.referrerRewardStatus} />
                </Td>
                <Td className="whitespace-nowrap text-ink-400">{formatDate(referral.createdAt.slice(0, 10))}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon="🎁" title="No referrals yet" description="Share the referral link from the customer app to get started." />
        )}
      </Card>
    </div>
  );
}
