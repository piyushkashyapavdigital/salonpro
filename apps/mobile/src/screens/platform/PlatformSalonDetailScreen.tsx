import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { platform } from '../../shared/endpoints';
import { errorMessage, useAsync } from '../../shared/hooks';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  Row,
  Screen,
  SectionTitle,
  StatTile,
} from '../../shared/components';
import { colors, font, radius, space } from '../../shared/theme';
import { formatDate, formatDateTime, formatMoney, relativeTime } from '../../core';
import { PageHead } from '../../navigation/common';
import type { PlatformStackParamList } from '../../navigation/types';

export function PlatformSalonDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<PlatformStackParamList, 'SalonDetail'>>();
  const { id } = route.params;
  const detail = useAsync(() => platform.salon(id), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail.loading && !detail.data) return <Loading label="Loading the salon…" />;

  const salon = detail.data?.salon;
  if (!salon) {
    return (
      <Screen header={<PageHead title="Salon" onBack={() => navigation.goBack()} />}>
        <Empty
          icon="🏪"
          title="Salon not found"
          message={detail.error ?? 'The server did not return this salon.'}
          action="Try again"
          onAction={detail.reload}
        />
      </Screen>
    );
  }

  const setStatus = (status: 'active' | 'suspended') => {
    const verb = status === 'suspended' ? 'Suspend' : 'Reactivate';
    Alert.alert(
      `${verb} ${salon.name}?`,
      status === 'suspended'
        ? 'Staff and clients at this salon will be signed out on their next request. The platform console keeps access.'
        : 'The salon and its existing sessions will be able to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb,
          style: status === 'suspended' ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await platform.updateSalon(id, { status });
              await detail.reload();
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

  return (
    <Screen
      header={
        <PageHead
          title={salon.name}
          subtitle={`${salon.plan} plan · ${salon.status}`}
          onBack={() => navigation.goBack()}
          right={
            <Badge
              label={salon.status === 'active' ? 'active' : 'suspended'}
              bg={salon.status === 'active' ? colors.mintSoft : colors.roseSoft}
              fg={salon.status === 'active' ? colors.mint : colors.rose}
            />
          }
        />
      }
    >
      <View style={styles.body}>
        {error ? <Banner tone="error" message={error} /> : null}
        {detail.error ? <Banner tone="error" message={detail.error} action="Try again" onAction={detail.reload} /> : null}

        <Card>
          <View style={styles.grid}>
            <StatTile label="Branches" value={String(salon.branchCount)} />
            <StatTile label="Staff" value={String(salon.staffCount)} tone={colors.sky} />
            <StatTile label="Clients" value={String(salon.customerCount)} tone={colors.lilac} />
          </View>
          <View style={[styles.grid, { marginTop: space(4) }]}>
            <StatTile label="Appointments" value={String(salon.appointmentCount)} tone={colors.coral} />
            <StatTile label="Completed value" value={formatMoney(salon.completedValue)} tone={colors.mint} />
          </View>
        </Card>

        <SectionTitle title="Owner" />
        <Card>
          {salon.owner ? (
            <View style={styles.owner}>
              <Avatar name={salon.owner.name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerName}>{salon.owner.name}</Text>
                <Text style={styles.ownerMeta}>
                  {salon.owner.phone} · {salon.owner.status}
                </Text>
                {salon.owner.email ? <Text style={styles.ownerMeta}>{salon.owner.email}</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>No owner is linked to this salon.</Text>
          )}
          <Row label="Created" value={formatDate(salon.createdAt.slice(0, 10))} />
          <Row label="Trial ends" value={salon.trialEndsAt ? formatDate(salon.trialEndsAt.slice(0, 10)) : '—'} />
          <Row label="Timezone" value={salon.timezone} />
        </Card>

        <SectionTitle title="Plan & access" />
        <Card>
          <Row label="Plan" value={salon.plan} emphasis />
          <Row label="Status" value={salon.status} emphasis />
          <Button
            label={busy ? 'Updating…' : salon.status === 'active' ? 'Suspend salon' : 'Reactivate salon'}
            variant={salon.status === 'active' ? 'danger' : 'success'}
            onPress={() => setStatus(salon.status === 'active' ? 'suspended' : 'active')}
            loading={busy}
            style={{ marginTop: space(3) }}
          />
          <Text style={styles.help}>
            Suspension is enforced by the API when a session is resolved. It is not just a hidden button in the app.
          </Text>
        </Card>

        <SectionTitle title="Branches" />
        <Card padded={false}>
          {detail.data?.branches.length ? (
            detail.data.branches.map((branch) => (
              <View key={branch.id} style={styles.branchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.branchName}>{branch.name}</Text>
                  <Text style={styles.branchMeta}>{branch.address}</Text>
                </View>
                <Badge
                  label={branch.status}
                  bg={branch.status === 'active' ? colors.mintSoft : colors.ink100}
                  fg={branch.status === 'active' ? colors.mint : colors.ink500}
                />
              </View>
            ))
          ) : (
            <Text style={[styles.muted, { padding: space(4) }]}>No branches.</Text>
          )}
        </Card>

        <SectionTitle title="Recent activity" />
        <Card padded={false}>
          {detail.data?.recentAudit.length ? (
            detail.data.recentAudit.map((entry) => (
              <View key={entry.id} style={styles.auditRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditAction}>{entry.action}</Text>
                  <Text style={styles.auditMeta}>
                    {entry.actorName ?? 'System'} · {entry.entityType} · {relativeTime(entry.timestamp)}
                  </Text>
                </View>
                <Text style={styles.auditTime}>{formatDateTime(entry.timestamp)}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.muted, { padding: space(4) }]}>No activity recorded.</Text>
          )}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(4), gap: space(3) },
  grid: { flexDirection: 'row', gap: space(3) },
  owner: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2) },
  ownerName: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  ownerMeta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2, textTransform: 'capitalize' },
  muted: { fontSize: font.size.sm, color: colors.ink400 },
  help: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18, marginTop: space(3) },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(4),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink100,
  },
  branchName: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  branchMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(4),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink100,
  },
  auditAction: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  auditMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  auditTime: { fontSize: font.size.xs, color: colors.ink300, maxWidth: 90, textAlign: 'right' },
});
