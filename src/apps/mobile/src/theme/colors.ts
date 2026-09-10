/**
 * Colour tokens -- warm and earthy, drawn from Indian craft traditions.
 *
 * The PS calls for a minimalist, accessible UI for low-literacy users, so the
 * palette is small and every foreground/background pair below meets WCAG AA
 * (4.5:1) at body size. Status colours are also distinguishable without
 * relying on hue alone -- pair them with an icon, never colour on its own.
 *
 * The `*Soft` entries are the tinted circle/pill fills the design uses behind
 * icons and status text. They are backgrounds only; never put text on them in
 * their own hue without checking contrast first.
 */
export const colors = {
  // surfaces
  bg: '#FDF9F3',          // warm cream -- the whole app sits on this
  surface: '#FFFFFF',
  surfaceAlt: '#F5EDE1',  // subtle card fill, media placeholders
  border: '#E8DFD3',

  // text
  text: '#2B2118',        // near-black brown, 13.6:1 on bg
  textMuted: '#6B5D50',   // 5.4:1 on bg -- the floor for readable secondary text
  textInverse: '#FFFFFF',

  // brand -- terracotta carries every primary action
  primary: '#B85C38',
  primaryPressed: '#8F4327',
  primaryDark: '#8F4327',  // full-bleed backgrounds (voice overlay)
  primarySoft: '#FFF4EE',

  // informational -- indigo, never used for a primary action
  secondary: '#2D3E6B',
  secondarySoft: '#E5E8F2',

  // highlight -- marigold/haldi
  accent: '#E8A33D',
  accentSoft: '#FBEBCF',

  // status
  ok: '#4A7C59',          // live, paid, sold
  okSoft: '#E4F0E6',
  okText: '#386444',      // ok, darkened for text on okSoft
  warn: '#D98324',        // attention, stale listings
  warnSoft: '#FDF2E3',
  warnText: '#8A5A0B',
  error: '#B03A2E',       // errors, dignity-floor breach
  errorSoft: '#F7E3E0',

  // channels -- fixed brand colours, not ours to change
  whatsapp: '#25D366',
  ondc: '#1E5EFF',
} as const;

export type ColorName = keyof typeof colors;
