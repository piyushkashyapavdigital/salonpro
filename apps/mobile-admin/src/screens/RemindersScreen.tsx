/**
 * Reminders: which nudges the salon sends (day 7 / 14 / 30 after a visit, plus
 * booking confirmations), on which channels, and the truth about what happened.
 *
 * Two honesty rules are visible on this screen:
 *   • a message is "sent" only when a provider accepted it — otherwise it says
 *     pending or failed, with the provider's own error;
 *   • with no provider connected, "Run now" produces pending rows, not imaginary
 *     deliveries, and the screen says that before you tap.
 */
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../shared/auth';
import { admin, health } from '../shared/endpoints';
import { errorMessage, useAsync } from '../shared/hooks';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Loading, Row, SectionTitle, StatTile } from '../shared/components';
import { colors, font, space, statusColors, STATUS_LABEL } from '../shared/theme';
import { formatDateTime, relativeTime } from '../core';

const STAGES = ['day7', 'day14', 'day30', 'appointment'] as const;
const CHANNELS = ['whatsapp', 'push', 'sms', 'email'] as const;
const TEMPLATE_KEYS = ['day7', 'day14', 'day30', 'appointment_confirmation', 'referral_reward', 'wallet_credit'] as const;

export function RemindersScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const reminders = useAsync(() => admin.reminders(), []);
  const integrations = useAsync(async () => (await health()).integrations, []);

  const [templates, setTemplates] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isOwner = ['salon_owner', 'super_admin'].includes(user?.role ?? '');
  const settings = reminders.data?.settings;
  const stats = reminders.data?.stats;

  const templateValues = TEMPLATE_KEYS.reduce<Record<string, string>>((acc, key) => {
    acc[key] = templates?.[key] ?? reminders.data?.templates?.[key] ?? '';
    return acc;
  }, {});

  const flipStage = async (stage: (typeof STAGES)[number]) => {
    if (!settings) return;
    const next = settings.stages.includes(stage) ? settings.stages.filter((s) => s !== stage) : [...settings.stages, stage];
    setBusy(true);
    setError(null);
    try {
      await admin.updateReminderSettings({ stages: next as never });
      await reminders.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const flipChannel = async (channel: (typeof CHANNELS)[number]) => {
    if (!settings) return;
    const next = settings.channels.includes(channel) ? settings.channels.filter((c) => c !== channel) : [...settings.channels, channel];
    setBusy(true);
    setError(null);
    try {
      await admin.updateReminderSettings({ channels: next as never });
      await reminders.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      await admin.updateReminderSettings({ enabled: !settings.enabled });
      setMessage(!settings.enabled ? 'Reminders switched on.' : 'Reminders switched off — nothing will be queued.');
      await reminders.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveTemplates = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await admin.updateReminderTemplates(templates ?? {});
      setMessage('Templates saved.');
      setTemplates(null);
      await reminders.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const runNow = () => {
    Alert.alert(
      'Queue reminders now?',
      integrations.data?.otpDelivery || integrations.data?.whatsapp || integrations.data?.push
        ? 'The salon’s scheduler normally runs this every few minutes. Running it now is safe — the same checks apply.'
        : 'No messaging provider is connected, so the messages will be queued and end up pending or failed. Nothing will be delivered, and the app will say so.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run now',
          onPress: async () => {
            setBusy(true);
            setError(null);
            setMessage(null);
            try {
              const result = await admin.runReminders();
              setMessage(`Scheduler ran: ${JSON.stringify(result.result).slice(0, 200)}`);
              await reminders.reload();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (reminders.loading && !reminders.data) return <Loading label="Loading reminders…" />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reminders</Text>
          <Text style={styles.sub}>Nudges that bring customers back</Text>
        </View>
        <Button label={busy ? 'Running…' : 'Run now'} size="sm" onPress={runNow} loading={busy} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={reminders.refreshing} onRefresh={reminders.refresh} tintColor={colors.brand500} />}
      >
        {error ? <Banner tone="error" title="Not saved" message={error} /> : null}
        {message ? <Banner tone="info" message={message} /> : null}
        {reminders.error ? <Banner tone="error" message={reminders.error} action="Try again" onAction={reminders.reload} /> : null}

        {integrations.data ? (
          <Banner
            tone={integrations.data.otpDelivery || integrations.data.whatsapp ? 'success' : 'warning'}
            title="Delivery"
            message={
              integrations.data.whatsapp
                ? 'WhatsApp is connected, so reminders can actually be delivered.'
                : 'No WhatsApp/SMS provider is connected on this server. Reminders will be recorded as pending or failed — nothing is delivered, and no screen claims otherwise.'
            }
          />
        ) : null}

        {settings ? (
          <>
            <SectionTitle title="Status" />
            <Card>
              <Row label="Reminders" value={settings.enabled ? 'on' : 'off'} emphasis />
              <View style={styles.statsRow}>
                {(stats?.byStatus ?? []).slice(0, 4).map((entry) => (
                  <StatTile
                    key={entry.status}
                    label={STATUS_LABEL[entry.status] ?? entry.status}
                    value={String(entry.count)}
                    tone={entry.status === 'sent' ? colors.mint : entry.status === 'failed' ? colors.rose : colors.ink800}
                  />
                ))}
              </View>
              <Button
                label={settings.enabled ? 'Switch reminders off' : 'Switch reminders on'}
                variant="secondary"
                onPress={() => void toggleEnabled()}
                loading={busy}
                style={{ marginTop: space(3) }}
              />
            </Card>

            <SectionTitle title="Stages" />
            <Card>
              <Text style={styles.label}>After a visit, nudge on</Text>
              <View style={styles.chips}>
                {STAGES.map((stage) => (
                  <Chip
                    key={stage}
                    label={stage === 'appointment' ? 'booking confirmation' : `day ${stage.replace('day', '')}`}
                    active={settings.stages.includes(stage)}
                    onPress={() => void flipStage(stage)}
                  />
                ))}
              </View>
              <Text style={styles.label}>Channels</Text>
              <View style={styles.chips}>
                {CHANNELS.map((channel) => (
                  <Chip
                    key={channel}
                    label={channel}
                    active={settings.channels.includes(channel)}
                    onPress={() => void flipChannel(channel)}
                  />
                ))}
              </View>
              <Text style={styles.note}>
                Day counters are stored per customer, so a reminder is queued once — never twice for the same visit and stage.
              </Text>
            </Card>

            {isOwner ? (
              <>
                <SectionTitle title="Templates" action={templates ? 'Save' : 'Edit'} onAction={() => (templates ? void saveTemplates() : setTemplates({}))} />
                <Card>
                  {TEMPLATE_KEYS.map((key) => (
                    <Field
                      key={key}
                      label={key.replace(/_/g, ' ')}
                      value={templateValues[key] ?? ''}
                      onChangeText={(value) => setTemplates((current) => ({ ...(current ?? templateValues), [key]: value }))}
                      multiline
                      numberOfLines={3}
                      editable={!!templates}
                      style={{ minHeight: 74, textAlignVertical: 'top' }}
                    />
                  ))}
                  <Text style={styles.note}>
                    Placeholders like {'{{customerName}}'} and {'{{salonName}}'} are filled in by the server when the message is
                    queued. A message with an unknown placeholder is sent as-is rather than pretending to have a name.
                  </Text>
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        <SectionTitle title="Recent messages" />
        {(reminders.data?.notifications.length ?? 0) === 0 ? (
          <Card>
            <Empty icon="🔔" title="Nothing queued yet" message="Reminders appear here the moment the scheduler queues them." />
          </Card>
        ) : (
          reminders.data!.notifications.slice(0, 40).map((notification) => (
            <Card key={notification.id}>
              <View style={styles.messageHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.messageStage}>
                    {notification.stage ? notification.stage.replace('day', 'Day ') : notification.template.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.meta}>
                    {notification.customerName ?? 'Customer'} · {notification.channel} ·{' '}
                    {notification.sentAt ? `sent ${relativeTime(notification.sentAt)}` : `queued ${relativeTime(notification.scheduledAt)}`}
                  </Text>
                </View>
                <Badge label={STATUS_LABEL[notification.status] ?? notification.status} {...statusColors(notification.status)} />
              </View>
              <Text style={styles.messageBody}>{notification.body}</Text>
              {notification.errorDetails ? <Text style={styles.error}>{notification.errorDetails}</Text> : null}
              {notification.status === 'failed' || notification.status === 'pending' ? (
                <Button
                  label="Send again"
                  variant="secondary"
                  size="sm"
                  style={{ marginTop: space(3) }}
                  onPress={async () => {
                    try {
                      await admin.retryReminder(notification.id);
                      setMessage('Queued for another attempt.');
                      await reminders.reload();
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  }}
                />
              ) : null}
            </Card>
          ))
        )}

        <Row label="Scheduler" value="Every 15 minutes on the server, plus a daily sweep" />
        <Text style={styles.note}>
          Queued: {formatDateTime(new Date().toISOString())} · The server never reports a message as sent without a provider
          receipt.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  sub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  label: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(3), marginBottom: space(1.5) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  statsRow: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(3) },
  messageHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  messageStage: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  messageBody: { fontSize: font.size.sm, color: colors.ink600, marginTop: space(3), lineHeight: 20 },
  error: { fontSize: font.size.xs, color: colors.rose, marginTop: space(2) },
});
