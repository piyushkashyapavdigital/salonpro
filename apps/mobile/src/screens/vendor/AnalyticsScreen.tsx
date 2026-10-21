/**
 * Reports: revenue over a chosen window, retention, and who the money comes from.
 *
 * Everything is the server's own arithmetic over completed service records — the
 * screen only chooses the window and draws what comes back.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { admin } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import { BarChart, Banner, Button, Card, Chip, Empty, Loading, ProgressBar, Row, SectionTitle, StatTile } from '../../shared/components';
import { colors, font, gradients, space } from '../../shared/theme';
import { addDays, formatDate, formatMoney, formatMoneyShort, isoDate } from '../../core';

const WINDOWS = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
] as const;

type WindowKey = (typeof WINDOWS)[number]['key'];

function rangeFor(key: WindowKey): { from: string; to: string } {
  const today = isoDate();
  if (key === 'month') {
    const monthStart = `${today.slice(0, 7)}-01`;
    return { from: monthStart, to: today };
  }
  return { from: addDays(today, -(Number(key) - 1)), to: today };
}

export function AnalyticsScreen() {
  const navigation = useNavigation<any>();
  const [windowKey, setWindowKey] = useState<WindowKey>('30');
  const [tab, setTab] = useState<'revenue' | 'retention' | 'customers'>('revenue');

  const range = useMemo(() => rangeFor(windowKey), [windowKey]);
  const revenue = useAsync(() => admin.revenueReport(range), [range.from, range.to]);
  const retention = useAsync(() => admin.retentionReport(), []);
  const top = useAsync(() => admin.topCustomers({ from: range.from, to: range.to, limit: 20 }), [range.from, range.to]);

  const report = revenue.data?.report;
  const series = report?.series ?? [];
  const payments = report ? report.byMethod.reduce((sum, entry) => sum + entry.count, 0) : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space(12) }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={revenue.refreshing || retention.refreshing || top.refreshing}
            onRefresh={() => {
              revenue.refresh();
              retention.refresh();
              top.refresh();
            }}
            tintColor={colors.brand500}
          />
        }
      >
        <LinearGradient colors={gradients.header as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <MaterialIcons name="arrow-back" size={22} color={colors.white} onPress={() => navigation.goBack()} />
            <View style={{ flex: 1 }} />
            <Text style={styles.heroRange}>
              {formatDate(range.from, { day: 'numeric', month: 'short' })} – {formatDate(range.to, { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Text style={styles.heroLabel}>Collected in this window</Text>
          <Text style={styles.heroValue}>{formatMoney(report?.netCollected ?? 0)}</Text>
          <Text style={styles.heroSub}>
            {payments} payments · {formatMoney(report?.outstanding ?? 0)} still to collect
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {WINDOWS.map((option) => (
              <Chip key={option.key} label={option.label} active={windowKey === option.key} onPress={() => setWindowKey(option.key)} />
            ))}
          </ScrollView>

          <View style={styles.chips}>
            <Chip label="Revenue" active={tab === 'revenue'} onPress={() => setTab('revenue')} />
            <Chip label="Retention" active={tab === 'retention'} onPress={() => setTab('retention')} />
            <Chip label="Top customers" active={tab === 'customers'} onPress={() => setTab('customers')} />
          </View>

          {revenue.error ? <Banner tone="error" message={revenue.error} action="Try again" onAction={revenue.reload} /> : null}
          {retention.error && tab === 'retention' ? <Banner tone="error" message={retention.error} action="Try again" onAction={retention.reload} /> : null}

          {tab === 'revenue' ? (
            revenue.loading && !revenue.data ? (
              <Loading label="Crunching the numbers…" />
            ) : (
              <>
                <SectionTitle title="Day by day" />
                <Card>
                  {series.length === 0 ? (
                    <Empty icon="📈" title="No completed visits in this window" />
                  ) : (
                    <BarChart
                      data={series.map((point) => ({ label: formatDate(point.date, { day: 'numeric', month: 'short' }), value: point.net }))}
                      format={(value) => formatMoneyShort(value)}
                    />
                  )}
                </Card>

                <SectionTitle title="The money story" />
                <Card>
                  <Row label="Service sales (before discounts)" value={formatMoney(report?.grossServiceSales ?? 0)} />
                  <Row label="Discounts given" value={`− ${formatMoney(report?.discounts ?? 0)}`} />
                  <Row label="Refunds" value={`− ${formatMoney(report?.refunds ?? 0)}`} />
                  <Row label="Collected (net)" value={formatMoney(report?.netCollected ?? 0)} emphasis />
                  <Row label="Still to collect" value={formatMoney(report?.outstanding ?? 0)} />
                  <Row label="Paid from wallets" value={formatMoney(report?.walletCashCollected ?? 0)} />
                  <Row label="Bonus granted with top-ups" value={formatMoney(report?.walletBonusGranted ?? 0)} />
                  <Row label="Referral rewards" value={formatMoney(report?.referralRewardExpense ?? 0)} />
                  <Row label="Direct (cash, UPI, card)" value={formatMoney(report?.directCollected ?? 0)} />
                  <Row label="Wallet liability (purchased)" value={formatMoney(report?.cashLiability ?? 0)} />
                  <Row label="Wallet liability (bonus)" value={formatMoney(report?.bonusLiability ?? 0)} />
                </Card>

                <SectionTitle title="How customers paid" />
                <Card>
                  {(report?.byMethod ?? []).length === 0 ? (
                    <Empty icon="💳" title="No payments in this window" />
                  ) : (
                    report!.byMethod.map((method) => (
                      <Row
                        key={method.method}
                        label={`${method.method.replace(/_/g, ' ')} (${method.count})`}
                        value={formatMoney(method.amount)}
                      />
                    ))
                  )}
                </Card>

                <SectionTitle title="By service" />
                <Card>
                  {(revenue.data?.report.byService ?? []).length === 0 ? (
                    <Empty icon="✂️" title="Nothing completed yet" />
                  ) : (
                    revenue.data!.report.byService.slice(0, 8).map((service) => {
                      const share = report?.netCollected ? service.revenue / report.netCollected : 0;
                      return (
                        <View key={service.serviceId} style={styles.barRow}>
                          <View style={styles.barHead}>
                            <Text style={styles.barLabel} numberOfLines={1}>
                              {service.name}
                            </Text>
                            <Text style={styles.barValue}>
                              {formatMoneyShort(service.revenue)} · {service.count}×
                            </Text>
                          </View>
                          <ProgressBar ratio={share} />
                        </View>
                      );
                    })
                  )}
                </Card>

                <Button label="Refresh report" variant="secondary" onPress={() => void revenue.reload()} />
              </>
            )
          ) : null}

          {tab === 'retention' ? (
            retention.loading && !retention.data ? (
              <Loading label="Loading retention…" />
            ) : retention.data ? (
              <>
                <SectionTitle title="Win-back" />
                <Card>
                  <View style={styles.grid}>
                    <StatTile label="Gone 30+ days" value={String(retention.data.report.inactive30)} />
                    <StatTile label="Gone 60+ days" value={String(retention.data.report.inactive60)} />
                    <StatTile label="Gone 90+ days" value={String(retention.data.report.inactive90)} tone={colors.rose} />
                  </View>
                  <Text style={styles.note}>
                    Customers whose last completed visit is older than each window — the list the day-30 reminder is built for.
                  </Text>
                </Card>

                <SectionTitle title="Habits" />
                <Card>
                  <Row label="Repeat customers" value={`${retention.data.report.repeatCustomerPercent.toFixed(0)}%`} emphasis />
                  <Row label="Average spend per visit" value={formatMoney(retention.data.report.averageSpend)} />
                  <Row label="Came through a referral" value={String(retention.data.report.referralAcquisition)} />
                </Card>

                <SectionTitle title="Popular services" />
                <Card>
                  {retention.data.report.popularServices.length === 0 ? (
                    <Empty icon="✂️" title="No bookings yet" />
                  ) : (
                    retention.data.report.popularServices.slice(0, 8).map((service) => (
                      <Row key={service.name} label={service.name} value={`${service.count} bookings`} />
                    ))
                  )}
                </Card>

                <SectionTitle title="Did reminders bring people back?" />
                <Card>
                  {retention.data.report.reminderConversions.length === 0 ? (
                    <Empty icon="🔔" title="No reminder conversions recorded" message="Conversions appear once a customer books after a reminder." />
                  ) : (
                    retention.data.report.reminderConversions.map((row) => (
                      <Row
                        key={row.stage}
                        label={row.stage.replace('day', 'Day ')}
                        value={`${row.booked} of ${row.sent} booked again (${row.conversion}%)`}
                      />
                    ))
                  )}
                </Card>
              </>
            ) : null
          ) : null}

          {tab === 'customers' ? (
            top.loading && !top.data ? (
              <Loading label="Ranking customers…" />
            ) : (
              <>
                <SectionTitle title={`Top customers (${range.from} → ${range.to})`} />
                <Card padded={false}>
                  {(top.data?.customers ?? []).length === 0 ? (
                    <Empty icon="🏆" title="No spending in this window" />
                  ) : (
                    top.data!.customers.map((customer, index) => (
                      <View key={customer.customerId} style={styles.rowItem}>
                        <Text style={styles.rank}>#{index + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{customer.name}</Text>
                          <Text style={styles.meta}>
                            {customer.visits} visits · avg {formatMoneyShort(customer.averageSpend)} · wallet{' '}
                            {formatMoneyShort(customer.walletBalance)} · {customer.referrals} referrals
                          </Text>
                        </View>
                        <Text style={styles.amount}>{formatMoney(customer.totalSpend)}</Text>
                      </View>
                    ))
                  )}
                </Card>
                <Text style={styles.note}>
                  Sorted by money spent with the salon in the chosen window, from completed service records only — pending
                  appointments are not counted as revenue.
                </Text>
              </>
            )
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(6), borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  heroRange: { color: '#EADCF6', fontSize: font.size.xs },
  heroLabel: { color: '#EADCF6', fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space(4) },
  heroValue: { color: colors.white, fontSize: font.size.hero, fontWeight: font.weight.heavy, letterSpacing: -1 },
  heroSub: { color: '#D8C7EC', fontSize: font.size.xs, marginTop: space(2) },
  body: { padding: space(4), gap: space(3) },
  chips: { gap: space(2), paddingVertical: space(2) },
  grid: { flexDirection: 'row', gap: space(3) },
  barRow: { marginBottom: space(3), gap: space(1.5) },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3) },
  barLabel: { flex: 1, fontSize: font.size.sm, color: colors.ink700 },
  barValue: { fontSize: font.size.xs, color: colors.ink500 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink100 },
  rank: { fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.brand600, width: 34 },
  name: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  amount: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink900 },
  note: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(2) },
});
