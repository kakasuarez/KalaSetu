/**
 * A listing's status, as colour AND word.
 *
 * Never colour alone: a green dot means nothing to someone seeing the app for
 * the first time, and roughly 1 in 12 men cannot separate the green from the
 * amber at all.
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radius, typography } from '../../theme';

/** Mirrors ListingStatus in src/api/listings.ts. */
type Status = 'draft' | 'ready' | 'published' | 'paused' | 'sold_out';

const LOOK: Record<Status, { label: string; bg: string; fg: string }> = {
  published: { label: 'Live', bg: colors.ok, fg: colors.textInverse },
  ready: { label: 'Ready', bg: colors.secondary, fg: colors.textInverse },
  draft: { label: 'Draft', bg: colors.accent, fg: colors.text },
  paused: { label: 'Paused', bg: colors.textMuted, fg: colors.textInverse },
  sold_out: { label: 'Sold out', bg: colors.error, fg: colors.textInverse },
};

export function StatusPill({ status, style }: { status: Status; style?: ViewStyle }) {
  const look = LOOK[status] ?? LOOK.draft;
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }, style]}>
      <Text style={[styles.text, { color: look.fg }]}>{look.label}</Text>
    </View>
  );
}

/** The same words the pill shows, for read-aloud phrases. */
export function statusLabel(status: Status): string {
  return (LOOK[status] ?? LOOK.draft).label;
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  text: { ...typography.label, fontSize: 14, lineHeight: 18 },
});
