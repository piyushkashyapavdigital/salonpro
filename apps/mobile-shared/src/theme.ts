/**
 * The SalonPro mobile design system.
 *
 * A calm, editorial palette: deep evergreen, warm ivory and a single terracotta
 * spark. It is intentionally less "candy" than the old theme — closer to a
 * well-lit salon than a toy — while keeping enough contrast for one-handed use
 * on a busy shop floor. Screens are styled with StyleSheet rather than a CSS
 * runtime, so an Android build needs no NDK/CMake toolchain.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  /* Brand — evergreen */
  brand50: '#EAF5F0',
  brand100: '#D5EBE2',
  brand200: '#A9D8C8',
  brand300: '#72BDA6',
  brand400: '#3E9F85',
  brand500: '#1C856C',
  brand600: '#0F6B57',
  brand700: '#0B5345',
  brand800: '#083F35',
  brand900: '#062E27',

  /* Neutrals — warm stone */
  ink50: '#F8F6F1',
  ink100: '#EDE8DF',
  ink200: '#DDD5C8',
  ink300: '#B8AEA0',
  ink400: '#8A8174',
  ink500: '#6B645A',
  ink600: '#4F4A42',
  ink700: '#3A3731',
  ink800: '#24231F',
  ink900: '#151512',
  ink950: '#0B0B09',

  /* Accents — muted, natural */
  mint: '#2E8B74',
  mintSoft: '#E3F4EE',
  amber: '#C9892C',
  amberSoft: '#FBF0DC',
  sky: '#3E7CB1',
  skySoft: '#E7F0F8',
  lilac: '#6B5B95',
  lilacSoft: '#EFECF6',
  rose: '#C05A62',
  roseSoft: '#F8E7E8',
  coral: '#D97757',
  coralSoft: '#FBEDE7',
  lemon: '#C9A227',
  lemonSoft: '#FAF3D9',
  grape: '#3F3A5A',

  white: '#FFFFFF',
  canvas: '#F7F3EC',
} as const;

export const gradients = {
  header: ['#0B3B34', '#126B58'] as const,
  primary: ['#0F6B57', '#2E8B74'] as const,
  mint: ['#0B5345', '#2E8B74'] as const,
  gold: ['#8A5A1F', '#C9A227'] as const,
  lilac: ['#3F3A5A', '#6B5B95'] as const,
  coral: ['#A94E38', '#D97757'] as const,
  night: ['#151512', '#3A3731'] as const,
};

/** A rotating set of natural accents, so cards can carry some colour. */
export const accents = [colors.brand500, colors.coral, colors.mint, colors.sky, colors.lilac, colors.lemon] as const;

/** 4pt grid. */
export const space = (steps: number) => steps * 4;

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 21, xxl: 27, hero: 35 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
  /**
   * A serif display face gives headings a boutique-salon signature without
   * bundling a font file. Body copy stays on the platform's highly legible
   * sans-serif.
   */
  family: {
    display: Platform.select({ android: 'serif', default: 'Georgia' }) as string,
  },
} as const;

/** Soft elevation that reads the same on Android and iOS. */
export const shadow: Record<'card' | 'raised' | 'none', ViewStyle> = {
  card: Platform.select({
    android: { elevation: 2 },
    default: {
      shadowColor: '#0B3B34',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
  }) as ViewStyle,
  raised: Platform.select({
    android: { elevation: 7 },
    default: {
      shadowColor: '#0B3B34',
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
  }) as ViewStyle,
  none: {},
};

export const heading = (level: 'hero' | 'xxl' | 'xl' | 'lg' = 'lg'): TextStyle => ({
  fontFamily: font.family.display,
  fontSize: font.size[level],
  fontWeight: font.weight.bold,
  color: colors.ink900,
  letterSpacing: -0.4,
});

/** Shared motion timings. Durations are intentionally short enough to feel responsive. */
export const motion = {
  fast: 140,
  base: 220,
  slow: 420,
  spring: { damping: 17, stiffness: 210, mass: 0.7 },
} as const;

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
