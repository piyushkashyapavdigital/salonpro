import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatDateTime, maskPhone, type CustomerProfile, type NotificationPreferences } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { downloadFile } from '../../lib/api';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Field,
  Input,
  LoadingBlock,
  Modal,
  SectionTitle,
  Switch,
} from '../../components/ui';
import { IconLock, IconLogout, IconReceipt, IconShield } from '../../components/icons';

interface ProfileResponse {
  user: { id: string; name: string; phone: string; email: string | null; createdAt: string } | null;
  profile: CustomerProfile | null;
  preferences: NotificationPreferences;
}

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, refetch } = useApi<ProfileResponse>('/customer/profile');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  useEffect(() => {
    if (!data) return;
    setName(data.user?.name ?? '');
    setEmail(data.user?.email ?? '');
    setBirthday(data.profile?.birthday ?? '');
    setPrefs(data.preferences);
  }, [data]);

  const saveProfile = useApiMutation<Record<string, unknown>, { profile: CustomerProfile }>('PATCH', '/customer/profile', {
    invalidate: ['/customer/profile', '/customer/home'],
    onSuccess: () => toast.success('Profile updated'),
  });

  const savePrefs = useApiMutation<Partial<NotificationPreferences>, { preferences: NotificationPreferences }>(
    'PATCH',
    '/customer/preferences',
    { onSuccess: (result) => setPrefs(result.preferences) },
  );

  const deleteAccount = useApiMutation<{ confirm: string }, { ok: boolean; message: string }>(
    'POST',
    '/customer/account-deletion',
    {
      onSuccess: async (result) => {
        toast.info('Account deactivated', result.message);
        setDeleteOpen(false);
        await signOut();
        navigate('/');
      },
    },
  );

  if (isLoading || !prefs) return <div className="px-4 py-5"><LoadingBlock rows={5} /></div>;

  const profile = data?.profile;

  const togglePref = async (patch: Partial<NotificationPreferences>, label: string) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await savePrefs.mutateAsync(patch);
      toast.success(`${label} updated`);
    } catch (err) {
      setPrefs(prefs);
      toast.error('Could not save that', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="flex items-center gap-4">
        <Avatar name={profile?.name ?? user?.name ?? 'You'} size={56} tone="brand" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] text-ink-900">{profile?.name ?? user?.name}</h1>
          <p className="text-[13px] text-ink-400">{maskPhone(profile?.phone ?? user?.phone ?? '')}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Card className="p-3.5 text-center">
          <p className="font-display text-[20px] text-ink-900">{profile?.totalVisits ?? 0}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-400">Visits</p>
        </Card>
        <Card className="p-3.5 text-center">
          <p className="font-display text-[20px] text-ink-900">{profile?.successfulReferrals ?? 0}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-400">Referrals</p>
        </Card>
        <Card className="p-3.5 text-center">
          <p className="font-display text-[20px] text-ink-900">{formatDate(profile?.lastVisitAt?.slice(0, 10) ?? profile?.createdAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10))}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-400">Member since</p>
        </Card>
      </div>

      {/* Personal details */}
      <section>
        <SectionTitle title="Personal details" />
        <Card className="space-y-4 p-4">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Phone" hint="Your login number cannot be changed here. Contact the salon to update it.">
            <Input value={maskPhone(profile?.phone ?? user?.phone ?? '')} disabled />
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Birthday (optional)" hint="Used only to send you a birthday-month reward.">
            <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
          <Button
            variant="brand"
            className="w-full"
            loading={saveProfile.isPending}
            onClick={async () => {
              try {
                await saveProfile.mutateAsync({
                  name: name.trim() || undefined,
                  email: email.trim() ? email.trim() : null,
                  birthday: birthday || null,
                });
                await refresh();
                refetch();
              } catch (err) {
                toast.error('Could not save', err instanceof Error ? err.message : undefined);
              }
            }}
          >
            Save changes
          </Button>
        </Card>
      </section>

      {/* Communication preferences */}
      <section>
        <SectionTitle title="Notifications" subtitle="What we may send you — and when" />
        <Card className="divide-y divide-ink-100">
          <div className="p-4">
            <Switch
              checked={prefs.whatsappConsent}
              onChange={(next) => void togglePref({ whatsappConsent: next }, 'WhatsApp consent')}
              label="WhatsApp updates"
              description="Booking confirmations and appointment reminders."
            />
          </div>
          <div className="p-4">
            <Switch
              checked={prefs.pushEnabled}
              onChange={(next) => void togglePref({ pushEnabled: next }, 'Push notifications')}
              label="Push notifications"
              description="Reminders and reward alerts on this device."
            />
          </div>
          <div className="p-4">
            <Switch
              checked={prefs.promotionalConsent}
              onChange={(next) => void togglePref({ promotionalConsent: next }, 'Promotional consent')}
              label="Offers & re-engagement"
              description="Occasional offers and “we miss you” reminders."
            />
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Field label="Quiet hours from">
              <Input
                type="time"
                value={prefs.quietHoursStart}
                onChange={(e) => setPrefs({ ...prefs, quietHoursStart: e.target.value })}
                onBlur={(e) => void togglePref({ quietHoursStart: e.target.value }, 'Quiet hours')}
              />
            </Field>
            <Field label="Quiet hours to">
              <Input
                type="time"
                value={prefs.quietHoursEnd}
                onChange={(e) => setPrefs({ ...prefs, quietHoursEnd: e.target.value })}
                onBlur={(e) => void togglePref({ quietHoursEnd: e.target.value }, 'Quiet hours')}
              />
            </Field>
          </div>
        </Card>
        <p className="mt-2 text-[11.5px] leading-snug text-ink-400">
          Reminders are queued outside quiet hours. If a channel is not connected yet, SalonPro records it as “pending”
          with the reason instead of pretending it was delivered.
        </p>
      </section>

      {/* Privacy */}
      <section>
        <SectionTitle title="Privacy & data" />
        <Card className="divide-y divide-ink-100">
          <button
            className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-ink-50"
            onClick={async () => {
              try {
                await downloadFile('/customer/data-export', 'salonpro-my-data.json');
                toast.success('Download started');
              } catch (err) {
                toast.error('Could not export your data', err instanceof Error ? err.message : undefined);
              }
            }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
              <IconReceipt size={17} />
            </span>
            <div className="flex-1">
              <p className="text-[13.5px] font-medium text-ink-800">Download my data</p>
              <p className="text-[11.5px] text-ink-400">A JSON copy of your profile, bookings, wallet and rewards.</p>
            </div>
          </button>
          <button
            className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-ink-50"
            onClick={() => {
              setDeleteConfirm('');
              setDeleteOpen(true);
            }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-500">
              <IconShield size={17} />
            </span>
            <div className="flex-1">
              <p className="text-[13.5px] font-medium text-rose-500">Delete my account</p>
              <p className="text-[11.5px] text-ink-400">Anonymises your details; financial records are retained by law.</p>
            </div>
          </button>
        </Card>
      </section>

      {/* Account */}
      <section>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
            <IconLock size={17} />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-ink-800">Session</p>
            <p className="text-[11.5px] text-ink-400">Signed in since {formatDateTime(profile?.createdAt ?? new Date().toISOString())}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            <IconLogout size={15} /> Sign out
          </Button>
        </Card>
      </section>

      <p className="pb-4 text-center text-[11px] text-ink-300">
        SalonPro · Account created {formatDate(profile?.createdAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10))}
      </p>

      {/* Delete account modal */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              disabled={deleteConfirm !== 'DELETE'}
              loading={deleteAccount.isPending}
              onClick={async () => {
                try {
                  await deleteAccount.mutateAsync({ confirm: 'DELETE' });
                } catch (err) {
                  toast.error('Could not delete', err instanceof Error ? err.message : undefined);
                }
              }}
            >
              Delete account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="danger" title="This is permanent">
            Your name and personal details are anonymised immediately, notifications stop and any active session ends.
            Wallet, payment and tax records are retained for accounting as required by law.
          </Alert>
          <Field label='Type DELETE to confirm'>
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())} placeholder="DELETE" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
