import { useMemo, useState } from 'react';
import {
  addDays,
  formatDate,
  formatMoney,
  formatMoneyShort,
  isoDate,
  type RetentionReport,
  type RevenueReport,
} from '@salonpro/shared';
import { useApi } from '../../lib/hooks';
import { downloadFile } from '../../lib/api';
import {
  BarChart,
  Card,
  CardHeader,
  DonutChart,
  EmptyState,
  LoadingBlock,
  ProgressBar,
  Stat,
  Table,
  Td,
} from '../../components/ui';
import { IconDownload } from '../../components/icons';

const METHOD_COLORS: Record<string, string> = {
  wallet: '#C9A227',
  cash: '#0f9d58',
  online: '#3b82f6',
  upi_card: '#8b5cf6',
  pay_at_salon: '#d3d3dc',
};

export default function ReportsAdmin() {
  const [from, setFrom] = useState(addDays(isoDate(), -29));
  const [to, setTo] = useState(isoDate());

  const revenue = useApi<{ report: RevenueReport }>(`/admin/reports/revenue?from=${from}&to=${to}`);
  const retention = useApi<{ report: RetentionReport }>('/admin/reports/retention');

  const report = revenue.data?.report;
  const series = useMemo(() => report?.series.slice(-28) ?? [], [report]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Reports</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">Revenue, retention and outstanding balances. All figures in ₹, from completed services.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="field w-auto py-2" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ink-300">→</span>
          <input type="date" className="field w-auto py-2" value={to} min={from} max={isoDate()} onChange={(e) => setTo(e.target.value)} />
          <button className="btn-ghost btn-sm" onClick={() => downloadFile(`/admin/reports/revenue.csv?from=${from}&to=${to}`, `salonpro-revenue-${from}-to-${to}.csv`)}>
            <IconDownload size={15} /> Revenue CSV
          </button>
        </div>
      </div>

      {/* Revenue summary */}
      {revenue.isLoading ? (
        <LoadingBlock rows={3} />
      ) : !report ? (
        <Card>
          <EmptyState icon="📈" title="No report data" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat tone="dark" label="Gross service sales" value={formatMoney(report.grossServiceSales)} sub={`${formatMoney(report.discounts)} discounts`} />
            <Stat label="Net collected (services)" value={formatMoney(report.netCollected)} sub={`${formatMoney(report.refunds)} refunded`} />
            <Stat label="Wallet recharges collected" value={formatMoney(report.walletCashCollected)} sub={`${formatMoney(report.walletBonusGranted)} bonus granted`} />
            <Stat tone="brand" label="Outstanding (unpaid)" value={formatMoney(report.outstanding)} sub={`${formatMoney(report.referralRewardExpense)} referral expense`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title="Daily collections"
                subtitle={`Net service revenue · ${formatDate(from)} to ${formatDate(to)}`}
                action={<span className="text-[12.5px] text-ink-400">Peak {formatMoneyShort(Math.max(0, ...series.map((s) => s.net)))}</span>}
              />
              <div className="p-5">
                {series.length ? (
                  <BarChart data={series.map((s) => ({ label: s.date, value: s.net }))} format={(n) => formatMoney(n)} />
                ) : (
                  <EmptyState icon="📊" title="No completed services in this range" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Payment mix" subtitle="By collected amount" />
              <div className="p-5">
                {report.byMethod.length ? (
                  <DonutChart
                    slices={report.byMethod.map((m) => ({
                      label: m.method.replace('_', ' '),
                      value: m.amount,
                      color: METHOD_COLORS[m.method] ?? '#94a3b8',
                    }))}
                    centerValue={formatMoneyShort(report.netCollected)}
                    centerLabel="collected"
                  />
                ) : (
                  <EmptyState icon="💳" title="No payments recorded" />
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Revenue by service" subtitle="Completed services only" />
              {report.byService.length ? (
                <Table head={['Service', 'Count', 'Revenue']}>
                  {report.byService.slice(0, 12).map((service) => (
                    <tr key={service.serviceId} className="hover:bg-ink-50">
                      <Td className="font-medium text-ink-800">{service.name}</Td>
                      <Td>{service.count}</Td>
                      <Td className="font-semibold text-ink-900">{formatMoney(service.revenue)}</Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <EmptyState icon="✂️" title="No service revenue" />
              )}
            </Card>

            <Card>
              <CardHeader title="Wallet liability" subtitle="Value customers can still spend at the salon" />
              <div className="space-y-4 p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-ink-400">Total liability</p>
                    <p className="font-display text-[26px] text-ink-900">{formatMoney(report.cashLiability + report.bonusLiability)}</p>
                  </div>
                  <div className="text-right text-[12.5px] text-ink-500">
                    <p>{formatMoney(report.cashLiability)} cash</p>
                    <p>{formatMoney(report.bonusLiability)} bonus</p>
                  </div>
                </div>
                <ProgressBar value={report.cashLiability} max={Math.max(1, report.cashLiability + report.bonusLiability)} tone="ink" />
                <p className="text-[12px] leading-snug text-ink-400">
                  Cash is purchased money that never expires. Bonus is promotional, spent first and never refundable as cash.
                </p>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Retention */}
      <Card>
        <CardHeader
          title="Retention & re-engagement"
          subtitle="Lapsed customers and reminder effectiveness"
          action={
            <button className="btn-ghost btn-sm" onClick={() => downloadFile('/admin/reports/customers.csv', 'salonpro-customers.csv')}>
              <IconDownload size={15} /> Customer CSV
            </button>
          }
        />
        {retention.isLoading || !retention.data ? (
          <div className="p-5">
            <LoadingBlock rows={3} />
          </div>
        ) : (
          <div className="grid gap-5 p-5 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Inactive 30d" value={retention.data.report.inactive30} />
                <Stat label="Inactive 60d" value={retention.data.report.inactive60} />
                <Stat tone="brand" label="Inactive 90d" value={retention.data.report.inactive90} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Repeat customers" value={`${retention.data.report.repeatCustomerPercent}%`} />
                <Stat label="Average spend" value={formatMoney(retention.data.report.averageSpend)} />
                <Stat label="Referral acquisitions" value={retention.data.report.referralAcquisition} />
              </div>
              <div className="rounded-xl border border-ink-100 p-4">
                <p className="text-[12px] font-medium uppercase tracking-wide text-ink-400">Reminder conversions</p>
                <div className="mt-3 space-y-2">
                  {retention.data.report.reminderConversions.length ? (
                    retention.data.report.reminderConversions.map((c) => (
                      <div key={c.stage} className="flex items-center gap-3">
                        <span className="w-16 text-[13px] capitalize text-ink-600">{c.stage.replace('day', 'Day ')}</span>
                        <div className="flex-1">
                          <ProgressBar value={c.booked} max={Math.max(1, c.sent)} tone="brand" />
                        </div>
                        <span className="w-24 text-right text-[12px] text-ink-400">
                          {c.booked}/{c.sent} · {c.conversion}%
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[13px] text-ink-400">No reminder sends recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-400">Popular services</p>
              {retention.data.report.popularServices.length ? (
                <ul className="space-y-2">
                  {retention.data.report.popularServices.map((service) => {
                    const max = retention.data!.report.popularServices[0]!.count || 1;
                    return (
                      <li key={service.name} className="space-y-1">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="truncate text-ink-600">{service.name}</span>
                          <span className="font-medium text-ink-800">{service.count}</span>
                        </div>
                        <ProgressBar value={service.count} max={max} tone="ink" />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-400">No service records.</p>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
