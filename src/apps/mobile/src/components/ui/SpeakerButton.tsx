/**
 * The round speaker affordance beside headings and numbers.
 *
 * Distinct from SpeakableText: that wraps a string and reads *itself*, while
 * this reads a phrase assembled from several elements -- "your total earnings
 * are forty-eight thousand two hundred rupees" for a card that shows a label
 * and a figure separately.
 */
import React, { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import * as Speech from 'expo-speech';

import { useVoice } from '../../store/voice';
import { colors } from '../../theme';
import { Icon } from './Icon';

type Props = {
  /** What to say. Write it as it should sound, not as it is printed. */
  phrase: string;
  size?: number;
  accessibilityLabel?: string;
};

export function SpeakerButton({ phrase, size = 44, accessibilityLabel = 'Listen' }: Props) {
  const { lang } = useVoice();

  const say = useCallback(() => {
    // Overlapping utterances are unintelligible; always pre-empt.
    Speech.stop();
    Speech.speak(phrase, { language: lang.speech, rate: 0.92 });
  }, [phrase, lang.speech]);

  return (
    <Pressable
      onPress={say}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Reads this aloud"
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && styles.pressed,
      ]}
    >
      <Icon name="speaker" size={size * 0.5} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  pressed: { opacity: 0.6 },
});
