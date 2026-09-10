/**
 * What a screen shows when it has nothing -- which for a new artisan is the
 * first thing she ever sees. So it carries the illustration, the explanation
 * and the way forward, rather than an apology.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';
import { BigButton } from '../BigButton';
import { SpeakableText } from '../SpeakableText';

type Props = {
  glyph: string;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  /** Read the title and body aloud on arrival. */
  autoSpeak?: boolean;
};

export function EmptyState({ glyph, title, body, action, autoSpeak = false }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
      <SpeakableText
        style={styles.title}
        speak={title + '. ' + body}
        autoSpeak={autoSpeak}
        hideButton
      >
        {title}
      </SpeakableText>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <BigButton label={action.label} onPress={action.onPress} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, alignItems: 'center' },
  circle: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 44 },
  title: {
    ...typography.heading,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
