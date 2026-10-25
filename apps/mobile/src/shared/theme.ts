/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: apps/mobile-shared/src/theme.ts
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
/**
 * The SalonPro mobile design language — "atelier".
 *
 * Paper, ink and a single vermilion accent. A high-contrast serif for display,
 * a quiet sans for the work, hairline rules instead of drop shadows, and labels
 * set small and wide like a printed lookbook. It is deliberately not a gradient
 * dashboard: a salon floor is busy enough.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  /* Brand — vermilion clay. Used for attention, never for whole surfaces. */
  brand50: '#F8EDE7',
  brand100: '#F0DCD2',
  brand200: '#E3C0B1',
  brand300: '#D19C86',
  brand400: '#C27052',
  brand500: '#C4472B',
  brand600: '#A93A22',
  brand700: '#8A2F1B',
  brand800: '#6B2515',
  brand900: '#4B190E',

  /* Neutrals — warm paper & ink */
  ink50: '#FAF7F1',
  ink100: '#E9E2D6',
  ink200: '#D8CEBE',
  ink300: '#B5A997',
  ink400: '#8C8172',
  ink500: '#6E6557',
  ink600: '#514B40',
  ink700: '#3B362D',
  ink800: '#24211A',
  ink900: '#17150F',
  ink950: '#0B0A07',

  /* Accents — dusty, natural, never candy */
  mint: '#3F6B52',
  mintSoft: '#E6EDE4',
  amber: '#A9762B',
  amberSoft: '#F6EBD8',
  sky: '#4A6D8A',
  skySoft: '#E6EDF2',
  lilac: '#6B5F7A',
  lilacSoft: '#ECE8F0',
  rose: '#A8474E',
  roseSoft: '#F5E4E4',
  coral: '#C4472B',
  coralSoft: '#F4E2DA',
  lemon: '#B8912F',
  lemonSoft: '#F6EED6',
  grape: '#45403C',

  /* Surfaces */
  white: '#FBF8F2',
  paper: '#FBF8F2',
  line: '#DCD3C3',
  lineSoft: '#E7DFD1',
  clay: '#C4472B',
  claySoft: '#F4E2DA',
  brass: '#C9A35C',
  brassSoft: '#F4E9D3',
  olive: '#45523F',
  oliveSoft: '#E6E9DF',
  canvas: '#F2EDE4',
} as const;

export const gradients = {
  header: ['#17150F', '#2A251C'] as const,
  primary: ['#17150F', '#24211A'] as const,
  mint: ['#2F4A3B', '#3F6B52'] as const,
  gold: ['#7A5A22', '#B8912F'] as const,
  lilac: ['#3B3648', '#6B5F7A'] as const,
  coral: ['#8A2F1B', '#C4472B'] as const,
  night: ['#0B0A07', '#24211A'] as const,
};

/** A rotating set of dusted accents, for category dots and charts. */
export const accents = [colors.clay, colors.olive, colors.brass, colors.sky, colors.lilac, colors.rose] as const;

/** 4pt grid. */
export const space = (steps: number) => steps * 4;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  size: { xs: 10, sm: 12.5, md: 14.5, lg: 17, xl: 22, xxl: 30, hero: 44 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
  /**
   * Instrument Serif ships in the Android assets (`assets/fonts`), so the
   * display face is the same on every handset without a network fetch. iOS
   * falls back to Georgia until the font is linked there.
   */
  family: {
    display: Platform.select({
      android: 'InstrumentSerif',
      ios: 'Georgia',
      default: 'Georgia',
    }) as string,
    mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
  },
} as const;

/** Hairline-first elevation. Paper should look like paper, not a floating tile. */
export const shadow: Record<'card' | 'raised' | 'none', ViewStyle> = {
  card: Platform.select({
    android: { elevation: 1 },
    default: {
      shadowColor: '#17150F',
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
  }) as ViewStyle,
  raised: Platform.select({
    android: { elevation: 4 },
    default: {
      shadowColor: '#17150F',
      shadowOpacity: 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
  }) as ViewStyle,
  none: {},
};

export const heading = (level: 'hero' | 'xxl' | 'xl' | 'lg' = 'lg'): TextStyle => ({
  fontFamily: font.family.display,
  fontSize: font.size[level],
  fontWeight: font.weight.regular,
  color: colors.ink900,
  letterSpacing: level === 'hero' ? -1.2 : -0.5,
  lineHeight: Math.round(font.size[level] * 1.04),
});

/** Micro-label: the small, wide, printed caption used above every block. */
export const label = (tone: 'muted' | 'ink' | 'light' = 'muted'): TextStyle => ({
  fontFamily: Platform.select({ android: 'sans-serif-medium', default: undefined }),
  fontSize: 9,
  fontWeight: font.weight.bold,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: tone === 'ink' ? colors.ink800 : tone === 'light' ? 'rgba(251,248,242,0.55)' : colors.ink500,
});

export const motion = {
  fast: 130,
  base: 240,
  slow: 460,
  spring: { damping: 18, stiffness: 220, mass: 0.65 },
} as const;

export const body = (tone: 'strong' | 'base' | 'muted' = 'base'): TextStyle => ({
  fontSize: font.size.md,
  lineHeight: 21,
  color: tone === 'strong' ? colors.ink800 : tone === 'muted' ? colors.ink500 : colors.ink700,
});

/** Colour for an appointment / payment status chip. */
export function statusColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'completed':
    case 'paid':
    case 'posted':
      return { bg: colors.oliveSoft, fg: colors.mint };
    case 'confirmed':
    case 'in_progress':
      return { bg: colors.skySoft, fg: colors.sky };
    case 'pending':
    case 'unpaid':
    case 'partially_paid':
      return { bg: colors.amberSoft, fg: colors.amber };
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
