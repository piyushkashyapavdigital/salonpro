/**
 * Unified sign-in.
 *
 * A printed poster, not a form: the wordmark, a serif welcome, a ticker of the
 * three rooms, then one quiet panel. Demo servers add a dark "backstage" card
 * that opens the seeded account for any workspace with a PIN.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../shared/auth';
import { auth } from '../shared/endpoints';
import { errorMessage } from '../shared/hooks';
import { ServerCard } from '../shared/ServerCard';
import { Banner, BrandMark, Button, Field, Marquee } from '../shared/components';
import { colors, font, label, radius, space } from '../shared/theme';
import { APP_VERSION } from '../config';
import type { DevLoginRole } from '../shared/types';

const WORKSPACES: { role: DevLoginRole; label: string; sub: string }[] = [
  { role: 'super_admin', label: 'Platform', sub: 'Support console' },
  { role: 'salon_owner', label: 'Salon owner', sub: 'The full workspace' },
  { role: 'branch_manager', label: 'Manager', sub: 'One branch, one team' },
  { role: 'receptionist', label: 'Reception', sub: 'The front desk' },
  { role: 'customer', label: 'Client', sub: 'The customer app' },
];

function RoleRow({
  index,
  label: roleLabel,
  sub,
  busy,
  disabled,
  onPress,
}: {
  index: number;
  label: string;
  sub: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Open the demo ${roleLabel} account`}
      style={({ pressed }) => [styles.roleRow, pressed && styles.rolePressed]}
    >
      <Text style={styles.roleIndex}>{String(index).padStart(2, '0')}</Text>
      <View style={styles.flex}>
        <Text style={styles.roleLabel}>{roleLabel}</Text>
        <Text style={styles.roleSub}>{sub}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.clay} />
      ) : (
        <MaterialIcons name="arrow-forward" size={16} color="rgba(251,248,242,0.42)" />
      )}
    </Pressable>
  );
}

export function SignInScreen() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [pin, setPin] = useState('');
  const [pinBusyRole, setPinBusyRole] = useState<DevLoginRole | null>(null);
  /** Null until the server answers: the demo card is hidden either way. */
  const [devMode, setDevMode] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    auth
      .devMode()
      .then((res) => {
        if (!cancelled) setDevMode(Boolean(res.enabled));
      })
      .catch(() => {
        if (!cancelled) setDevMode(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  /** The error appears at the top of the sheet; bring it into view. */
  const showError = (text: string | null) => {
    setError(text);
    if (text) scrollRef.current?.scrollTo({ y: 250, animated: true });
  };

  const requestCode = async () => {
    setError(null);
    if (cleanPhone.length !== 10) {
      showError('Enter the 10 digit mobile number this phone is registered with.');
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
      showError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (code.replace(/\D/g, '').length < 4) {
      showError('Enter the one-time code.');
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
      showError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /** Demo servers only: open the first seeded account for a workspace. */
  const devLogin = async (role?: DevLoginRole) => {
    setError(null);
    if (!pin.trim()) {
      showError('Enter the developer PIN first. Demo servers use 1234.');
      return;
    }
    setPinBusyRole(role ?? 'salon_owner');
    try {
      await signIn(await auth.devLogin({ pin: pin.trim(), role }));
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setPinBusyRole(null);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SafeAreaView edges={['top']} style={styles.poster}>
            <View style={styles.masthead}>
              <View style={styles.brandRow}>
                <BrandMark size={36} />
                <Text style={styles.wordmark}>
                  SalonPro<Text style={styles.wordmarkDot}>.</Text>
                </Text>
              </View>
              <Text style={styles.est}>EST. 2026</Text>
            </View>

            <View style={styles.hero}>
              <Text style={styles.heroKicker}>CLIENT · SALON · PLATFORM</Text>
              <Text style={styles.heroTitle}>
                Your chair{'\n'}is <Text style={styles.heroItalic}>waiting.</Text>
              </Text>
              <Text style={styles.heroSub}>
                {stage === 'phone'
                  ? 'One app for the people in the chair and the people holding the scissors.'
                  : `We sent a code to ${cleanPhone}. It expires in five minutes.`}
              </Text>
            </View>

            <Marquee items={['CLIENTS', 'SALONS', 'PLATFORM', 'ONE APP', 'PRIVATE REVIEWS']} />
          </SafeAreaView>

          <View style={styles.sheet}>
            {error ? <Banner tone="error" title="Could not continue" message={error} /> : null}

            <View style={styles.panel}>
              <View style={styles.panelRule} />
              <Text style={styles.panelKicker}>{stage === 'phone' ? '01 — SIGN IN' : '02 — VERIFY'}</Text>
              <Text style={styles.panelTitle}>{stage === 'phone' ? 'Welcome back.' : 'Check your messages.'}</Text>
              <Text style={styles.panelSub}>
                {stage === 'phone'
                  ? 'We will text a one-time code. No password to remember.'
                  : 'Enter the code we sent. It works once and then expires.'}
              </Text>

              <View style={styles.form}>
                {stage === 'phone' ? (
                  <>
                    <Field
                      label="Mobile number"
                      value={phone}
                      onChangeText={(text) => setPhone(text.replace(/[^\d+\s]/g, ''))}
                      placeholder="98765 43210"
                      keyboardType="phone-pad"
                      maxLength={14}
                    />
                    <Button
                      label={busy ? 'Sending…' : 'Send one-time code'}
                      onPress={() => void requestCode()}
                      loading={busy}
                      size="lg"
                      style={{ marginTop: space(5) }}
                    />
                    <Text style={styles.formNote}>No email. No password. Just the number the salon knows.</Text>
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
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                      style={styles.codeInput}
                    />
                    <Button
                      label={busy ? 'Verifying…' : 'Verify & open the app'}
                      onPress={() => void verify()}
                      loading={busy}
                      size="lg"
                      style={{ marginTop: space(5) }}
                    />
                    <Pressable
                      onPress={() => {
                        setStage('phone');
                        setCode('');
                        setName('');
                        setIsNew(false);
                        setDevCode(null);
                        setError(null);
                      }}
                      hitSlop={8}
                      style={{ marginTop: space(3), alignSelf: 'center' }}
                    >
                      <Text style={styles.link}>Use a different number</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>

            {devMode ? (
              <View style={styles.demoPanel}>
                <View style={styles.demoHead}>
                  <View style={styles.flex}>
                    <Text style={styles.demoKicker}>DEMO ACCESS</Text>
                    <Text style={styles.demoTitle}>Walk into any room.</Text>
                  </View>
                  <Pressable onPress={() => setPin('1234')} hitSlop={8} style={styles.pinChip}>
                    <Text style={styles.pinChipText}>Use 1234</Text>
                  </Pressable>
                </View>
                <Text style={styles.demoNote}>
                  The PIN opens the first seeded account for that workspace. Enter it once, then choose a room.
                </Text>

                <Text style={styles.pinLabel}>DEVELOPER PIN</Text>
                <TextInput
                  value={pin}
                  onChangeText={(text) => setPin(text.replace(/\D/g, '').slice(0, 8))}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={8}
                  placeholder="••••"
                  placeholderTextColor="rgba(251,248,242,0.28)"
                  style={styles.pinInput}
                />

                <View style={styles.roleList}>
                  {WORKSPACES.map((item, index) => (
                    <RoleRow
                      key={item.role}
                      index={index + 1}
                      label={item.label}
                      sub={item.sub}
                      busy={pinBusyRole === item.role}
                      disabled={Boolean(pinBusyRole)}
                      onPress={() => void devLogin(item.role)}
                    />
                  ))}
                </View>

                <Text style={styles.demoFoot}>
                  Only demo servers show this card. A real deployment turns developer sign-in off.
                </Text>
              </View>
            ) : null}

            <Pressable onPress={() => setShowServer((value) => !value)} style={styles.serverRow}>
              <MaterialIcons name="dns" size={15} color={colors.ink500} />
              <Text style={styles.serverText}>Salon server address</Text>
              <MaterialIcons name={showServer ? 'expand-less' : 'expand-more'} size={19} color={colors.ink400} />
            </Pressable>

            {showServer ? <ServerCard /> : null}

            <Text style={styles.version}>SALONPRO {APP_VERSION}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  scroll: { paddingBottom: space(12) },

  poster: { paddingHorizontal: space(5), paddingBottom: 0 },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space(3),
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  wordmark: {
    fontFamily: font.family.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink900,
    letterSpacing: -0.5,
  },
  wordmarkDot: { color: colors.clay },
  est: { ...label('muted'), fontSize: 7.5, letterSpacing: 1.8 },

  hero: { marginTop: space(8) },
  heroKicker: { ...label('muted'), fontSize: 8, letterSpacing: 2 },
  heroTitle: {
    fontFamily: font.family.display,
    fontSize: font.size.hero,
    lineHeight: 46,
    letterSpacing: -1.1,
    color: colors.ink900,
    marginTop: space(3),
  },
  heroItalic: {
    fontFamily: Platform.select({ android: 'InstrumentSerifItalic', ios: 'Georgia', default: 'Georgia' }),
    fontStyle: 'italic',
    color: colors.clay,
  },
  heroSub: {
    fontSize: font.size.sm,
    lineHeight: 19,
    color: colors.ink500,
    marginTop: space(3),
    maxWidth: 330,
  },

  sheet: { paddingHorizontal: space(4), paddingTop: space(5), gap: space(3.5) },

  panel: {
    position: 'relative',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space(5),
    overflow: 'hidden',
  },
  panelRule: { position: 'absolute', top: 0, left: space(5), width: 44, height: 2, backgroundColor: colors.clay },
  panelKicker: { ...label('muted'), fontSize: 8, letterSpacing: 1.8 },
  panelTitle: {
    fontFamily: font.family.display,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink900,
    marginTop: space(1.5),
  },
  panelSub: { fontSize: font.size.sm, lineHeight: 19, color: colors.ink500, marginTop: space(1.5) },
  form: { marginTop: space(4), gap: space(4) },
  formNote: { fontSize: 9.5, lineHeight: 15, color: colors.ink400, marginTop: space(1) },
  codeInput: {
    fontFamily: font.family.display,
    fontSize: 34,
    letterSpacing: 12,
    textAlign: 'center',
    paddingVertical: space(1),
  },
  link: {
    ...label('muted'),
    fontSize: 8.5,
    letterSpacing: 1.3,
    textDecorationLine: 'underline',
    textDecorationColor: colors.line,
  },

  demoPanel: {
    backgroundColor: colors.ink900,
    borderRadius: radius.lg,
    padding: space(5),
    overflow: 'hidden',
  },
  demoHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  demoKicker: { ...label('light'), fontSize: 8, letterSpacing: 2 },
  demoTitle: {
    fontFamily: font.family.display,
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: colors.paper,
    marginTop: space(1),
  },
  pinChip: {
    borderWidth: 1,
    borderColor: 'rgba(251,248,242,0.24)',
    borderRadius: radius.pill,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
  },
  pinChipText: { ...label('light'), fontSize: 7.5, letterSpacing: 1.2, color: colors.paper },
  demoNote: { fontSize: 10.5, lineHeight: 16, color: 'rgba(251,248,242,0.5)', marginTop: space(2.5) },
  pinLabel: { ...label('light'), fontSize: 7.5, letterSpacing: 1.6, marginTop: space(4) },
  pinInput: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(251,248,242,0.24)',
    color: colors.paper,
    fontSize: font.size.xl,
    letterSpacing: 8,
    paddingVertical: space(2),
    paddingHorizontal: 0,
  },

  roleList: { marginTop: space(4), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(251,248,242,0.14)' },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(251,248,242,0.14)',
  },
  rolePressed: { opacity: 0.6 },
  roleIndex: {
    ...label('light'),
    fontFamily: font.family.mono,
    fontSize: 8,
    letterSpacing: 0.6,
    width: 18,
    color: 'rgba(251,248,242,0.34)',
  },
  roleLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.paper, letterSpacing: 0.1 },
  roleSub: { fontSize: 9.5, color: 'rgba(251,248,242,0.45)', marginTop: 1 },
  demoFoot: { fontSize: 9, lineHeight: 14, color: 'rgba(251,248,242,0.34)', marginTop: space(3) },

  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingVertical: space(2),
    paddingHorizontal: space(1),
  },
  serverText: { flex: 1, ...label('muted'), fontSize: 8.5, letterSpacing: 1.2 },
  version: { ...label('muted'), fontSize: 7.5, letterSpacing: 2, textAlign: 'center', marginTop: space(2) },
});
