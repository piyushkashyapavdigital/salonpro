import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { platform } from '../../shared/endpoints';
import { errorMessage } from '../../shared/hooks';
import { Banner, Button, Card, Chip, Field, Screen } from '../../shared/components';
import { colors, font, space } from '../../shared/theme';
import { PageHead } from '../../navigation/common';

type Plan = 'trial' | 'growth' | 'pro';

export function PlatformCreateSalonScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [branchName, setBranchName] = useState('');
  const [plan, setPlan] = useState<Plan>('trial');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const phone = ownerPhone.replace(/\D/g, '').slice(-10);
    if (name.trim().length < 2) return setError('Enter the salon name.');
    if (address.trim().length < 4) return setError('Enter the salon address.');
    if (ownerName.trim().length < 2) return setError('Enter the owner name.');
    if (phone.length !== 10) return setError('Enter the owner’s 10 digit mobile number.');
    setBusy(true);
    try {
      const created = await platform.createSalon({
        name: name.trim(),
        address: address.trim(),
        contact: contact.trim() || null,
        ownerName: ownerName.trim(),
        ownerPhone: phone,
        branchName: branchName.trim() || undefined,
        plan,
      });
      Alert.alert(
        'Salon created',
        `${created.salon.name} is active with one branch. ${ownerName.trim()} can sign in with ${phone} and the one-time code.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<PageHead title="New salon" subtitle="Creates the tenant, branch and owner" onBack={() => navigation.goBack()} />}>
      <View style={styles.body}>
        {error ? <Banner tone="error" title="Could not create the salon" message={error} /> : null}

        <Card>
          <Text style={styles.cardTitle}>Salon</Text>
          <Field label="Salon name" value={name} onChangeText={setName} placeholder="Indiranagar Studio" autoCapitalize="words" />
          <Field label="Address" value={address} onChangeText={setAddress} placeholder="100 Feet Road, Bengaluru" />
          <Field
            label="Salon contact"
            value={contact}
            onChangeText={setContact}
            placeholder="080 1234 5678"
            keyboardType="phone-pad"
          />
          <Field
            label="First branch name"
            value={branchName}
            onChangeText={setBranchName}
            placeholder="Main branch (optional)"
            autoCapitalize="words"
          />
          <View style={styles.planRow}>
            {(['trial', 'growth', 'pro'] as const).map((value) => (
              <Chip key={value} label={value} active={plan === value} onPress={() => setPlan(value)} />
            ))}
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Owner</Text>
          <Text style={styles.help}>
            This creates the owner account in invited state. They sign in with this mobile number and a one-time code; no
            password is created and no SMS is claimed by this screen.
          </Text>
          <Field label="Owner name" value={ownerName} onChangeText={setOwnerName} placeholder="Nisha Rao" autoCapitalize="words" />
          <Field
            label="Owner mobile number"
            value={ownerPhone}
            onChangeText={(value) => setOwnerPhone(value.replace(/[^\d\s+]/g, ''))}
            placeholder="98765 43210"
            keyboardType="phone-pad"
            maxLength={14}
          />
        </Card>

        <Button
          label={busy ? 'Creating…' : 'Create salon'}
          onPress={() => void submit()}
          loading={busy}
          size="lg"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(4), gap: space(3) },
  cardTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900, marginBottom: space(3) },
  help: { fontSize: font.size.xs, color: colors.ink500, lineHeight: 18, marginBottom: space(3) },
  planRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
});
