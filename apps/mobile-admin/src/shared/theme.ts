/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: apps/mobile-shared/src/theme.ts
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
/**
 * SalonPro mobile design system.
 *
 * The same palette the web app uses (brand pinks over warm ink neutrals), as
 * plain values — the apps are styled with StyleSheet rather than a CSS runtime,
 * so an Android build needs no NDK/CMake toolchain. Everything a screen needs to
 * look "SalonPro" lives here, so the two apps cannot drift apart.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  /* Brand */
  brand50: '#FFF1F7',
  brand100: '#FDE3EF',
  brand200: '#FBCFE3',
  brand300: '#F8A8CE',
  brand400: '#F472B6',
  brand500: '#EC4899',
  brand600: '#DB2777',
  brand700: '#BE185D',
  brand800: '#9D174D',
  brand900: '#831843',

  /* Neutrals */
  ink50: '#FDF2F7',
  ink100: '#F1E2EA',
  ink200: '#D8CBD3',
  ink300: '#AFA2AA',
  ink400: '#8A7C85',
  ink500: '#675A63',
  ink600: '#4E4049',
  ink700: '#3B2F37',
  ink800: '#2C2228',
  ink900: '#1A1317',
  ink950: '#100B0E',

  /* Accents */
  mint: '#16A34A',
  mintSoft: '#E6F7ED',
  amber: '#F59E0B',
  amberSoft: '#FEF3C7',
  sky: '#2563EB',
  skySoft: '#E4EFFE',
  lilac: '#8B5CF6',
  lilacSoft: '#F0E9FE',
  rose: '#E11D48',
  roseSoft: '#FFE4E9',

  white: '#FFFFFF',
  canvas: '#FDF2F7',
} as const;

export const gradients = {
  header: ['#9D174D', '#DB2777'] as const,
  primary: ['#DB2777', '#EC4899'] as const,
  mint: ['#15803D', '#22C55E'] as const,
  gold: ['#B45309', '#F59E0B'] as const,
  lilac: ['#6D28D9', '#8B5CF6'] as const,
  night: ['#1A1317', '#3B2F37'] as const,
};

/** 4pt grid. */
export const space = (steps: number) => steps * 4;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 21, xxl: 27, hero: 34 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
} as const;

/** Soft elevation that reads the same on Android and iOS. */
export const shadow: Record<'card' | 'raised' | 'none', ViewStyle> = {
  card: Platform.select({
    android: { elevation: 2 },
    default: {
      shadowColor: '#3B2F37',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
  }) as ViewStyle,
  raised: Platform.select({
    android: { elevation: 6 },
    default: {
      shadowColor: '#3B2F37',
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
  }) as ViewStyle,
  none: {},
};

export const heading = (level: 'hero' | 'xxl' | 'xl' | 'lg' = 'lg'): TextStyle => ({
  fontSize: font.size[level],
  fontWeight: font.weight.bold,
  color: colors.ink900,
  letterSpacing: -0.4,
});

export const body = (tone: 'strong' | 'base' | 'muted' = 'base'): TextStyle => ({
  fontSize: font.size.md,
  color: tone === 'strong' ? colors.ink800 : tone === 'muted' ? colors.ink500 : colors.ink700,
});

/** Colour for an appointment / payment status chip. */
export function statusColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'completed':
    case 'paid':
    case 'posted':
      return { bg: colors.mintSoft, fg: colors.mint };
    case 'confirmed':
    case 'in_progress':
      return { bg: colors.skySoft, fg: colors.sky };
    case 'pending':
    case 'unpaid':
    case 'partially_paid':
      return { bg: colors.amberSoft, fg: '#B45309' };
    case 'cancelled':
    case 'no_show':
    case 'failed':
    case 'refunded':
    case 'reversed':
      return { bg: colors.roseSoft, fg: colors.rose };
    default:
      return { bg: colors.ink100, fg: colors.ink600 };
  }
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
  unpaid: 'Unpaid',
  partially_paid: 'Part paid',
  paid: 'Paid',
  refunded: 'Refunded',
  posted: 'Posted',
  reversed: 'Reversed',
  failed: 'Failed',
};
