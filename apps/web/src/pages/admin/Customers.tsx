import { useState } from 'react';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  maskPhone,
  relativeTime,
  rupeesToPaise,
  type Appointment,
  type CustomerProfile,
  type TopCustomer,
  type Wallet,
  type WalletTransaction,
} from '@salonpro/shared';
import { useApi, useApiMutation, useDebounced } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  ProgressBar,
  SectionTitle,
  Select,
  Stat,
  StatusPill,
  Switch,
  Table,
  Tabs,
  Td,
} from '../../components/ui';
import { IconDownload, IconPlus, IconSearch } from '../../components/icons';

interface DetailResponse {
  profile: CustomerProfile;
  wallet: Wallet;
  appointments: Appointment[];
  transactions: WalletTransaction[];
  rewards: { id: string; amount: number; type: string; status: string; createdAt: string }[];
  referrals: { id: string; status: string; createdAt: string }[];
  loyalty: { points: number; lifetimePoints: number } | null;
}

export default function Customers() {
  const toast = useToast();
  const [tab, setTab] = useState<'directory' | 'top'>('directory');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [sort, setSort] = useState<'spend' | 'visits' | 'referrals'>('spend');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const directory = useApi<{ customers: CustomerProfile[] }>(`/admin/customers?search=${encodeURIComponent(debounced)}`);
  const top = useApi<{ customers: TopCustomer[] }>(`/admin/customers/top?sort=${sort}&limit=20`);
  const detail = useApi<DetailResponse>(selectedId ? `/admin/customers/${selectedId}` : null);

  const customers = directory.data?.customers ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Customers</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">Directory, spend, wallet balances and consent — all in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'top' ? (
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto py-2">
              <option value="spend">Sort: Spend</option>
              <option value="visits">Sort: Visits</option>
              <option value="referrals">Sort: Referrals</option>
            </Select>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open('/api/admin/reports/customers.csv', '_blank')}
          >
            <IconDownload size={15} /> Export CSV
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'directory', label: 'Directory', count: customers.length },
          { id: 'top', label: 'Top 20' },
        ]}
      />

      {tab === 'directory' ? (
        <>
          <div className="relative max-w-md">
            <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input className="pl-10" placeholder="Search by name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {directory.isLoading ? (
            <LoadingBlock rows={6} />
          ) : customers.length === 0 ? (
            <Card>
              <EmptyState icon="👥" title="No customers found" description="Try a different name or phone number." />
            </Card>
          ) : (
            <Card>
              <Table head={['Customer', 'Visits', 'Total spend', 'Wallet', 'Last visit', 'Consent', '']}>
                {customers.map((customer) => (
                  <tr key={customer.customerId} className="cursor-pointer hover:bg-ink-50" onClick={() => setSelectedId(customer.customerId)}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={customer.name} size={32} />
                        <div>
                          <p className="font-medium text-ink-800">{customer.name}</p>
                          <p className="text-[11.5px] text-ink-400">{maskPhone(customer.phone)}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{customer.totalVisits}</Td>
                    <Td className="font-semibold text-ink-900">{formatMoney(customer.totalCompletedSpend)}</Td>
                    <Td>{formatMoney(customer.wallet?.totalBalance ?? 0)}</Td>
                    <Td>{customer.lastVisitAt ? relativeTime(customer.lastVisitAt) : '—'}</Td>
                    <Td>
                      {customer.marketingConsent ? <Badge tone="muted">Opted in</Badge> : <Badge tone="muted">Opted out</Badge>}
                    </Td>
                    <Td>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </>
      ) : top.isLoading ? (
        <LoadingBlock rows={6} />
      ) : top.data?.customers.length ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tracked customers" value={top.data.customers.length} />
            <Stat
              label="Combined spend"
              value={formatMoney(top.data.customers.reduce((s, c) => s + c.totalSpend, 0))}
            />
            <Stat
              label="Total visits"
              value={top.data.customers.reduce((s, c) => s + c.visits, 0)}
            />
            <Stat label="Avg per customer" value={formatMoney(Math.round(top.data.customers.reduce((s, c) => s + c.totalSpend, 0) / top.data.customers.length))} tone="brand" />
          </div>
          <Card>
            <Table head={['#', 'Customer', 'Visits', 'Total spend', 'Avg', 'Wallet', 'Referrals']}>
              {top.data.customers.map((customer, index) => (
                <tr key={customer.customerId} className="cursor-pointer hover:bg-ink-50" onClick={() => setSelectedId(customer.customerId)}>
                  <Td>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${index < 3 ? 'bg-brand-sheen text-ink-950' : 'bg-ink-100 text-ink-500'}`}>
                      {index + 1}
                    </span>
                  </Td>
                  <Td>
                    <p className="font-medium text-ink-800">{customer.name}</p>
                    <p className="text-[11.5px] text-ink-400">{customer.phoneMasked}</p>
                  </Td>
                  <Td>{customer.visits}</Td>
                  <Td className="font-semibold text-ink-900">{formatMoney(customer.totalSpend)}</Td>
                  <Td>{formatMoney(customer.averageSpend)}</Td>
                  <Td>{formatMoney(customer.walletBalance)}</Td>
                  <Td>{customer.referrals}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState icon="👑" title="No spend recorded yet" />
        </Card>
      )}

      {/* Detail drawer */}
      <Drawer
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={detail.data?.profile.name ?? 'Customer'}
        subtitle={detail.data ? `${maskPhone(detail.data.profile.phone)} · member since ${formatDate(detail.data.profile.createdAt.slice(0, 10))}` : undefined}
        width="max-w-xl"
        footer={
          detail.data ? (
            <div className="flex justify-end gap-2">
              <Button variant="brand" onClick={() => setAdjustOpen(true)}>
                <IconPlus size={14} /> Adjust wallet
              </Button>
            </div>
          ) : null
        }
      >
        {detail.isLoading || !detail.data ? (
          <LoadingBlock rows={6} />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total spend" value={formatMoney(detail.data.profile.totalCompletedSpend)} />
              <Stat label="Visits" value={detail.data.profile.totalVisits} />
              <Stat tone="brand" label="Wallet balance" value={formatMoney(detail.data.wallet.totalBalance)} sub={`${formatMoney(detail.data.wallet.bonusBalance)} bonus`} />
              <Stat label="Referrals" value={detail.data.profile.successfulReferrals} />
            </div>

            <div className="rounded-xl border border-ink-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-ink-800">Bonus share of wallet</p>
                  <p className="text-[12px] text-ink-400">
                    {formatMoney(detail.data.wallet.bonusBalance)} bonus of {formatMoney(detail.data.wallet.totalBalance)} total
                  </p>
                </div>
                <Badge tone="brand">{detail.data.wallet.totalBalance ? Math.round((detail.data.wallet.bonusBalance / detail.data.wallet.totalBalance) * 100) : 0}%</Badge>
              </div>
              <div className="mt-3">
                <ProgressBar value={detail.data.wallet.bonusBalance} max={Math.max(1, detail.data.wallet.totalBalance)} />
              </div>
            </div>

            <div className="rounded-xl border border-ink-100 p-4">
              <Switch
                checked={detail.data.profile.marketingConsent}
                onChange={async (next) => {
                  try {
                    await fetch(`/api/admin/customers/${selectedId}/consent`, {
                      method: 'POST',
                      headers: {
                        'content-type': 'application/json',
                        authorization: `Bearer ${localStorage.getItem('salonpro.token')}`,
                      },
                      body: JSON.stringify({ marketingConsent: next }),
                    });
                    toast.success(`Marketing consent ${next ? 'given' : 'withdrawn'}`);
                    detail.refetch();
                  } catch {
                    toast.error('Could not update consent');
                  }
                }}
                label="Marketing & promotional consent"
                description="When off, promotional reminders and re-engagement offers are suppressed."
              />
            </div>

            <div>
              <SectionTitle title="Recent wallet activity" className="mb-2" />
              {detail.data.transactions.length ? (
                <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                  {detail.data.transactions.slice(0, 6).map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium capitalize text-ink-800">
                          {tx.type.replace('_', ' ')} · {tx.balanceType}
                        </p>
                        <p className="text-[11px] text-ink-400">{formatDateTime(tx.createdAt)}{tx.reason ? ` · ${tx.reason}` : ''}</p>
                      </div>
                      <span className={`text-[13px] font-semibold ${tx.amount > 0 ? 'text-mint-500' : 'text-ink-800'}`}>
                        {tx.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(tx.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-ink-400">No wallet activity yet.</p>
              )}
            </div>

            <div>
              <SectionTitle title="Recent appointments" className="mb-2" />
              {detail.data.appointments.length ? (
                <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                  {detail.data.appointments.slice(0, 6).map((appointment) => (
                    <div key={appointment.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-ink-700">
                          {formatDate(appointment.date)} · {appointment.services.map((s) => s.name).join(' + ')}
                        </p>
                      </div>
                      <span className="text-[13px] font-medium text-ink-800">{formatMoney(appointment.totalAmount)}</span>
                      <StatusPill status={appointment.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-ink-400">No appointments yet.</p>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {selectedId ? (
        <AdjustModal
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
          customerId={selectedId}
          onDone={() => {
            detail.refetch();
            directory.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function AdjustModal({
  open,
  onClose,
  customerId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [balanceType, setBalanceType] = useState<'cash' | 'bonus'>('cash');
  const [reason, setReason] = useState('');

  const adjust = useApiMutation<Record<string, unknown>, { wallet: Wallet }>('POST', `/admin/customers/${customerId}/wallet/adjust`, {
    onSuccess: () => {
      toast.success('Wallet adjusted', 'A ledger entry was posted — balances are never edited.');
      onClose();
      setAmount('');
      setReason('');
      onDone();
    },
  });

  return (
    <Drawer open={open} onClose={onClose} title="Adjust wallet" subtitle="Owner-approved correction with an audit trail">
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {(['credit', 'debit'] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => setDirection(dir)}
              className={`chip ${direction === dir ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500'}`}
            >
              {dir === 'credit' ? 'Credit (add)' : 'Debit (remove)'}
            </button>
          ))}
        </div>
        <Field label="Balance type">
          <Select value={balanceType} onChange={(e) => setBalanceType(e.target.value as 'cash' | 'bonus')}>
            <option value="cash">Cash value (purchased)</option>
            <option value="bonus">Promotional bonus</option>
          </Select>
        </Field>
        <Field label="Amount (₹)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="500" />
        </Field>
        <Field label="Reason" hint="Required and stored on the audit log. Minimum 6 characters.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill gesture for delayed service" />
        </Field>
        <Button
          variant="brand"
          className="w-full"
          loading={adjust.isPending}
          disabled={!amount || reason.trim().length < 6}
          onClick={async () => {
            const paise = rupeesToPaise(Number(amount));
            if (!paise) return;
            try {
              await adjust.mutateAsync({
                amount: direction === 'credit' ? paise : -paise,
                balanceType,
                reason: reason.trim(),
              });
            } catch (err) {
              toast.error('Adjustment rejected', err instanceof Error ? err.message : undefined);
            }
          }}
        >
          Post ledger adjustment
        </Button>
      </div>
    </Drawer>
  );
}
