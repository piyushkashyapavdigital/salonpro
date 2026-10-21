import React, { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { platform } from '../../shared/endpoints';
import { useAsync, useDebounced } from '../../shared/hooks';
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  GradientHeader,
  Loading,
  Screen,
} from '../../shared/components';
import { colors, font, radius, space } from '../../shared/theme';
import { formatMoney, formatDate } from '../../core';

type StatusFilter = 'all' | 'active' | 'suspended';

export function PlatformSalonsScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const search = useDebounced(query, 300);
  const salons = useAsync(
    () => platform.salons({ q: search || undefined, status: status === 'all' ? undefined : status }),
    [search, status],
  );

  return (
    <Screen
      refresh={
        <RefreshControl refreshing={salons.refreshing} onRefresh={salons.refresh} tintColor={colors.brand500} />
      }
    >
      <GradientHeader
        title="Salons"
        subtitle="Tenants, owners and plan state"
        right={
          <Button
            label="New salon"
            size="sm"
            variant="secondary"
            onPress={() => navigation.navigate('CreateSalon')}
          />
        }
      />
      <View style={styles.body}>
        <Field
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Salon, owner or phone"
          autoCapitalize="none"
        />
        <View style={styles.filters}>
          {(['all', 'active', 'suspended'] as const).map((value) => (
            <Chip
              key={value}
              label={value === 'all' ? 'All' : value === 'active' ? 'Active' : 'Suspended'}
              active={status === value}
              onPress={() => setStatus(value)}
            />
          ))}
        </View>

        {salons.error ? (
          <Banner tone="error" message={salons.error} action="Try again" onAction={salons.reload} />
        ) : null}

        {salons.loading && !salons.data ? <Loading label="Loading salons…" /> : null}

        {salons.data?.salons.length ? (
          <View style={styles.list}>
            {salons.data.salons.map((salon) => (
              <Pressable
                key={salon.id}
                onPress={() => navigation.navigate('SalonDetail', { id: salon.id })}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.brand50 }]}
              >
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{salon.name}</Text>
                    <Text style={styles.meta}>
                      {salon.owner?.name ?? 'No owner'} · {salon.owner?.phone ?? '—'}
                    </Text>
                  </View>
                  <Badge
                    label={salon.status === 'active' ? 'active' : 'suspended'}
                    bg={salon.status === 'active' ? colors.mintSoft : colors.roseSoft}
                    fg={salon.status === 'active' ? colors.mint : colors.rose}
                  />
                </View>
                <View style={styles.stats}>
                  <Stat label="Branches" value={String(salon.branchCount)} />
                  <Stat label="Staff" value={String(salon.staffCount)} />
                  <Stat label="Clients" value={String(salon.customerCount)} />
                  <Stat label="Completed" value={formatMoney(salon.completedValue)} />
                </View>
                <Text style={styles.foot}>
                  {salon.plan} plan · created {formatDate(salon.createdAt.slice(0, 10))}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!salons.loading && salons.data && salons.data.salons.length === 0 ? (
          <Empty
            icon="🏪"
            title="No salons match"
            message="Try clearing the search, or create the first salon."
            action="New salon"
            onAction={() => navigation.navigate('CreateSalon')}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(4), gap: space(3) },
  filters: { flexDirection: 'row', gap: space(2) },
  list: { gap: space(3) },
  row: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space(4), gap: space(3), borderWidth: 1, borderColor: colors.ink100 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  name: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 3 },
  stats: { flexDirection: 'row', gap: space(2) },
  stat: { flex: 1, backgroundColor: colors.ink50, borderRadius: radius.md, padding: space(2.5) },
  statLabel: { fontSize: font.size.xs, color: colors.ink400 },
  statValue: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.ink800, marginTop: 2 },
  foot: { fontSize: font.size.xs, color: colors.ink300, textTransform: 'capitalize' },
});
