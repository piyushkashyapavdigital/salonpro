/**
 * "Which server does this app talk to?"
 *
 * The packaged app is useless until it can reach the API, and the person holding
 * the phone almost never knows a URL — so this card does three things: it shows
 * the address in use, offers one-tap presets, and *proves* the address before
 * saving it (a captive portal must not be mistaken for a connected server).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BUILD_API_BASE, SERVER_PRESETS } from '../config';
import { checkApiBase, getApiBase, normalizeApiBase, setApiBase } from './api';
import { Banner, Button, Card, Chip, Field } from './components';
import { colors, font, space } from './theme';

export function CurrentServerLine() {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>Server</Text>
      <Text style={styles.lineValue} numberOfLines={1}>
        {getApiBase() || '(not set)'}
      </Text>
    </View>
  );
}

export function ServerCard({ onSaved }: { onSaved?: () => void }) {
  const [value, setValue] = useState(getApiBase() === BUILD_API_BASE ? '' : getApiBase());
  const [state, setState] = useState<{ tone: 'info' | 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (candidate: string) => {
    if (!candidate.trim()) {
      setState({ tone: 'error', message: 'Enter the server address first.' });
      return;
    }
    setBusy(true);
    setState({ tone: 'info', message: `Checking ${normalizeApiBase(candidate)}…` });
    const result = await checkApiBase(candidate);
    if (!result.ok) {
      setState({ tone: 'error', message: result.message });
      setBusy(false);
      return;
    }
    await setApiBase(candidate);
    setBusy(false);
    setState({ tone: 'success', message: `${result.message} Saved.` });
    onSaved?.();
  };

  const reset = async () => {
    await setApiBase(null);
    setValue('');
    setState({ tone: 'info', message: `Back to the address this app was built with: ${BUILD_API_BASE}` });
    onSaved?.();
  };

  return (
    <Card>
      <Text style={styles.title}>Salon server address</Text>
      <Text style={styles.help}>
        This app is not tied to one server. Point it at the salon you are visiting — a hosted address like
        https://salon.example.com, or the address shown on the salon's own computer (for example 192.168.1.34:4000)
        while the phone is on the same Wi-Fi.
      </Text>

      {SERVER_PRESETS.length > 0 ? (
        <View style={styles.presets}>
          {SERVER_PRESETS.map((preset) => (
            <Chip key={preset} label={preset.replace(/^https?:\/\//, '')} onPress={() => void save(preset)} />
          ))}
        </View>
      ) : null}

      <Field
        label="Address"
        value={value}
        onChangeText={setValue}
        placeholder={BUILD_API_BASE || '192.168.1.34:4000'}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!busy}
      />

      <View style={styles.actions}>
        <Button label={busy ? 'Checking…' : 'Test & save'} onPress={() => void save(value)} loading={busy} style={styles.action} />
        <Button label="Use build default" variant="secondary" onPress={() => void reset()} style={styles.action} />
      </View>

      {state ? <Banner tone={state.tone} message={state.message} /> : null}

      <Text style={styles.footnote}>
        Nothing is saved unless the address answers as a SalonPro server. The setting only exists on this phone.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  help: { fontSize: font.size.sm, color: colors.ink500, lineHeight: 20, marginTop: space(1.5) },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(3) },
  actions: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  action: { flex: 1 },
  footnote: { fontSize: font.size.xs, color: colors.ink400, marginTop: space(3) },
  line: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  lineLabel: { fontSize: font.size.xs, color: '#EADCF6', textTransform: 'uppercase', letterSpacing: 0.4 },
  lineValue: { fontSize: font.size.xs, color: colors.white, fontWeight: font.weight.semibold, flexShrink: 1 },
});
