/**
 * "Most popular" / "Your best products" -- an H2 with an optional speaker and
 * an optional text link on the right.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';
import { SpeakerButton } from './SpeakerButton';

type Props = {
  title: string;
  /** Present = show the speaker button, and say this instead of the title. */
  speak?: string;
  action?: { label: string; onPress: () => void };
};

export function SectionHeading({ title, speak, action }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {speak ? <SpeakerButton phrase={speak} size={40} /> : null}
      <View style={styles.spacer} />
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.heading, color: colors.text },
  spacer: { flex: 1 },
  action: { ...typography.bodyBold, color: colors.primary, paddingVertical: spacing.sm },
  pressed: { opacity: 0.6 },
});
