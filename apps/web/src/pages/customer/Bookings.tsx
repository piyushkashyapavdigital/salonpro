import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDays,
  formatDate,
  formatDateLong,
  formatDuration,
  formatMoney,
  formatTime12,
  isoDate,
  type Appointment,
} from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { Alert, Button, Card, Drawer, EmptyState, Field, Input, LoadingBlock, Modal, StatusPill, Tabs } from '../../components/ui';

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export default function Bookings() {
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<FilterId>('upcoming');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(addDays(isoDate(), 1));
  const [slots, setSlots] = useState<{ startTime: string; endTime: string; staffId: string; staffName: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading, refetch } = useApi<{ appointments: Appointment[] }>('/customer/bookings');

  const cancel = useApiMutation<Record<string, unknown>, { appointment: Appointment }>(
    'POST',
    (body) => `/customer/bookings/${body.id}/cancel`,
    { invalidate: () => ['/customer/bookings', '/customer/home'] },
  );

  const reschedule = useApiMutation<Record<string, unknown>, { appointment: Appointment }>(
    'POST',
    (body) => `/customer/bookings/${body.id}/reschedule`,
    { invalidate: () => ['/customer/bookings', '/customer/home'] },
  );

  const today = isoDate();
  const all = data?.appointments ?? [];
  const filtered = all.filter((appointment) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return ['booked', 'confirmed', 'checked_in', 'in_progress'].includes(appointment.status) && appointment.date >= today;
    if (filter === 'completed') return appointment.status === 'completed';
    return ['cancelled', 'no_show'].includes(appointment.status);
  });

  const loadSlots = async (appointment: Appointment, date: string) => {
    setSlotsLoading(true);
    try {
      const result = await fetch(
        `/api/catalog/availability?branchId=${appointment.branchId}&date=${date}&serviceIds=${appointment.services
          .map((s) => s.serviceId)
          .join(',')}${appointment.staffId ? `&staffId=${appointment.staffId}` : ''}`,
        { headers: { authorization: `Bearer ${localStorage.getItem('salonpro.token')}` } },
      ).then((r) => r.json());
      setSlots(result.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[24px] text-ink-900">My appointments</h1>
          <p className="mt-1 text-[13px] text-ink-400">Manage, reschedule or cancel your bookings.</p>
        </div>
        <Button variant="brand" size="sm" onClick={() => navigate('/app/book')}>
          New booking
        </Button>
      </div>

      <Tabs value={filter} onChange={setFilter} tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))} />

      {isLoading ? (
        <LoadingBlock rows={4} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="📅"
            title={filter === 'upcoming' ? 'No upcoming appointments' : 'Nothing in this list'}
            description="When you book a service it will appear here with its live status."
            action={
              <Button variant="brand" onClick={() => navigate('/app/book')}>
                Book an appointment
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((appointment) => (
            <Card key={appointment.id} className="animate-fade-up overflow-hidden">
              <button className="w-full p-4 text-left" onClick={() => setSelected(appointment)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-semibold text-ink-900">
                      {appointment.services.map((s) => s.name).join(' + ')}
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink-400">
                      {formatDate(appointment.date, { weekday: 'short' })} · {formatTime12(appointment.startTime)} ·{' '}
                      {formatDuration(appointment.durationMinutes)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-400">
                      {appointment.staffName ?? 'Any stylist'} · {formatMoney(appointment.totalAmount)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusPill status={appointment.status} />
                    <StatusPill status={appointment.paymentStatus} />
                  </div>
                </div>
              </button>
              {['booked', 'confirmed'].includes(appointment.status) && appointment.date >= today ? (
                <div className="flex border-t border-ink-100">
                  <button
                    className="flex-1 py-2.5 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
                    onClick={() => {
                      setSelected(appointment);
                      setRescheduleDate(addDays(appointment.date, 1));
                      setRescheduleOpen(true);
                      void loadSlots(appointment, addDays(appointment.date, 1));
                    }}
                  >
                    Reschedule
                  </button>
                  <button
                    className="flex-1 border-l border-ink-100 py-2.5 text-[13px] font-medium text-rose-500 hover:bg-rose-100/50"
                    onClick={() => {
                      setSelected(appointment);
                      setCancelOpen(true);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Drawer
        open={Boolean(selected) && !rescheduleOpen && !cancelOpen}
        onClose={() => setSelected(null)}
        title="Appointment details"
        subtitle={selected ? `Reference SP-${selected.id.slice(0, 6).toUpperCase()}` : undefined}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <Row label="Status" value={<StatusPill status={selected.status} />} />
              <Row label="Payment" value={<StatusPill status={selected.paymentStatus} />} />
              <Row label="When" value={`${formatDateLong(selected.date)} · ${formatTime12(selected.startTime)}`} />
              <Row label="Duration" value={formatDuration(selected.durationMinutes)} />
              <Row label="Stylist" value={selected.staffName ?? 'Any available'} />
              <Row label="Booked via" value={selected.bookingSource.replace('_', ' ')} />
            </div>
            <div className="rounded-xl border border-ink-100 p-4">
              <p className="mb-2 text-[13px] font-semibold text-ink-800">Services</p>
              {selected.services.map((s) => (
                <div key={s.serviceId} className="flex justify-between py-1 text-[13px]">
                  <span className="text-ink-500">{s.name}</span>
                  <span className="text-ink-800">{formatMoney(s.price)}</span>
                </div>
              ))}
              <div className="mt-2 border-t border-ink-100 pt-2">
                <Row label="Subtotal" value={formatMoney(selected.subtotal)} />
                {selected.discount ? <Row label="Discount" value={`− ${formatMoney(selected.discount)}`} /> : null}
                <Row label="Total" value={formatMoney(selected.totalAmount)} />
                <Row label="Paid" value={formatMoney(selected.paidAmount)} />
              </div>
            </div>
            {selected.notes ? (
              <Alert tone="info" title="Your note">
                {selected.notes}
              </Alert>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      {/* Reschedule */}
      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reschedule appointment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRescheduleOpen(false)}>
              Keep current
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New date">
            <Input
              type="date"
              value={rescheduleDate}
              min={isoDate()}
              onChange={(e) => {
                setRescheduleDate(e.target.value);
                if (selected) void loadSlots(selected, e.target.value);
              }}
            />
          </Field>
          {slotsLoading ? (
            <LoadingBlock rows={2} />
          ) : slots.length === 0 ? (
            <Alert tone="warn">No free slots for that date. Try another day.</Alert>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.slice(0, 18).map((slot) => (
                <button
                  key={`${slot.startTime}-${slot.staffId}`}
                  className="rounded-xl border border-ink-100 px-2 py-2.5 text-center text-[13px] font-semibold hover:border-brand-400"
                  onClick={async () => {
                    if (!selected) return;
                    await reschedule.mutateAsync({
                      id: selected.id,
                      date: rescheduleDate,
                      startTime: slot.startTime,
                      staffId: slot.staffId,
                    });
                    toast.success('Appointment moved', `${formatDate(rescheduleDate)} at ${formatTime12(slot.startTime)}.`);
                    setRescheduleOpen(false);
                    setSelected(null);
                    refetch();
                  }}
                >
                  {formatTime12(slot.startTime)}
                  <span className="mt-0.5 block truncate text-[10px] font-normal opacity-70">{slot.staffName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Cancel */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this appointment?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={async () => {
                if (!selected) return;
                await cancel.mutateAsync({ id: selected.id, reason: cancelReason || 'Cancelled by customer' });
                toast.success('Appointment cancelled');
                setCancelOpen(false);
                setSelected(null);
                refetch();
              }}
            >
              Yes, cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warn" title="Refund policy">
            Wallet-funded bookings return to your wallet in full when cancelled more than 4 hours before the
            appointment. Promotional bonus returns as bonus, never as cash.
          </Alert>
          <Field label="Reason (optional)">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Plans changed" />
          </Field>
        </div>
      </Modal>
    </div>
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
