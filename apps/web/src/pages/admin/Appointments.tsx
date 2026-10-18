import { useEffect, useState } from 'react';
import {
  addDays,
  formatDate,
  formatDateLong,
  formatDuration,
  formatMoney,
  formatTime12,
  isoDate,
  type Appointment,
  type Service,
} from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import {
  Alert,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  StatusPill,
  Tabs,
} from '../../components/ui';
import { IconCalendar, IconPlus, IconSearch } from '../../components/icons';
import { api } from '../../lib/api';

interface Branch {
  id: string;
  name: string;
  status: string;
}

type FilterId = 'all' | 'pending' | 'completed' | 'cancelled';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PENDING = ['booked', 'confirmed', 'checked_in', 'in_progress'];

export default function Appointments() {
  const toast = useToast();
  const [date, setDate] = useState(isoDate());
  const [filter, setFilter] = useState<FilterId>('all');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Appointment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [walkInOpen, setWalkInOpen] = useState(false);

  const { data, isLoading, refetch } = useApi<{ appointments: Appointment[] }>(
    `/admin/appointments?date=${date}`,
  );
  const { data: branchesData } = useApi<{ branches: Branch[] }>('/admin/branches');

  const setStatus = useApiMutation<{ status: string; reason?: string; paymentMethod?: string }, { appointment: Appointment }>(
    'POST',
    (body) => `/admin/appointments/${(body as { id?: string }).id}/status`,
    { invalidate: ['/admin/overview'] },
  );

  const noShow = useApiMutation<{ id: string }, { appointment: Appointment }>('POST', (body) => `/admin/appointments/${body.id}/no-show`);

  const list = data?.appointments ?? [];
  const counts = {
    all: list.length,
    pending: list.filter((a) => PENDING.includes(a.status)).length,
    completed: list.filter((a) => a.status === 'completed').length,
    cancelled: list.filter((a) => ['cancelled', 'no_show'].includes(a.status)).length,
  };
  const filtered = list.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return PENDING.includes(a.status);
    if (filter === 'completed') return a.status === 'completed';
    return ['cancelled', 'no_show'].includes(a.status);
  });

  const transition = async (appointment: Appointment, status: string, extra: Record<string, unknown> = {}) => {
    try {
      await setStatus.mutateAsync({ id: appointment.id, status, ...extra } as never);
      toast.success(`Marked ${status.replace('_', ' ')}`);
      setSelected(null);
      refetch();
    } catch (err) {
      toast.error('Could not update', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Appointments</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">{formatDateLong(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="field w-auto py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, -1))}>
            ‹
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, 1))}>
            ›
          </Button>
          <Button variant="brand" size="sm" onClick={() => setWalkInOpen(true)}>
            <IconPlus size={15} /> Walk-in
          </Button>
        </div>
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] }))}
      />

      {isLoading ? (
        <LoadingBlock rows={5} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="📅"
            title="No appointments"
            description={`Nothing in this view for ${formatDate(date)}. Create a walk-in to add one now.`}
            action={
              <Button variant="brand" onClick={() => setWalkInOpen(true)}>
                <IconPlus size={15} /> New walk-in
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-ink-100">
          {filtered.map((appointment) => (
            <div key={appointment.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <div className="w-[74px] shrink-0">
                <p className="text-[14px] font-semibold text-ink-900">{formatTime12(appointment.startTime)}</p>
                <p className="text-[11px] text-ink-400">{formatDuration(appointment.durationMinutes)}</p>
              </div>
              <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(appointment)}>
                <p className="truncate text-[14px] font-medium text-ink-800">
                  {appointment.customerName}
                  {appointment.customerPhone ? (
                    <span className="ml-2 text-[11.5px] font-normal text-ink-400">{appointment.customerPhone}</span>
                  ) : null}
                </p>
                <p className="truncate text-[12.5px] text-ink-400">
                  {appointment.services.map((s) => s.name).join(' + ')} · {appointment.staffName ?? 'Any stylist'}
                </p>
              </button>
              <div className="text-right">
                <p className="text-[13.5px] font-semibold text-ink-900">{formatMoney(appointment.totalAmount)}</p>
                <StatusPill status={appointment.paymentStatus} />
              </div>
              <StatusPill status={appointment.status} />
              <div className="flex items-center gap-1.5">
                {['booked', 'confirmed'].includes(appointment.status) ? (
                  <Button variant="ghost" size="sm" onClick={() => void transition(appointment, 'checked_in')}>
                    Check in
                  </Button>
                ) : null}
                {appointment.status === 'checked_in' ? (
                  <Button variant="ghost" size="sm" onClick={() => void transition(appointment, 'in_progress')}>
                    Start
                  </Button>
                ) : null}
                {appointment.status === 'in_progress' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setCompleteTarget(appointment);
                      setPaymentMethod('wallet');
                    }}
                  >
                    Complete
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Detail drawer */}
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.customerName ?? 'Appointment'}
        subtitle={selected ? `${formatDate(selected.date)} · ${formatTime12(selected.startTime)}` : undefined}
        footer={
          selected ? (
            <div className="flex flex-wrap justify-end gap-2">
              {['booked', 'confirmed'].includes(selected.status) ? (
                <Button variant="ghost" onClick={() => void transition(selected, 'checked_in')}>
                  Check in
                </Button>
              ) : null}
              {selected.status === 'checked_in' ? (
                <Button variant="ghost" onClick={() => void transition(selected, 'in_progress')}>
                  Start service
                </Button>
              ) : null}
              {selected.status === 'in_progress' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setCompleteTarget(selected);
                    setSelected(null);
                  }}
                >
                  Complete &amp; pay
                </Button>
              ) : null}
              {['booked', 'confirmed', 'checked_in', 'in_progress'].includes(selected.status) ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await noShow.mutateAsync({ id: selected.id });
                      toast.info('Marked as no-show');
                      setSelected(null);
                      refetch();
                    }}
                  >
                    No-show
                  </Button>
                  <Button variant="danger" onClick={() => void transition(selected, 'cancelled', { reason: 'Cancelled by staff' })}>
                    Cancel
                  </Button>
                </>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusPill status={selected.status} />
              <StatusPill status={selected.paymentStatus} />
              <span className="chip bg-ink-100 text-ink-500">{selected.bookingSource.replace('_', ' ')}</span>
            </div>
            <div className="space-y-2 text-[13px]">
              <Row label="Customer" value={selected.customerName} />
              <Row label="Phone" value={selected.customerPhone} />
              <Row label="Stylist" value={selected.staffName ?? 'Any available'} />
              <Row label="Duration" value={formatDuration(selected.durationMinutes)} />
              <Row label="Branch" value={branchesData?.branches.find((b) => b.id === selected.branchId)?.name ?? '—'} />
            </div>
            <div className="rounded-xl border border-ink-100 p-4">
              <p className="mb-2 text-[13px] font-semibold text-ink-800">Services</p>
              {selected.services.map((s) => (
                <div key={s.serviceId} className="flex justify-between py-1 text-[13px]">
                  <span className="text-ink-500">{s.name}</span>
                  <span className="text-ink-800">{formatMoney(s.price)}</span>
                </div>
              ))}
              <div className="mt-2 space-y-1 border-t border-ink-100 pt-2">
                <Row label="Subtotal" value={formatMoney(selected.subtotal)} />
                {selected.discount ? <Row label="Discount" value={`− ${formatMoney(selected.discount)}`} /> : null}
                <Row label="Total" value={formatMoney(selected.totalAmount)} />
                <Row label="Paid" value={formatMoney(selected.paidAmount)} />
              </div>
            </div>
            {selected.notes ? <Alert tone="info" title="Note">{selected.notes}</Alert> : null}
          </div>
        ) : null}
      </Drawer>

      {/* Complete + payment modal */}
      <Modal
        open={Boolean(completeTarget)}
        onClose={() => setCompleteTarget(null)}
        title="Complete appointment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCompleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={setStatus.isPending}
              onClick={async () => {
                if (!completeTarget) return;
                await transition(completeTarget, 'completed', { paymentMethod });
                setCompleteTarget(null);
              }}
            >
              Mark completed
            </Button>
          </>
        }
      >
        {completeTarget ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-ink-100 p-4 text-[13px]">
              <Row label="Customer" value={completeTarget.customerName} />
              <Row label="Amount due" value={formatMoney(completeTarget.totalAmount - completeTarget.paidAmount)} />
            </div>
            <Field label="Payment method taken now">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="wallet">Wallet (prepaid credit)</option>
                <option value="cash">Cash</option>
                <option value="upi_card">UPI / Card (at salon)</option>
                <option value="online">Online (Razorpay link)</option>
                <option value="pay_at_salon">Pay at salon (unsettled)</option>
              </Select>
            </Field>
            <Alert tone="info">
              Completing writes the service record, updates the customer's spend and loyalty, and qualifies any referral
              reward only when the visit is genuinely paid.
            </Alert>
          </div>
        ) : null}
      </Modal>

      <WalkInDrawer
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        branches={branchesData?.branches ?? []}
        onCreated={() => {
          refetch();
          setWalkInOpen(false);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Walk-in creation                                                    */
/* ------------------------------------------------------------------ */

function WalkInDrawer({
  open,
  onClose,
  branches,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [branchId, setBranchId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string>('');
  const [date, setDate] = useState(isoDate());
  const [startTime, setStartTime] = useState('');
  const [slots, setSlots] = useState<{ startTime: string; staffName: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ customerId: string; name: string; phone: string }[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const { data: servicesData } = useApi<{ services: Service[] }>(open ? '/admin/services' : null);
  const { data: staffData } = useApi<{ staff: { id: string; name: string; designation: string }[] }>(
    open && branchId ? `/catalog/staff?branchId=${branchId}` : null,
  );

  useEffect(() => {
    if (branches.length && !branchId) setBranchId(branches[0]!.id);
  }, [branches, branchId]);

  const services = (servicesData?.services ?? []).filter((s) => s.active);
  const totalDuration = services.filter((s) => serviceIds.includes(s.id)).reduce((sum, s) => sum + s.durationMinutes, 0);
  const subtotal = services.filter((s) => serviceIds.includes(s.id)).reduce((sum, s) => sum + s.price, 0);

  const loadSlots = async (nextDate = date, nextBranch = branchId) => {
    if (!nextBranch || !serviceIds.length) return;
    setSlotsLoading(true);
    try {
      const params = new URLSearchParams({ branchId: nextBranch, date: nextDate, serviceIds: serviceIds.join(',') });
      if (staffId) params.set('staffId', staffId);
      const result = await api<{ slots: { startTime: string; staffName: string }[]; closed?: boolean; reason?: string }>(
        `/catalog/availability?${params.toString()}`,
      );
      setSlots(result.slots ?? []);
      if (!result.slots?.length) toast.info('No free slots', result.reason ?? 'Try another stylist or date.');
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (open && branchId && serviceIds.length && startTime === '') void loadSlots(date, branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchId, serviceIds.length]);

  const create = useApiMutation<Record<string, unknown>, { appointment: Appointment }>('POST', '/admin/appointments', {
    onSuccess: () => {
      toast.success('Walk-in booked');
      onCreated();
      setServiceIds([]);
      setStartTime('');
      setName('');
      setPhone('');
      setCustomerId(null);
      setSearch('');
      setResults([]);
    },
  });

  const runSearch = async (term: string) => {
    setSearch(term);
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const result = await api<{ customers: { customerId: string; name: string; phone: string }[] }>(
        `/admin/customers?search=${encodeURIComponent(term.trim())}`,
      );
      setResults(result.customers.slice(0, 5));
    } catch {
      setResults([]);
    }
  };

  const canSubmit = branchId && serviceIds.length && startTime && (customerId || (name.trim() && phone.replace(/\D/g, '').length >= 10));

  return (
    <Drawer open={open} onClose={onClose} title="New walk-in" subtitle="Book a customer in at the desk" width="max-w-xl">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch">
            <Select value={branchId} onChange={(e) => { setBranchId(e.target.value); setStartTime(''); setSlots([]); }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={date}
              min={isoDate()}
              onChange={(e) => {
                setDate(e.target.value);
                setStartTime('');
                void loadSlots(e.target.value, branchId);
              }}
            />
          </Field>
        </div>

        <div>
          <p className="label">Services ({totalDuration ? `${totalDuration} min` : 'none selected'})</p>
          <div className="flex flex-wrap gap-1.5">
            {services.map((service) => {
              const active = serviceIds.includes(service.id);
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => {
                    const next = active ? serviceIds.filter((id) => id !== service.id) : [...serviceIds, service.id];
                    setServiceIds(next);
                    setStartTime('');
                    if (next.length && branchId) setTimeout(() => void loadSlots(date, branchId), 0);
                  }}
                  className={`chip border ${
                    active ? 'border-brand-400 bg-brand-100 text-brand-700' : 'border-ink-100 bg-white text-ink-600 hover:border-ink-200'
                  }`}
                >
                  {service.imageEmoji} {service.name} · {formatMoney(service.price)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred stylist">
            <Select
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
                setStartTime('');
                void loadSlots(date, branchId);
              }}
            >
              <option value="">Any available</option>
              {(staffData?.staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.designation}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimate">
            <div className="field flex items-center justify-between bg-ink-50 text-ink-700">
              <span>{formatDuration(totalDuration || 0)}</span>
              <span className="font-semibold">{formatMoney(subtotal)}</span>
            </div>
          </Field>
        </div>

        <div>
          <p className="label">Available slots</p>
          {slotsLoading ? (
            <LoadingBlock rows={2} />
          ) : slots.length === 0 ? (
            <Alert tone="warn">Pick services and a date to see free slots.</Alert>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.slice(0, 24).map((slot) => (
                <button
                  key={`${slot.startTime}-${slot.staffName}`}
                  type="button"
                  onClick={() => {
                    setStartTime(slot.startTime);
                    if (!staffId) {
                      const match = (staffData?.staff ?? []).find((s) => s.name === slot.staffName);
                      if (match) setStaffId(match.id);
                    }
                  }}
                  className={`rounded-xl border px-2 py-2.5 text-center text-[13px] font-semibold transition ${
                    startTime === slot.startTime
                      ? 'border-brand-400 bg-brand-100 text-brand-700'
                      : 'border-ink-100 text-ink-700 hover:border-brand-300'
                  }`}
                >
                  {formatTime12(slot.startTime)}
                  <span className="mt-0.5 block truncate text-[10px] font-normal opacity-70">{slot.staffName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-ink-100 p-4">
          <p className="mb-3 text-[13px] font-semibold text-ink-800">Customer</p>
          <Field label="Find an existing customer" hint="Search by name or phone. Leave blank to register a new walk-in.">
            <div className="relative">
              <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => void runSearch(e.target.value)}
                placeholder="Priya or 97000…"
              />
            </div>
          </Field>
          {results.length ? (
            <div className="mt-2 space-y-1">
              {results.map((customer) => (
                <button
                  key={customer.customerId}
                  type="button"
                  onClick={() => {
                    setCustomerId(customer.customerId);
                    setName(customer.name);
                    setPhone(customer.phone);
                    setResults([]);
                    setSearch(customer.name);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] ${
                    customerId === customer.customerId ? 'border-brand-400 bg-brand-100' : 'border-ink-100 hover:bg-ink-50'
                  }`}
                >
                  <span className="font-medium text-ink-800">{customer.name}</span>
                  <span className="text-ink-400">{customer.phone}</span>
                </button>
              ))}
            </div>
          ) : null}
          {customerId ? (
            <p className="mt-2 text-[12px] text-mint-500">Linked to an existing customer.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))} placeholder="10-digit number" inputMode="numeric" />
              </Field>
            </div>
          )}
        </div>

        <Button
          variant="brand"
          size="lg"
          className="w-full"
          loading={create.isPending}
          disabled={!canSubmit}
          onClick={async () => {
            try {
              await create.mutateAsync({
                customerId: customerId ?? undefined,
                customerName: customerId ? undefined : name.trim(),
                customerPhone: customerId ? undefined : phone,
                branchId,
                serviceIds,
                staffId: staffId || null,
                date,
                startTime,
                paymentPreference: 'pay_at_salon',
                idempotencyKey: `walkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              } as never);
            } catch (err) {
              toast.error('Could not book the walk-in', err instanceof Error ? err.message : undefined);
            }
          }}
        >
          <IconCalendar size={16} /> Book walk-in {startTime ? `at ${formatTime12(startTime)}` : ''}
        </Button>
      </div>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12.5px] text-ink-400">{label}</span>
      <span className="text-right text-[13px] text-ink-700">{value}</span>
    </div>
  );
}
