import { useState } from 'react';
import { formatDateTime, formatMoney, formatMoneyShort, paiseToRupees, rupeesToPaise, type WalletTransaction } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { downloadFile } from '../../lib/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Select,
  Stat,
  StatusPill,
  Switch,
  Table,
  Tabs,
  Td,
} from '../../components/ui';
import { IconDownload, IconPlus, IconWallet } from '../../components/icons';

interface WalletResponse {
  transactions: (WalletTransaction & { customerName: string })[];
  liabilities: { cash: number; bonus: number; total: number };
  recentRecharges: { id: string; customerName?: string; amount: number; status: string; createdAt: string; verifiedAt: string | null }[];
  }

interface OfferRow {
  id: string;
  payAmount: number;
  bonusAmount: number;
  label: string;
  active: boolean;
  sortOrder: number;
  totalValue: number;
}

export default function WalletAdmin() {
  const toast = useToast();
  const [tab, setTab] = useState<'ledger' | 'offers'>('ledger');
  const [typeFilter, setTypeFilter] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('');
  const [editor, setEditor] = useState<{ id?: string; pay: string; bonus: string; label: string; active: boolean } | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const query = new URLSearchParams();
  if (typeFilter) query.set('type', typeFilter);
  if (balanceFilter) query.set('balanceType', balanceFilter);
  const { data, isLoading, refetch } = useApi<WalletResponse>(`/admin/wallet?${query.toString()}`);
  const offers = useApi<{ rechargeOffers: OfferRow[] }>('/admin/offers');

  const saveOffer = useApiMutation<Record<string, unknown>, { offer: OfferRow }>(
    'POST',
    (body) => (body.id ? `/admin/offers/recharge/${body.id}` : '/admin/offers/recharge'),
    {
      onSuccess: () => {
        toast.success('Offer saved');
        setEditor(null);
        offers.refetch();
      },
    },
  );

  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Wallet &amp; payments</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">
            Append-only ledger. Balances are always the sum of posted entries — never an edited number.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAdjustOpen(true)}>
            <IconPlus size={15} /> Adjust a wallet
          </Button>
          <Button variant="ghost" size="sm" onClick={() => offers.refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Liabilities */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          tone="dark"
          label="Total outstanding liability"
          value={formatMoney(data?.liabilities.total ?? 0)}
          sub="Cash + bonus value customers can still spend"
          icon={<IconWallet size={16} />}
        />
        <Stat label="Cash liability" value={formatMoney(data?.liabilities.cash ?? 0)} sub="Purchased money — never expires" />
        <Stat tone="brand" label="Bonus liability" value={formatMoney(data?.liabilities.bonus ?? 0)} sub="Promotional — spent first, non-refundable" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'ledger', label: 'Ledger', count: transactions.length },
          { id: 'offers', label: 'Recharge offers', count: offers.data?.rechargeOffers.length },
        ]}
      />

      {tab === 'ledger' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-auto py-2" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {['recharge', 'spend', 'refund', 'referral_bonus', 'adjustment', 'reversal'].map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </Select>
            <Select className="w-auto py-2" value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)}>
              <option value="">All balances</option>
              <option value="cash">Cash</option>
              <option value="bonus">Bonus</option>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadFile('/admin/wallet.csv', 'salonpro-wallet-ledger.csv')}
            >
              <IconDownload size={15} /> Export ledger
            </Button>
          </div>

          {isLoading ? (
            <LoadingBlock rows={6} />
          ) : transactions.length === 0 ? (
            <Card>
              <EmptyState icon="🧾" title="No ledger entries" description="Wallet activity will appear here as customers recharge and spend." />
            </Card>
          ) : (
            <Card>
              <Table head={['When', 'Customer', 'Type', 'Balance', 'Amount', 'Status']}>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-ink-50">
                    <Td className="whitespace-nowrap text-ink-400">{formatDateTime(tx.createdAt)}</Td>
                    <Td className="font-medium text-ink-800">{tx.customerName}</Td>
                    <Td className="capitalize">{tx.type.replace('_', ' ')}</Td>
                    <Td>
                      <Badge tone={tx.balanceType === 'bonus' ? 'brand' : 'muted'}>{tx.balanceType}</Badge>
                    </Td>
                    <Td className={`font-semibold ${tx.amount > 0 ? 'text-mint-500' : 'text-ink-900'}`}>
                      {tx.amount > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(tx.amount))}
                    </Td>
                    <Td>
                      <StatusPill status={tx.status} />
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <Card>
            <CardHeader title="Recent recharges" subtitle="Latest successful wallet top-ups" />
            {data?.recentRecharges.length ? (
              <Table head={['When', 'Customer', 'Amount', 'Status']}>
                {data.recentRecharges.map((order) => (
                  <tr key={order.id} className="hover:bg-ink-50">
                    <Td className="whitespace-nowrap text-ink-400">{formatDateTime(order.verifiedAt ?? order.createdAt)}</Td>
                    <Td className="font-medium text-ink-800">{order.customerName ?? '—'}</Td>
                    <Td className="font-semibold text-ink-900">{formatMoney(order.amount)}</Td>
                    <Td>
                      <StatusPill status={order.status} />
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState icon="💳" title="No recharges yet" />
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[13.5px] text-ink-400">
              Prepaid top-up offers shown to customers. Bonus is promotional and tracked separately from cash.
            </p>
            <Button variant="brand" size="sm" onClick={() => setEditor({ pay: '1000', bonus: '150', label: 'Popular', active: true })}>
              <IconPlus size={15} /> New offer
            </Button>
          </div>
          {offers.isLoading ? (
            <LoadingBlock rows={3} />
          ) : offers.data?.rechargeOffers.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {offers.data.rechargeOffers.map((offer) => (
                <Card key={offer.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display text-[20px] text-ink-900">Pay {formatMoney(offer.payAmount)}</p>
                      <p className="mt-1 text-[12.5px] text-ink-500">
                        + <span className="font-semibold text-mint-500">{formatMoney(offer.bonusAmount)}</span> bonus →{' '}
                        {formatMoneyShort(offer.totalValue)}
                      </p>
                    </div>
                    {offer.label ? <Badge tone="brand">{offer.label}</Badge> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    {offer.active ? <Badge tone="success">Live</Badge> : <Badge tone="muted">Hidden</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditor({
                          id: offer.id,
                          pay: String(paiseToRupees(offer.payAmount)),
                          bonus: String(paiseToRupees(offer.bonusAmount)),
                          label: offer.label,
                          active: offer.active,
                        })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState icon="🎁" title="No recharge offers" description="Create a top-up offer to boost prepaid wallet adoption." />
            </Card>
          )}
        </>
      )}

      {/* Offer editor */}
      <Drawer open={Boolean(editor)} onClose={() => setEditor(null)} title={editor?.id ? 'Edit offer' : 'New recharge offer'}>
        {editor ? (
          <div className="space-y-4">
            <Field label="Customer pays (₹)">
              <Input value={editor.pay} inputMode="decimal" onChange={(e) => setEditor({ ...editor, pay: e.target.value.replace(/[^\d.]/g, '') })} placeholder="1000" />
            </Field>
            <Field label="Bonus added (₹)" hint="Promotional value — spent before cash and never refundable as cash.">
              <Input value={editor.bonus} inputMode="decimal" onChange={(e) => setEditor({ ...editor, bonus: e.target.value.replace(/[^\d.]/g, '') })} placeholder="150" />
            </Field>
            <Field label="Label" hint="Optional badge such as Popular or Best value.">
              <Input value={editor.label} onChange={(e) => setEditor({ ...editor, label: e.target.value })} maxLength={40} placeholder="Popular" />
            </Field>
            <div className="rounded-xl border border-ink-100 p-4">
              <Switch checked={editor.active} onChange={(next) => setEditor({ ...editor, active: next })} label="Show to customers" />
            </div>
            <Button
              variant="brand"
              className="w-full"
              loading={saveOffer.isPending}
              onClick={async () => {
                const payAmount = rupeesToPaise(Number(editor.pay));
                const bonusAmount = rupeesToPaise(Number(editor.bonus || 0));
                if (!payAmount || payAmount < 100) {
                  toast.error('Minimum top-up is ₹1');
                  return;
                }
                try {
                  await saveOffer.mutateAsync({
                    id: editor.id,
                    payAmount,
                    bonusAmount,
                    label: editor.label,
                    active: editor.active,
                    sortOrder: 0,
                  } as never);
                } catch (err) {
                  toast.error('Could not save the offer', err instanceof Error ? err.message : undefined);
                }
              }}
            >
              Save offer
            </Button>
          </div>
        ) : null}
      </Drawer>

      <AdjustPicker open={adjustOpen} onClose={() => setAdjustOpen(false)} onDone={() => refetch()} />
    </div>
  );
}

/** Pick a customer by phone/name then hand off to the customer wallet adjustment. */
function AdjustPicker({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { data } = useApi<{ customers: { customerId: string; name: string; phone: string }[] }>(
    open ? `/admin/customers?search=${encodeURIComponent(search)}` : null,
  );
  const [target, setTarget] = useState<{ customerId: string; name: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [balanceType, setBalanceType] = useState<'cash' | 'bonus'>('cash');
  const [reason, setReason] = useState('');

  const adjust = useApiMutation<Record<string, unknown>, unknown>(
    'POST',
    `/admin/customers/${target?.customerId}/wallet/adjust`,
    {
      onSuccess: () => {
        toast.success('Wallet adjusted');
        onClose();
        onDone();
        setTarget(null);
        setAmount('');
        setReason('');
      },
    },
  );

  return (
    <Drawer open={open} onClose={onClose} title="Adjust a customer wallet" subtitle="Every manual change is audited">
      <div className="space-y-4">
        {!target ? (
          <>
            <Field label="Find customer">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone" />
            </Field>
            <div className="space-y-1">
              {(data?.customers ?? []).slice(0, 8).map((customer) => (
                <button
                  key={customer.customerId}
                  onClick={() => setTarget({ customerId: customer.customerId, name: customer.name })}
                  className="flex w-full items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-left text-[13px] hover:bg-ink-50"
                >
                  <span className="font-medium text-ink-800">{customer.name}</span>
                  <span className="text-ink-400">{customer.phone}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-brand-300/60 bg-brand-soft px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Adjusting wallet for</p>
                <p className="text-[14px] font-semibold text-ink-900">{target.name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
                Change
              </Button>
            </div>
            <div className="flex gap-1.5">
              {(['credit', 'debit'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setDirection(dir)}
                  className={`chip ${direction === dir ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500'}`}
                >
                  {dir === 'credit' ? 'Credit' : 'Debit'}
                </button>
              ))}
            </div>
            <Field label="Balance type">
              <Select value={balanceType} onChange={(e) => setBalanceType(e.target.value as 'cash' | 'bonus')}>
                <option value="cash">Cash value</option>
                <option value="bonus">Promotional bonus</option>
              </Select>
            </Field>
            <Field label="Amount (₹)">
              <Input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Field label="Reason" hint="Minimum 6 characters.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button
              variant="brand"
              className="w-full"
              loading={adjust.isPending}
              disabled={!amount || reason.trim().length < 6}
              onClick={async () => {
                const paise = rupeesToPaise(Number(amount));
                try {
                  await adjust.mutateAsync({
                    amount: direction === 'credit' ? paise : -paise,
                    balanceType,
                    reason: reason.trim(),
                  } as never);
                } catch (err) {
                  toast.error('Adjustment rejected', err instanceof Error ? err.message : undefined);
                }
              }}
            >
              Post adjustment
            </Button>
          </>
        )}
      </div>
    </Drawer>
  );
}
