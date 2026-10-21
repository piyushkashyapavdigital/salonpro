/**
 * Visit history: what is coming up and what has happened.
 *
 * The server returns the customer's appointments; the split is by date on the
 * phone because "upcoming" must stay correct when the clock rolls past midnight.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { customer } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import { Badge, Banner, Card, Chip, Empty, Loading } from '../../shared/components';
import { colors, font, radius, shadow, space, statusColors, STATUS_LABEL } from '../../shared/theme';
import { formatDate, formatMoney, formatTime12, isoDate, relativeTime } from '../../core';
import type { Appointment } from '../../core';

const OPEN_STATUSES = ['booked', 'confirmed', 'checked_in', 'in_progress'];

export function VisitsScreen() {
  const navigation = useNavigation<any>();
  const visits = useAsync(() => customer.bookings(), []);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const { upcoming, past } = useMemo(() => {
    const today = isoDate();
    const rows = visits.data?.appointments ?? [];
    const upcomingRows = rows
      .filter((appointment) => appointment.date >= today && OPEN_STATUSES.includes(appointment.status))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const pastRows = rows
      .filter((appointment) => !(appointment.date >= today && OPEN_STATUSES.includes(appointment.status)))
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    return { upcoming: upcomingRows, past: pastRows };
  }, [visits.data]);

  const rows = tab === 'upcoming' ? upcoming : past;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Your visits</Text>
        <Text style={styles.sub}>
          {upcoming.length} upcoming · {past.length} in your history
        </Text>
        <View style={styles.tabs}>
          <Chip label={`Upcoming (${upcoming.length})`} active={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
          <Chip label={`History (${past.length})`} active={tab === 'past'} onPress={() => setTab('past')} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={visits.refreshing} onRefresh={visits.refresh} tintColor={colors.brand500} />}
        showsVerticalScrollIndicator={false}
      >
        {visits.error ? <Banner tone="error" message={visits.error} action="Try again" onAction={visits.reload} /> : null}

        {visits.loading && !visits.data ? (
          <Loading label="Loading your visits…" />
        ) : rows.length === 0 ? (
          <Card>
            <Empty
              icon={tab === 'upcoming' ? '📅' : '🗂'}
              title={tab === 'upcoming' ? 'No upcoming visits' : 'Nothing in your history yet'}
              message={
                tab === 'upcoming'
                  ? 'Book a service and it will appear here with the time and stylist.'
                  : 'Completed visits, with what you spent, will show up here.'
              }
              action={tab === 'upcoming' ? 'Book now' : undefined}
              onAction={() => navigation.navigate('Book')}
            />
          </Card>
        ) : (
          rows.map((appointment) => <VisitCard key={appointment.id} appointment={appointment} onPress={() => navigation.navigate('VisitDetail', { id: appointment.id })} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function VisitCard({ appointment, onPress }: { appointment: Appointment; onPress: () => void }) {
  const status = statusColors(appointment.status);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{formatDate(appointment.date, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          <Text style={styles.time}>
            {formatTime12(appointment.startTime)} – {formatTime12(appointment.endTime)}
          </Text>
        </View>
        <Badge label={STATUS_LABEL[appointment.status] ?? appointment.status} bg={status.bg} fg={status.fg} />
      </View>

      <View style={styles.services}>
        {appointment.services.map((service) => (
          <Text key={service.serviceId} style={styles.service} numberOfLines={1}>
            • {service.name}
          </Text>
        ))}
      </View>

      <View style={styles.cardFoot}>
        <Text style={styles.meta}>{appointment.staffName ? `with ${appointment.staffName}` : 'stylist to be assigned'}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.amount}>{formatMoney(appointment.totalAmount)}</Text>
          <Text style={styles.paid}>
            {appointment.paymentStatus === 'paid' ? 'Paid' : `${formatMoney(appointment.paidAmount)} paid`}
          </Text>
        </View>
      </View>

      {appointment.status === 'completed' ? (
        <Text style={styles.completedAt}>Completed {relativeTime(appointment.updatedAt)}</Text>
      ) : null}
      <MaterialIcons name="chevron-right" size={20} color={colors.ink200} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { paddingHorizontal: space(4), paddingTop: space(3), gap: space(2) },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.ink900, letterSpacing: -0.6 },
  sub: { fontSize: font.size.sm, color: colors.ink500 },
  tabs: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space(4), ...shadow.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  date: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  time: { fontSize: font.size.sm, color: colors.ink500, marginTop: 2 },
  services: { marginTop: space(3), gap: 2 },
  service: { fontSize: font.size.sm, color: colors.ink700 },
  cardFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space(3), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100, gap: space(3) },
  meta: { fontSize: font.size.xs, color: colors.ink400, flexShrink: 1 },
  amount: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  paid: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  completedAt: { fontSize: font.size.xs, color: colors.ink300, marginTop: space(2) },
  chevron: { position: 'absolute', right: space(2), top: space(4) },
});
