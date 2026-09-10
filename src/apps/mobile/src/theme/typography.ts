/**
 * Type scale, spacing and radii.
 *
 * Sizes start large: the primary user has low literacy and often reads at
 * arm's length on a small, scratched screen in daylight. Nothing in the
 * artisan flow goes below `caption` (15pt), and body copy is 18pt.
 *
 * Each scale entry names its own `fontFamily` rather than setting a numeric
 * `fontWeight`. Android does not synthesise weights for a bundled font
 * family, so "NotoSans + fontWeight 700" silently renders regular; the weight
 * has to be a separate loaded face. App.tsx loads exactly these four.
 */
import type { TextStyle } from 'react-native';

const REGULAR = 'NotoSans_400Regular';
const SEMIBOLD = 'NotoSans_600SemiBold';
const BOLD = 'NotoSans_700Bold';

export const fonts = { regular: REGULAR, semibold: SEMIBOLD, bold: BOLD } as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontFamily: BOLD },
  /** H1 -- screen titles. */
  title: { fontSize: 26, lineHeight: 34, fontFamily: BOLD },
  /** H2 -- section headings, card titles. */
  heading: { fontSize: 22, lineHeight: 30, fontFamily: SEMIBOLD },
  body: { fontSize: 18, lineHeight: 28, fontFamily: REGULAR },
  bodyBold: { fontSize: 18, lineHeight: 28, fontFamily: SEMIBOLD },
  label: { fontSize: 15, lineHeight: 22, fontFamily: SEMIBOLD },
  caption: { fontSize: 15, lineHeight: 22, fontFamily: REGULAR },
  /** Money is the most important thing on screen. Tabular so digits do not jitter. */
  money: { fontSize: 34, lineHeight: 42, fontFamily: BOLD, fontVariant: ['tabular-nums'] },
  mono: { fontSize: 13, lineHeight: 19, fontFamily: 'monospace' },
  // `satisfies` rather than `as const`: it still checks every entry against
  // TextStyle, but leaves fontVariant a mutable FontVariant[]. Under `as
  // const` it becomes a readonly tuple, which is not assignable to TextStyle
  // -- and one bad entry makes StyleSheet.create widen EVERY key in the sheet
  // to ViewStyle | TextStyle | ImageStyle, so an unrelated <Image> two files
  // away stops compiling.
} satisfies Record<string, TextStyle>;

/** 12 is the card-to-card gutter the design uses everywhere; it is not part of the 4/8 rhythm by accident. */
export const spacing = { xs: 4, sm: 8, gap: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 14, image: 16, lg: 20, pill: 999 } as const;

/** Minimum touch target. Android accessibility guidance is 48dp; the design asks for 56. */
export const HIT_SIZE = 56;
