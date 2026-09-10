/**
 * The voice assistant overlay.
 *
 * Full-screen and terracotta, so there is no doubt the app is listening. She
 * asks anything; the answer comes back short, printed large, and read aloud,
 * because the whole point is that she does not have to read it.
 *
 * When the answer carries an action the app offers it as a button rather than
 * navigating on its own -- being thrown into the camera because a word was
 * misheard is a worse failure than one extra tap.
 */
import React, { useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Speech from 'expo-speech';

import { assistantApi, type AssistantAction } from '../api/assistant';
import { messageFor } from '../api/errors';
import { useVoice } from '../store/voice';
import { BigButton } from '../components/BigButton';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { colors, radius, spacing, typography } from '../theme';
import type { AppNav } from '../navigation';

const EXAMPLES = ['"How many things have I put up?"', '"Add a new item"', '"What is my basket priced at?"'];

const ACTION_LABEL: Record<AssistantAction, string> = {
  add_product: 'Add a new item',
  open_catalog: 'Open my shop',
  open_inbox: 'Open messages',
  open_profile: 'Open my profile',
};

export function VoiceAssistantScreen() {
  const navigation = useNavigation<AppNav>();
  const { lang } = useVoice();

  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [action, setAction] = useState<AssistantAction | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    Speech.stop();
    navigation.goBack();
  };

  const onTranscript = async (text: string) => {
    setQuestion(text);
    setAnswer(null);
    setAction(null);
    setError(null);
    setThinking(true);
    try {
      const result = await assistantApi.ask(text, lang.code);
      setAnswer(result.answer);
      setAction(result.action);
      Speech.stop();
      Speech.speak(result.answer, { language: lang.speech, rate: 0.92 });
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setThinking(false);
    }
  };

  const go = () => {
    Speech.stop();
    if (action === 'add_product') navigation.navigate('CatalogWizard', {});
    else if (action === 'open_catalog') navigation.navigate('Shop');
    else if (action === 'open_inbox') navigation.navigate('Inbox');
    else if (action === 'open_profile') navigation.navigate('Profile');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{answer ? 'Here is what I know' : 'Ask me anything'}</Text>

        <Waveform active={thinking} />

        <View style={styles.recorder}>
          <VoiceRecorder
            maxSeconds={20}
            onDark
            label={answer ? 'Ask something else' : 'Tap and speak'}
            onTranscript={onTranscript}
          />
        </View>

        {question ? (
          <View style={styles.heard}>
            <Text style={styles.heardLabel}>You asked</Text>
            <Text style={styles.heardText}>{question}</Text>
          </View>
        ) : null}

        {thinking ? <Text style={styles.thinking}>Thinking…</Text> : null}

        {answer ? (
          <View style={styles.answer}>
            <Text style={styles.answerText}>{answer}</Text>
          </View>
        ) : null}

        {action ? (
          <BigButton label={ACTION_LABEL[action]} onPress={go} style={styles.action} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!question ? (
          <View style={styles.examples}>
            {EXAMPLES.map((example) => (
              <Text key={example} style={styles.example}>
                {example}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/** Seven bars breathing in sequence. Purely a "something is happening" cue. */
function Waveform({ active }: { active: boolean }) {
  const bars = React.useRef([...Array(7)].map(() => new Animated.Value(0.3))).current;

  React.useEffect(() => {
    if (!active) {
      bars.forEach((bar) => bar.setValue(0.3));
      return;
    }
    const loops = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(bar, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.3,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, bars]);

  return (
    <View style={styles.wave}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            i % 2 === 0 ? styles.barLight : styles.barPale,
            { transform: [{ scaleY: bar }] },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryDark },
  content: { padding: spacing.xl, alignItems: 'center', paddingBottom: spacing.xxl },
  title: { ...typography.title, color: colors.textInverse, textAlign: 'center' },

  wave: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 90, marginTop: spacing.lg },
  bar: { width: 8, height: 70, borderRadius: 4 },
  barLight: { backgroundColor: colors.textInverse },
  barPale: { backgroundColor: '#F3C98B' },

  recorder: { marginTop: spacing.lg },

  heard: { marginTop: spacing.lg, alignSelf: 'stretch' },
  heardLabel: { ...typography.caption, color: '#F5DCC4' },
  heardText: { ...typography.body, color: colors.textInverse, marginTop: spacing.xs },

  thinking: { ...typography.body, color: '#F5DCC4', marginTop: spacing.md },

  answer: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  answerText: { ...typography.heading, color: colors.text },
  action: { alignSelf: 'stretch', marginTop: spacing.gap },
  error: { ...typography.body, color: '#FFD9D2', marginTop: spacing.md, textAlign: 'center' },

  examples: { marginTop: spacing.xl, gap: spacing.sm },
  example: { ...typography.body, color: '#F5DCC4', textAlign: 'center' },

  close: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
    height: 64,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  closeText: { ...typography.bodyBold, color: colors.textInverse },
});
