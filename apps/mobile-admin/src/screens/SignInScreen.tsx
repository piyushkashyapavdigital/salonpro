/**
 * Staff sign-in: the same phone + one-time code as the customer app, but with a
 * role check afterwards — a customer account is told which app to use instead.
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
import { Banner, Button, Card, Field } from '../shared/components';
import { colors, font, gradients, radius, shadow, space } from '../shared/theme';
import { APP_VERSION } from '../config';
import type { DemoAccount } from '../shared/types';

export function SignInScreen() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [demo, setDemo] = useState<{ accounts: DemoAccount[]; notice: string } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);

  const requestCode = async () => {
    setError(null);
    if (cleanPhone.length !== 10) {
      setError('Enter the 10 digit mobile number this phone is registered with.');
      return;
    }
    setBusy(true);
    try {
      const res = await auth.requestOtp(cleanPhone);
      setStage('code');
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
    setBusy(true);
    try {
      const session = await auth.verifyOtp({ phone: cleanPhone, code: code.trim() });
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
      const staff = res.accounts.filter((account) => account.role !== 'customer');
      if (!staff.length) {
        setError('No staff demo accounts on this server — it is running with real data.');
        setDemo(null);
        return;
      }
      setDemo({ accounts: staff, notice: res.notice });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  };

  const demoLogin = async (demoPhone: string) => {
    setDemoBusy(true);
    setError(null);
    try {
      await signIn(await auth.demoLogin(demoPhone));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  };

  /** Demo servers only: open the app with the developer PIN instead of an OTP. */
  const devLogin = async () => {
    setError(null);
    if (pin.replace(/\D/g, '').length < 3) {
      setError('Enter the developer PIN.');
      return;
    }
    setPinBusy(true);
    try {
      await signIn(await auth.devLogin({ pin: pin.trim() }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.header as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <SafeAreaView edges={['top']}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <MaterialIcons name="storefront" size={24} color={colors.brand700} />
            </View>
            <View>
              <Text style={styles.brandName}>SalonPro Admin</Text>
              <Text style={styles.brandTag}>Runs the salon, not the chair</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{stage === 'phone' ? 'Sign in to the salon' : 'Enter your one-time code.'}</Text>
          <Text style={styles.heroSub}>
            {stage === 'phone'
              ? 'Owner, manager, reception and stylist accounts all sign in here.'
              : `Sent to ${cleanPhone}. Codes expire in 5 minutes.`}
          </Text>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Banner tone="error" title="Could not continue" message={error} /> : null}

          <Card>
            {stage === 'phone' ? (
              <>
                <Field
                  label="Staff mobile number"
                  value={phone}
                  onChangeText={(text) => setPhone(text.replace(/[^\d+\s]/g, ''))}
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  maxLength={14}
                />
                <Button label={busy ? 'Sending…' : 'Send one-time code'} onPress={() => void requestCode()} loading={busy} size="lg" style={{ marginTop: space(4) }} />
              </>
            ) : (
              <>
                {devCode ? (
                  <Banner
                    tone="warning"
                    title="DEV MODE — no SMS was sent"
                    message={`This server has no SMS provider, so the code is shown here instead: ${devCode}`}
                  />
                ) : null}
                {notice && !devCode ? <Banner tone="info" message={notice} /> : null}
                <Field
                  label="One-time code"
                  value={code}
                  onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={styles.codeInput}
                />
                <Button label={busy ? 'Verifying…' : 'Verify & open the app'} onPress={() => void verify()} loading={busy} size="lg" style={{ marginTop: space(4) }} />
                <Pressable
                  onPress={() => {
                    setStage('phone');
                    setCode('');
                    setDevCode(null);
                    setError(null);
                  }}
                  hitSlop={8}
                  style={{ marginTop: space(3) }}
                >
                  <Text style={styles.link}>Use a different number</Text>
                </Pressable>
              </>
            )}
          </Card>

          <Card>
            <View style={styles.devHead}>
              <MaterialIcons name="vpn-key" size={18} color={colors.brand700} />
              <Text style={styles.devTitle}>Developer sign-in</Text>
            </View>
            <Text style={styles.devNote}>
              Demo servers only. Enter the developer PIN to open the app as the salon owner — no SMS, no one-time code.
              A real server turns this off automatically.
            </Text>
            <Field
              label="Developer PIN"
              value={pin}
              onChangeText={(text) => setPin(text.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="••••"
            />
            <Button
              label={pinBusy ? 'Opening…' : 'Open with PIN'}
              variant="secondary"
              onPress={() => void devLogin()}
              loading={pinBusy}
              style={{ marginTop: space(3) }}
            />
          </Card>

          <Card>
            <Button
              label={demo ? 'Hide demo staff' : 'Demo staff accounts'}
              variant="secondary"
              onPress={() => (demo ? setDemo(null) : void loadDemo())}
              loading={demoBusy}
            />
            {demo ? (
              <>
                <Text style={styles.demoNote}>{demo.notice}</Text>
                {demo.accounts.map((account) => (
                  <Pressable key={account.phone} onPress={() => void demoLogin(account.phone)} style={styles.demoRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.demoName}>{account.name}</Text>
                      <Text style={styles.demoMeta}>
                        {account.role.replace(/_/g, ' ')} · {account.phone}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={colors.ink300} />
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={styles.demoNote}>
                Demo logins exist only on a demo database. On a real salon database the owner signs in with the code sent to
                their own number.
              </Text>
            )}
          </Card>

          <Card>
            <Pressable onPress={() => setShowServer((value) => !value)} style={styles.serverToggle}>
              <MaterialIcons name="dns" size={18} color={colors.brand700} />
              <Text style={styles.serverToggleText}>Salon server address</Text>
              <MaterialIcons name={showServer ? 'expand-less' : 'expand-more'} size={20} color={colors.ink400} />
            </Pressable>
          </Card>

          {showServer ? <ServerCard /> : null}

          <Text style={styles.version}>SalonPro Admin {APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { paddingHorizontal: space(6), paddingBottom: space(9), borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(4) },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  brandName: { color: colors.white, fontSize: font.size.lg, fontWeight: font.weight.heavy, letterSpacing: -0.3 },
  brandTag: { color: '#FBDFEB', fontSize: font.size.xs },
  heroTitle: { color: colors.white, fontSize: font.size.xl, fontWeight: font.weight.heavy, marginTop: space(6), letterSpacing: -0.5 },
  heroSub: { color: '#FBD9E7', fontSize: font.size.sm, marginTop: space(2), lineHeight: 20 },
  sheetWrap: { flex: 1, marginTop: -space(5) },
  sheet: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  codeInput: { fontSize: font.size.xxl, letterSpacing: 10, textAlign: 'center', fontWeight: font.weight.bold },
  link: { color: colors.brand700, fontWeight: font.weight.semibold, fontSize: font.size.sm, textAlign: 'center' },
  demoNote: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(2), lineHeight: 18 },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(3) },
  demoName: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  demoMeta: { fontSize: font.size.xs, color: colors.ink400, marginTop: 2, textTransform: 'capitalize' },
  serverToggle: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  serverToggleText: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  version: { textAlign: 'center', color: colors.ink300, fontSize: font.size.xs },
  devHead: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  devTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  devNote: { fontSize: font.size.xs, color: colors.ink500, marginTop: space(1), marginBottom: space(3), lineHeight: 18 },
});
