/**
 * More: everything that is not an everyday tab — reports, the staff, the service
 * menu, offers, reminders, settings and the server address.
 *
 * Rows are hidden when the signed-in role cannot use them, so nobody taps into a
 * screen that will only answer 403.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../shared/auth';
import { getApiBase } from '../../shared/api';
import { admin } from '../../shared/endpoints';
import { useAsync } from '../../shared/hooks';
import { Avatar, Badge, Banner, Button, Card, Row, SectionTitle } from '../../shared/components';
import { colors, font, radius, shadow, space } from '../../shared/theme';
import { formatMoney } from '../../core';
import type { Permission } from '../../core';
import { useAppUpdate } from '../../shared/updates';

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const { check, checking, currentVersion } = useAppUpdate();
  const me = useAsync(() => admin.me(), []);

  const permissions = user?.permissions ?? [];
  const can = (permission: Permission) => permissions.includes(permission);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={styles.identity}>
            <Avatar name={user?.name ?? 'Staff'} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name ?? 'Staff'}</Text>
              <Text style={styles.meta}>
                {user?.role?.replace(/_/g, ' ') ?? 'staff'} · {user?.phone}
              </Text>
              {me.data?.salon ? <Text style={styles.meta}>{me.data.salon.name}</Text> : null}
            </View>
            {can('salon.settings.manage') ? (
              <Badge label="full access" bg={colors.mintSoft} fg={colors.mint} />
            ) : (
              <Badge label="scoped access" bg={colors.ink100} fg={colors.ink600} />
            )}
          </View>
        </Card>

        {me.error ? <Banner tone="error" message={me.error} action="Try again" onAction={me.reload} /> : null}

        <SectionTitle title="Run the salon" />
        <Card padded={false}>
          {can('salon.report.read') ? (
            <MenuRow icon="insights" label="Reports & analytics" hint="Revenue, retention, top customers" onPress={() => navigation.navigate('Analytics')} />
          ) : null}
          {can('salon.review.read') ? (
            <MenuRow icon="star" label="Reviews" hint="Google hand-offs and private 1–3★ feedback" onPress={() => navigation.navigate('Reviews')} />
          ) : null}
          {can('salon.appointment.read') ? (
            <MenuRow icon="event-note" label="Schedule" hint="Move visits through the day" onPress={() => navigation.navigate('Schedule')} />
          ) : null}
          {can('salon.appointment.manage') ? (
            <MenuRow icon="person-add-alt" label="New walk-in booking" onPress={() => navigation.navigate('WalkIn')} />
          ) : null}
          {can('salon.customer.read') ? (
            <MenuRow icon="groups" label="Customers" hint="Directory, top 20, wallet adjustments" onPress={() => navigation.navigate('Customers')} />
          ) : null}
          {can('salon.payment.read') || can('salon.payment.refund') ? (
            <MenuRow icon="payments" label="Money" hint="Payments, refunds, wallet ledger" onPress={() => navigation.navigate('Money')} />
          ) : null}
        </Card>

        <SectionTitle title="The salon" />
        <Card padded={false}>
          {can('salon.service.read') ? (
            <MenuRow icon="content-cut" label="Services & prices" onPress={() => navigation.navigate('Services')} />
          ) : null}
          {can('salon.staff.read') ? (
            <MenuRow icon="badge" label="Staff & attendance" onPress={() => navigation.navigate('Staff')} />
          ) : null}
          {can('salon.offer.read') || can('salon.offer.manage') ? (
            <MenuRow icon="local-offer" label="Offers, coupons & referrals" onPress={() => navigation.navigate('Offers')} />
          ) : null}
          {can('salon.reminder.read') || can('salon.reminder.manage') ? (
            <MenuRow icon="notifications-active" label="Reminders & messages" onPress={() => navigation.navigate('Reminders')} />
          ) : null}
          {can('salon.settings.manage') || can('salon.user.manage') || can('salon.audit.read') ? (
            <MenuRow icon="settings" label="Salon settings" hint="Hours, branches, users, audit log" onPress={() => navigation.navigate('Settings')} />
          ) : null}
        </Card>

        <SectionTitle title="This device" />
        <Card padded={false}>
          <MenuRow icon="dns" label="Server address" hint={getApiBase()} onPress={() => navigation.navigate('ServerSettings')} />
          <MenuRow
            icon="system-update"
            label="Check for updates"
            hint={checking ? 'Checking GitHub…' : `Version ${currentVersion}`}
            onPress={() => void check({ manual: true })}
          />
        </Card>
        <Card>
          <Row label="App version" value={currentVersion} />
          <Row label="Signed in as" value={user?.role?.replace(/_/g, ' ') ?? 'staff'} />
          {me.data?.branches?.length ? (
            <Row label="Branches" value={me.data.branches.filter((branch) => branch.status === 'active').map((branch) => branch.name).join(', ')} />
          ) : null}
          <Row label="Wallet liability" value="See Money → Wallet ledger" />
          <Button label="Sign out" variant="secondary" onPress={() => void signOut()} style={{ marginTop: space(3) }} />
        </Card>

        <Text style={styles.footnote}>
          The admin app never claims a message was sent or a payment captured unless the server recorded it. Where a connection
          is missing (SMS, WhatsApp, Razorpay), the screens say so.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
  root: { flex: 1, backgroundColor: colors.canvas },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  name: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  meta: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2, textTransform: 'capitalize' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink100 },
  menuIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  menuHint: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  footnote: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 18 },
});
