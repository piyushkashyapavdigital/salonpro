import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { platform } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import {
  Badge,
  Banner,
  Card,
  Empty,
  GradientHeader,
  Loading,
  Screen,
  SectionTitle,
  StatTile,
} from '../../shared/components';
import { colors, font, space } from '../../shared/theme';
import { formatMoney, formatMoneyShort, relativeTime } from '../../core';

export function PlatformOverviewScreen() {
  const navigation = useNavigation<any>();
  const overview = useAsync(() => platform.overview(), []);
  const data = overview.data;

  if (overview.loading && !data) return <Loading label="Opening the platform console…" />;

  const metrics = data?.metrics;

  return (
    <Screen
      refresh={
        <RefreshControl
          refreshing={overview.refreshing}
          onRefresh={overview.refresh}
          tintColor={colors.brand500}
        />
      }
    >
      <GradientHeader
        title="Platform console"
        subtitle="Every salon on this server"
        right={<Badge label="ADMIN" bg={colors.white} fg={colors.grape} />}
      >
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroLabel}>Salons</Text>
            <Text style={styles.heroValue}>{metrics?.salons ?? 0}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroLabel}>Active</Text>
            <Text style={styles.heroValue}>{metrics?.activeSalons ?? 0}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroLabel}>Suspended</Text>
            <Text style={styles.heroValue}>{metrics?.suspendedSalons ?? 0}</Text>
          </View>
        </View>
      </GradientHeader>

      <View style={styles.body}>
        {overview.error ? (
          <Banner tone="error" message={overview.error} action="Try again" onAction={overview.reload} />
        ) : null}

        <SectionTitle title="Installation" />
        <Card>
          <View style={styles.grid}>
            <StatTile label="Vendors" value={String(metrics?.vendors ?? 0)} />
            <StatTile label="Clients" value={String(metrics?.clients ?? 0)} tone={colors.sky} />
            <StatTile label="Appointments" value={String(metrics?.appointments ?? 0)} tone={colors.lilac} />
          </View>
          <View style={[styles.grid, { marginTop: space(4) }]}>
            <StatTile label="Today" value={String(metrics?.todayAppointments ?? 0)} tone={colors.coral} />
            <StatTile
              label="Completed value"
              value={formatMoneyShort(metrics?.completedValue ?? 0)}
              sub={formatMoney(metrics?.completedValue ?? 0)}
              tone={colors.mint}
            />
          </View>
        </Card>

        <SectionTitle title="Newest salons" action="All salons" onAction={() => navigation.navigate('Salons')} />
        {data?.recentSalons?.length ? (
          <Card padded={false}>
            {data.recentSalons.map((salon) => (
              <Pressable
                key={salon.id}
                onPress={() => navigation.navigate('SalonDetail', { id: salon.id })}
                style={({ pressed }) => [styles.salonRow, pressed && { backgroundColor: colors.brand50 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.salonName}>{salon.name}</Text>
                  <Text style={styles.salonMeta}>
                    {salon.owner?.name ?? 'No owner'} · {salon.status} · {salon.branchCount} branch
                    {salon.branchCount === 1 ? '' : 'es'}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.ink200} />
              </Pressable>
            ))}
          </Card>
        ) : (
          <Empty
            icon="🏪"
            title="No salons yet"
            message="Create the first salon from the Salons tab. The owner can then sign in with their mobile number."
          />
        )}

        <SectionTitle title="Latest platform activity" action="Audit log" onAction={() => navigation.navigate('Audit')} />
        {data?.recentAudit?.length ? (
          <Card padded={false}>
            {data.recentAudit.map((entry) => (
              <View key={entry.id} style={styles.auditRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditAction}>{entry.action}</Text>
                  <Text style={styles.auditMeta}>
                    {entry.actorName ?? 'System'} · {entry.entityType} · {relativeTime(entry.timestamp)}
                  </Text>
                </View>
                <Text style={styles.auditTime}>{formatDateTimeShort(entry.timestamp)}</Text>
              </View>
            ))}
          </Card>
        ) : (
          <Empty icon="📝" title="No activity yet" message="Platform actions will appear here." />
        )}
      </View>
    </Screen>
  );
}

function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  heroStats: { flexDirection: 'row', gap: space(4), marginTop: space(5) },
  heroStat: { flex: 1 },
  heroLabel: { color: colors.brand100, fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.heavy, marginTop: 2 },
  body: { padding: space(4), gap: space(3) },
  grid: { flexDirection: 'row', gap: space(3) },
  salonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink100,
  },
  salonName: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  salonMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2, textTransform: 'capitalize' },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink100,
  },
  auditAction: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  auditMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  auditTime: { fontSize: font.size.xs, color: colors.ink300 },
});
