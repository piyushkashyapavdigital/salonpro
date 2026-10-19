/**
 * Sign in with a mobile number and a one-time code.
 *
 * Honesty rules the screen obeys: it never says an SMS was sent. When the server
 * is running in development-mock mode it returns the code, the screen shows it
 * as a labelled DEV MODE block and says so in words; when the server has no SMS
 * provider and is not in mock mode, the server answers 503 and the screen shows
 * that message verbatim.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../shared/auth';
import { auth } from '../shared/endpoints';
import { errorMessage } from '../shared/hooks';
import { ServerCard } from '../shared/ServerCard';
import { Banner, Button, Card, Chip, Field, Loading, Screen } from '../shared/components';
import { colors, font, gradients, radius, shadow, space } from '../shared/theme';
import { APP_NAME, APP_VERSION } from '../config';
import type { DemoAccount } from '../shared/types';

export function SignInScreen() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [demo, setDemo] = useState<{ accounts: DemoAccount[]; password: string; notice: string } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const phoneReady = cleanPhone.length === 10;

  const requestCode = async () => {
    setError(null);
    if (!phoneReady) {
      setError('Enter the 10 digit mobile number you use at the salon.');
      return;
    }
    setBusy(true);
    try {
      const res = await auth.requestOtp(cleanPhone);
      setStage('code');
      setIsNew(res.isNewUser);
      setDevCode(res.devCode ?? null);
      setNotice(res.notice ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (code.replace(/\D/g, '').length < 4) {
      setError('Enter the code from the SMS.');
      return;
    }
    setBusy(true);
    try {
      const session = await auth.verifyOtp({
        phone: cleanPhone,
        code: code.trim(),
        ...(isNew && name.trim() ? { name: name.trim() } : {}),
      });
      await signIn(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setDemoBusy(true);
    setError(null);
    try {
      const res = await auth.demoAccounts();
      setDemo(res.accounts.length ? { accounts: res.accounts, password: res.password, notice: res.notice } : null);
      if (!res.accounts.length) setError('This server has no demo accounts (it is not a demo database).');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  };

  const demoLogin = async (accountPhone: string) => {
    setDemoBusy(true);
    setError(null);
    try {
      const session = await auth.demoLogin(accountPhone);
      await signIn(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.header as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <SafeAreaView edges={['top']}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <MaterialIcons name="spa" size={26} color={colors.brand700} />
            </View>
            <View>
              <Text style={styles.brandName}>{APP_NAME}</Text>
              <Text style={styles.brandTag}>Your salon, in your pocket</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>
            {stage === 'phone' ? 'Sign in to book,\nrecharge and track visits.' : 'Enter your one-time code.'}
          </Text>
          <Text style={styles.heroSub}>
            {stage === 'phone'
              ? 'We only need the number your salon already has on file.'
              : `Sent to ${cleanPhone}. The code expires in 5 minutes.`}
          </Text>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Banner tone="error" title="Could not continue" message={error} /> : null}

          {stage === 'phone' ? (
            <Card>
              <Field
                label="Mobile number"
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/[^\d+\s]/g, ''))}
                placeholder="98765 43210"
                keyboardType="phone-pad"
                maxLength={14}
                hint="India (+91) — the number registered at the salon."
              />
              {isNew ? (
                <Text style={styles.helper}>
                  New here? After verifying, add your name and you are in — the salon will see your first booking.
                </Text>
              ) : null}
              <Button
                label={busy ? 'Sending…' : 'Send one-time code'}
                onPress={() => void requestCode()}
                loading={busy}
                size="lg"
                style={{ marginTop: space(4) }}
              />
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>
              <Button
                label={demo ? 'Hide demo accounts' : 'Try a demo account'}
                variant="secondary"
                onPress={() => (demo ? setDemo(null) : void loadDemo())}
                loading={demoBusy}
              />
            </Card>
          ) : (
            <Card>
              {devCode ? (
                <Banner
                  tone="warning"
                  title="DEV MODE — no SMS was sent"
                  message={`This server has no SMS provider, so the code is shown here instead: ${devCode}`}
                />
              ) : null}
              {notice && !devCode ? <Banner tone="info" message={notice} /> : null}

              {isNew ? (
                <Field
                  label="Your name"
                  value={name}
                  onChangeText={setName}
                  placeholder="How the salon should greet you"
                  autoCapitalize="words"
                />
              ) : null}

              <Field
                label="One-time code"
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 digit code"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                style={styles.codeInput}
              />
              <Button label={busy ? 'Verifying…' : 'Verify & continue'} onPress={() => void verify()} loading={busy} size="lg" style={{ marginTop: space(4) }} />
              <Pressable
                onPress={() => {
                  setStage('phone');
                  setCode('');
                  setDevCode(null);
                  setNotice(null);
                  setError(null);
                }}
                hitSlop={8}
                style={{ marginTop: space(3) }}
              >
                <Text style={styles.link}>Use a different number</Text>
              </Pressable>
            </Card>
          )}

          {demo ? (
            <Card>
              <Text style={styles.demoTitle}>Demo accounts on this server</Text>
              <Text style={styles.demoNote}>{demo.notice}</Text>
              {demo.accounts.map((account) => (
                <Pressable key={account.phone} onPress={() => void demoLogin(account.phone)} style={styles.demoRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.demoName}>{account.name}</Text>
                    <Text style={styles.demoMeta}>
                      {account.label ?? account.role} · {account.phone}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.ink300} />
                </Pressable>
              ))}
            </Card>
          ) : null}

          <Card>
            <Pressable onPress={() => setShowServer((value) => !value)} style={styles.serverToggle}>
              <MaterialIcons name="dns" size={18} color={colors.brand700} />
              <Text style={styles.serverToggleText}>Salon server address</Text>
              <MaterialIcons name={showServer ? 'expand-less' : 'expand-more'} size={20} color={colors.ink400} />
            </Pressable>
            <Text style={styles.serverHint}>
              Signing in to a different salon? Point the app at their server here. You can change it any time from
              Profile.
            </Text>
          </Card>

          {showServer ? <ServerCard /> : null}

          <Text style={styles.version}>
            {APP_NAME} {APP_VERSION}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { paddingHorizontal: space(6), paddingBottom: space(10), borderBottomLeftRadius: 34, borderBottomRightRadius: 34 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(4) },
  logo: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  brandName: { color: colors.white, fontSize: font.size.lg, fontWeight: font.weight.heavy, letterSpacing: -0.3 },
  brandTag: { color: '#FBDFEB', fontSize: font.size.xs },
  heroTitle: { color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.heavy, marginTop: space(6), letterSpacing: -0.6, lineHeight: 34 },
  heroSub: { color: '#FBD9E7', fontSize: font.size.sm, marginTop: space(2), lineHeight: 20 },
  sheetWrap: { flex: 1, marginTop: -space(6) },
  sheet: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  helper: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(2), lineHeight: 18 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginVertical: space(3) },
  orLine: { flex: 1, height: 1, backgroundColor: colors.ink100 },
  orText: { color: colors.ink400, fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  codeInput: { fontSize: font.size.xxl, letterSpacing: 10, textAlign: 'center', fontWeight: font.weight.bold },
  link: { color: colors.brand700, fontWeight: font.weight.semibold, fontSize: font.size.sm, textAlign: 'center' },
  demoTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  demoNote: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(1), lineHeight: 18 },
  demoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ink100, gap: space(2) },
  demoName: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  demoMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2 },
  serverToggle: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  serverToggleText: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  serverHint: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(2), lineHeight: 18 },
  version: { textAlign: 'center', color: colors.ink300, fontSize: font.size.xs, marginTop: space(2) },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  pageTitle: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink900 },
  back: { alignItems: 'center', justifyContent: 'center' },
});
