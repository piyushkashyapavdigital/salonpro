/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: apps/mobile-shared/src/components.tsx
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
/**
 * The SalonPro UI kit — plain React Native, styled from `theme.ts`.
 *
 * The rules: paper surfaces, 1px lines, no decorative gradients, a serif for
 * display type and small wide capitals for labels. Motion is native-driver
 * only, so a mid-range Android phone on the shop floor stays smooth.
 */
import React, { useEffect, useRef, useState } from 'react';
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
  type LayoutChangeEvent,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, gradients, label as labelStyle, motion, radius, shadow, space } from './theme';

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
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.scrollPad, { paddingBottom: space(14) }]}
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
            transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        {body}
      </Animated.View>
      {footer}
    </SafeAreaView>
  );
}

/**
 * The ink poster at the top of a workspace screen: a wide serif title, a
 * letter-spaced caption, a hairline clay rule and a single oversized asterisk.
 * The old version used coloured orbs; this one is built from type and rules.
 */
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
    <LinearGradient
      colors={gradient as unknown as string[]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.headerRing} />
      <View style={styles.headerDot} />
      <Text style={styles.headerAsterisk} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        ✳
      </Text>
      <View style={styles.headerTop}>
        <View style={styles.flex}>
          <View style={styles.headerKickerRow}>
            <View style={styles.headerRule} />
            <Text style={styles.headerKicker}>SalonPro</Text>
          </View>
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
 * The SalonPro monogram. Drawn from Views, crisp at any size: an ink tile, a
 * serif S and one vermilion dot — the whole identity in three shapes.
 */
export function BrandMark({ size = 52 }: { size?: number }) {
  const dot = Math.max(4, Math.round(size * 0.1));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundColor: colors.ink900,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Text
        style={{
          fontFamily: font.family.display,
          fontSize: size * 0.64,
          lineHeight: size * 0.72,
          fontWeight: font.weight.regular,
          color: colors.paper,
          marginTop: -size * 0.02,
        }}
      >
        S
      </Text>
      <View
        style={{
          position: 'absolute',
          top: size * 0.17,
          right: size * 0.17,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: colors.clay,
        }}
      />
    </View>
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
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} android_ripple={{ color: colors.brand50 }}>
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
        <View style={styles.sectionDiamond} />
        <Text style={styles.sectionTitleText}>{title}</Text>
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A quiet horizontal ticker of words, used on the sign-in poster. */
export function Marquee({
  items,
  speed = 26000,
  tone = colors.ink500,
}: {
  items: string[];
  speed?: number;
  tone?: string;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!width) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -width, duration: speed, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [speed, width, x]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width / 2;
    if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
  };

  return (
    <View style={styles.marquee}>
      <Animated.View style={[styles.marqueeTrack, { transform: [{ translateX: x }] }]} onLayout={onLayout}>
        {[0, 1].map((copy) => (
          <View key={copy} style={styles.marqueeGroup} accessibilityElementsHidden={copy === 1}>
            {items.map((item, index) => (
              <View key={`${copy}-${item}-${index}`} style={styles.marqueeItem}>
                <Text style={[styles.marqueeText, { color: tone }]}>{item}</Text>
                <Text style={styles.marqueeStar}>✳</Text>
              </View>
            ))}
          </View>
        ))}
      </Animated.View>
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
  const height = size === 'sm' ? 38 : size === 'lg' ? 54 : 48;
  const textColor = variant === 'primary' || variant === 'danger' || variant === 'success' ? colors.paper : colors.ink900;
  const { scale, pressIn, pressOut } = useScalePress(0.975);

  const tone: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.ink900, borderColor: colors.ink900 },
    secondary: { backgroundColor: 'transparent', borderColor: colors.ink900, borderWidth: 1 },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
    danger: { backgroundColor: colors.clay, borderColor: colors.clay },
    success: { backgroundColor: colors.mint, borderColor: colors.mint },
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={inactive}
      android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
      style={[style, inactive && styles.disabled]}
    >
      <Animated.View style={[styles.button, { height }, tone[variant], { transform: [{ scale }] }]}>
        <View style={styles.buttonInner}>
          {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
          <Text style={[styles.buttonLabel, { color: textColor, fontSize: size === 'sm' ? 10 : 11 }]}>{label}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  onFocus,
  onBlur,
  ...inputProps
}: {
  label?: string;
  hint?: string;
  error?: string | null;
} & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.ink300}
        {...inputProps}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : null, style]}
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
  const { scale, pressIn, pressOut } = useScalePress(0.96);
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
  const tones: Record<BannerTone, { bg: string; fg: string; rule: string }> = {
    info: { bg: colors.skySoft, fg: colors.sky, rule: colors.sky },
    success: { bg: colors.oliveSoft, fg: colors.mint, rule: colors.mint },
    warning: { bg: colors.amberSoft, fg: colors.amber, rule: colors.amber },
    error: { bg: colors.roseSoft, fg: colors.rose, rule: colors.rose },
  };
  const palette = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderLeftColor: palette.rule }]}>
      {title ? <Text style={[styles.bannerTitle, { color: palette.fg }]}>{title}</Text> : null}
      <Text style={[styles.bannerText, { color: palette.fg }]}>{message}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={{ marginTop: space(1.5) }}>
          <Text style={[styles.bannerAction, { color: palette.fg }]}>{action}</Text>
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
  icon = '✳',
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
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.sheetRule} />
          <Text style={styles.sheetKicker}>SALONPRO</Text>
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
      <ActivityIndicator color={colors.clay} size="small" />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = colors.ink900,
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

export function Avatar({ name, size = 44, tone = colors.ink900 }: { name: string; size?: number; tone?: string }) {
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
      <Text style={{ color: colors.paper, fontFamily: font.family.display, fontSize: size * 0.42 }}>
        {initials || '•'}
      </Text>
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
                height: Math.max(3, (point.value / max) * (height - 30)),
                borderRadius: 2,
                backgroundColor: point.value > 0 ? colors.ink800 : colors.ink100,
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

export function ProgressBar({ ratio, tone = colors.clay }: { ratio: number; tone?: string }) {
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
  disabled: { opacity: 0.45 },

  header: {
    paddingHorizontal: space(5),
    paddingTop: space(2),
    paddingBottom: space(5),
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  headerRing: {
    position: 'absolute',
    top: -86,
    right: -66,
    width: 218,
    height: 218,
    borderRadius: 109,
    borderWidth: 1,
    borderColor: 'rgba(251,248,242,0.14)',
  },
  headerDot: { position: 'absolute', top: 44, right: 54, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.clay },
  headerAsterisk: {
    position: 'absolute',
    right: -16,
    bottom: -46,
    fontFamily: font.family.display,
    fontSize: 152,
    lineHeight: 166,
    color: 'rgba(196,71,43,0.22)',
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  headerKickerRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(2) },
  headerRule: { width: 18, height: 1, backgroundColor: colors.clay },
  headerKicker: { ...labelStyle('light'), fontSize: 8, letterSpacing: 2 },
  headerTitle: {
    fontFamily: font.family.display,
    color: colors.paper,
    fontSize: font.size.xxl,
    fontWeight: font.weight.regular,
    letterSpacing: -0.6,
    lineHeight: Math.round(font.size.xxl * 1.02),
  },
  headerSubtitle: {
    color: 'rgba(251,248,242,0.52)',
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: space(2),
    lineHeight: 15,
  },

  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardPad: { padding: space(4) },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(3) },
  rowLabel: { color: colors.ink500, fontSize: font.size.sm, flexShrink: 0 },
  rowValue: {
    color: colors.ink900,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    textAlign: 'right',
    flexShrink: 1,
  },
  rowValueStrong: { fontFamily: font.family.display, fontSize: font.size.lg, fontWeight: font.weight.regular },

  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space(3),
    paddingBottom: space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sectionTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  sectionDiamond: {
    width: 5,
    height: 5,
    backgroundColor: colors.clay,
    transform: [{ rotate: '45deg' }],
  },
  sectionTitleText: {
    fontFamily: font.family.display,
    fontSize: font.size.xl,
    fontWeight: font.weight.regular,
    letterSpacing: -0.3,
    color: colors.ink900,
  },
  sectionAction: {
    ...labelStyle('muted'),
    fontSize: 8.5,
    letterSpacing: 1.2,
    textDecorationLine: 'underline',
    textDecorationColor: colors.line,
  },

  marquee: {
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: space(2.5),
  },
  marqueeTrack: { flexDirection: 'row' },
  marqueeGroup: { flexDirection: 'row', alignItems: 'center' },
  marqueeItem: { flexDirection: 'row', alignItems: 'center' },
  marqueeText: { ...labelStyle('muted'), fontSize: 8.5, letterSpacing: 1.8 },
  marqueeStar: { color: colors.clay, fontSize: 8, marginHorizontal: space(3) },

  button: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(5),
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  buttonLabel: { fontWeight: font.weight.bold, letterSpacing: 1.3, textTransform: 'uppercase' },

  field: { gap: space(1) },
  fieldLabel: { ...labelStyle('muted'), fontSize: 8.5, letterSpacing: 1.5 },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 0,
    paddingTop: space(2),
    paddingBottom: space(2),
    fontSize: font.size.lg,
    color: colors.ink900,
  },
  inputFocused: { borderColor: colors.ink900 },
  inputError: { borderColor: colors.rose },
  fieldHint: { fontSize: font.size.xs, color: colors.ink400, lineHeight: 15 },
  fieldError: { fontSize: font.size.xs, color: colors.clay, lineHeight: 15 },

  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink900, borderColor: colors.ink900 },
  chipText: { fontSize: font.size.xs, color: colors.ink600, fontWeight: font.weight.semibold, letterSpacing: 0.4 },
  chipTextActive: { color: colors.paper },

  banner: {
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    gap: space(1),
  },
  bannerTitle: { ...labelStyle('muted'), fontSize: 8.5, letterSpacing: 1.3 },
  bannerText: { fontSize: font.size.sm, lineHeight: 19 },
  bannerAction: { ...labelStyle('muted'), fontSize: 8.5, letterSpacing: 1.2, textDecorationLine: 'underline' },

  badge: { borderRadius: 4, paddingHorizontal: space(2), paddingVertical: 3 },
  badgeText: { fontSize: 8, fontWeight: font.weight.bold, letterSpacing: 1, textTransform: 'uppercase' },

  empty: { alignItems: 'center', paddingVertical: space(8), paddingHorizontal: space(6), gap: space(2) },
  emptyIcon: { fontFamily: font.family.display, fontSize: 34, color: colors.clay },
  emptyTitle: {
    fontFamily: font.family.display,
    fontSize: font.size.xl,
    fontWeight: font.weight.regular,
    color: colors.ink900,
    textAlign: 'center',
  },
  emptyMessage: { fontSize: font.size.sm, color: colors.ink500, textAlign: 'center', lineHeight: 19 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(3), paddingVertical: space(10) },
  loadingLabel: { ...labelStyle('muted'), fontSize: 8.5, letterSpacing: 1.6 },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,10,7,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(5),
  },
  sheetCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.paper,
    borderRadius: radius.xl,
    padding: space(6),
    paddingTop: space(6),
    gap: space(2.5),
    ...shadow.raised,
  },
  sheetRule: { position: 'absolute', top: 0, left: space(6), width: 42, height: 2, backgroundColor: colors.clay },
  sheetKicker: { ...labelStyle('muted'), fontSize: 8, letterSpacing: 2 },
  sheetTitle: {
    fontFamily: font.family.display,
    fontSize: font.size.xxl,
    fontWeight: font.weight.regular,
    color: colors.ink900,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  sheetMessage: { fontSize: font.size.sm, color: colors.ink600, lineHeight: 20 },
  sheetMessageError: { color: colors.rose },
  sheetActions: { flexDirection: 'row', gap: space(2), marginTop: space(2) },

  statTile: { flex: 1, gap: 2 },
  statLabel: { ...labelStyle('muted'), fontSize: 8, letterSpacing: 1.2 },
  statValue: {
    fontFamily: font.family.display,
    fontSize: font.size.xxl,
    fontWeight: font.weight.regular,
    letterSpacing: -0.5,
  },
  statSub: { fontSize: 9, color: colors.ink400 },

  barValue: { fontSize: 8, color: colors.ink500, marginBottom: 2 },
  barLabel: { fontSize: 8, color: colors.ink400, textAlign: 'center' },
  progressTrack: { height: 3, backgroundColor: colors.line, overflow: 'hidden' },
  progressFill: { height: '100%' },
});
