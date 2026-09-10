/**
 * Big-button numeric entry.
 *
 * There is no TextInput anywhere in the artisan flow -- Phase 11's DoD is
 * literally "grep the codebase to prove it". Building the keypad now instead
 * of retrofitting it later is why the login screen never needs a rewrite.
 *
 * Keys are 1/3 of the screen wide, well past the 48dp Android accessibility
 * minimum, and every one carries an accessibilityLabel for TalkBack.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  /** Render entered digits as dots. Used for the PIN. */
  secure?: boolean;
  /** Shown above the dots, e.g. "+91". */
  prefix?: string;
  deleteLabel?: string;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function NumericKeypad({
  value,
  onChange,
  maxLength,
  secure = false,
  prefix,
  deleteLabel = 'Delete',
}: Props) {
  const press = (key: string) => {
    if (key === '') return;
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  };

  const cells = Array.from({ length: maxLength }, (_, i) => {
    const filled = i < value.length;
    if (secure) {
      return (
        <View
          key={i}
          style={[styles.dot, filled ? styles.dotFilled : styles.dotEmpty]}
        />
      );
    }
    return (
      <Text key={i} style={[styles.digit, !filled && styles.digitEmpty]}>
        {filled ? value[i] : '–'}
      </Text>
    );
  });

  return (
    <View style={styles.wrap}>
      <View
        style={styles.display}
        accessibilityRole="text"
        accessibilityLabel={
          secure
            ? `${value.length} of ${maxLength} digits entered`
            : `${prefix ?? ''} ${value.split('').join(' ')}`
        }
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        {cells}
      </View>

      <View style={styles.pad}>
        {KEYS.map((key, i) => (
          <Pressable
            key={`${key}-${i}`}
            onPress={() => press(key)}
            disabled={key === ''}
            accessibilityRole={key === '' ? 'none' : 'button'}
            accessibilityLabel={key === '⌫' ? deleteLabel : key || undefined}
            style={({ pressed }) => [
              styles.key,
              key === '' && styles.keyBlank,
              pressed && key !== '' && styles.keyPressed,
            ]}
          >
            <Text style={styles.keyLabel}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  display: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
  },
  prefix: { ...typography.title, color: colors.textMuted, marginRight: spacing.xs },
  digit: { ...typography.title, color: colors.text, minWidth: 22, textAlign: 'center' },
  digitEmpty: { color: colors.border },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotEmpty: { backgroundColor: 'transparent', borderColor: colors.border },
  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: {
    width: '33.33%',
    aspectRatio: 1.7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyBlank: { opacity: 0 },
  keyPressed: { backgroundColor: colors.surfaceAlt },
  keyLabel: { ...typography.display, color: colors.text },
});
