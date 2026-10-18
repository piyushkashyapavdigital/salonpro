import { useState } from 'react';
import {
  formatDateTime,
  formatMoney,
  formatMoneyShort,
  paiseToRupees,
  rupeesToPaise,
  type Wallet,
  type WalletTransaction,
} from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { Alert, Badge, Button, Card, Drawer, EmptyState, Field, Input, LoadingBlock, Modal, SectionTitle, Tabs } from '../../components/ui';
import { IconDownload, IconReceipt, IconSparkle, IconWallet } from '../../components/icons';
import { api, downloadFile } from '../../lib/api';

interface WalletResponse {
  wallet: Wallet;
  transactions: WalletTransaction[];
  offers: { id: string; payAmount: number; bonusAmount: number; totalValue: number; label: string }[];
  spendingOrder: string[];
  bonusExpiryDays: number | null;
  terms: string[];
}

interface OrderResponse {
  order: { id: string; razorpayOrderId: string; amount: number; mode: string; status: string };
  checkout: {
    provider: string;
    mode: string;
    keyId: string;
    orderId: string;
    amount: number;
    simulatedSignature?: string;
    simulatedPaymentId?: string;
  };
  offer: { payAmount: number; bonusAmount: number; totalValue: number; label: string };
}

export default function WalletPage() {
  const { refresh, wallet: sessionWallet } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'recharge' | 'history'>('recharge');
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [checkout, setCheckout] = useState<OrderResponse | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  const { data, isLoading, refetch } = useApi<WalletResponse>('/customer/wallet');
  const createOrder = useApiMutation<Record<string, unknown>, OrderResponse>('POST', '/payments/orders');
  const simulatePay = useApiMutation<Record<string, unknown>, { ok: boolean; wallet?: Wallet }>('POST', '/payments/simulate');

  const wallet = data?.wallet ?? sessionWallet;

  const startRecharge = async () => {
    const amount = selectedOffer ? undefined : rupeesToPaise(Number(customAmount));
    if (!selectedOffer && (!amount || amount < 10000)) {
      toast.error('Minimum recharge is ₹100');
      return;
    }
    try {
      const result = await createOrder.mutateAsync({
        purpose: 'wallet_recharge',
        offerId: selectedOffer ?? undefined,
        amount,
        idempotencyKey: `recharge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setCheckout(result);
    } catch (err) {
      toast.error('Could not start the payment', err instanceof Error ? err.message : undefined);
    }
  };

  const completeRecharge = async (outcome: 'success' | 'failure') => {
    if (!checkout) return;
    try {
      const result = await simulatePay.mutateAsync({
        razorpayOrderId: checkout.checkout.orderId,
        outcome,
      });
      if (outcome === 'failure' || !result.ok) {
        toast.error('Payment failed', 'No money was credited. The payment order is recorded as failed.');
      } else {
        toast.brand(
          'Wallet topped up',
          `${formatMoney(checkout.offer.payAmount)} + ${formatMoney(checkout.offer.bonusAmount)} bonus added.`,
        );
        await refresh();
        refetch();
      }
    } catch (err) {
      toast.error('Verification failed', err instanceof Error ? err.message : undefined);
    } finally {
      setCheckout(null);
      setSelectedOffer(null);
      setCustomAmount('');
    }
  };

  const openReceipt = async (transaction: WalletTransaction) => {
    try {
      const result = await api<{ receipt: Record<string, unknown> }>(`/customer/wallet/receipt/${transaction.id}`);
      setReceipt(result.receipt);
    } catch (err) {
      toast.error('Could not load the receipt', err instanceof Error ? err.message : undefined);
    }
  };

  if (isLoading) return <div className="px-4 py-5"><LoadingBlock rows={4} /></div>;

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <h1 className="font-display text-[24px] text-ink-900">Wallet</h1>
        <p className="mt-1 text-[13px] text-ink-400">
          Prepaid salon credit. Bonus is spent first — purchased cash never expires.
        </p>
      </div>

      {/* Balance card */}
      <div className="card-dark relative overflow-hidden p-5">
        <div className="grid-lines absolute inset-0 opacity-60" />
        <div className="relative">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">Total available</p>
          <p className="mt-2 font-display text-[36px] leading-none text-white">
            {formatMoney(wallet?.totalBalance ?? 0)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Cash</p>
              <p className="mt-0.5 text-[15px] font-semibold text-white">{formatMoney(wallet?.cashBalance ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-brand-300">Bonus</p>
              <p className="mt-0.5 text-[15px] font-semibold text-brand-200">{formatMoney(wallet?.bonusBalance ?? 0)}</p>
            </div>
          </div>
          <button className="mt-4 text-[11.5px] text-brand-300 underline hover:text-brand-200" onClick={() => setTermsOpen(true)}>
            Bonus, expiry and refund terms
          </button>
        </div>
      </div>

      <Tabs
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'recharge', label: 'Add money' },
          { id: 'history', label: 'Transactions', count: data?.transactions.length },
        ]}
      />

      {mode === 'recharge' ? (
        <div className="space-y-4">
          <SectionTitle title="Recharge offers" subtitle="Set by the salon owner — instant bonus value" />
          <div className="space-y-2.5">
            {(data?.offers ?? []).map((offer) => {
              const active = selectedOffer === offer.id;
              return (
                <button
                  key={offer.id}
                  onClick={() => {
                    setSelectedOffer(active ? null : offer.id);
                    setCustomAmount('');
                  }}
                  className={`card flex w-full items-center gap-4 p-4 text-left transition ${
                    active ? 'ring-2 ring-brand-400' : 'hover:-translate-y-0.5 hover:shadow-lift'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-[20px] text-ink-900">Pay {formatMoney(offer.payAmount)}</p>
                      {offer.label ? <Badge tone="brand">{offer.label}</Badge> : null}
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-500">
                      Get <span className="font-semibold text-mint-500">{formatMoney(offer.bonusAmount)}</span> bonus →{' '}
                      {formatMoney(offer.totalValue)} of salon value
                    </p>
                  </div>
                  <IconSparkle size={20} className={active ? 'text-brand-500' : 'text-ink-300'} />
                </button>
              );
            })}
          </div>

          <Card className="p-4">
            <Field label="Or enter a custom amount" hint="Minimum ₹100. Custom top-ups do not earn bonus.">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-400">₹</span>
                <Input
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value.replace(/[^\d.]/g, ''));
                    setSelectedOffer(null);
                  }}
                  placeholder="1,000"
                  inputMode="decimal"
                  className="pl-8"
                />
              </div>
            </Field>
          </Card>

          <Alert tone="info" title="Test mode">
            Razorpay keys are not configured on this deployment, so the checkout below runs SalonPro's simulated test
            gateway. It still performs real HMAC signature verification on the server before any credit is issued.
          </Alert>

          <Button variant="brand" size="lg" className="w-full" loading={createOrder.isPending} onClick={startRecharge}>
            <IconWallet size={17} />
            {selectedOffer
              ? `Pay ${formatMoney((data?.offers ?? []).find((o) => o.id === selectedOffer)?.payAmount ?? 0)}`
              : 'Continue to payment'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle title="Transaction history" className="mb-0" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadFile('/customer/wallet/transactions.csv', 'salonpro-wallet.csv')}
            >
              <IconDownload size={14} /> CSV
            </Button>
          </div>
          {data?.transactions.length ? (
            <Card className="divide-y divide-ink-100">
              {data.transactions.map((transaction) => (
                <button
                  key={transaction.id}
                  onClick={() => openReceipt(transaction)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-50"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-[15px] ${
                      transaction.amount > 0 ? 'bg-mint-100 text-mint-500' : 'bg-ink-100 text-ink-500'
                    }`}
                  >
                    {transaction.amount > 0 ? '↑' : '↓'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium capitalize text-ink-800">
                      {transaction.type.replace('_', ' ')} · {transaction.balanceType}
                    </p>
                    <p className="text-[11.5px] text-ink-400">
                      {formatDateTime(transaction.createdAt)}
                      {transaction.reason ? ` · ${transaction.reason}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[13.5px] font-semibold ${transaction.amount > 0 ? 'text-mint-500' : 'text-ink-800'}`}>
                      {transaction.amount > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(transaction.amount))}
                    </p>
                    <p className="text-[11px] text-ink-400">{transaction.status}</p>
                  </div>
                </button>
              ))}
            </Card>
          ) : (
            <Card>
              <EmptyState icon="🧾" title="No transactions yet" description="Recharge your wallet to get started." />
            </Card>
          )}
        </div>
      )}

      {/* Simulated checkout */}
      <Modal
        open={Boolean(checkout)}
        onClose={() => setCheckout(null)}
        title="SalonPro test checkout"
        footer={
          <>
            <Button variant="ghost" loading={simulatePay.isPending} onClick={() => completeRecharge('failure')}>
              Simulate failure
            </Button>
            <Button variant="brand" loading={simulatePay.isPending} onClick={() => completeRecharge('success')}>
              Simulate success
            </Button>
          </>
        }
      >
        {checkout ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-300/70 bg-brand-100 p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-700">Razorpay · {checkout.order.mode}</p>
              <p className="mt-1 text-[13px] leading-snug text-brand-700">
                No live keys are configured, so this dialog stands in for Razorpay Checkout. Choosing “Simulate success”
                posts a correctly signed payload that the server verifies exactly like a real one — the wallet is only
                credited after that verification passes.
              </p>
            </div>
            <div className="space-y-2 text-[13px]">
              <SummaryRow label="Order id" value={checkout.checkout.orderId} />
              <SummaryRow label="Amount" value={formatMoney(checkout.offer.payAmount)} />
              <SummaryRow label="Bonus" value={formatMoney(checkout.offer.bonusAmount)} />
              <SummaryRow label="Wallet value" value={formatMoney(checkout.offer.totalValue)} strong />
              <SummaryRow label="Key id" value={checkout.checkout.keyId} />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Receipt drawer */}
      <Drawer open={Boolean(receipt)} onClose={() => setReceipt(null)} title="Wallet receipt" subtitle="Downloadable record of this movement">
        {receipt ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-ink-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-[18px] text-ink-900">SalonPro</p>
                  <p className="text-[11.5px] text-ink-400">{(receipt.salon as { address?: string })?.address}</p>
                </div>
                <Badge tone="brand">Receipt</Badge>
              </div>
              <div className="mt-4 space-y-2 text-[13px]">
                <SummaryRow label="Receipt no" value={String(receipt.number)} />
                <SummaryRow label="Issued" value={formatDateTime(String(receipt.issuedAt))} />
                <SummaryRow label="Customer" value={String((receipt.customer as { name?: string })?.name ?? '')} />
                <SummaryRow label="Type" value={String(receipt.type).replace('_', ' ')} />
                <SummaryRow label="Balance type" value={String(receipt.balanceType)} />
                <SummaryRow
                  label="Amount"
                  value={formatMoney(Number(receipt.amount))}
                  strong
                />
                <SummaryRow label="Status" value={String(receipt.status)} />
              </div>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => window.print()}>
              <IconReceipt size={16} /> Print
            </Button>
          </div>
        ) : null}
      </Drawer>

      {/* Terms */}
      <Drawer open={termsOpen} onClose={() => setTermsOpen(false)} title="Wallet terms" subtitle="Shown before you pay — always">
        <div className="space-y-4">
          <Alert tone="warn" title="Spending order">
            {data?.spendingOrder.join(' → ')} — promotional bonus is always consumed first.
          </Alert>
          <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-ink-600">
            {(data?.terms ?? []).map((term) => (
              <li key={term} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {term}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ink-400">
            Bonus expiry: {data?.bonusExpiryDays ? `${data.bonusExpiryDays} days` : 'no expiry currently configured'}.
          </p>
          <p className="text-[12px] text-ink-400">
            Current balance: {formatMoneyShort(wallet?.totalBalance ?? 0)} ({formatMoney(wallet?.bonusBalance ?? 0)} bonus,
            ≈ ₹{paiseToRupees(wallet?.cashBalance ?? 0).toLocaleString('en-IN')} cash)
          </p>
        </div>
      </Drawer>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[12.5px] text-ink-400">{label}</span>
      <span className={`break-all text-right ${strong ? 'text-[14px] font-semibold text-ink-900' : 'text-[13px] text-ink-700'}`}>
        {value}
      </span>
    </div>
  );
}
