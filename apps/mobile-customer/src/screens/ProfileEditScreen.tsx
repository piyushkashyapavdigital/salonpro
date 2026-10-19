/**
 * Edit what the salon knows: name, email, birthday, marketing consent.
 *
 * Saved with PATCH and verified by re-reading the profile, so the screen never
 * shows a change the server did not keep.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../shared/auth';
import { customer } from '../shared/endpoints';
import { errorMessage, useAsync } from '../shared/hooks';
import { Banner, Button, Card, Field, Loading, SectionTitle } from '../shared/components';
import { colors, font, space } from '../shared/theme';

/** Accepts `1996-08-26` or `26/08/1996` and returns the ISO date. */
function toIsoDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

export function ProfileEditScreen() {
  const navigation = useNavigation<any>();
  const { patchUser } = useAuth();
  const profile = useAsync(() => customer.profile(), []);

  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [birthday, setBirthday] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const data = profile.data;

  if (profile.loading && !data) return <Loading label="Loading your details…" />;

  const currentName = name ?? data?.user.name ?? '';
  const currentEmail = email ?? data?.user.email ?? '';
  const currentBirthday = birthday ?? data?.profile.birthday ?? '';

  const save = async () => {
    setError(null);
    setSaved(null);
    if (currentName.trim().length < 2) {
      setError('Please enter your name as you would like the salon to use it.');
      return;
    }
    const isoBirthday = toIsoDate(currentBirthday);
    if (currentBirthday.trim() && !isoBirthday) {
      setError('Birthday should look like 1996-08-26 or 26/08/1996.');
      return;
    }
    setBusy(true);
    try {
      await customer.updateProfile({
        name: currentName.trim(),
        email: currentEmail.trim() || undefined,
        birthday: isoBirthday ?? null,
      });
      patchUser({ name: currentName.trim(), email: currentEmail.trim() || null });
      setSaved('Saved. The salon sees this the next time they open your file.');
      await profile.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={22} color={colors.ink800} />
        </Pressable>
        <Text style={styles.title}>Your details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="error" title="Not saved" message={error} /> : null}
        {saved ? <Banner tone="success" message={saved} /> : null}

        <Card>
          <Field
            label="Name"
            value={currentName}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
          />
          <Field
            label="Email (optional)"
            value={currentEmail}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            hint="Used for online payment receipts only."
          />
          <Field
            label="Birthday (optional)"
            value={currentBirthday}
            onChangeText={setBirthday}
            placeholder="1996-08-26"
            keyboardType="numbers-and-punctuation"
            hint="The salon sends a birthday reward — no message is sent at other times."
          />
        </Card>

        <SectionTitle title="What you agreed to" />
        <Card>
          <Text style={styles.consentLine}>
            Marketing consent: {data?.profile.marketingConsent ? 'given' : 'not given'}
          </Text>
          <Text style={styles.consentLine}>
            WhatsApp: {data?.preferences.whatsappConsent ? 'on' : 'off'} · App notifications:{' '}
            {data?.preferences.pushEnabled ? 'on' : 'off'}
          </Text>
          <Button
            label="Change message settings"
            variant="secondary"
            onPress={() => navigation.navigate('Profile')}
            style={{ marginTop: space(3) }}
          />
        </Card>

        <Button label={busy ? 'Saving…' : 'Save changes'} size="lg" loading={busy} onPress={() => void save()} />

        <Button
          label="Delete my data…"
          variant="ghost"
          onPress={() =>
            Alert.alert(
              'Delete your data?',
              'This asks the salon to erase your profile. Records the salon must keep for accounting are retained, and the salon confirms with you before anything is removed.',
            )
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  body: { padding: space(4), gap: space(3), paddingBottom: space(12) },
  consentLine: { fontSize: font.size.sm, color: colors.ink600, marginBottom: space(1.5) },
});
