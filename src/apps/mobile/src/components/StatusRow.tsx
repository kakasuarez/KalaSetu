/**
 * One dependency's health, as a labelled row.
 *
 * Status is conveyed by symbol AND colour -- never colour alone, since a
 * meaningful share of users cannot distinguish red from green.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

export function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${ok ? 'ok' : 'unavailable'}`}
    >
      <Text style={[styles.mark, { color: ok ? colors.ok : colors.error }]}>
        {ok ? '✓' : '✕'}
      </Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.detail} numberOfLines={1}>
        {detail ?? ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  mark: { ...typography.heading, width: 28 },
  label: { ...typography.body, color: colors.text, flex: 1 },
  detail: { ...typography.mono, color: colors.textMuted, maxWidth: '45%', textAlign: 'right' },
});
