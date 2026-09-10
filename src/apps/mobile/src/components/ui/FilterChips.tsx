/**
 * The horizontal filter row above a list: All / Live / Draft / Paused.
 *
 * Distinct from ChipGroup, which wraps onto several lines and is an *answer*
 * to a question. This one scrolls sideways on a single line and is a view
 * switch, so it never wraps and always has exactly one selection.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

export type Chip<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Chip<T>[];
  value: T;
  onChange: (next: T) => void;
};

export function FilterChips<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.gap },
  chip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  label: { ...typography.bodyBold, color: colors.text },
  labelActive: { color: colors.textInverse },
});
