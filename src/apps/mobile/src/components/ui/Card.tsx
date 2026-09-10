/**
 * The white rounded surface every screen is built from.
 *
 * Extracted because six screens had each hand-rolled the same recipe with
 * slightly different radii and border colours, which is exactly how a design
 * drifts.
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '../../theme';

type Props = {
  children: React.ReactNode;
  /** Cards that hold a full-bleed image clip their children instead of padding them. */
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export function Card({ children, padded = true, style }: Props) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  padded: { padding: spacing.md },
});
