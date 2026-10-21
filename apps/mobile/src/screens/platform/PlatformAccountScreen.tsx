import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../shared/auth';
import { getApiBase } from '../../shared/api';
import { useAppUpdate } from '../../shared/updates';
import { Avatar, Button, Card, GradientHeader, Row, Screen, SectionTitle } from '../../shared/components';
import { colors, font, radius, space } from '../../shared/theme';
import { APP_NAME, APP_VERSION } from '../../config';

export function PlatformAccountScreen() {
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const { check, checking, currentVersion } = useAppUpdate();

  return (
    <Screen>
      <GradientHeader title="Account" subtitle="Platform session and this device" />
      <View style={styles.body}>
        <Card>
          <View style={styles.identity}>
            <Avatar name={user?.name ?? 'Admin'} size={52} tone={colors.grape} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name ?? 'Platform admin'}</Text>
              <Text style={styles.meta}>{user?.phone}</Text>
              <Text style={styles.meta}>{user?.email ?? 'No email on file'}</Text>
            </View>
          </View>
          <Row label="Role" value={user?.role?.replace(/_/g, ' ') ?? 'platform admin'} emphasis />
          <Row label="Workspace" value={user?.workspace ?? 'platform'} />
        </Card>

        <SectionTitle title="This device" />
        <Card padded={false}>
          <MenuRow
            icon="dns"
            label="Server address"
            hint={getApiBase()}
            onPress={() => navigation.navigate('ServerSettings')}
          />
          <MenuRow
            icon="system-update"
            label="Check for updates"
            hint={checking ? 'Checking GitHub…' : `Version ${currentVersion}`}
            onPress={() => void check({ manual: true })}
          />
        </Card>

        <Card>
          <Row label="App" value={`${APP_NAME} ${APP_VERSION}`} />
          <Row label="Package" value="com.salonpro.app" />
          <Button label="Sign out" variant="secondary" onPress={() => void signOut()} style={{ marginTop: space(3) }} />
        </Card>

        <Text style={styles.footnote}>
          The platform console reads across every salon on this server. Salon data is never inferred from the device; the
          API resolves the platform role from the signed-in session on every request.
        </Text>
      </View>
    </Screen>
  );
}

function MenuRow({ icon, label, hint, onPress }: { icon: string; label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.brand50 }]}>
      <View style={styles.menuIcon}>
        <MaterialIcons name={icon} size={18} color={colors.brand700} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {hint ? (
          <Text style={styles.menuHint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={20} color={colors.ink200} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(4), gap: space(3) },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2) },
  name: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(4),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink100,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  menuHint: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  footnote: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18 },
});
