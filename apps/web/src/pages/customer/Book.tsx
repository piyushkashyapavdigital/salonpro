import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  addDays,
  formatDateLong,
  formatDuration,
  formatMoney,
  formatTime12,
  isoDate,
  weekdayIndex,
  type AvailabilityResponse,
  type AvailabilitySlot,
  type Appointment,
  type Branch,
  type Service,
  type Staff,
  type Wallet,
} from '@salonpro/shared';
import { useApi, useApiMutation, nextDays } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { Alert, Button, Card, EmptyState, Field, Input, LoadingBlock, Skeleton, StatusPill } from '../../components/ui';
import { IconArrowLeft, IconCheck, IconSparkle, IconWallet } from '../../components/icons';
import { api } from '../../lib/api';

type Step = 'branch' | 'services' | 'stylist' | 'slot' | 'review' | 'done';
type PaymentChoice = 'wallet' | 'online' | 'pay_at_salon';

interface OrderResponse {
  order: { id: string; razorpayOrderId: string; amount: number; status: string; mode: string };
  checkout: {
    provider: string;
    mode: string;
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    simulatedSignature?: string;
    simulatedPaymentId?: string;
  };
  offer: { payAmount: number; bonusAmount: number; totalValue: number; label: string };
}

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: 'branch', label: 'Branch' },
  { id: 'services', label: 'Services' },
  { id: 'stylist', label: 'Stylist' },
  { id: 'slot', label: 'Time' },
  { id: 'review', label: 'Confirm' },
];

export default function Book() {
  const navigate = useNavigate();
  const toast = useToast();
  const { wallet, refresh } = useAuth();
  const [params] = useSearchParams();

  const [step, setStep] = useState<Step>('branch');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>(() => {
    const preset = params.get('service');
    return preset ? [preset] : [];
  });
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(addDays(isoDate(), 1));
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; description: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('wallet');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);
  const [idempotencyKey] = useState(() => `book_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);

  const branchesQuery = useApi<{ branches: Branch[] }>('/catalog/branches');
  const servicesQuery = useApi<{ services: Service[] }>('/catalog/services');
  const staffQuery = useApi<{ staff: Staff[] }>(branchId ? `/catalog/staff?branchId=${branchId}` : null);
  const dayCount = 14;

  const chosenServices = useMemo(
    () => (servicesQuery.data?.services ?? []).filter((s) => serviceIds.includes(s.id)),
    [servicesQuery.data, serviceIds],
  );
  const subtotal = chosenServices.reduce((sum, s) => sum + s.price, 0);
  const duration = chosenServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const discount = appliedCoupon?.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  const availability = useApi<AvailabilityResponse & { services: Service[] }>(
    branchId && serviceIds.length && date
      ? `/catalog/availability?branchId=${branchId}&date=${date}&serviceIds=${serviceIds.join(',')}${
          staffId ? `&staffId=${staffId}` : ''
        }`
      : null,
  );

  useEffect(() => {
    setSlot(null);
  }, [date, staffId, serviceIds.join(','), branchId]);

  const createBooking = useApiMutation<
    Record<string, unknown>,
    { appointment: Appointment; walletDebit: number; wallet: Wallet }
  >('POST', '/customer/bookings', {
    invalidate: () => ['/customer/home', '/customer/bookings', '/customer/wallet'],
  });

  const createOnlineOrder = useApiMutation<Record<string, unknown>, OrderResponse>('POST', '/payments/orders');
  const verifyOnline = useApiMutation<Record<string, unknown>, { ok: boolean }>('POST', '/payments/verify');
  const simulatePay = useApiMutation<Record<string, unknown>, { ok: boolean; simulated?: boolean }>('POST', '/payments/simulate');

  const go = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const branch = branchesQuery.data?.branches.find((b) => b.id === branchId);

  const validateCoupon = async () => {
    setCouponError(null);
    try {
      const result = await api<{ code: string; discount: number; description: string }>('/catalog/coupons/validate', {
        method: 'POST',
        body: { code: couponCode.trim().toUpperCase(), amount: subtotal },
      });
      setAppliedCoupon(result);
      toast.success(`Coupon ${result.code} applied`, `You saved ${formatMoney(result.discount)}.`);
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : 'That coupon is not valid.');
    }
  };

  const confirm = async () => {
    if (!branchId || !slot) return;
    try {
      const result = await createBooking.mutateAsync({
        branchId,
        serviceIds,
        staffId: staffId ?? undefined,
        date,
        startTime: slot.startTime,
        couponCode: appliedCoupon?.code ?? undefined,
        notes: notes || undefined,
        paymentPreference: paymentChoice === 'wallet' ? 'wallet' : 'pay_at_salon',
        idempotencyKey,
      });

      if (paymentChoice === 'online') {
        const orderResult = await createOnlineOrder.mutateAsync({
          purpose: 'appointment',
          appointmentId: result.appointment.id,
        });
        if (orderResult.checkout.mode === 'simulated') {
          await simulatePay.mutateAsync({ razorpayOrderId: orderResult.checkout.orderId, outcome: 'success' });
        } else {
          await verifyOnline.mutateAsync({
            razorpayOrderId: orderResult.checkout.orderId,
            razorpayPaymentId: orderResult.checkout.simulatedPaymentId ?? 'pay_unknown',
            razorpaySignature: orderResult.checkout.simulatedSignature ?? '',
          });
        }
        toast.success('Online payment processed', 'Razorpay test mode — see the mode banner on the payments page.');
      } else if (paymentChoice === 'wallet') {
        toast.brand('Paid from wallet', `${formatMoney(result.walletDebit)} deducted.`);
      } else {
        toast.info('Booking confirmed', 'You can pay at the salon after your service.');
      }

      setConfirmed(result.appointment);
      await refresh();
      go('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not confirm the booking.';
      toast.error('Booking not confirmed', message);
      if (message.toLowerCase().includes('slot')) {
        availability.refetch();
        go('slot');
      }
    }
  };

  /* ---------------------------------------------------------------- */

  const header = (
    <div className="mb-5 flex items-center gap-3">
      {step !== 'branch' && step !== 'done' ? (
        <button
          className="btn-ghost btn-sm"
          onClick={() => {
            const order = STEP_LABELS.map((s) => s.id);
            const index = order.indexOf(step);
            go(order[Math.max(0, index - 1)]!);
          }}
        >
          <IconArrowLeft size={15} /> Back
        </button>
      ) : null}
      <div>
        <h1 className="font-display text-[23px] leading-tight text-ink-900">
          {step === 'done' ? 'Booking confirmed' : 'Book an appointment'}
        </h1>
        {step !== 'done' ? (
          <p className="mt-0.5 text-[12.5px] text-ink-400">
            Step {Math.max(1, STEP_LABELS.findIndex((s) => s.id === step) + 1)} of {STEP_LABELS.length}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (step === 'done' && confirmed) {
    return (
      <div className="space-y-5 px-4 py-6">
        <div className="flex flex-col items-center text-center animate-fade-up">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-2xl text-mint-500">
            <IconCheck size={30} />
          </span>
          <h1 className="mt-4 font-display text-[25px] text-ink-900">You're booked</h1>
          <p className="mt-1 text-[13.5px] text-ink-500">
            A confirmation is on its way. Reference{' '}
            <span className="font-semibold text-ink-800">SP-{confirmed.id.slice(0, 6).toUpperCase()}</span>
          </p>
        </div>

        <Card>
          <div className="space-y-3 p-5">
            <Row label="Branch" value={branch?.name ?? '—'} />
            <Row label="When" value={`${formatDateLong(confirmed.date)} · ${formatTime12(confirmed.startTime)}`} />
            <Row label="Services" value={confirmed.services.map((s) => s.name).join(', ')} />
            <Row label="Stylist" value={confirmed.staffName ?? 'Any available'} />
            <Row label="Duration" value={formatDuration(confirmed.durationMinutes)} />
            <div className="border-t border-ink-100 pt-3">
              <Row label="Subtotal" value={formatMoney(confirmed.subtotal)} />
              {confirmed.discount ? <Row label="Discount" value={`− ${formatMoney(confirmed.discount)}`} tone="mint" /> : null}
              <Row label="Total" value={formatMoney(confirmed.totalAmount)} strong />
            </div>
            <div className="flex gap-2">
              <StatusPill status={confirmed.status} />
              <StatusPill status={confirmed.paymentStatus} />
            </div>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button variant="brand" className="flex-1" onClick={() => navigate('/app/bookings')}>
            My bookings
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => navigate('/app')}>
            Back home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      {header}

      {/* Progress */}
      <div className="mb-5 flex items-center gap-1.5">
        {STEP_LABELS.map((s, i) => {
          const currentIndex = STEP_LABELS.findIndex((x) => x.id === step);
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'todo';
          return (
            <div key={s.id} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  state === 'done' ? 'bg-brand-500' : state === 'active' ? 'bg-ink-900' : 'bg-ink-100'
                }`}
              />
              <p className={`mt-1.5 text-[10.5px] font-medium ${state === 'todo' ? 'text-ink-300' : 'text-ink-600'}`}>
                {s.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Step: branch */}
      {step === 'branch' ? (
        <div className="space-y-3">
          {branchesQuery.isLoading ? (
            <LoadingBlock rows={3} />
          ) : (
            branchesQuery.data?.branches.map((b) => {
              const today = weekdayIndex(isoDate());
              const hours = b.openingHours[today];
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    setBranchId(b.id);
                    setStaffId(null);
                    go('services');
                  }}
                  className={`card w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift ${
                    branchId === b.id ? 'ring-2 ring-brand-400' : ''
                  }`}
                >
                  <p className="text-[15px] font-semibold text-ink-900">{b.name}</p>
                  <p className="mt-1 text-[12.5px] leading-snug text-ink-400">{b.address}</p>
                  <p className="mt-2 text-[12px] font-medium text-ink-500">
                    {hours?.closed ? 'Closed today' : `Open today ${hours?.open}–${hours?.close}`}
                  </p>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {/* Step: services */}
      {step === 'services' ? (
        <div className="space-y-4">
          <Alert tone="info">
            Combine as many services as you like — availability is calculated for the full duration.
          </Alert>
          <div className="space-y-2">
            {(servicesQuery.data?.services ?? []).map((service) => {
              const active = serviceIds.includes(service.id);
              return (
                <button
                  key={service.id}
                  onClick={() =>
                    setServiceIds((ids) => (ids.includes(service.id) ? ids.filter((x) => x !== service.id) : [...ids, service.id]))
                  }
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                    active ? 'border-brand-400 bg-brand-100/60' : 'border-ink-100 bg-white hover:border-ink-200'
                  }`}
                >
                  <span className="text-[20px]">{service.imageEmoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink-900">{service.name}</span>
                    <span className="block text-[12px] text-ink-400">
                      {formatDuration(service.durationMinutes)} · {formatMoney(service.price)}
                    </span>
                  </span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[12px] ${
                      active ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-200 text-transparent'
                    }`}
                  >
                    <IconCheck size={13} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sticky bottom-24 z-10">
            <Card className="flex items-center justify-between gap-3 p-4 shadow-lift">
              <div>
                <p className="text-[12px] text-ink-400">
                  {serviceIds.length} service{serviceIds.length === 1 ? '' : 's'} · {formatDuration(duration)}
                </p>
                <p className="font-display text-[20px] text-ink-900">{formatMoney(subtotal)}</p>
              </div>
              <Button variant="brand" disabled={!serviceIds.length} onClick={() => go('stylist')}>
                Choose stylist
              </Button>
            </Card>
          </div>
        </div>
      ) : null}

      {/* Step: stylist */}
      {step === 'stylist' ? (
        <div className="space-y-3">
          <button
            onClick={() => {
              setStaffId(null);
              go('slot');
            }}
            className={`card flex w-full items-center gap-3 p-4 text-left transition hover:shadow-lift ${
              staffId === null ? 'ring-2 ring-brand-400' : ''
            }`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <IconSparkle size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-[14.5px] font-semibold text-ink-900">Any available stylist</span>
              <span className="block text-[12px] text-ink-400">Widest choice of times — recommended</span>
            </span>
          </button>

          {staffQuery.isLoading ? (
            <LoadingBlock rows={3} />
          ) : (
            (staffQuery.data?.staff ?? []).map((member) => (
              <button
                key={member.id}
                onClick={() => {
                  setStaffId(member.id);
                  go('slot');
                }}
                className={`card flex w-full items-center gap-3 p-4 text-left transition hover:shadow-lift ${
                  staffId === member.id ? 'ring-2 ring-brand-400' : ''
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-[13px] font-semibold text-white">
                  {member.name
                    .split(' ')
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')}
                </span>
                <span className="flex-1">
                  <span className="block text-[14.5px] font-semibold text-ink-900">{member.name}</span>
                  <span className="block text-[12px] text-ink-400">{member.designation}</span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {/* Step: slot */}
      {step === 'slot' ? (
        <div className="space-y-4">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {nextDays(dayCount).map((d) => {
              const value = isoDate(d);
              const active = value === date;
              return (
                <button
                  key={value}
                  onClick={() => setDate(value)}
                  className={`w-[62px] shrink-0 rounded-xl border px-2 py-2.5 text-center transition ${
                    active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-100 bg-white text-ink-600 hover:border-ink-200'
                  }`}
                >
                  <span className="block text-[10.5px] uppercase tracking-wide opacity-70">
                    {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </span>
                  <span className="mt-0.5 block font-display text-[17px]">{d.getDate()}</span>
                  <span className="block text-[10px] opacity-70">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                </button>
              );
            })}
          </div>

          {availability.isLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : availability.data?.closed ? (
            <Card>
              <EmptyState
                icon="🚪"
                title={`Closed on ${formatDateLong(date)}`}
                description={availability.data.reason ?? 'That branch is closed on this day. Try another date.'}
              />
            </Card>
          ) : availability.data && availability.data.slots.length === 0 ? (
            <Card>
              <EmptyState
                icon="⏳"
                title="No free slots for this selection"
                description={
                  staffId
                    ? 'That stylist is fully booked. Try another stylist or date.'
                    : 'Try another date — or shorten your service selection.'
                }
                action={
                  <Button variant="ghost" onClick={() => setDate(addDays(date, 1))}>
                    Next day
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-ink-500">
                  {availability.data?.slots.length ?? 0} slots for {formatDuration(duration)}
                </p>
                <p className="text-[12px] text-ink-400">{formatDateLong(date)}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {availability.data?.slots.map((candidate) => {
                  const active = slot?.startTime === candidate.startTime && slot?.staffId === candidate.staffId;
                  return (
                    <button
                      key={`${candidate.startTime}-${candidate.staffId}`}
                      onClick={() => setSlot(candidate)}
                      className={`rounded-xl border px-2 py-2.5 text-center transition ${
                        active ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-100 bg-white hover:border-brand-300'
                      }`}
                    >
                      <span className="block text-[13.5px] font-semibold">{formatTime12(candidate.startTime)}</span>
                      <span className="mt-0.5 block truncate text-[10.5px] opacity-70">{candidate.staffName}</span>
                    </button>
                  );
                })}
              </div>
              <div className="sticky bottom-24">
                <Card className="flex items-center justify-between gap-3 p-4 shadow-lift">
                  <div>
                    <p className="text-[12px] text-ink-400">
                      {slot ? `${formatTime12(slot.startTime)} · ${slot.staffName}` : 'Pick a time'}
                    </p>
                    <p className="font-display text-[20px] text-ink-900">{formatMoney(subtotal)}</p>
                  </div>
                  <Button variant="brand" disabled={!slot} onClick={() => go('review')}>
                    Review booking
                  </Button>
                </Card>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Step: review */}
      {step === 'review' ? (
        <div className="space-y-4">
          <Card>
            <div className="space-y-3 p-5">
              <Row label="Branch" value={branch?.name ?? '—'} />
              <Row label="When" value={`${formatDateLong(date)} · ${slot ? formatTime12(slot.startTime) : ''}`} />
              <Row label="Stylist" value={slot?.staffName ?? 'Any available'} />
              <Row label="Duration" value={formatDuration(duration)} />
            </div>
            <div className="border-t border-ink-100 px-5 py-4">
              {chosenServices.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1 text-[13px]">
                  <span className="text-ink-600">{s.name}</span>
                  <span className="font-medium text-ink-800">{formatMoney(s.price)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <Field label="Have a coupon?" hint="Try WELCOME20, GLOW150 or SPA10.">
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Enter code"
                  className="flex-1 uppercase tracking-wide"
                />
                <Button variant="ghost" onClick={validateCoupon} disabled={!couponCode.trim()}>
                  Apply
                </Button>
              </div>
            </Field>
            {couponError ? <p className="mt-2 text-[12px] font-medium text-rose-500">{couponError}</p> : null}
            {appliedCoupon ? (
              <p className="mt-2 text-[12px] font-medium text-mint-500">
                {appliedCoupon.code} applied — {appliedCoupon.description}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13.5px] font-semibold text-ink-800">How would you like to pay?</p>
            <div className="space-y-2">
              {(
                [
                  {
                    id: 'wallet' as const,
                    icon: <IconWallet size={17} />,
                    title: 'SalonPro wallet',
                    body: wallet
                      ? `${formatMoney(wallet.totalBalance)} available (bonus ${formatMoney(wallet.bonusBalance)} spent first)`
                      : 'Prepaid balance',
                    disabled: Boolean(wallet && wallet.totalBalance < total),
                  },
                  {
                    id: 'online' as const,
                    icon: <span className="text-[15px]">💳</span>,
                    title: 'Pay online now',
                    body: 'Razorpay — test mode until live keys are configured',
                    disabled: false,
                  },
                  {
                    id: 'pay_at_salon' as const,
                    icon: <span className="text-[15px]">🏪</span>,
                    title: 'Pay at the salon',
                    body: 'Settle after your service by cash, card or UPI',
                    disabled: false,
                  },
                ]
              ).map((option) => (
                <button
                  key={option.id}
                  disabled={option.disabled}
                  onClick={() => setPaymentChoice(option.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                    paymentChoice === option.id ? 'border-brand-400 bg-brand-100/60' : 'border-ink-100 hover:border-ink-200'
                  }`}
                >
                  <span className="mt-0.5 text-ink-500">{option.icon}</span>
                  <span className="flex-1">
                    <span className="block text-[13.5px] font-medium text-ink-900">{option.title}</span>
                    <span className="block text-[12px] leading-snug text-ink-400">{option.body}</span>
                  </span>
                  <span
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                      paymentChoice === option.id ? 'border-[5px] border-brand-500' : 'border-ink-200'
                    }`}
                  />
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <Field label="Notes for the salon (optional)">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. allergic to almond oil" />
            </Field>
          </Card>

          <Card className="p-5">
            <div className="space-y-1.5">
              <Row label="Subtotal" value={formatMoney(subtotal)} />
              {discount ? <Row label="Coupon discount" value={`− ${formatMoney(discount)}`} tone="mint" /> : null}
              <Row label="Total payable" value={formatMoney(total)} strong />
            </div>
          </Card>

          <Button
            variant="brand"
            size="lg"
            className="w-full"
            loading={createBooking.isPending || createOnlineOrder.isPending || simulatePay.isPending || verifyOnline.isPending}
            onClick={confirm}
          >
            Confirm booking
          </Button>
          <p className="pb-2 text-center text-[11.5px] leading-snug text-ink-400">
            Your slot is re-checked on the server at confirmation. If it was taken in the meantime you will be asked to
            pick another time — no charge is made.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'mint';
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[12.5px] text-ink-400">{label}</span>
      <span
        className={`text-right text-[13px] ${strong ? 'font-semibold text-ink-900' : 'text-ink-700'} ${
          tone === 'mint' ? '!text-mint-500' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
