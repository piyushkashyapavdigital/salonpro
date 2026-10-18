import { useState } from 'react';
import { formatDateTime, formatMoney, rupeesToPaise } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { downloadFile } from '../../lib/api';
import {
  Alert,
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
  Textarea,
} from '../../components/ui';
import { IconDownload, IconPlus } from '../../components/icons';

interface Order {
  id: string;
  customerName?: string;
  razorpayOrderId: string;
  paymentId: string | null;
  amount: number;
  amountPaid: number;
  purpose: string;
  status: string;
  mode: string;
  verifiedAt: string | null;
  createdAt: string;
}

interface Refund {
  id: string;
  customerName: string;
  customerId: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
}

interface PaymentsResponse {
  orders: Order[];
  refunds: Refund[];
  mode: string;
  summary: { collected: number; pending: number; failed: number; refunded: number };
}

export default function PaymentsAdmin() {
  const toast = useToast();
  const [tab, setTab] = useState<'orders' | 'refunds'>('orders');
  const [refundOpen, setRefundOpen] = useState(false);
  const { data, isLoading, refetch } = useApi<PaymentsResponse>('/admin/payments');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Payments &amp; refunds</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">
            Every order and refund, with Razorpay server-side verification. Mode: <strong>{data?.mode ?? '—'}</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => downloadFile('/admin/payments.csv', 'salonpro-payments.csv')}>
            <IconDownload size={15} /> Export CSV
          </Button>
          <Button variant="brand" size="sm" onClick={() => setRefundOpen(true)}>
            <IconPlus size={15} /> Issue refund
          </Button>
        </div>
      </div>

      {data && data.mode !== 'live' ? (
        <div className="flex items-start gap-3 rounded-xl border border-brand-300/70 bg-brand-100 px-4 py-3 text-[12.5px] text-brand-700">
          <span className="font-bold">DEV</span>
          <span>
            No live Razorpay keys are configured. Orders are created and verified against SalonPro's test gateway
            (signature verification is real). Switch to live keys to take real payments.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Collected" value={formatMoney(data?.summary.collected ?? 0)} />
        <Stat label="Pending / attempted" value={data?.summary.pending ?? 0} />
        <Stat label="Failed orders" value={data?.summary.failed ?? 0} />
        <Stat tone="brand" label="Refunded" value={formatMoney(data?.summary.refunded ?? 0)} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'orders', label: 'Orders', count: data?.orders.length },
          { id: 'refunds', label: 'Refunds', count: data?.refunds.length },
        ]}
      />

      {isLoading ? (
        <LoadingBlock rows={6} />
      ) : tab === 'orders' ? (
        <Card>
          {data?.orders.length ? (
            <Table head={['Created', 'Customer', 'Purpose', 'Amount', 'Mode', 'Status', 'Verified']}>
              {data.orders.map((order) => (
                <tr key={order.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-400">{formatDateTime(order.createdAt)}</Td>
                  <Td className="font-medium text-ink-800">{order.customerName ?? '—'}</Td>
                  <Td>
                    <Badge tone="muted">{order.purpose.replace('_', ' ')}</Badge>
                  </Td>
                  <Td className="font-semibold text-ink-900">{formatMoney(order.amount)}</Td>
                  <Td className="capitalize text-ink-500">{order.mode}</Td>
                  <Td>
                    <StatusPill status={order.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-400">{order.verifiedAt ? formatDateTime(order.verifiedAt) : '—'}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState icon="💳" title="No payment orders yet" />
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Refund history" subtitle="Wallet-credited and source refunds are recorded here" />
          {data?.refunds.length ? (
            <Table head={['When', 'Customer', 'Amount', 'Reason', 'Status']}>
              {data.refunds.map((refund) => (
                <tr key={refund.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-400">{formatDateTime(refund.createdAt)}</Td>
                  <Td className="font-medium text-ink-800">{refund.customerName}</Td>
                  <Td className="font-semibold text-ink-900">{formatMoney(refund.amount)}</Td>
                  <Td className="max-w-[320px] truncate text-ink-500">{refund.reason}</Td>
                  <Td>
                    <StatusPill status={refund.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState icon="↩️" title="No refunds issued" description="Refunds appear here once the owner or a manager approves one." />
          )}
        </Card>
      )}

      <RefundDrawer open={refundOpen} onClose={() => setRefundOpen(false)} onDone={() => refetch()} />
    </div>
  );
}

function RefundDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<{ customerId: string; name: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [toWallet, setToWallet] = useState(true);

  const { data } = useApi<{ customers: { customerId: string; name: string; phone: string }[] }>(
    open ? `/admin/customers?search=${encodeURIComponent(search)}` : null,
  );

  const refund = useApiMutation<Record<string, unknown>, unknown>('POST', '/admin/refunds', {
    onSuccess: () => {
      toast.success('Refund recorded');
      onClose();
      onDone();
      setCustomer(null);
      setAmount('');
      setReason('');
    },
  });

  return (
    <Drawer open={open} onClose={onClose} title="Issue a refund" subtitle="Requires owner or manager role — enforced on the server">
      <div className="space-y-4">
        {!customer ? (
          <>
            <Field label="Find customer">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone" />
            </Field>
            <div className="space-y-1">
              {(data?.customers ?? []).slice(0, 8).map((c) => (
                <button
                  key={c.customerId}
                  onClick={() => setCustomer({ customerId: c.customerId, name: c.name })}
                  className="flex w-full items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-left text-[13px] hover:bg-ink-50"
                >
                  <span className="font-medium text-ink-800">{c.name}</span>
                  <span className="text-ink-400">{c.phone}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-brand-300/60 bg-brand-soft px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Refunding</p>
                <p className="text-[14px] font-semibold text-ink-900">{customer.name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                Change
              </Button>
            </div>
            <Field label="Amount (₹)">
              <Input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="799" />
            </Field>
            <Field label="Reason" hint="Stored permanently on the refund and the audit log.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Service not delivered as agreed" />
            </Field>
            <div className="rounded-xl border border-ink-100 p-4">
              <Switch
                checked={toWallet}
                onChange={setToWallet}
                label="Refund to wallet"
                description="On: credits the customer's wallet instantly. Off: refunds to the original payment source after owner approval."
              />
            </div>
            <Alert tone="warn" title="Refund policy">
              Promotional bonus is never refunded as cash. Where a refund reverses a qualifying referral visit, the ₹50 +
              ₹50 rewards are reversed with audited compensating entries.
            </Alert>
            <Button
              variant="brand"
              className="w-full"
              loading={refund.isPending}
              disabled={!amount || reason.trim().length < 6}
              onClick={async () => {
                try {
                  await refund.mutateAsync({
                    customerId: customer.customerId,
                    amount: rupeesToPaise(Number(amount)),
                    reason: reason.trim(),
                    toWallet,
                  } as never);
                } catch (err) {
                  toast.error('Refund failed', err instanceof Error ? err.message : undefined);
                }
              }}
            >
              Process refund
            </Button>
          </>
        )}
      </div>
    </Drawer>
  );
}
