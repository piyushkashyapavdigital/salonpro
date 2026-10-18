import { useState } from 'react';
import { formatDate, formatMoney, isoDate } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import {
  Avatar,
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
  Table,
  Td,
} from '../../components/ui';
import { IconPlus } from '../../components/icons';

interface StaffRow {
  id: string;
  branchId: string;
  userId: string;
  designation: string;
  status: string;
  name: string;
  phone: string;
  email: string | null;
  branchName: string;
  commissionRules: { serviceBps: number; productBps: number };
  attendance: { date: string; status: string; checkInAt: string | null; checkOutAt: string | null }[];
  stats: { services: number; revenue: number; upcoming: number };
}

interface Branch {
  id: string;
  name: string;
}

const ATTENDANCE = ['present', 'absent', 'leave', 'half_day'] as const;

interface StaffDraft {
  id?: string;
  name: string;
  phone: string;
  designation: string;
  branchId: string;
  status: string;
  serviceBps: string;
  productBps: string;
}

const EMPTY: StaffDraft = {
  name: '',
  phone: '',
  designation: '',
  branchId: '',
  status: 'active',
  serviceBps: '8',
  productBps: '3',
};

export default function StaffAdmin() {
  const toast = useToast();
  const [draft, setDraft] = useState<StaffDraft | null>(null);
  const { data, isLoading, refetch } = useApi<{ staff: StaffRow[] }>('/admin/staff');
  const branches = useApi<{ branches: Branch[] }>('/admin/branches');

  const saveStaff = useApiMutation<Record<string, unknown>, { staffId?: string; staff?: StaffRow }>(
    'POST',
    (body) => (body.id ? `/admin/staff/${body.id}` : '/admin/staff'),
    {
      onSuccess: () => {
        toast.success('Staff saved');
        setDraft(null);
        refetch();
      },
    },
  );

  const markAttendance = useApiMutation<Record<string, unknown>, { ok: boolean }>('POST', (body) => `/admin/staff/${(body as { staffId: string }).staffId}/attendance`, {
    onSuccess: () => {
      toast.success('Attendance updated');
      refetch();
    },
  });

  const staff = data?.staff ?? [];
  const totalRevenue = staff.reduce((s, x) => s + x.stats.revenue, 0);

  const submit = async (d: StaffDraft) => {
    const payload: Record<string, unknown> = {
      id: d.id,
      designation: d.designation.trim(),
      branchId: d.branchId,
      status: d.status,
      commissionRules: {
        serviceBps: Math.round(Number(d.serviceBps || 0) * 100),
        productBps: Math.round(Number(d.productBps || 0) * 100),
      },
    };
    if (!d.id) {
      payload.name = d.name.trim();
      payload.phone = d.phone.replace(/\D/g, '');
    }
    try {
      await saveStaff.mutateAsync(payload as never);
    } catch (err) {
      toast.error('Could not save staff member', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Staff</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">Roster, commissions, performance and daily attendance.</p>
        </div>
        <Button
          variant="brand"
          onClick={() => setDraft({ ...EMPTY, branchId: branches.data?.branches[0]?.id ?? '' })}
        >
          <IconPlus size={15} /> Add staff
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Team members" value={staff.length} />
        <Stat label="Active" value={staff.filter((s) => s.status === 'active').length} />
        <Stat label="Upcoming appointments" value={staff.reduce((s, x) => s + x.stats.upcoming, 0)} />
        <Stat tone="brand" label="Lifetime service revenue" value={formatMoney(totalRevenue)} />
      </div>

      {isLoading ? (
        <LoadingBlock rows={5} />
      ) : staff.length === 0 ? (
        <Card>
          <EmptyState icon="💇" title="No staff yet" description="Add stylists and therapists to assign them to bookings." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {staff.map((member) => {
            const today = member.attendance.find((a) => a.date === isoDate());
            return (
              <Card key={member.id}>
                <CardHeader
                  title={
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name} size={38} />
                      <div>
                        <p className="text-[15px] font-semibold text-ink-900">{member.name}</p>
                        <p className="text-[12px] text-ink-400">
                          {member.designation} · {member.branchName}
                        </p>
                      </div>
                    </div>
                  }
                  action={member.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
                />
                <div className="grid grid-cols-3 divide-x divide-ink-100 border-b border-ink-100">
                  <div className="p-3 text-center">
                    <p className="text-[16px] font-semibold text-ink-900">{member.stats.services}</p>
                    <p className="text-[10.5px] uppercase tracking-wide text-ink-400">Services</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[16px] font-semibold text-ink-900">{formatMoney(member.stats.revenue)}</p>
                    <p className="text-[10.5px] uppercase tracking-wide text-ink-400">Revenue</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[16px] font-semibold text-ink-900">{member.stats.upcoming}</p>
                    <p className="text-[10.5px] uppercase tracking-wide text-ink-400">Upcoming</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <span className="text-[12px] text-ink-400">Commission</span>
                  <Badge tone="muted">{member.commissionRules.serviceBps / 100}% service</Badge>
                  <Badge tone="muted">{member.commissionRules.productBps / 100}% product</Badge>
                  <span className="ml-auto text-[12px] text-ink-400">
                    Today: {today ? <StatusPill status={today.status === 'half_day' ? 'in_progress' : 'paid'} label={today.status.replace('_', ' ')} /> : '—'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 border-t border-ink-100 px-4 py-3">
                  {ATTENDANCE.map((status) => (
                    <button
                      key={status}
                      onClick={() =>
                        markAttendance.mutate({ staffId: member.id, date: isoDate(), status } as never)
                      }
                      className="chip bg-ink-100 text-ink-600 transition hover:bg-brand-100 hover:text-brand-700"
                    >
                      {status.replace('_', ' ')}
                    </button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() =>
                      setDraft({
                        id: member.id,
                        name: member.name,
                        phone: member.phone,
                        designation: member.designation,
                        branchId: member.branchId,
                        status: member.status,
                        serviceBps: String(member.commissionRules.serviceBps / 100),
                        productBps: String(member.commissionRules.productBps / 100),
                      })
                    }
                  >
                    Edit
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader title="Attendance log" subtitle="Last 7 recorded days across the team" />
        {staff.some((s) => s.attendance.length) ? (
          <Table head={['Staff', 'Date', 'Status', 'Check-in', 'Check-out']}>
            {staff
              .flatMap((s) => s.attendance.map((a) => ({ ...a, name: s.name })))
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 12)
              .map((row, index) => (
                <tr key={`${row.name}-${row.date}-${index}`} className="hover:bg-ink-50">
                  <Td className="font-medium text-ink-800">{row.name}</Td>
                  <Td className="whitespace-nowrap text-ink-400">{formatDate(row.date)}</Td>
                  <Td>
                    <StatusPill status={row.status === 'half_day' ? 'in_progress' : 'paid'} label={row.status.replace('_', ' ')} />
                  </Td>
                  <Td>{row.checkInAt ?? '—'}</Td>
                  <Td>{row.checkOutAt ?? '—'}</Td>
                </tr>
              ))}
          </Table>
        ) : (
          <EmptyState icon="🗓️" title="No attendance recorded" description="Mark attendance from a staff card above." />
        )}
      </Card>

      <Drawer open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? 'Edit staff member' : 'Add staff member'}>
        {draft ? (
          <div className="space-y-4">
            {!draft.id ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Rakesh Kumar" />
                </Field>
                <Field label="Phone">
                  <Input value={draft.phone} inputMode="numeric" onChange={(e) => setDraft({ ...draft, phone: e.target.value.replace(/[^\d]/g, '') })} placeholder="9800000010" />
                </Field>
              </div>
            ) : (
              <div className="rounded-xl border border-ink-100 p-4 text-[13px]">
                <p className="font-semibold text-ink-800">{draft.name}</p>
                <p className="text-ink-400">{draft.phone}</p>
              </div>
            )}
            <Field label="Designation">
              <Input value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value })} placeholder="Senior Stylist" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Branch">
                <Select value={draft.branchId} onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}>
                  {(branches.data?.branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Service commission (%)">
                <Input value={draft.serviceBps} inputMode="decimal" onChange={(e) => setDraft({ ...draft, serviceBps: e.target.value.replace(/[^\d.]/g, '') })} />
              </Field>
              <Field label="Product commission (%)">
                <Input value={draft.productBps} inputMode="decimal" onChange={(e) => setDraft({ ...draft, productBps: e.target.value.replace(/[^\d.]/g, '') })} />
              </Field>
            </div>
            <Button
              variant="brand"
              size="lg"
              className="w-full"
              loading={saveStaff.isPending}
              disabled={!draft.designation.trim() || !draft.branchId || (!draft.id && (!draft.name.trim() || draft.phone.replace(/\D/g, '').length < 10))}
              onClick={() => void submit(draft)}
            >
              {draft.id ? 'Save changes' : 'Add staff member'}
            </Button>
            <p className="text-[11.5px] leading-snug text-ink-400">
              A new staff member gets a login on the number you enter. Commission rates are stored in basis points so
              payout maths stays exact.
            </p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
