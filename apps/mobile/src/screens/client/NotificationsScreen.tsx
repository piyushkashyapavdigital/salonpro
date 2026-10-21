/**
 * Reminders and messages the salon has sent.
 *
 * The list is the server's own record: statuses are `sent` only where a provider
 * accepted the message, and `pending`/`failed` are shown as they are — with a
 * retry button that asks the server to try again.
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { customer } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import { Badge, Banner, Button, Card, Empty, Loading } from '../../shared/components';
import { colors, font, radius, space, statusColors, STATUS_LABEL } from '../../shared/theme';
import { formatDateTime, relativeTime } from '../../core';

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const notifications = useAsync(() => customer.notifications(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const retry = async (id: string) => {
    setBusy(id);
    setMessage(null);
    try {
      await customer.retryNotification(id);
      setMessage('Asked the server to send it again.');
      await notifications.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not retry.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <MaterialIcons name="arrow-back" size={22} color={colors.ink800} onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Messages</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={notifications.refreshing} onRefresh={notifications.refresh} tintColor={colors.brand500} />}
      >
        {notifications.error ? <Banner tone="error" message={notifications.error} action="Try again" onAction={notifications.reload} /> : null}
        {message ? <Banner tone="info" message={message} /> : null}
        <Banner
          tone="info"
          message="A message appears as 'sent' only when the salon's provider accepted it. Without a provider connected, reminders stay 'pending' and nothing is claimed as delivered."
        />

        {notifications.loading && !notifications.data ? (
          <Loading label="Loading messages…" />
        ) : (notifications.data?.notifications.length ?? 0) === 0 ? (
          <Card>
            <Empty icon="🔔" title="Nothing yet" message="Reminders about your visits and wallet credit will appear here." />
          </Card>
        ) : (
          notifications.data!.notifications.map((item) => (
            <Card key={item.id}>
              <View style={styles.row}>
                <View style={styles.icon}>
                  <MaterialIcons
                    name={item.channel === 'whatsapp' ? 'chat' : item.channel === 'push' ? 'notifications' : 'sms'}
                    size={18}
                    color={colors.brand700}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stage}>{item.stage ? item.stage.replace(/^day/, 'Day ') : item.template.replace(/_/g, ' ')}</Text>
                  <Text style={styles.when}>
                    {item.sentAt ? `Sent ${formatDateTime(item.sentAt)}` : `Scheduled ${formatDateTime(item.scheduledAt)}`} ·{' '}
                    {relativeTime(item.sentAt ?? item.scheduledAt)}
                  </Text>
                </View>
                <Badge label={STATUS_LABEL[item.status] ?? item.status} {...statusColors(item.status)} />
              </View>
              <Text style={styles.messageBody}>{item.body}</Text>
              {item.errorDetails ? <Text style={styles.error}>{item.errorDetails}</Text> : null}
              {item.status !== 'sent' ? (
                <Button
                  label={busy === item.id ? 'Asking…' : 'Send again'}
                  variant="secondary"
                  size="sm"
                  loading={busy === item.id}
                  onPress={() => void retry(item.id)}
                  style={{ marginTop: space(3) }}
                />
              ) : null}
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  icon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  stage: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink900, textTransform: 'capitalize' },
  when: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  messageBody: { fontSize: font.size.sm, color: colors.ink600, marginTop: space(3), lineHeight: 20 },
  error: { fontSize: font.size.xs, color: colors.rose, marginTop: space(2) },
});
