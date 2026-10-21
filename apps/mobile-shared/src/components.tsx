/**
 * The UI kit: plain React Native components styled from `theme.ts`.
 *
 * Deliberately dependency-light (no CSS runtime, no animation library) so the
 * Android build needs nothing beyond the JDK and the SDK, and so both apps look
 * identical.
 */
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, gradients, motion, radius, shadow, space } from './theme';

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

function useScalePress(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => {
    Animated.spring(scale, { toValue: to, useNativeDriver: true, ...motion.spring }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.spring }).start();
  };
  return { scale, pressIn, pressOut };
}

/**
 * A slow, barely-there float for the coloured orbs in headers. It is decorative
 * only, uses the native driver, and stops as soon as the header unmounts.
 */
function FloatingBlob({
  style,
  delay = 0,
  distance = 12,
  duration = 4200,
}: {
  style: StyleProp<ViewStyle>;
  delay?: number;
  distance?: number;
  duration?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, duration, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) },
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, distance * 0.45] }) },
          ],
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screen scaffolding                                                  */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  scroll = true,
  padded = true,
  background = colors.canvas,
  refresh,
  header,
  footer,
}: {
  children?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  background?: string;
  refresh?: React.ReactElement<RefreshControlProps>;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.scrollPad, { paddingBottom: space(10) }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.scrollPad]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: background }]} edges={['top']}>
      {header}
      <Animated.View
        style={[
          styles.flex,
          {
            opacity: entrance,
            transform: [
              { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            ],
          },
        ]}
      >
        {body}
      </Animated.View>
      {footer}
    </SafeAreaView>
  );
}

export function GradientHeader({
  title,
  subtitle,
  right,
  colors: gradient = gradients.header,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  colors?: readonly string[];
  children?: React.ReactNode;
}) {
  return (
    <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <FloatingBlob style={styles.headerBlob1} distance={14} duration={4600} />
      <FloatingBlob style={styles.headerBlob2} delay={900} distance={10} duration={5200} />
      <FloatingBlob style={styles.headerBlob3} delay={1600} distance={16} duration={6200} />
      <View style={styles.headerTop}>
        <View style={styles.flex}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

/**
 * The SalonPro monogram. It is drawn from Views so it stays crisp at every
 * size and can be reused in the sign-in hero, the updater and empty states.
 */
export function BrandMark({ size = 52 }: { size?: number }) {
  const dot = Math.max(5, Math.round(size * 0.12));
  return (
    <LinearGradient
      colors={gradients.header as unknown as string[]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: size * 0.7,
          height: size * 0.7,
          borderRadius: size * 0.35,
          borderWidth: 1,
          borderColor: 'rgba(217, 179, 130, 0.55)',
        }}
      />
      <Text
        style={{
          fontFamily: font.family.display,
          fontSize: size * 0.58,
          lineHeight: size * 0.64,
          fontWeight: font.weight.bold,
          color: colors.canvas,
          marginTop: -size * 0.03,
        }}
      >
        S
      </Text>
      <View
        style={{
          position: 'absolute',
          top: size * 0.16,
          right: size * 0.16,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: colors.coral,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.35)',
        }}
      />
    </LinearGradient>
  );
}

/* ------------------------------------------------------------------ */
/* Cards & rows                                                        */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const { scale, pressIn, pressOut } = useScalePress(0.985);
  const content = (
    <Animated.View style={[styles.card, padded && styles.cardPad, style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      android_ripple={{ color: colors.brand50 }}
    >
      {content}
    </Pressable>
  );
}

export function Row({
  label,
  value,
  emphasis,
  valueStyle,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  valueStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowValueStrong, valueStyle]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function Divider({ spaced = true }: { spaced?: boolean }) {
  return <View style={[styles.divider, spaced && { marginVertical: space(2.5) }]} />;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionTitleLeft}>
        <View style={styles.sectionBar} />
        <Text style={styles.sectionTitleText}>{title}</Text>
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  size = 'md',
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const inactive = disabled || loading;
  const height = size === 'sm' ? 36 : size === 'lg' ? 56 : 48;
  const textColor = variant === 'primary' || variant === 'danger' || variant === 'success' ? colors.white : colors.brand700;
  const { scale, pressIn, pressOut } = useScalePress(0.97);

  const body = (
    <View style={styles.buttonInner}>
      {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
      <Text style={[styles.buttonLabel, { color: textColor, fontSize: size === 'sm' ? font.size.sm : font.size.md }]}>
        {label}
      </Text>
    </View>
  );

  if (variant === 'primary' && !inactive) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={inactive}
        style={style}
        android_ripple={{ color: '#ffffff33' }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <LinearGradient
            colors={gradients.primary as unknown as string[]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.button, { height }, shadow.card]}
          >
            {body}
          </LinearGradient>
        </Animated.View>
      </Pressable>
    );
  }

  const tone: Record<ButtonVariant, ViewStyle> = {
    primary: {},
    secondary: { backgroundColor: colors.brand100, borderColor: colors.brand200, borderWidth: 1 },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.rose },
    success: { backgroundColor: colors.mint },
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={inactive}
      android_ripple={{ color: '#ffffff22' }}
      style={[style, inactive && styles.disabled]}
    >
      <Animated.View style={[styles.button, { height }, tone[variant], { transform: [{ scale }] }]}>
        {body}
      </Animated.View>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  ...inputProps
}: {
  label?: string;
  hint?: string;
  error?: string | null;
} & TextInputProps) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.ink300}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { scale, pressIn, pressOut } = useScalePress(0.95);
  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.chip, active && styles.chipActive, { transform: [{ scale }] }]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

type BannerTone = 'info' | 'success' | 'warning' | 'error';

export function Banner({
  tone = 'info',
  title,
  message,
  action,
  onAction,
}: {
  tone?: BannerTone;
  title?: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  const tones: Record<BannerTone, { bg: string; fg: string; border: string }> = {
    info: { bg: colors.skySoft, fg: colors.sky, border: '#C9DDEB' },
    success: { bg: colors.mintSoft, fg: colors.mint, border: '#BFE3D5' },
    warning: { bg: colors.amberSoft, fg: colors.amber, border: '#EAD6B0' },
    error: { bg: colors.roseSoft, fg: colors.rose, border: '#EBC7C9' },
  };
  const tone_ = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: tone_.bg, borderColor: tone_.border }]}>
      {title ? <Text style={[styles.bannerTitle, { color: tone_.fg }]}>{title}</Text> : null}
      <Text style={[styles.bannerText, { color: tone_.fg }]}>{message}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={{ marginTop: space(1.5) }}>
          <Text style={styles.bannerAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Empty({
  icon = '✨',
  title,
  message,
  action,
  onAction,
}: {
  icon?: string;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action ? <Button label={action} onPress={onAction} size="sm" style={{ marginTop: space(3) }} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Custom sheets (no native Android dialogs)                           */
/* ------------------------------------------------------------------ */

export type SheetRequest = {
  title: string;
  message?: string;
  /** One button: "Got it". Two buttons: a cancel and a confirm. */
  tone?: 'confirm' | 'info' | 'error';
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
};

/**
 * The app's own dialog. Android's `Alert` is a system window with the
 * platform's shape, colours and buttons; this sheet is SalonPro's, with the
 * same monogram, type and motion as the rest of the app.
 */
export function AppSheet({ request, onClose }: { request: SheetRequest | null; onClose: () => void }) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!request) return;
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.spring }).start();
  }, [enter, request]);

  if (!request) return null;
  const info = request.tone === 'info' || request.tone === 'error';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.sheetBackdrop, { opacity: enter }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <Animated.View
          style={[
            styles.sheetCard,
            {
              transform: [
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
              ],
            },
          ]}
        >
          <BrandMark size={44} />
          <Text style={styles.sheetTitle}>{request.title}</Text>
          {request.message ? (
            <Text style={[styles.sheetMessage, request.tone === 'error' && styles.sheetMessageError]}>
              {request.message}
            </Text>
          ) : null}
          <View style={styles.sheetActions}>
            {!info ? (
              <Button
                label={request.cancelLabel ?? 'Cancel'}
                variant="secondary"
                onPress={onClose}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button
              label={request.confirmLabel ?? (info ? 'Got it' : 'Confirm')}
              variant={request.destructive ? 'danger' : 'primary'}
              onPress={() => {
                onClose();
                request.onConfirm?.();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.brand600} size="large" />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = colors.brand700,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export function Avatar({ name, size = 44, tone = colors.brand600 }: { name: string; size?: number; tone?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.white, fontWeight: font.weight.bold, fontSize: size * 0.36 }}>{initials || '•'}</Text>
    </View>
  );
}

/** A tiny bar chart — enough for a trend, and no chart library to bundle. */
export function BarChart({
  data,
  height = 96,
  format,
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ height: height + 26 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height }}>
        {data.map((point, index) => (
          <View key={`${point.label}-${index}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.barValue} numberOfLines={1}>
              {point.value > 0 && format ? format(point.value) : ''}
            </Text>
            <View
              style={{
                width: '100%',
                height: Math.max(4, (point.value / max) * (height - 30)),
                borderRadius: 6,
                backgroundColor: point.value > 0 ? colors.brand500 : colors.brand100,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {data.map((point, index) => (
          <Text key={`label-${point.label}-${index}`} style={[styles.barLabel, { flex: 1 }]} numberOfLines={1}>
            {point.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function ProgressBar({ ratio, tone = colors.brand500 }: { ratio: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${clamped * 100}%`, backgroundColor: tone }]} />
    </View>
  );
}

export { LinearGradient };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollPad: { padding: space(4), gap: space(3) },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },

  header: {
    paddingHorizontal: space(5),
    paddingTop: space(3),
    paddingBottom: space(6),
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  headerBlob1: { position: 'absolute', top: -70, right: -36, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(217, 119, 87, 0.18)' },
  headerBlob2: { position: 'absolute', bottom: -80, left: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255, 255, 255, 0.07)' },
  headerBlob3: { position: 'absolute', top: 24, right: 70, width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(201, 162, 39, 0.14)' },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  headerTitle: { fontFamily: font.family.display, color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.bold, letterSpacing: -0.6 },
  headerSubtitle: { color: colors.brand100, fontSize: font.size.sm, marginTop: 3, lineHeight: 19 },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 59, 52, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(5),
  },
  sheetCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space(5),
    gap: space(2.5),
    ...shadow.raised,
  },
  sheetTitle: {
    fontFamily: font.family.display,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: colors.ink900,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  sheetMessage: { fontSize: font.size.sm, color: colors.ink600, lineHeight: 21 },
  sheetMessageError: { color: colors.rose },
  sheetActions: { flexDirection: 'row', gap: space(2), marginTop: space(1) },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink100, ...shadow.card },
  cardPad: { padding: space(4) },
  divider: { height: 1, backgroundColor: colors.ink100 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(3) },
  rowLabel: { color: colors.ink500, fontSize: font.size.sm, flexShrink: 0 },
  rowValue: { color: colors.ink800, fontSize: font.size.md, fontWeight: font.weight.semibold, textAlign: 'right', flexShrink: 1 },
  rowValueStrong: { fontSize: font.size.lg, fontWeight: font.weight.bold },

  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space(2),
  },
  sectionTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  sectionBar: { width: 4, height: 18, borderRadius: 999, backgroundColor: colors.brand500 },
  sectionTitleText: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink900 },
  sectionAction: { color: colors.brand600, fontWeight: font.weight.semibold, fontSize: font.size.sm },

  button: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(5) },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  buttonLabel: { fontWeight: font.weight.bold, letterSpacing: 0.2 },

  field: { gap: space(1.5) },
  fieldLabel: { fontSize: font.size.sm, color: colors.ink600, fontWeight: font.weight.semibold },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: font.size.md,
    color: colors.ink900,
  },
  inputError: { borderColor: colors.rose },
  fieldHint: { fontSize: font.size.xs, color: colors.ink400 },
  fieldError: { fontSize: font.size.xs, color: colors.rose },

  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  chipActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  chipText: { fontSize: font.size.sm, color: colors.ink600, fontWeight: font.weight.semibold },
  chipTextActive: { color: colors.white },

  banner: { borderRadius: radius.md, borderWidth: 1, padding: space(3.5), gap: space(1) },
  bannerTitle: { fontWeight: font.weight.bold, fontSize: font.size.sm },
  bannerText: { fontSize: font.size.sm, lineHeight: 20 },
  bannerAction: { color: colors.brand700, fontWeight: font.weight.bold, fontSize: font.size.sm },

  badge: { borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  badgeText: { fontSize: font.size.xs, fontWeight: font.weight.bold },

  empty: { alignItems: 'center', paddingVertical: space(8), paddingHorizontal: space(6), gap: space(2) },
  emptyIcon: { fontSize: 34 },
  emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink800, textAlign: 'center' },
  emptyMessage: { fontSize: font.size.sm, color: colors.ink500, textAlign: 'center', lineHeight: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(3), paddingVertical: space(10) },
  loadingLabel: { color: colors.ink500, fontSize: font.size.sm },

  statTile: { flex: 1, gap: space(1) },
  statLabel: { fontSize: font.size.xs, color: colors.ink500, fontWeight: font.weight.semibold, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: font.size.xl, fontWeight: font.weight.heavy, letterSpacing: -0.5 },
  statSub: { fontSize: font.size.xs, color: colors.ink400 },

  barValue: { fontSize: 9, color: colors.ink500, marginBottom: 2 },
  barLabel: { fontSize: 9, color: colors.ink400, textAlign: 'center' },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.ink100, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
});
