import { useState } from 'react';
import { formatDateTime, relativeTime } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { Alert, Button, Card, EmptyState, LoadingBlock, StatusPill, Tabs } from '../../components/ui';
import { IconBell, IconClock } from '../../components/icons';

interface NotificationItem {
  id: string;
  channel: string;
  template: string;
  stage: string;
  status: string;
  sentAt: string | null;
  scheduledAt: string;
  body: string | null;
  errorDetails: string | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  push: 'Push',
  sms: 'SMS',
  email: 'Email',
};

const REASON_LABEL: Record<string, string> = {
  whatsapp_not_configured: 'WhatsApp provider not connected on this deployment',
  push_not_configured: 'Push provider not connected',
  push_provider_pending: 'Push delivery provider is not connected yet',
  suppressed_quiet_hours: 'Held back — arrives inside your quiet hours',
  customer_opted_out: 'Not sent — you have opted out of this channel',
  sms_not_configured: 'SMS provider not connected',
  email_not_configured: 'Email provider not connected',
};

function reasonText(reason: string | null): string | null {
  if (!reason) return null;
  return REASON_LABEL[reason] ?? reason.replace(/_/g, ' ');
}

export default function Notifications() {
  const toast = useToast();
  const [tab, setTab] = useState<'all' | 'pending' | 'sent'>('all');
  const { data, isLoading, refetch } = useApi<{ notifications: NotificationItem[] }>('/customer/notifications');

  const retry = useApiMutation<Record<string, unknown>, { notification: NotificationItem }>(
    'POST',
    (body) => `/customer/notifications/${body.id}/retry`,
    { onSuccess: (result) => refetch().then(() => result) },
  );

  const all = data?.notifications ?? [];
  const filtered = all.filter((n) => {
    if (tab === 'all') return true;
    if (tab === 'sent') return n.status === 'sent' || n.status === 'delivered';
    return ['pending', 'queued', 'failed', 'suppressed'].includes(n.status);
  });

  const pendingCount = all.filter((n) => ['pending', 'queued', 'failed', 'suppressed'].includes(n.status)).length;

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <h1 className="font-display text-[24px] text-ink-900">Notifications</h1>
        <p className="mt-1 text-[13px] text-ink-400">Every message SalonPro has queued for you — and its real status.</p>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'All', count: all.length },
          { id: 'pending', label: 'Needs attention', count: pendingCount },
          { id: 'sent', label: 'Sent' },
        ]}
      />

      {isLoading ? (
        <LoadingBlock rows={5} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔔"
            title={tab === 'sent' ? 'Nothing sent yet' : 'You are all caught up'}
            description="Appointment confirmations, reminders and reward alerts will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const reason = reasonText(item.errorDetails);
            const canRetry = ['pending', 'failed', 'queued'].includes(item.status);
            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                    <IconBell size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-semibold capitalize text-ink-800">
                        {item.stage === 'transactional' ? 'Notification' : item.stage.replace('day', 'Day ')}
                      </p>
                      <StatusPill status={item.status} />
                      <span className="text-[11px] text-ink-400">{CHANNEL_LABEL[item.channel] ?? item.channel}</span>
                    </div>
                    {item.body ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">{item.body}</p> : null}
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-ink-400">
                      <IconClock size={12} />
                      {item.sentAt ? `Sent ${relativeTime(item.sentAt)}` : `Queued ${formatDateTime(item.scheduledAt)}`}
                    </p>
                    {reason ? (
                      <p className="mt-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11.5px] text-ink-500">{reason}</p>
                    ) : null}
                  </div>
                </div>
                {canRetry ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full"
                    loading={retry.isPending}
                    onClick={async () => {
                      try {
                        await retry.mutateAsync({ id: item.id });
                        toast.info('Delivery attempted', 'Status updated below — pending means the provider is not connected yet.');
                      } catch (err) {
                        toast.error('Retry failed', err instanceof Error ? err.message : undefined);
                      }
                    }}
                  >
                    Retry delivery
                  </Button>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Alert tone="info" title="Honest delivery status">
        A notification is only marked <strong>sent</strong> when a provider actually accepted it. With no WhatsApp or push
        provider connected on this deployment, messages are stored as <strong>pending</strong> with the exact reason —
        never faked as delivered.
      </Alert>
    </div>
  );
}
