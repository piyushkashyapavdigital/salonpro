/**
 * Today, at a glance: money collected, who came in, what is still pending, and
 * the schedule for the rest of the day.
 *
 * One call (`GET /admin/overview`) fills the whole screen, plus a health check
 * for the honest integrations strip at the bottom (a salon should be able to see
 * whether SMS/payments are actually connected).
 */
import React, { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../shared/auth';
import { admin, health } from '../shared/endpoints';
import { useAsync } from '../shared/hooks';
import { Badge, Banner, BarChart, Button, Card, Empty, Loading, Row, SectionTitle, StatTile } from '../shared/components';
import { colors, font, gradients, radius, shadow, space, statusColors, STATUS_LABEL } from '../shared/theme';
import { formatDate, formatDateLong, formatMoney, formatMoneyShort, formatTime12, isoDate } from '../core';

export function OverviewScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const overview = useAsync(() => admin.overview(), []);
  const integrations = useAsync(async () => (await health()).integrations, []);

  const data = overview.data;
  const [date, setDate] = React.useState(isoDate());

  const refresh = useCallback(() => {
    overview.refresh();
    integrations.refresh();
  }, [overview, integrations]);

  if (overview.loading && !data) return <Loading label="Opening today's numbers…" />;

  const kpi = data?.overview;
  const trend = data?.trend ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space(10) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={overview.refreshing} onRefresh={refresh} tintColor={colors.brand500} />}
      >
        <LinearGradient colors={gradients.header as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroRole}>{user?.role?.replace(/_/g, ' ') ?? 'staff'}</Text>
              <Text style={styles.heroName}>{user?.name ?? 'Salon team'}</Text>
              <Text style={styles.heroDate}>{formatDateLong(date)}</Text>
            </View>
            <Pressable onPress={() => navigation.navigate('WalkIn')} style={styles.walkIn}>
              <MaterialIcons name="person-add-alt" size={16} color={colors.brand700} />
              <Text style={styles.walkInText}>Walk-in</Text>
            </Pressable>
          </View>

          <View style={styles.heroStats}>
            <View>
              <Text style={styles.heroStatLabel}>Collected today</Text>
              <Text style={styles.heroStatValue}>{formatMoney(kpi?.revenueCollected ?? 0)}</Text>
            </View>
            <View>
              <Text style={styles.heroStatLabel}>Visits</Text>
              <Text style={styles.heroStatValue}>{kpi?.customersVisited ?? 0}</Text>
            </View>
            <View>
              <Text style={styles.heroStatLabel}>Pending</Text>
              <Text style={styles.heroStatValue}>{kpi?.pending ?? 0}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {overview.error ? <Banner tone="error" message={overview.error} action="Try again" onAction={overview.reload} /> : null}

          {integrations.data ? (
            <Banner
              tone={integrations.data.razorpayLive && integrations.data.otpDelivery ? 'success' : 'warning'}
              title="Connections"
              message={describeIntegrations(integrations.data)}
            />
          ) : null}

          <SectionTitle title="Today's numbers" />
          <Card>
            <View style={styles.grid}>
              <StatTile label="Booked" value={String(kpi?.appointmentsBooked ?? 0)} />
              <StatTile label="Completed" value={String(kpi?.completed ?? 0)} tone={colors.mint} />
              <StatTile label="Cancelled" value={String(kpi?.cancelled ?? 0)} tone={colors.rose} />
            </View>
            <View style={[styles.grid, { marginTop: space(4) }]}>
              <StatTile label="New customers" value={String(kpi?.newCustomers ?? 0)} />
              <StatTile label="Returning" value={String(kpi?.returningCustomers ?? 0)} />
              <StatTile label="Walk-ins" value={String(kpi?.walkIns ?? 0)} />
            </View>
            <View style={styles.splitRow}>
              <Row label="Paid from wallets" value={formatMoney(kpi?.walletPayments ?? 0)} />
              <Row label="Direct payments" value={formatMoney(kpi?.directPayments ?? 0)} />
              {kpi?.newRegistrations ? <Row label="New sign-ups" value={String(kpi.newRegistrations)} /> : null}
            </View>
          </Card>

          <SectionTitle title="Last 7 days" action="Full reports" onAction={() => navigation.navigate('Analytics')} />
          <Card>
            {trend.length === 0 ? (
              <Empty icon="📈" title="No trend yet" message="Once visits are recorded, revenue by day shows up here." />
            ) : (
              <BarChart
                data={trend.map((point) => ({
                  label: formatDate(point.date, { day: 'numeric', month: 'short' }),
                  value: point.revenue,
                }))}
                format={(value) => formatMoneyShort(value)}
              />
            )}
          </Card>

          <SectionTitle title="Rest of today" action="Schedule" onAction={() => navigation.navigate('Schedule')} />
          {(data?.upcomingToday.length ?? 0) === 0 ? (
            <Card>
              <Empty
                icon="🗓"
                title="Nothing left today"
                message="The calendar is clear. Tomorrow's appointments appear here after midnight."
                action="Add a walk-in"
                onAction={() => navigation.navigate('WalkIn')}
              />
            </Card>
          ) : (
            <Card padded={false}>
              {data!.upcomingToday.map((appointment, index) => (
                <Pressable
                  key={appointment.id}
                  onPress={() => navigation.navigate('AppointmentDetail', { id: appointment.id })}
                  style={[styles.rowItem, index > 0 && styles.rowBorder]}
                >
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{formatTime12(appointment.startTime)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{appointment.customerName ?? 'Customer'}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {appointment.services.map((service) => service.name).join(', ')}
                      {appointment.staffName ? ` · ${appointment.staffName}` : ''}
                    </Text>
                  </View>
                  <Badge label={STATUS_LABEL[appointment.status] ?? appointment.status} {...statusColors(appointment.status)} />
                </Pressable>
              ))}
            </Card>
          )}

          <SectionTitle title="Referrals & reminders" />
          <Card>
            <Row label="Referral rewards paid" value={formatMoney(data?.referralStats.rewardExpense ?? 0)} />
            <Row label="Qualified referrals" value={String(data?.referralStats.qualified ?? 0)} />
            <Row
              label="Reminders sent"
              value={String(data?.reminderStats.byStatus.find((entry) => entry.status === 'sent')?.count ?? 0)}
            />
            <Row
              label="Reminders pending"
              value={String(data?.reminderStats.byStatus.find((entry) => entry.status === 'pending')?.count ?? 0)}
            />
            <Button
              label="Open reminders"
              variant="secondary"
              size="sm"
              style={{ marginTop: space(3) }}
              onPress={() => navigation.navigate('Reminders')}
            />
          </Card>

          <SectionTitle title="Top customers" action="See 20" onAction={() => navigation.navigate('Customers')} />
          <Card>
            {(data?.topCustomers.length ?? 0) === 0 ? (
              <Empty icon="🏆" title="No spending yet" />
            ) : (
              data!.topCustomers.slice(0, 5).map((customer, index) => (
                <Pressable
                  key={customer.customerId}
                  onPress={() => navigation.navigate('CustomerDetail', { id: customer.customerId })}
                  style={[styles.rowItem, index > 0 && styles.rowBorder]}
                >
                  <Text style={styles.rank}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{customer.name}</Text>
                    <Text style={styles.rowMeta}>
                      {customer.visits} visits · avg {formatMoneyShort(customer.averageSpend)} · wallet{' '}
                      {formatMoneyShort(customer.walletBalance)}
                    </Text>
                  </View>
                  <Text style={styles.rowAmount}>{formatMoneyShort(customer.totalSpend)}</Text>
                </Pressable>
              ))
            )}
          </Card>

          <Text style={styles.footnote}>
            Figures are computed by the server from completed service records and verified payments — nothing is estimated on
            the phone.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function describeIntegrations(flags: {
  razorpayLive: boolean;
  razorpayWebhook: boolean;
  whatsapp: boolean;
  push: boolean;
  otpDelivery: boolean;
}): string {
  const on: string[] = [];
  const off: string[] = [];
  (flags.otpDelivery ? on : off).push('sign-in codes');
  (flags.razorpayLive ? on : off).push('card/UPI payments');
  (flags.whatsapp ? on : off).push('WhatsApp');
  (flags.push ? on : off).push('push notifications');
  (flags.razorpayWebhook ? on : off).push('payment webhooks');
  return `${on.length ? `Connected: ${on.join(', ')}.` : ''}${on.length ? ' ' : ''}${
    off.length ? `Not connected: ${off.join(', ')} — those messages and payments are not sent, and the app says so rather than pretending.` : ''
  }`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(5), borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  heroRole: { color: '#FBDFEB', fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroName: { color: colors.white, fontSize: font.size.xl, fontWeight: font.weight.heavy, letterSpacing: -0.4 },
  heroDate: { color: '#F6C9DD', fontSize: font.size.xs, marginTop: 2 },
  walkIn: { flexDirection: 'row', alignItems: 'center', gap: space(1), backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) },
  walkInText: { color: colors.brand700, fontWeight: font.weight.bold, fontSize: font.size.xs },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space(5) },
  heroStatLabel: { color: '#FBDFEB', fontSize: font.size.xs },
  heroStatValue: { color: colors.white, fontSize: font.size.xl, fontWeight: font.weight.heavy, marginTop: 2, letterSpacing: -0.5 },
  body: { padding: space(4), gap: space(3) },
  grid: { flexDirection: 'row', gap: space(3) },
  splitRow: { marginTop: space(4), paddingTop: space(3), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3.5) },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ink100 },
  timeBadge: { backgroundColor: colors.brand50, borderRadius: radius.sm, paddingHorizontal: space(2), paddingVertical: space(1) },
  timeBadgeText: { color: colors.brand700, fontSize: font.size.xs, fontWeight: font.weight.bold },
  rowTitle: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink900 },
  rowMeta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  rowAmount: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink900 },
  rank: { width: 26, fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.brand600 },
  footnote: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18 },
});
