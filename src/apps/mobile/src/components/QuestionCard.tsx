/**
 * One questionnaire field: label, input, and a mic to answer by voice.
 *
 * Every question is skippable, and skipping is a first-class answer. The field
 * then stays null and the listing says "not specified" — which is the honest
 * outcome and the one that protects the artisan from a returns dispute. The UI
 * therefore never marks an unanswered question as an error.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { CraftQuestion } from '../api/catalog';
import { ChipGroup } from './ChipGroup';
import { SpeakableText } from './SpeakableText';
import { VoiceRecorder } from './VoiceRecorder';
import { colors, radius, spacing, typography } from '../theme';

export type AnswerValue = string | string[] | number | null;

type Props = {
  question: CraftQuestion;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  required?: boolean;
};

export function QuestionCard({ question, value, onChange, required = false }: Props) {
  const answered = value !== null && value !== '' &&
    !(Array.isArray(value) && value.length === 0);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <SpeakableText style={styles.label}>{question.label}</SpeakableText>
        {required ? (
          <Text style={styles.required} accessibilityLabel="Recommended">
            recommended
          </Text>
        ) : null}
      </View>

      {question.hint ? <Text style={styles.hint}>{question.hint}</Text> : null}

      {question.type === 'chips' || question.type === 'chips_multi' ? (
        <ChipGroup
          options={question.options ?? []}
          value={Array.isArray(value) || typeof value === 'string' ? value : null}
          multi={question.type === 'chips_multi'}
          onChange={onChange}
        />
      ) : (
        <TextInput
          style={styles.input}
          value={value === null ? '' : String(value)}
          onChangeText={(t) => onChange(t === '' ? null : t)}
          keyboardType={question.type === 'number' ? 'numeric' : 'default'}
          placeholder={question.unit ? `In ${question.unit}` : 'Type or speak'}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={question.label}
          accessibilityHint={question.hint ?? undefined}
        />
      )}

      <View style={styles.voiceRow}>
        <VoiceRecorder
          maxSeconds={15}
          label="Or answer by voice"
          onTranscript={(text) => {
            // A spoken answer for a chip question is stored verbatim rather
            // than matched against the options: forcing it into the nearest
            // chip would be a guess, and guessing is what this feature exists
            // to prevent. The server keeps the artisan's own words.
            if (question.type === 'chips_multi') {
              const list = Array.isArray(value) ? value : [];
              onChange([...list, text]);
            } else if (question.type === 'number') {
              // Whisper returns a whole phrase ("do ghante", "about 2 hours"),
              // so pull the first number out of it rather than parsing from
              // the start. If there is no digit at all, keep the words: the
              // artisan can see what was heard and correct it, and the server
              // drops an unreadable answer instead of rejecting the listing.
              const digits = text.match(/\d+(?:\.\d+)?/);
              onChange(digits ? parseFloat(digits[0]) : text);
            } else {
              onChange(text);
            }
          }}
        />
      </View>

      {answered ? null : (
        <Text style={styles.skip}>
          Leave this empty if you are not sure — the listing will simply say
          &quot;not specified&quot;.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.label, color: colors.text, flex: 1 },
  required: { ...typography.mono, color: colors.warn },
  hint: { ...typography.body, color: colors.textMuted, fontSize: 15 },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 52,
  },
  voiceRow: { alignItems: 'flex-start', transform: [{ scale: 0.72 }] },
  skip: { ...typography.mono, color: colors.textMuted },
});
