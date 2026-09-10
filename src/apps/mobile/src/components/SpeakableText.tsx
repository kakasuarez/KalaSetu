/**
 * Text that can read itself aloud.
 *
 * This is the accessibility spine of the wizard, and it does a different job
 * from TalkBack. TalkBack helps someone who has already enabled a screen
 * reader; an artisan with low literacy and no accessibility settings switched
 * on will never hear a word of it. So the app speaks on its own initiative:
 * `autoSpeak` on entering a step, and a tap target to hear it again.
 *
 * expo-speech uses the device's own TTS engine — free, offline, no API key,
 * and it works inside Expo Go.
 */
import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View } from 'react-native';
import * as Speech from 'expo-speech';

import { useVoice } from '../store/voice';
import { colors, spacing, typography } from '../theme';

type Props = {
  /** Shown on screen. English, per the product decision. */
  children: string;
  /**
   * Spoken instead of `children` when present — used to read guidance in the
   * artisan's own language while the label stays English.
   */
  speak?: string;
  autoSpeak?: boolean;
  style?: TextStyle;
  /** Hide the speaker affordance when a parent already provides one. */
  hideButton?: boolean;
};

/** Stop whatever is playing. Call before navigating away. */
export function stopSpeaking() {
  Speech.stop();
}

export function SpeakableText({
  children,
  speak,
  autoSpeak = false,
  style,
  hideButton = false,
}: Props) {
  const { lang, speakGuidance } = useVoice();
  const phrase = speak ?? children;

  const say = useCallback(() => {
    // Overlapping utterances are unintelligible; always pre-empt.
    Speech.stop();
    Speech.speak(phrase, { language: lang.speech, rate: 0.92 });
  }, [phrase, lang.speech]);

  useEffect(() => {
    if (!autoSpeak || !speakGuidance) return;
    // A beat of silence after the screen settles; speaking mid-transition gets
    // clipped by the navigation animation on Android.
    const timer = setTimeout(say, 350);
    return () => {
      clearTimeout(timer);
      Speech.stop();
    };
  }, [autoSpeak, speakGuidance, say]);

  return (
    <View style={styles.row}>
      <Text style={[styles.text, style]}>{children}</Text>
      {hideButton ? null : (
        <Pressable
          onPress={say}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Listen to this"
          accessibilityHint="Reads this text aloud"
          style={({ pressed }) => [styles.speaker, pressed && styles.pressed]}
        >
          <Text style={styles.icon}>🔊</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { ...typography.heading, color: colors.text, flex: 1 },
  speaker: {
    padding: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  pressed: { opacity: 0.6 },
  icon: { fontSize: 20 },
});
