/**
 * Tappable answer chips.
 *
 * Follows the selected-chip pattern already established in
 * ReviewListingScreen, but fixes two things it got wrong: the accessibility
 * label there announced English while the chip displayed Hindi, and there was
 * no way to clear a selection.
 *
 * Clearing matters more than it sounds. A wrong chip is worse than no chip: an
 * unanswered field is honestly reported as "not specified", whereas a
 * mis-tapped one becomes a confident false claim in the listing.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  options: string[];
  /** A string for single-select, an array for multi-select. */
  value: string | string[] | null;
  onChange: (next: string | string[] | null) => void;
  multi?: boolean;
};

export function ChipGroup({ options, value, onChange, multi = false }: Props) {
  const selected = (opt: string) =>
    multi ? Array.isArray(value) && value.includes(opt) : value === opt;

  const toggle = (opt: string) => {
    if (multi) {
      const list = Array.isArray(value) ? value : [];
      onChange(list.includes(opt) ? list.filter((v) => v !== opt) : [...list, opt]);
      return;
    }
    // Tapping the selected chip again clears it.
    onChange(value === opt ? null : opt);
  };

  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const isOn = selected(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => toggle(opt)}
            accessibilityRole="button"
            accessibilityLabel={opt}
            accessibilityHint={isOn ? 'Selected. Tap to clear.' : 'Tap to choose'}
            accessibilityState={{ selected: isOn }}
            style={({ pressed }) => [
              styles.chip,
              isOn && styles.chipOn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.text, isOn && styles.textOn]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  text: { ...typography.label, color: colors.text },
  textOn: { color: colors.textInverse },
});
