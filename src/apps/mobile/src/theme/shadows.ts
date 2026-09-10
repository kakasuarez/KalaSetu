/**
 * The only two elevations in the design.
 *
 * The shadow is tinted terracotta rather than black: on a warm cream ground a
 * neutral shadow reads as grey dirt around the card edge.
 * `elevation` is the Android half -- iOS ignores it, Android ignores the rest.
 */
export const shadows = {
  /** Cards, stat tiles, product tiles. */
  soft: {
    shadowColor: '#B85C38',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  /** Floating action buttons only -- they must read as above the page. */
  lifted: {
    shadowColor: '#B85C38',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;
