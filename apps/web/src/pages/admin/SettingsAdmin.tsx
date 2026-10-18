import { useEffect, useState } from 'react';
import { ROLE_LABEL, formatDateTime, type Role, type SalonSettings } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  LoadingBlock,
  Select,
  StatusPill,
  Switch,
  Table,
  Tabs,
  Td,
} from '../../components/ui';

interface SettingsResponse {
  salon: { id: string; name: string; address: string; contact: string | null; timezone: string; currency: string; settings: SalonSettings; createdAt: string };
  integrations: { razorpayLive: boolean; razorpayWebhook: boolean; whatsapp: boolean; push: boolean; otpDelivery: boolean };
  payments: { mode: string };
  refundPolicy: string;
}

interface UserRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  status: string;
  branchNames: string | null;
  activeSessions: number;
}

interface AuditRow {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  meta: Record<string, unknown> | null;
  ip: string | null;
  timestamp: string;
}

const ROLES: Role[] = ['super_admin', 'salon_owner', 'branch_manager', 'receptionist', 'salon_staff', 'customer'];

export default function SettingsAdmin() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role === 'super_admin' || user?.role === 'salon_owner';

  const [tab, setTab] = useState<'salon' | 'team' | 'integrations' | 'audit'>('salon');
  const { data, isLoading, refetch } = useApi<SettingsResponse>('/admin/settings');
  const users = useApi<{ users: UserRow[] }>(tab === 'team' ? '/admin/users' : null);
  const audit = useApi<{ logs: AuditRow[] }>(tab === 'audit' ? '/admin/audit?limit=100' : null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [spendBonusFirst, setSpendBonusFirst] = useState(true);
  const [bonusExpiry, setBonusExpiry] = useState('');
  const [granularity, setGranularity] = useState('15');
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);
  const [loyaltyRate, setLoyaltyRate] = useState('1');

  useEffect(() => {
    if (!data) return;
    setName(data.salon.name);
    setAddress(data.salon.address);
    setContact(data.salon.contact ?? '');
    const settings = data.salon.settings;
    setSpendBonusFirst(settings.spendingOrder[0] === 'bonus');
    setBonusExpiry(settings.bonusExpiryDays ? String(settings.bonusExpiryDays) : '');
    setGranularity(String(settings.slotGranularityMinutes));
    setLoyaltyEnabled(settings.loyaltyEnabled);
    setLoyaltyRate(String(settings.loyaltyPointsPerHundred));
  }, [data]);

  const saveSettings = useApiMutation<Record<string, unknown>, { settings: SalonSettings }>('PATCH', '/admin/settings', {
    onSuccess: () => {
      toast.success('Settings saved');
      refetch();
    },
  });

  const saveUser = useApiMutation<Record<string, unknown>, { user: UserRow }>('PATCH', (body) => `/admin/users/${(body as { id: string }).id}`, {
    onSuccess: () => {
      toast.success('User updated');
      users.refetch();
    },
  });

  if (isLoading || !data) return <LoadingBlock rows={6} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Settings</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">Salon profile, wallet policy, team roles, integrations and the audit log.</p>
        </div>
        {!canManage ? <Badge tone="muted">Read-only for your role</Badge> : null}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'salon', label: 'Salon & wallet' },
          { id: 'team', label: 'Team & roles', count: users.data?.users.length },
          { id: 'integrations', label: 'Integrations' },
          { id: 'audit', label: 'Audit log' },
        ]}
      />

      {tab === 'salon' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Salon profile" subtitle="Shown on receipts and in the customer app" />
            <div className="space-y-4 p-5">
              <Field label="Salon name">
                <Input value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Address">
                <Input value={address} disabled={!canManage} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <Field label="Contact">
                <Input value={contact} disabled={!canManage} onChange={(e) => setContact(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3 text-[12.5px] text-ink-400">
                <p>Timezone: {data.salon.timezone}</p>
                <p>Currency: {data.salon.currency}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Wallet & loyalty policy" subtitle="Applies to every branch" />
            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-ink-100 p-4">
                <Switch
                  checked={spendBonusFirst}
                  onChange={setSpendBonusFirst}
                  disabled={!canManage}
                  label="Spend promotional bonus before cash"
                  description="Recommended. Bonus is non-refundable; cash is purchased money that never expires."
                />
              </div>
              <Field label="Bonus expiry (days)" hint="Leave blank for no expiry. Cash value never expires.">
                <Input value={bonusExpiry} disabled={!canManage} inputMode="numeric" onChange={(e) => setBonusExpiry(e.target.value.replace(/[^\d]/g, ''))} placeholder="No expiry" />
              </Field>
              <Field label="Booking slot granularity (minutes)" hint="How tightly appointment slots are packed.">
                <Select value={granularity} disabled={!canManage} onChange={(e) => setGranularity(e.target.value)}>
                  {[5, 10, 15, 20, 30].map((m) => (
                    <option key={m} value={String(m)}>
                      {m} minutes
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="rounded-xl border border-ink-100 p-4">
                <Switch checked={loyaltyEnabled} onChange={setLoyaltyEnabled} disabled={!canManage} label="Loyalty points program" />
              </div>
              <Field label="Points per ₹100 spent">
                <Input value={loyaltyRate} disabled={!canManage || !loyaltyEnabled} inputMode="numeric" onChange={(e) => setLoyaltyRate(e.target.value.replace(/[^\d]/g, ''))} />
              </Field>
              {canManage ? (
                <Button
                  variant="brand"
                  className="w-full"
                  loading={saveSettings.isPending}
                  onClick={async () => {
                    try {
                      await saveSettings.mutateAsync({
                        name: name.trim(),
                        address: address.trim(),
                        contact: contact.trim() || null,
                        spendingOrder: spendBonusFirst ? ['bonus', 'cash'] : ['cash', 'bonus'],
                        bonusExpiryDays: bonusExpiry ? Number(bonusExpiry) : null,
                        slotGranularityMinutes: Number(granularity),
                        loyaltyEnabled,
                        loyaltyPointsPerHundred: Number(loyaltyRate || 0),
                      });
                    } catch (err) {
                      toast.error('Could not save settings', err instanceof Error ? err.message : undefined);
                    }
                  }}
                >
                  Save settings
                </Button>
              ) : null}
            </div>
          </Card>

          <Alert tone="info" title="Refund policy" className="xl:col-span-2">
            {data.refundPolicy}
          </Alert>
        </div>
      ) : tab === 'team' ? (
        <Card>
          <CardHeader title="Team & roles" subtitle="Role changes are audited; you cannot change your own role" />
          {users.isLoading ? (
            <div className="p-5">
              <LoadingBlock rows={4} />
            </div>
          ) : (
            <Table head={['User', 'Phone', 'Branches', 'Role', 'Status', 'Sessions']}>
              {(users.data?.users ?? []).map((member) => (
                <tr key={member.id} className="hover:bg-ink-50">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={member.name} size={30} />
                      <div>
                        <p className="font-medium text-ink-800">{member.name}</p>
                        <p className="max-w-[200px] truncate text-[11.5px] text-ink-400">{member.email ?? member.phone}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-ink-500">{member.phone}</Td>
                  <Td className="max-w-[180px] truncate text-ink-500">{member.branchNames ?? '—'}</Td>
                  <Td>
                    {canManage ? (
                      <Select
                        className="w-auto py-1.5 text-[12.5px]"
                        value={member.role}
                        disabled={member.id === user?.id}
                        onChange={(e) => saveUser.mutate({ id: member.id, role: e.target.value } as never)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone="muted">{ROLE_LABEL[member.role]}</Badge>
                    )}
                  </Td>
                  <Td>
                    <StatusPill status={member.status} />
                  </Td>
                  <Td>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={member.id === user?.id}
                        onClick={() =>
                          saveUser.mutate({ id: member.id, status: member.status === 'active' ? 'deactivated' : 'active' } as never)
                        }
                      >
                        {member.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    ) : (
                      <span className="text-[12.5px] text-ink-400">{member.activeSessions} active</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : tab === 'integrations' ? (
        <div className="space-y-4">
          <Alert tone="warn" title="Honest integration status">
            Nothing here is faked. A service is only shown as connected when its credentials are present in the
            environment. Until then, payments run through the labelled test gateway, OTP codes are shown in DEV mode, and
            notifications are stored as <strong>pending</strong> with a reason.
          </Alert>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: 'razorpayLive', label: 'Razorpay live keys', desc: 'Take real payments with server-side verification.' },
              { key: 'razorpayWebhook', label: 'Razorpay webhook secret', desc: 'Reconcile payment events from Razorpay.' },
              { key: 'whatsapp', label: 'WhatsApp Cloud API', desc: 'Deliver reminders and confirmations on WhatsApp.' },
              { key: 'push', label: 'Web push (VAPID)', desc: 'Browser push notifications for reminders.' },
              { key: 'otpDelivery', label: 'OTP delivery provider', desc: 'Send real login OTPs by SMS/WhatsApp.' },
            ].map((item) => {
              const connected = data.integrations[item.key as keyof SettingsResponse['integrations']];
              return (
                <Card key={item.key} className="flex items-start gap-3 p-4">
                  <span className={`mt-0.5 h-9 w-9 shrink-0 rounded-lg ${connected ? 'bg-mint-100 text-mint-500' : 'bg-ink-100 text-ink-400'} flex items-center justify-center`}>
                    {connected ? '✓' : '–'}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-ink-900">{item.label}</p>
                      {connected ? <Badge tone="success">Connected</Badge> : <Badge tone="muted">Not configured</Badge>}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-400">{item.desc}</p>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="p-4">
            <p className="text-[13px] font-semibold text-ink-800">Payment mode</p>
            <p className="mt-1 text-[13px] text-ink-500">
              Current mode: <strong className="text-ink-800">{data.payments.mode}</strong>
              {data.payments.mode === 'live' && ' — real money is moving. Double-check your keys and webhook secret.'}
            </p>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader title="Audit log" subtitle="Every privileged action, newest first" />
          {audit.isLoading ? (
            <div className="p-5">
              <LoadingBlock rows={5} />
            </div>
          ) : (audit.data?.logs ?? []).length ? (
            <Table head={['When', 'Actor', 'Action', 'Entity', 'Details', 'IP']}>
              {(audit.data?.logs ?? []).map((log) => (
                <tr key={log.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-400">{formatDateTime(log.timestamp)}</Td>
                  <Td className="font-medium text-ink-800">{log.actorName ?? 'System'}</Td>
                  <Td>
                    <Badge tone="muted">{log.action}</Badge>
                  </Td>
                  <Td className="text-ink-500">{log.entityType}</Td>
                  <Td className="max-w-[280px] truncate text-[12px] text-ink-400">
                    {log.meta ? JSON.stringify(log.meta) : '—'}
                  </Td>
                  <Td className="text-ink-400">{log.ip ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="p-5 text-[13px] text-ink-400">No audit entries yet.</div>
          )}
        </Card>
      )}
    </div>
  );
}
