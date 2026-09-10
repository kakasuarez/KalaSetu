/**
 * Wizard progress: "Step 2 of 5" plus a dot per step.
 *
 * Announces transitions to TalkBack via AccessibilityInfo. Without that a
 * screen-reader user gets no signal that the screen changed at all, because
 * the wizard swaps sub-views inside one route rather than navigating — there
 * is no screen-change event for the reader to pick up.
 */
import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  index: number; // zero-based
  total: number;
  title: string;
};

export function StepHeader({ index, total, title }: Props) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `Step ${index + 1} of ${total}. ${title}`,
    );
  }, [index, total, title]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.counter} accessibilityRole="text">
        Step {index + 1} of {total}
      </Text>
      <View
        style={styles.dots}
        // One label for the row; announcing eight separate dots is noise.
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      >
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === index && styles.dotActive,
              i < index && styles.dotDone,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingBottom: spacing.sm },
  counter: { ...typography.label, color: colors.textMuted },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotDone: { backgroundColor: colors.ok },
  dotActive: { backgroundColor: colors.primary },
});
