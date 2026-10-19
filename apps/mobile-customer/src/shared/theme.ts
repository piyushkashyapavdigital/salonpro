/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: apps/mobile-shared/src/theme.ts
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
/**
 * The SalonPro mobile design system.
 *
 * One vivid, playful palette both apps share — a hot-magenta brand over warm
 * cream and plum-ink neutrals, with bright candy accents (mint, tangerine,
 * sky, grape). The apps are styled with StyleSheet rather than a CSS runtime,
 * so an Android build needs no NDK/CMake toolchain. Everything a screen needs to
 * look "SalonPro" lives here, so the two apps cannot drift apart.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  /* Brand — hot magenta */
  brand50: '#FFF0F6',
  brand100: '#FFE0EE',
  brand200: '#FFC2DD',
  brand300: '#FF92C2',
  brand400: '#FF5CA8',
  brand500: '#FF2E88',
  brand600: '#EC1E76',
  brand700: '#C4145F',
  brand800: '#9C104C',
  brand900: '#7A0E3D',

  /* Neutrals — warm plum ink */
  ink50: '#FAF7F9',
  ink100: '#EFE9EF',
  ink200: '#DBD1DC',
  ink300: '#B3A6B7',
  ink400: '#8C7F8F',
  ink500: '#695D6B',
  ink600: '#4D4150',
  ink700: '#39303C',
  ink800: '#29212D',
  ink900: '#1A141E',
  ink950: '#0F0B12',

  /* Accents — candy */
  mint: '#0FB47A',
  mintSoft: '#DEFBF0',
  amber: '#F59E0B',
  amberSoft: '#FFF3D6',
  sky: '#2F7DF6',
  skySoft: '#E3EEFF',
  lilac: '#7C4DFF',
  lilacSoft: '#EEE7FF',
  rose: '#F43F5E',
  roseSoft: '#FFE4E9',
  coral: '#FF7A45',
  coralSoft: '#FFEDE4',
  lemon: '#F2B705',
  lemonSoft: '#FFF7D6',
  grape: '#5B21B6',

  white: '#FFFFFF',
  canvas: '#FFF7F2',
} as const;

export const gradients = {
  header: ['#5B21B6', '#EC1E76'] as const,
  primary: ['#EC1E76', '#FF5CA8'] as const,
  mint: ['#047857', '#10B981'] as const,
  gold: ['#B45309', '#F59E0B'] as const,
  lilac: ['#5B21B6', '#8B5CF6'] as const,
  coral: ['#EA580C', '#FB923C'] as const,
  night: ['#1A141E', '#39303C'] as const,
};

/** A rotating set of bright accents, so cards can carry some colour. */
export const accents = [colors.brand500, colors.lilac, colors.mint, colors.sky, colors.coral, colors.lemon] as const;

/** 4pt grid. */
export const space = (steps: number) => steps * 4;

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  xl: 34,
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
      shadowColor: '#5B2140',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
  }) as ViewStyle,
  raised: Platform.select({
    android: { elevation: 6 },
    default: {
      shadowColor: '#5B2140',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
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
