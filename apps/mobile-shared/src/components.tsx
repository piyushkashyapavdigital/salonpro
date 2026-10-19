/**
 * The UI kit: plain React Native components styled from `theme.ts`.
 *
 * Deliberately dependency-light (no CSS runtime, no animation library) so the
 * Android build needs nothing beyond the JDK and the SDK, and so both apps look
 * identical.
 */
import React from 'react';
import {
  ActivityIndicator,
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
import { colors, font, gradients, radius, shadow, space } from './theme';

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
      {body}
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
      <View style={styles.headerBlob1} />
      <View style={styles.headerBlob2} />
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
  const content = <View style={[styles.card, padded && styles.cardPad, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.brand100 }} style={({ pressed }) => pressed && styles.pressed}>
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
      <Pressable onPress={onPress} disabled={inactive} style={style} android_ripple={{ color: '#ffffff33' }}>
        <LinearGradient
          colors={gradients.primary as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.button, { height }, shadow.card]}
        >
          {body}
        </LinearGradient>
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
      disabled={inactive}
      android_ripple={{ color: '#ffffff22' }}
      style={({ pressed }) => [
        styles.button,
        { height },
        tone[variant],
        inactive && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {body}
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
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
    info: { bg: colors.skySoft, fg: colors.sky, border: '#BFDBFE' },
    success: { bg: colors.mintSoft, fg: colors.mint, border: '#BBF7D0' },
    warning: { bg: colors.amberSoft, fg: '#B45309', border: '#FDE68A' },
    error: { bg: colors.roseSoft, fg: colors.rose, border: '#FECDD3' },
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
  headerBlob1: { position: 'absolute', top: -60, right: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: '#ffffff22' },
  headerBlob2: { position: 'absolute', bottom: -70, left: -20, width: 130, height: 130, borderRadius: 65, backgroundColor: '#00000011' },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  headerTitle: { color: colors.white, fontSize: font.size.xl, fontWeight: font.weight.heavy, letterSpacing: -0.5 },
  headerSubtitle: { color: '#EADCF6', fontSize: font.size.sm, marginTop: 2 },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink100, ...shadow.card },
  cardPad: { padding: space(4) },
  divider: { height: 1, backgroundColor: colors.ink100 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(3) },
  rowLabel: { color: colors.ink500, fontSize: font.size.sm, flexShrink: 1 },
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
