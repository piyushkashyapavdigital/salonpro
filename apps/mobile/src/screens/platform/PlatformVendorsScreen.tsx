import React, { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { platform } from '../../shared/endpoints';
import { useAsync, useDebounced } from '../../shared/hooks';
import {
  Avatar,
  Badge,
  Banner,
  Empty,
  Field,
  GradientHeader,
  Loading,
  Screen,
} from '../../shared/components';
import { colors, font, radius, space } from '../../shared/theme';

export function PlatformVendorsScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 300);
  const vendors = useAsync(() => platform.vendors({ q: search || undefined }), [search]);

  return (
    <Screen
      refresh={
        <RefreshControl refreshing={vendors.refreshing} onRefresh={vendors.refresh} tintColor={colors.brand500} />
      }
    >
      <GradientHeader title="Vendors" subtitle="Salon owners across the platform" />
      <View style={styles.body}>
        <Field
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Owner, phone or salon"
          autoCapitalize="none"
        />

        {vendors.error ? (
          <Banner tone="error" message={vendors.error} action="Try again" onAction={vendors.reload} />
        ) : null}
        {vendors.loading && !vendors.data ? <Loading label="Loading vendors…" /> : null}

        {vendors.data?.vendors.length ? (
          <View style={styles.list}>
            {vendors.data.vendors.map((vendor) => (
              <Pressable
                key={vendor.id}
                onPress={() => (vendor.salonId ? navigation.navigate('SalonDetail', { id: vendor.salonId }) : undefined)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.brand50 }]}
              >
                <Avatar name={vendor.name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{vendor.name}</Text>
                  <Text style={styles.meta}>
                    {vendor.phone} · {vendor.salonName ?? 'No salon linked'}
                  </Text>
                  <Text style={styles.sub}>
                    {vendor.staffCount} staff · {vendor.customerCount} clients
                  </Text>
                </View>
                <Badge
                  label={vendor.salonStatus ?? vendor.userStatus}
                  bg={vendor.salonStatus === 'suspended' ? colors.roseSoft : colors.mintSoft}
                  fg={vendor.salonStatus === 'suspended' ? colors.rose : colors.mint}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        {!vendors.loading && vendors.data && vendors.data.vendors.length === 0 ? (
          <Empty
            icon="👤"
            title="No vendors match"
            message="A vendor account is created together with a salon from the Salons tab."
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(4), gap: space(3) },
  list: { gap: space(3) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space(4),
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  name: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  sub: { fontSize: font.size.xs, color: colors.ink400, marginTop: 3 },
});
