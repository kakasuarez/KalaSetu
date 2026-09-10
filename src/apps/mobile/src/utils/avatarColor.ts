/**
 * The colour an artisan is represented by everywhere -- her profile card's
 * avatar (Avatar.tsx) and her pin on the map (IndiaMap.tsx) use the SAME
 * deterministic colour, so she is visually the same "person" across both
 * screens without carrying a colour field through the API.
 */
import { colors } from '../theme';

const PALETTE: { bg: string; fg: string }[] = [
  { bg: colors.primary, fg: colors.textInverse },
  { bg: colors.secondary, fg: colors.textInverse },
  { bg: colors.ok, fg: colors.textInverse },
  { bg: colors.warn, fg: colors.textInverse },
  { bg: colors.primaryDark, fg: colors.textInverse },
  { bg: colors.accent, fg: colors.text },
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function avatarColorFor(name: string): { bg: string; fg: string } {
  return PALETTE[hashName(name) % PALETTE.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
