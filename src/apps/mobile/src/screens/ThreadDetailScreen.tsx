/**
 * One buyer conversation.
 *
 * The suggestion chips above the input are the feature that makes this usable:
 * a complete reply she can send with one tap, rather than composing a sentence
 * on a keyboard she cannot read. The microphone is the primary input and the
 * text field is deliberately the smaller, quieter one beside it.
 *
 * SAMPLE DATA. Replies do not send anywhere -- the WhatsApp and ONDC channels
 * that carry them are PRD phases 7 and 8, and the AI suggestions come from the
 * RAG engine in phase 9.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { SAMPLE_THREADS } from '../data/sampleContent';
import { Icon } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { colors, radius, shadows, spacing, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'Thread'>;

type Bubble = { id: string; from: 'buyer' | 'artisan'; text: string; ai?: boolean };

export function ThreadDetailScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const thread = SAMPLE_THREADS.find((t) => t.id === params.threadId) ?? SAMPLE_THREADS[0];

  const [messages, setMessages] = useState<Bubble[]>(thread.messages);
  const [sent, setSent] = useState(false);

  const send = (text: string) => {
    setMessages((prev) => [...prev, { id: `local-${prev.length}`, from: 'artisan', text }]);
    setSent(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Icon name="back" size={26} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.buyer} numberOfLines={1}>
            {thread.buyer}
          </Text>
          <Text style={styles.channel}>
            {thread.channel === 'whatsapp'
              ? 'WhatsApp'
              : thread.channel === 'ondc'
                ? 'ONDC'
                : 'KalaSetu'}
          </Text>
        </View>
      </View>

      <View style={styles.productChip}>
        <View style={styles.productThumb} />
        <Text style={styles.productText} numberOfLines={1}>
          {thread.product.name} · {thread.product.price}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.messages}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.bubble,
              message.from === 'buyer' ? styles.fromBuyer : styles.fromArtisan,
            ]}
          >
            <Text
              style={message.from === 'buyer' ? styles.buyerText : styles.artisanText}
            >
              {message.text}
            </Text>
            {message.ai ? (
              <Text style={styles.provenance}>Answered from your earlier replies</Text>
            ) : null}
          </View>
        ))}
        {sent ? (
          <Text style={styles.notSent}>
            Not delivered — sending replies arrives with the WhatsApp channel
          </Text>
        ) : null}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestions}
          >
            {thread.suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => send(suggestion)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Icon name="sparkle" size={16} color={colors.primary} />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.composer}>
            <View style={styles.textField}>
              <Text style={styles.placeholder}>Type…</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reply by voice"
              style={({ pressed }) => [styles.mic, pressed && styles.pressed]}
            >
              <Icon name="mic" size={30} color={colors.textInverse} />
            </Pressable>
          </View>
          <Text style={styles.hint}>Tap a reply above, or hold the microphone</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.gap,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  buyer: { ...typography.heading, color: colors.text },
  channel: { ...typography.caption, color: colors.textMuted },

  productChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    margin: spacing.gap,
    padding: 6,
    paddingRight: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  productThumb: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  productText: { ...typography.label, color: colors.text },

  messages: { padding: spacing.md, gap: spacing.gap },
  bubble: { maxWidth: '82%', padding: spacing.gap, borderRadius: radius.lg },
  fromBuyer: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderBottomLeftRadius: spacing.xs,
  },
  fromArtisan: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.xs,
  },
  buyerText: { ...typography.body, color: colors.text },
  artisanText: { ...typography.body, color: colors.textInverse },
  provenance: { ...typography.caption, fontSize: 14, color: colors.surfaceAlt, marginTop: 6 },
  notSent: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  inputBar: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gap,
    paddingTop: 10,
    paddingBottom: spacing.gap,
  },
  suggestions: { gap: spacing.sm, paddingBottom: 10 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  suggestionText: { ...typography.label, fontSize: 17, color: colors.primary },
  pressed: { opacity: 0.75 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textField: {
    flex: 1,
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  placeholder: { ...typography.body, fontSize: 16, color: colors.textMuted },
  mic: {
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lifted,
  },
  hint: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
