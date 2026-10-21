/**
 * Unified sign-in: one phone + one-time code. After verification the server
 * session decides whether this opens the client, vendor or platform workspace.
 *
 * Demo servers also expose a PIN-only switcher below the normal form. Each
 * shortcut asks the server for the first seeded account in that workspace, so
 * testing admin → vendor → client never means juggling phone numbers.
 */
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../shared/auth';
import { auth } from '../shared/endpoints';
import { errorMessage } from '../shared/hooks';
import { ServerCard } from '../shared/ServerCard';
import { Banner, BrandMark, Button, Card, Field } from '../shared/components';
import { colors, font, gradients, radius, shadow, space } from '../shared/theme';
import { APP_VERSION } from '../config';
import type { DevLoginRole } from '../shared/types';

const DEMO_ROLES: { role: DevLoginRole; label: string; sub: string; icon: string; tone: string }[] = [
  { role: 'super_admin', label: 'Platform', sub: 'Super admin', icon: 'admin-panel-settings', tone: colors.grape },
  { role: 'salon_owner', label: 'Salon owner', sub: 'Full workspace', icon: 'storefront', tone: colors.brand700 },
  { role: 'customer', label: 'Client', sub: 'Customer app', icon: 'person', tone: colors.mint },
];

const EXTRA_ROLES: { role: DevLoginRole; label: string; icon: string }[] = [
  { role: 'branch_manager', label: 'Manager', icon: 'supervisor-account' },
  { role: 'receptionist', label: 'Reception', icon: 'support-agent' },
];

function RoleCard({
  role,
  label,
  sub,
  icon,
  tone,
  busy,
  onPress,
}: {
  role: DevLoginRole;
  label: string;
  sub: string;
  icon: string;
  tone: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Open the demo ${label} account`}
      style={({ pressed }) => [styles.roleCard, pressed && styles.rolePressed]}
    >
      <View style={[styles.roleIcon, { backgroundColor: tone }]}>
        {busy ? <ActivityIndicator size="small" color={colors.white} /> : <MaterialIcons name={icon} size={20} color={colors.white} />}
      </View>
      <Text style={styles.roleLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.roleSub} numberOfLines={1}>
        {sub}
      </Text>
      <Text style={styles.roleKey}>{role.replace(/_/g, ' ')}</Text>
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

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  /** The banner lives above the fold, so bring it into view when it appears. */
  const showError = (text: string | null) => {
    setError(text);
    if (text) scrollRef.current?.scrollTo({ y: 0, animated: true });
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
      <LinearGradient colors={gradients.header as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroOrb1} />
        <View style={styles.heroOrb2} />
        <View style={styles.heroOrb3} />
        <SafeAreaView edges={['top']}>
          <View style={styles.brandRow}>
            <BrandMark size={46} />
            <View style={{ flex: 1 }}>
              <Text style={styles.brandName}>SalonPro</Text>
              <Text style={styles.brandTag}>The whole salon, in one app.</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{stage === 'phone' ? 'Welcome back.' : 'Check your messages.'}</Text>
          <Text style={styles.heroSub}>
            {stage === 'phone'
              ? 'Customers, salon teams and platform admins all sign in here. Your account decides where you land.'
              : `We sent a code to ${cleanPhone}. It expires in 5 minutes.`}
          </Text>
          <View style={styles.workspaceStrip}>
            <View style={styles.workspacePill}>
              <MaterialIcons name="person" size={13} color={colors.brand100} />
              <Text style={styles.workspaceText}>Client</Text>
            </View>
            <View style={styles.workspacePill}>
              <MaterialIcons name="storefront" size={13} color={colors.brand100} />
              <Text style={styles.workspaceText}>Salon</Text>
            </View>
            <View style={styles.workspacePill}>
              <MaterialIcons name="admin-panel-settings" size={13} color={colors.brand100} />
              <Text style={styles.workspaceText}>Platform</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.sheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error ? <Banner tone="error" title="Could not continue" message={error} /> : null}

          <Card>
            {stage === 'phone' ? (
              <>
                <View style={styles.cardHead}>
                  <View style={styles.cardIcon}>
                    <MaterialIcons name="phone-iphone" size={18} color={colors.brand700} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Sign in with your phone</Text>
                    <Text style={styles.cardSub}>We will send a one-time code. No password to remember.</Text>
                  </View>
                </View>
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
                  style={{ marginTop: space(4) }}
                />
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
                  style={{ marginTop: space(4) }}
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
                  style={{ marginTop: space(3) }}
                >
                  <Text style={styles.link}>Use a different number</Text>
                </Pressable>
              </>
            )}
          </Card>

          <Card style={styles.demoCard}>
            <View style={styles.devHead}>
              <View style={styles.devIcon}>
                <MaterialIcons name="bolt" size={18} color={colors.coral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.devTitle}>Demo access</Text>
                <Text style={styles.devNote}>Developer PIN · demo servers only</Text>
              </View>
              <Pressable onPress={() => setPin('1234')} hitSlop={8} style={styles.pinChip}>
                <Text style={styles.pinChipText}>Use 1234</Text>
              </Pressable>
            </View>

            <Field
              label="Developer PIN"
              value={pin}
              onChangeText={(text) => setPin(text.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="••••"
            />

            <View style={styles.roleGrid}>
              {DEMO_ROLES.map((item) => (
                <RoleCard
                  key={item.role}
                  {...item}
                  busy={pinBusyRole === item.role}
                  onPress={() => void devLogin(item.role)}
                />
              ))}
            </View>

            <View style={styles.extraRow}>
              {EXTRA_ROLES.map((item) => (
                <Pressable
                  key={item.role}
                  onPress={() => void devLogin(item.role)}
                  disabled={Boolean(pinBusyRole)}
                  style={({ pressed }) => [styles.extraPill, pressed && styles.rolePressed]}
                >
                  {pinBusyRole === item.role ? (
                    <ActivityIndicator size="small" color={colors.brand700} />
                  ) : (
                    <MaterialIcons name={item.icon} size={15} color={colors.brand700} />
                  )}
                  <Text style={styles.extraText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.demoFootnote}>
              The PIN opens the first seeded account for that workspace. A real server turns developer sign-in off.
            </Text>
          </Card>

          <Card>
            <Pressable onPress={() => setShowServer((value) => !value)} style={styles.serverToggle}>
              <MaterialIcons name="dns" size={18} color={colors.brand700} />
              <Text style={styles.serverToggleText}>Salon server address</Text>
              <MaterialIcons name={showServer ? 'expand-less' : 'expand-more'} size={20} color={colors.ink400} />
            </Pressable>
          </Card>

          {showServer ? <ServerCard /> : null}

          <Text style={styles.version}>SalonPro {APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: {
    paddingHorizontal: space(6),
    paddingBottom: space(9),
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroOrb1: { position: 'absolute', top: -80, right: -40, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(217, 119, 87, 0.18)' },
  heroOrb2: { position: 'absolute', bottom: -90, left: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroOrb3: { position: 'absolute', top: 34, right: 74, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(201, 162, 39, 0.16)' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(4) },
  brandName: { color: colors.white, fontFamily: font.family.display, fontSize: font.size.xl, fontWeight: font.weight.bold, letterSpacing: -0.4 },
  brandTag: { color: colors.brand100, fontSize: font.size.xs, marginTop: 1 },
  heroTitle: { color: colors.white, fontFamily: font.family.display, fontSize: font.size.hero, fontWeight: font.weight.bold, marginTop: space(6), letterSpacing: -0.8 },
  heroSub: { color: colors.brand100, fontSize: font.size.sm, marginTop: space(2), lineHeight: 20, maxWidth: 330 },
  workspaceStrip: { flexDirection: 'row', gap: space(2), marginTop: space(4), flexWrap: 'wrap' },
  workspacePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: space(2.5), paddingVertical: space(1.5) },
  workspaceText: { color: colors.brand100, fontSize: 10, fontWeight: font.weight.semibold, letterSpacing: 0.3 },
  sheetWrap: { flex: 1, marginTop: -space(5) },
  sheet: { padding: space(4), gap: space(3), paddingBottom: space(10) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(3) },
  cardIcon: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  cardSub: { fontSize: font.size.xs, color: colors.ink500, marginTop: 2, lineHeight: 17 },
  codeInput: { fontSize: font.size.xxl, letterSpacing: 10, textAlign: 'center', fontWeight: font.weight.bold },
  link: { color: colors.brand700, fontWeight: font.weight.semibold, fontSize: font.size.sm, textAlign: 'center' },
  demoCard: { borderColor: colors.brand100, backgroundColor: '#FFFDF9' },
  devHead: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(3) },
  devIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.coralSoft, alignItems: 'center', justifyContent: 'center' },
  devTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink900 },
  devNote: { fontSize: font.size.xs, color: colors.ink500, marginTop: 1 },
  pinChip: { paddingHorizontal: space(2.5), paddingVertical: space(1.5), borderRadius: radius.pill, backgroundColor: colors.brand50, borderWidth: 1, borderColor: colors.brand100 },
  pinChipText: { fontSize: 10, fontWeight: font.weight.bold, color: colors.brand700 },
  roleGrid: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  roleCard: { flex: 1, minWidth: 0, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink100, backgroundColor: colors.white, padding: space(2.5), gap: 3, ...shadow.card },
  rolePressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  roleIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  roleLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.ink900 },
  roleSub: { fontSize: 9, color: colors.ink500 },
  roleKey: { fontSize: 8, color: colors.ink300, textTransform: 'uppercase', letterSpacing: 0.3 },
  extraRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  extraPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink100, backgroundColor: colors.white, paddingVertical: space(2) },
  extraText: { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.ink700 },
  demoFootnote: { fontSize: 10, color: colors.ink400, lineHeight: 15, marginTop: space(2) },
  serverToggle: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  serverToggleText: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink800 },
  version: { textAlign: 'center', color: colors.ink300, fontSize: font.size.xs },
});
