import { useEffect, useState } from 'react';
import { formatDateTime, relativeTime, type ReminderStage, type NotificationChannel, type NotificationRecord } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  LoadingBlock,
  Stat,
  StatusPill,
  Switch,
  Table,
  Tabs,
  Td,
  Textarea,
} from '../../components/ui';

interface RemindersResponse {
  settings: { stages: ReminderStage[]; channels: NotificationChannel[]; intervals: Record<string, number>; enabled: boolean };
  templates: Record<string, string>;
  notifications: NotificationRecord[];
  stats: {
    byStatus: { status: string; n: number }[];
    byStage: { stage: string; n: number }[];
    conversions: { stage: string; sent: number; booked: number }[];
  };
}

const STAGES: { id: ReminderStage; label: string }[] = [
  { id: 'day7', label: 'Day 7' },
  { id: 'day14', label: 'Day 14' },
  { id: 'day30', label: 'Day 30' },
  { id: 'appointment', label: 'Appointment reminder' },
];

const CHANNELS: NotificationChannel[] = ['whatsapp', 'push', 'sms', 'email'];

const TEMPLATE_KEYS = ['day7', 'day14', 'day30', 'appointment_confirmation', 'referral_reward', 'wallet_credit'] as const;

const REASON_LABEL: Record<string, string> = {
  whatsapp_not_configured: 'WhatsApp provider not connected',
  push_not_configured: 'Push provider not connected',
  push_provider_pending: 'Push provider pending',
  suppressed_quiet_hours: 'Quiet hours',
  customer_opted_out: 'Customer opted out',
};

export default function RemindersAdmin() {
  const toast = useToast();
  const [tab, setTab] = useState<'engine' | 'queue' | 'templates'>('engine');
  const { data, isLoading, refetch } = useApi<RemindersResponse>('/admin/reminders');

  const [stages, setStages] = useState<ReminderStage[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [templates, setTemplates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setStages(data.settings.stages);
    setChannels(data.settings.channels);
    setEnabled(data.settings.enabled);
    setTemplates(data.templates);
  }, [data]);

  const saveSettings = useApiMutation<Record<string, unknown>, { settings: RemindersResponse['settings'] }>(
    'PATCH',
    '/admin/reminders/settings',
    { onSuccess: () => toast.success('Reminder settings saved') },
  );

  const saveTemplates = useApiMutation<Record<string, unknown>, { templates: Record<string, string> }>(
    'PATCH',
    '/admin/reminders/templates',
    { onSuccess: () => toast.success('Templates saved') },
  );

  const runPass = useApiMutation<Record<string, unknown>, { result: { scanned: number; queued: number; suppressed: number; skipped: number; pending: number } }>(
    'POST',
    '/admin/reminders/run',
    {
      onSuccess: (result) => {
        toast.brand(
          'Reminder pass complete',
          `${result.result.queued} queued · ${result.result.suppressed} suppressed · ${result.result.skipped} skipped.`,
        );
        refetch();
      },
    },
  );

  const retry = useApiMutation<Record<string, unknown>, unknown>('POST', (body) => `/admin/reminders/${(body as { id: string }).id}/retry`, {
    onSuccess: () => refetch(),
  });

  if (isLoading || !data) return <LoadingBlock rows={6} />;

  const statusCount = (status: string) => data.stats.byStatus.find((s) => s.status === status)?.n ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Reminders</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">
            Re-engagement at day 7 / 14 / 30, plus appointment reminders. Duplicates are impossible — each send is keyed to a visit.
          </p>
        </div>
        <Button variant="brand" onClick={() => runPass.mutate({} as never)} loading={runPass.isPending}>
          Run reminder pass now
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Queued" value={statusCount('queued')} />
        <Stat tone="brand" label="Pending (provider)" value={statusCount('pending')} sub="Waiting on a connected channel" />
        <Stat label="Sent" value={statusCount('sent') + statusCount('delivered')} />
        <Stat label="Suppressed" value={statusCount('suppressed')} sub="Opt-outs and quiet hours" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'engine', label: 'Engine' },
          { id: 'queue', label: 'Delivery queue', count: data.notifications.length },
          { id: 'templates', label: 'Templates' },
        ]}
      />

      {tab === 'engine' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Reminder stages" subtitle="Which re-engagement nudges are active" />
            <div className="divide-y divide-ink-100">
              {STAGES.map((stage) => (
                <div key={stage.id} className="p-4">
                  <Switch
                    checked={stages.includes(stage.id)}
                    onChange={(next) => {
                      const nextStages = next ? [...stages, stage.id] : stages.filter((s) => s !== stage.id);
                      setStages(nextStages);
                      saveSettings.mutate({ stages: nextStages } as never);
                    }}
                    label={stage.label}
                    description={
                      stage.id === 'appointment'
                        ? 'Transactional 24h reminder — unaffected by promo opt-out.'
                        : 'Sent when the customer has not visited for this many days.'
                    }
                  />
                </div>
              ))}
              <div className="p-4">
                <Switch
                  checked={enabled}
                  onChange={(next) => {
                    setEnabled(next);
                    saveSettings.mutate({ enabled: next } as never);
                  }}
                  label="Reminder engine enabled"
                  description="Master switch for all scheduled re-engagement messages."
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Channels" subtitle="Preferred delivery order" />
            <div className="divide-y divide-ink-100">
              {CHANNELS.map((channel) => (
                <div key={channel} className="p-4">
                  <Switch
                    checked={channels.includes(channel)}
                    onChange={(next) => {
                      const nextChannels = next ? [...channels, channel] : channels.filter((c) => c !== channel);
                      setChannels(nextChannels);
                      saveSettings.mutate({ channels: nextChannels } as never);
                    }}
                    label={channel.charAt(0).toUpperCase() + channel.slice(1)}
                  />
                </div>
              ))}
            </div>
            <div className="border-t border-ink-100 p-4">
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-400">Reminder conversion</p>
              <div className="mt-3 space-y-2">
                {data.stats.conversions.length ? (
                  data.stats.conversions.map((c) => (
                    <div key={c.stage} className="flex items-center justify-between text-[13px]">
                      <span className="capitalize text-ink-600">{c.stage.replace('day', 'Day ')}</span>
                      <span className="text-ink-400">
                        {c.sent} sent · {c.booked} booked
                      </span>
                      <Badge tone="brand">{c.sent ? Math.round((c.booked / c.sent) * 100) : 0}%</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] text-ink-400">No reminder sends recorded yet.</p>
                )}
              </div>
            </div>
          </Card>

          <Alert tone="info" title="Why messages can show as pending" className="xl:col-span-2">
            If WhatsApp or push providers are not connected on this deployment, SalonPro stores each message as{' '}
            <strong>pending</strong> with the exact reason instead of marking it sent. Connect provider credentials to turn
            those into real deliveries.
          </Alert>
        </div>
      ) : tab === 'queue' ? (
        <Card>
          {data.notifications.length ? (
            <Table head={['When', 'Customer', 'Stage', 'Channel', 'Status', 'Reason', '']}>
              {data.notifications.map((notification) => (
                <tr key={notification.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-400">{formatDateTime(notification.createdAt)}</Td>
                  <Td className="font-medium text-ink-800">{notification.customerName ?? '—'}</Td>
                  <Td className="capitalize">{notification.stage.replace('day', 'Day ')}</Td>
                  <Td className="capitalize text-ink-500">{notification.channel}</Td>
                  <Td>
                    <StatusPill status={notification.status} />
                  </Td>
                  <Td className="max-w-[240px] truncate text-[12px] text-ink-400">
                    {notification.errorDetails ? REASON_LABEL[notification.errorDetails] ?? notification.errorDetails : '—'}
                  </Td>
                  <Td>
                    {['pending', 'queued', 'failed'].includes(notification.status) ? (
                      <Button variant="ghost" size="sm" loading={retry.isPending} onClick={() => retry.mutate({ id: notification.id } as never)}>
                        Retry
                      </Button>
                    ) : (
                      <span className="text-[11.5px] text-ink-300">{notification.sentAt ? relativeTime(notification.sentAt) : ''}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState icon="🔔" title="Queue is empty" description="Run a reminder pass or wait for the scheduled job." />
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Message templates" subtitle="Use {{customer_name}}, {{salon_name}}, {{booking_link}}, {{amount}}, {{balance}} placeholders" />
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {TEMPLATE_KEYS.map((key) => (
              <Field key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}>
                <Textarea
                  value={templates[key] ?? ''}
                  onChange={(e) => setTemplates({ ...templates, [key]: e.target.value })}
                  className="min-h-[110px]"
                />
              </Field>
            ))}
          </div>
          <div className="flex justify-end border-t border-ink-100 p-5">
            <Button
              variant="brand"
              loading={saveTemplates.isPending}
              onClick={() => {
                const patch: Record<string, string> = {};
                for (const key of TEMPLATE_KEYS) patch[key] = templates[key] ?? '';
                saveTemplates.mutate(patch as never);
              }}
            >
              Save templates
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
