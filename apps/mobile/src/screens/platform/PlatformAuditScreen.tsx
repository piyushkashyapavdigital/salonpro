import React, { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { platform } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import {
  Banner,
  Chip,
  Empty,
  GradientHeader,
  Loading,
  Screen,
} from '../../shared/components';
import { colors, font, radius, space } from '../../shared/theme';
import { formatDateTime, relativeTime } from '../../core';

type Filter = 'all' | 'salon' | 'user';

export function PlatformAuditScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const audit = useAsync(
    () => platform.audit({ limit: 100, entityType: filter === 'all' ? undefined : filter }),
    [filter],
  );

  return (
    <Screen
      refresh={<RefreshControl refreshing={audit.refreshing} onRefresh={audit.refresh} tintColor={colors.brand500} />}
    >
      <GradientHeader title="Audit log" subtitle="Platform and tenant actions" />
      <View style={styles.body}>
        <View style={styles.filters}>
          {(['all', 'salon', 'user'] as const).map((value) => (
            <Chip key={value} label={value === 'all' ? 'Everything' : value} active={filter === value} onPress={() => setFilter(value)} />
          ))}
        </View>

        {audit.error ? <Banner tone="error" message={audit.error} action="Try again" onAction={audit.reload} /> : null}
        {audit.loading && !audit.data ? <Loading label="Loading the audit log…" /> : null}

        {audit.data?.audit.length ? (
          <View style={styles.list}>
            {audit.data.audit.map((entry) => (
              <View key={entry.id} style={styles.row}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.action}>{entry.action}</Text>
                  <Text style={styles.meta}>
                    {entry.actorName ?? 'System'} · {entry.actorRole ?? '—'} · {entry.entityType}
                  </Text>
                  {entry.meta ? (
                    <Text style={styles.metaJson} numberOfLines={2}>
                      {JSON.stringify(entry.meta)}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.time}>{relativeTime(entry.timestamp)}</Text>
                  <Text style={styles.date}>{formatDateTime(entry.timestamp)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {!audit.loading && audit.data && audit.data.audit.length === 0 ? (
          <Empty icon="📝" title="No audit entries" message="Platform actions will appear here as they happen." />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(4), gap: space(3) },
  filters: { flexDirection: 'row', gap: space(2), marginBottom: space(1) },
  list: { gap: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: space(3.5),
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand400, marginTop: 6 },
  action: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  meta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2, textTransform: 'capitalize' },
  metaJson: { fontSize: 10, color: colors.ink300, marginTop: 3 },
  time: { fontSize: font.size.xs, color: colors.ink400 },
  date: { fontSize: 10, color: colors.ink300, marginTop: 2, maxWidth: 96, textAlign: 'right' },
});
