/**
 * An initials avatar, deterministically coloured from the artisan's name.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, typography } from '../theme';
import { avatarColorFor, initialsFor } from '../utils/avatarColor';

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const { bg, fg } = avatarColorFor(name);
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: bg },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.initials, { fontSize: size * 0.38, color: fg }]}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...typography.bodyBold, fontFamily: typography.heading.fontFamily },
});
