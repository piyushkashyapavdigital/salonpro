import { useState } from 'react';
import { formatDate, formatMoney, isoDate, type DayHours } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
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
  Table,
  Td,
} from '../../components/ui';
import { IconCalendar, IconPlus } from '../../components/icons';

interface Branch {
  id: string;
  name: string;
  address: string;
  contact: string | null;
  status: string;
  openingHours: Record<number, DayHours>;
  staffCount: number;
  holidays: { id: string; date: string; reason: string | null }[];
  revenue: number;
  customers: number;
  appointments: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface BranchDraft {
  id?: string;
  name: string;
  address: string;
  contact: string;
  status: string;
  hours: Record<number, DayHours>;
}

function defaultHours(): Record<number, DayHours> {
  const out: Record<number, DayHours> = {};
  for (let d = 0; d < 7; d++) out[d] = { closed: d === 0, open: '09:00', close: '21:00' };
  return out;
}

export default function BranchesAdmin() {
  const toast = useToast();
  const [draft, setDraft] = useState<BranchDraft | null>(null);
  const [holidayBranch, setHolidayBranch] = useState<Branch | null>(null);
  const [holidayDate, setHolidayDate] = useState(isoDate());
  const [holidayReason, setHolidayReason] = useState('');

  const { data, isLoading, refetch } = useApi<{ branches: Branch[] }>('/admin/branches');

  const saveBranch = useApiMutation<Record<string, unknown>, { branch: Branch }>(
    'POST',
    (body) => (body.id ? `/admin/branches/${body.id}` : '/admin/branches'),
    {
      onSuccess: () => {
        toast.success('Branch saved');
        setDraft(null);
        refetch();
      },
    },
  );

  const addHoliday = useApiMutation<Record<string, unknown>, { ok: boolean }>(
    'POST',
    (body) => `/admin/branches/${(body as { branchId: string }).branchId}/holidays`,
    {
      onSuccess: () => {
        toast.success('Holiday added');
        setHolidayBranch(null);
        setHolidayReason('');
        refetch();
      },
    },
  );

  const branches = data?.branches ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Branches</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">Locations, opening hours, holidays and per-branch performance.</p>
        </div>
        <Button
          variant="brand"
          onClick={() => setDraft({ name: '', address: '', contact: '', status: 'active', hours: defaultHours() })}
        >
          <IconPlus size={15} /> New branch
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Branches" value={branches.length} />
        <Stat label="Active" value={branches.filter((b) => b.status === 'active').length} />
        <Stat label="Total staff" value={branches.reduce((s, b) => s + b.staffCount, 0)} />
        <Stat tone="brand" label="Lifetime revenue" value={formatMoney(branches.reduce((s, b) => s + b.revenue, 0))} />
      </div>

      {isLoading ? (
        <LoadingBlock rows={4} />
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState icon="🏬" title="No branches yet" description="Create your first branch to start scheduling." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {branches.map((branch) => {
            const openDays = Object.values(branch.openingHours).filter((h) => !h.closed);
            const sample = openDays[0];
            return (
              <Card key={branch.id}>
                <CardHeader
                  title={branch.name}
                  subtitle={branch.address}
                  action={branch.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
                />
                <div className="grid grid-cols-3 divide-x divide-ink-100 border-b border-ink-100">
                  <div className="p-3 text-center">
                    <p className="text-[16px] font-semibold text-ink-900">{branch.customers}</p>
                    <p className="text-[10.5px] uppercase tracking-wide text-ink-400">Customers</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[16px] font-semibold text-ink-900">{branch.appointments}</p>
                    <p className="text-[10.5px] uppercase tracking-wide text-ink-400">Bookings</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[16px] font-semibold text-ink-900">{formatMoney(branch.revenue)}</p>
                    <p className="text-[10.5px] uppercase tracking-wide text-ink-400">Revenue</p>
                  </div>
                </div>
                <div className="space-y-1.5 px-4 py-3 text-[12.5px] text-ink-500">
                  <p>
                    {branch.staffCount} staff · {branch.contact ?? 'no contact'} · opens {sample ? `${sample.open}–${sample.close}` : '—'}
                  </p>
                  <p>
                    Holidays:{' '}
                    {branch.holidays.length
                      ? branch.holidays
                          .slice(0, 4)
                          .map((h) => formatDate(h.date))
                          .join(', ')
                      : 'none scheduled'}
                  </p>
                </div>
                <div className="flex gap-2 border-t border-ink-100 px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: branch.id,
                        name: branch.name,
                        address: branch.address,
                        contact: branch.contact ?? '',
                        status: branch.status,
                        hours: { ...defaultHours(), ...branch.openingHours },
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setHolidayBranch(branch); setHolidayDate(isoDate()); }}>
                    <IconCalendar size={14} /> Add holiday
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Branch editor */}
      <Drawer open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? 'Edit branch' : 'New branch'} width="max-w-xl">
        {draft ? (
          <div className="space-y-4">
            <Field label="Branch name">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="SalonPro Indiranagar" />
            </Field>
            <Field label="Address">
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="100 Feet Road, Bengaluru" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact">
                <Input value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} placeholder="+91 80 4000 0000" />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </div>

            <div>
              <p className="label">Opening hours</p>
              <div className="space-y-2">
                {DAYS.map((day, index) => {
                  const hours = draft.hours[index] ?? { closed: false, open: '09:00', close: '21:00' };
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <span className="w-9 text-[12.5px] font-medium text-ink-500">{day}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, hours: { ...draft.hours, [index]: { ...hours, closed: !hours.closed } } })
                        }
                        className={`chip ${hours.closed ? 'bg-ink-100 text-ink-400' : 'bg-mint-100 text-mint-500'}`}
                      >
                        {hours.closed ? 'Closed' : 'Open'}
                      </button>
                      <Input
                        type="time"
                        className="w-auto py-1.5"
                        value={hours.open}
                        disabled={hours.closed}
                        onChange={(e) => setDraft({ ...draft, hours: { ...draft.hours, [index]: { ...hours, open: e.target.value } } })}
                      />
                      <span className="text-ink-300">–</span>
                      <Input
                        type="time"
                        className="w-auto py-1.5"
                        value={hours.close}
                        disabled={hours.closed}
                        onChange={(e) => setDraft({ ...draft, hours: { ...draft.hours, [index]: { ...hours, close: e.target.value } } })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Button
              variant="brand"
              size="lg"
              className="w-full"
              loading={saveBranch.isPending}
              disabled={draft.name.trim().length < 2 || draft.address.trim().length < 4}
              onClick={async () => {
                try {
                  await saveBranch.mutateAsync({
                    id: draft.id,
                    name: draft.name.trim(),
                    address: draft.address.trim(),
                    contact: draft.contact.trim() || null,
                    status: draft.status,
                    openingHours: draft.hours,
                  } as never);
                } catch (err) {
                  toast.error('Could not save the branch', err instanceof Error ? err.message : undefined);
                }
              }}
            >
              {draft.id ? 'Save changes' : 'Create branch'}
            </Button>
          </div>
        ) : null}
      </Drawer>

      {/* Holiday drawer */}
      <Drawer
        open={Boolean(holidayBranch)}
        onClose={() => setHolidayBranch(null)}
        title={`Add holiday · ${holidayBranch?.name ?? ''}`}
        subtitle="The branch cannot be booked on a holiday"
      >
        <div className="space-y-4">
          <Field label="Date">
            <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
          </Field>
          <Field label="Reason (optional)">
            <Input value={holidayReason} onChange={(e) => setHolidayReason(e.target.value)} placeholder="Diwali" />
          </Field>
          <Button
            variant="brand"
            className="w-full"
            loading={addHoliday.isPending}
            onClick={async () => {
              try {
                await addHoliday.mutateAsync({ branchId: holidayBranch?.id, date: holidayDate, reason: holidayReason || undefined } as never);
              } catch (err) {
                toast.error('Could not add the holiday', err instanceof Error ? err.message : undefined);
              }
            }}
          >
            Add holiday
          </Button>
          {holidayBranch?.holidays.length ? (
            <Table head={['Date', 'Reason', '']}>
              {holidayBranch.holidays.map((holiday) => (
                <tr key={holiday.id}>
                  <Td className="whitespace-nowrap">{formatDate(holiday.date)}</Td>
                  <Td>{holiday.reason ?? '—'}</Td>
                  <Td>
                    <Badge tone="muted">Scheduled</Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
