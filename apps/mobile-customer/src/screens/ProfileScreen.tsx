/**
 * Profile: who you are, what the salon knows, and the switches you control
 * (consent and quiet hours) — plus the two things nobody should have to hunt for,
 * the server address and sign-out.
 */
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../shared/auth';
import { getApiBase } from '../shared/api';
import { customer } from '../shared/endpoints';
import { useAsync } from '../shared/hooks';
import { Avatar, Banner, Button, Card, Loading, Row, SectionTitle } from '../shared/components';
import { colors, font, radius, shadow, space } from '../shared/theme';
import { formatDate, formatMoney } from '../core';
import { APP_VERSION } from '../config';

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const profile = useAsync(() => customer.profile(), []);
  const [busy, setBusy] = useState(false);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need a new one-time code to sign back in.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const data = profile.data;
  const preferences = data?.preferences;

  const togglePreference = async (patch: Record<string, boolean>) => {
    setBusy(true);
    try {
      await customer.updatePreferences(patch);
      await profile.reload();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={profile.refreshing} onRefresh={profile.refresh} tintColor={colors.brand500} />}
      >
        <Card>
          <View style={styles.identity}>
            <Avatar name={user?.name ?? 'You'} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name ?? 'Guest'}</Text>
              <Text style={styles.phone}>{user?.phone}</Text>
              {data?.profile ? (
                <Text style={styles.member}>
                  Member since {formatDate(data.profile.createdAt, { month: 'short', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={() => navigation.navigate('ProfileEdit')} style={styles.edit} hitSlop={8}>
              <MaterialIcons name="edit" size={18} color={colors.brand700} />
            </Pressable>
          </View>
        </Card>

        {profile.error ? <Banner tone="error" message={profile.error} action="Try again" onAction={profile.reload} /> : null}

        {data ? (
          <>
            <SectionTitle title="Your salon record" />
            <Card>
              <Row label="Visits" value={String(data.profile.totalVisits)} />
              <Row label="Lifetime spend" value={formatMoney(data.profile.totalCompletedSpend)} />
              <Row label="Average visit" value={formatMoney(data.profile.averageSpend)} />
              <Row label="Last visit" value={data.profile.lastVisitAt ? formatDate(data.profile.lastVisitAt, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not yet'} />
              {data.profile.birthday ? <Row label="Birthday" value={formatDate(data.profile.birthday, { day: 'numeric', month: 'long' })} /> : null}
            </Card>

            <SectionTitle title="Messages & offers" />
            <Card>
              <Toggle
                label="WhatsApp messages"
                hint="Visit reminders and receipts on WhatsApp."
                value={preferences?.whatsappConsent ?? false}
                disabled={busy}
                onChange={(value) => void togglePreference({ whatsappConsent: value })}
              />
              <Toggle
                label="App notifications"
                hint="Push notifications when the app is closed."
                value={preferences?.pushEnabled ?? false}
                disabled={busy}
                onChange={(value) => void togglePreference({ pushEnabled: value })}
              />
              <Toggle
                label="Offers and promotions"
                hint="Festive offers, loyalty news and win-back discounts."
                value={preferences?.promotionalConsent ?? false}
                disabled={busy}
                onChange={(value) => void togglePreference({ promotionalConsent: value })}
              />
              <Text style={styles.quiet}>
                Quiet hours {preferences?.quietHoursStart ?? '21:00'} – {preferences?.quietHoursEnd ?? '09:00'}: no marketing
                messages are sent then.
              </Text>
            </Card>

            <SectionTitle title="Shortcuts" />
            <Card padded={false}>
              <MenuRow icon="local-offer" label="Offers and coupons" onPress={() => navigation.navigate('Offers')} />
              <MenuRow icon="card-giftcard" label="Refer a friend" onPress={() => navigation.navigate('Referral')} />
              <MenuRow icon="notifications-none" label="Messages from the salon" onPress={() => navigation.navigate('Notifications')} />
              <MenuRow icon="dns" label="Salon server address" hint={getApiBase()} onPress={() => navigation.navigate('ServerSettings')} />
            </Card>

            <SectionTitle title="Account" />
            <Card>
              <Text style={styles.about}>
                Signed in as {user?.role?.replace(/_/g, ' ') ?? 'customer'}. {APP_VERSION} · API {getApiBase()}
              </Text>
              <Button label="Sign out" variant="secondary" onPress={confirmSignOut} style={{ marginTop: space(3) }} />
              <Button
                label="Ask the salon to delete my data"
                variant="ghost"
                onPress={() =>
                  Alert.alert(
                    'Delete your data?',
                    'The salon receives a deletion request. Your visit history needed for accounting may be retained as required by law, and the salon confirms the deletion with you.',
                    [
                      { text: 'Never mind', style: 'cancel' },
                      {
                        text: 'Send request',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            const result = await customer.requestAccountDeletion({ confirm: true, reason: 'Requested from the mobile app' });
                            Alert.alert('Request sent', result.message);
                          } catch (err) {
                            Alert.alert('Could not send', err instanceof Error ? err.message : 'Try again.');
                          }
                        },
                      },
                    ],
                  )
                }
              />
            </Card>
          </>
        ) : profile.loading ? (
          <Loading label="Loading your profile…" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={() => !disabled && onChange(!value)} style={[styles.toggleRow, disabled && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

export function MenuRow({ icon, label, hint, onPress }: { icon: string; label: string; hint?: string; onPress: () => void }) {
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  name: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  phone: { fontSize: font.size.sm, color: colors.ink500, marginTop: 2 },
  member: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  edit: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  quiet: { fontSize: font.size.xs, color: colors.ink400, marginTop: space(3), lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  toggleLabel: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink800 },
  toggleHint: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  switch: { width: 48, height: 28, borderRadius: radius.pill, backgroundColor: colors.ink100, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.brand500 },
  knob: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.white, ...shadow.card },
  knobOn: { alignSelf: 'flex-end' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink100 },
  menuIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  menuHint: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  about: { fontSize: font.size.xs, color: colors.ink500, lineHeight: 18 },
});
